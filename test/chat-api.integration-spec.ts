import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { ChatRole } from "../src/chat-workspace/domain/chat-role";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

const runDbIntegration = process.env.RUN_DB_INTEGRATION === "true";
const describeDbIntegration = runDbIntegration ? describe : describe.skip;
const integrationOwnerId = "33333333-3333-4333-8333-333333333333";
const testNamePrefix = "[integration] Chat API";

describeDbIntegration("Chat API PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageBasePath: string;

  beforeAll(async () => {
    requireDatabaseUrl();
    storageBasePath = await mkdtemp(join(tmpdir(), "documind-chat-integration-"));
    process.env.DOCUMIND_DEMO_OWNER_ID = integrationOwnerId;
    process.env.DOCUMENT_STORAGE_BASE_PATH = storageBasePath;
    process.env.DOCUMENT_MAX_FILE_BYTES = String(50 * 1024 * 1024);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
      })
    );
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupIntegrationData();
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await cleanupIntegrationData();
    }
    if (app !== undefined) {
      await app.close();
    }
    if (storageBasePath !== undefined) {
      await rm(storageBasePath, { recursive: true, force: true });
    }
  });

  it("실제 PostgreSQL에서 문서 텍스트 기반 채팅 생성, 조회, 출처 저장을 검증한다", async () => {
    const projectResponse = await request(app.getHttpServer())
      .post("/projects")
      .send({
        name: `${testNamePrefix} 제안 검토`,
        description: "채팅 통합 테스트",
        type: "PROPOSAL_REVIEW"
      })
      .expect(HttpStatus.CREATED);
    const projectId = projectResponse.body.id as string;
    const now = new Date();

    const document = await prisma.document.create({
      data: {
        id: "33333333-3333-7333-8333-333333333101",
        projectId,
        ownerId: integrationOwnerId,
        originalName: "견적서.txt",
        storageProvider: "local",
        storageKey: `projects/${projectId}/documents/33333333-3333-7333-8333-333333333101/estimate.txt`,
        mimeType: "text/plain",
        extension: "txt",
        sizeBytes: 36,
        status: DocumentStatus.READY,
        failureReason: null,
        createdAt: now,
        updatedAt: now
      }
    });

    await prisma.documentText.create({
      data: {
        id: "33333333-3333-7333-8333-333333333201",
        documentId: document.id,
        projectId,
        ownerId: integrationOwnerId,
        content: "견적 총액은 1,000만원이며 유지보수 항목은 별도 협의입니다.",
        contentHash: "chat-integration-content-hash",
        tokenCount: 12,
        extractedAt: now,
        createdAt: now,
        updatedAt: now
      }
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/chat/messages`)
      .set("X-Owner-Id", integrationOwnerId)
      .send({ content: "견적서 분석해줘" })
      .expect(HttpStatus.CREATED);

    expect(createResponse.body.userMessage).toMatchObject({
      projectId,
      role: ChatRole.USER,
      content: "견적서 분석해줘",
      sources: []
    });
    expect(createResponse.body.userMessage).not.toHaveProperty("ownerId");
    expect(createResponse.body.assistantMessage).toMatchObject({
      projectId,
      role: ChatRole.ASSISTANT,
      sources: [
        {
          documentId: document.id,
          index: 1,
          title: "견적서.txt",
          quote: "견적 총액은 1,000만원이며 유지보수 항목은 별도 협의입니다.",
          relevance: 0.85
        }
      ]
    });
    expect(createResponse.body.assistantMessage.content).toContain("[1]");
    expect(createResponse.body.assistantMessage).not.toHaveProperty("ownerId");

    const storedMessages = await prisma.chatMessage.findMany({
      where: { projectId, ownerId: integrationOwnerId },
      include: { sources: { orderBy: { sourceIndex: "asc" } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    expect(storedMessages).toHaveLength(2);
    expect(storedMessages.map((message) => message.role)).toEqual([
      ChatRole.USER,
      ChatRole.ASSISTANT
    ]);
    expect(storedMessages[1].sources).toHaveLength(1);
    expect(storedMessages[1].sources[0]).toMatchObject({
      documentId: document.id,
      sourceIndex: 1,
      title: "견적서.txt",
      quote: "견적 총액은 1,000만원이며 유지보수 항목은 별도 협의입니다."
    });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/chat/messages`)
      .set("X-Owner-Id", integrationOwnerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ page: 1, size: 30, total: 2, hasNext: false });
        expect(body.items.map((item: { role: ChatRole }) => item.role)).toEqual([
          ChatRole.USER,
          ChatRole.ASSISTANT
        ]);
        expect(body.items[1].sources[0]).toMatchObject({ documentId: document.id, index: 1 });
      });

    const updatedProject = await prisma.project.findUnique({ where: { id: projectId } });
    expect(updatedProject!.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      new Date(projectResponse.body.lastActivityAt as string).getTime()
    );
  });

  async function cleanupIntegrationData(): Promise<void> {
    await prisma.chatSource.deleteMany({
      where: { message: { ownerId: integrationOwnerId } }
    });
    await prisma.chatMessage.deleteMany({ where: { ownerId: integrationOwnerId } });
    await prisma.documentText.deleteMany({ where: { ownerId: integrationOwnerId } });
    await prisma.document.deleteMany({ where: { ownerId: integrationOwnerId } });
    await prisma.project.deleteMany({ where: { ownerId: integrationOwnerId } });
  }
});

function requireDatabaseUrl(): void {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
    throw new Error("RUN_DB_INTEGRATION=true 실행에는 DATABASE_URL 환경 변수가 필요합니다.");
  }
}
