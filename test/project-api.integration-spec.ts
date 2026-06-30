import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

const runDbIntegration = process.env.RUN_DB_INTEGRATION === "true";
const describeDbIntegration = runDbIntegration ? describe : describe.skip;
const integrationOwnerId = "11111111-1111-4111-8111-111111111111";
const testNamePrefix = "[integration] Project API";

describeDbIntegration("Project API PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    requireDatabaseUrl();
    process.env.DOCUMIND_DEMO_OWNER_ID = integrationOwnerId;

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
    await cleanupIntegrationProjects();
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await cleanupIntegrationProjects();
    }
    if (app !== undefined) {
      await app.close();
    }
  });

  it("실제 PostgreSQL에서 프로젝트 생성, 조회, 수정, 보관, 복원을 검증한다", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/projects")
      .send({
        name: `  ${testNamePrefix} 제안 검토  `,
        description: " 실제 DB round-trip ",
        type: "PROPOSAL_REVIEW"
      })
      .expect(HttpStatus.CREATED);

    expect(createResponse.body).toMatchObject({
      name: `${testNamePrefix} 제안 검토`,
      description: "실제 DB round-trip",
      type: "PROPOSAL_REVIEW",
      status: "ACTIVE",
      documentCount: 0,
      riskCandidateCount: 0
    });

    const projectId = createResponse.body.id as string;
    const stored = await prisma.project.findUnique({ where: { id: projectId } });
    expect(stored).toMatchObject({
      id: projectId,
      ownerId: integrationOwnerId,
      name: `${testNamePrefix} 제안 검토`
    });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: projectId, name: `${testNamePrefix} 제안 검토` });
      });

    await request(app.getHttpServer())
      .get("/projects")
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body.items).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: projectId })])
        );
      });

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .send({ name: ` ${testNamePrefix} 최종 검토 `, description: null })
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: projectId,
          name: `${testNamePrefix} 최종 검토`,
          description: null
        });
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/archive`)
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.status).toBe("ARCHIVED");
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/archive`)
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 409, code: "PROJECT_STATE_CONFLICT" });
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/restore`)
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.status).toBe("ACTIVE");
      });
  });

  async function cleanupIntegrationProjects(): Promise<void> {
    await prisma.project.deleteMany({ where: { ownerId: integrationOwnerId } });
  }
});

function requireDatabaseUrl(): void {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
    throw new Error("RUN_DB_INTEGRATION=true 실행에는 DATABASE_URL 환경 변수가 필요합니다.");
  }
}
