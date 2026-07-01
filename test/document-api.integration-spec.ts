import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

const runDbIntegration = process.env.RUN_DB_INTEGRATION === "true";
const describeDbIntegration = runDbIntegration ? describe : describe.skip;
const integrationOwnerId = "22222222-2222-4222-8222-222222222222";
const testNamePrefix = "[integration] Document API";

describeDbIntegration("Document API PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageBasePath: string;

  beforeAll(async () => {
    requireDatabaseUrl();
    storageBasePath = await mkdtemp(join(tmpdir(), "documind-document-integration-"));
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

  it("실제 PostgreSQL과 파일 시스템에서 문서 업로드, 조회, retry 실패 저장을 검증한다", async () => {
    const projectResponse = await request(app.getHttpServer())
      .post("/projects")
      .send({
        name: `${testNamePrefix} 제안 검토`,
        description: "문서 업로드 통합 테스트",
        type: "PROPOSAL_REVIEW"
      })
      .expect(HttpStatus.CREATED);
    const projectId = projectResponse.body.id as string;

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", integrationOwnerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.CREATED);

    expect(uploadResponse.body).toMatchObject({
      projectId,
      originalName: "proposal.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null
    });
    expect(uploadResponse.body).not.toHaveProperty("storageKey");
    const documentId = uploadResponse.body.id as string;

    const storedDocument = await prisma.document.findUnique({ where: { id: documentId } });
    expect(storedDocument).toMatchObject({
      id: documentId,
      projectId,
      ownerId: integrationOwnerId,
      storageProvider: "local",
      status: DocumentStatus.TEXT_EXTRACTION_PENDING
    });
    await expect(readFile(join(storageBasePath, storedDocument!.storageKey), "utf8")).resolves.toBe(
      "%PDF-1.7"
    );

    const storedProject = await prisma.project.findUnique({ where: { id: projectId } });
    expect(storedProject).toMatchObject({
      id: projectId,
      ownerId: integrationOwnerId,
      documentCount: 1
    });
    expect(storedProject!.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      new Date(projectResponse.body.lastActivityAt as string).getTime()
    );

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", integrationOwnerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ total: 1, page: 1, size: 20, hasNext: false });
        expect(body.items[0]).toMatchObject({ id: documentId, originalName: "proposal.pdf" });
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/${documentId}`)
      .set("X-Owner-Id", integrationOwnerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: documentId, projectId });
      });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.FAILED, failureReason: "텍스트 추출 실패" }
    });
    await rm(join(storageBasePath, storedDocument!.storageKey), { force: true });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${documentId}/retry`)
      .set("X-Owner-Id", integrationOwnerId)
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 409,
          code: "CONFLICT",
          message: "원본 파일을 찾을 수 없습니다."
        });
      });

    const retryFailedDocument = await prisma.document.findUnique({ where: { id: documentId } });
    expect(retryFailedDocument).toMatchObject({
      id: documentId,
      status: DocumentStatus.FAILED,
      failureReason: "원본 파일을 찾을 수 없습니다."
    });
  });

  async function cleanupIntegrationData(): Promise<void> {
    await prisma.document.deleteMany({ where: { ownerId: integrationOwnerId } });
    await prisma.project.deleteMany({ where: { ownerId: integrationOwnerId } });
  }
});

function requireDatabaseUrl(): void {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
    throw new Error("RUN_DB_INTEGRATION=true 실행에는 DATABASE_URL 환경 변수가 필요합니다.");
  }
}
