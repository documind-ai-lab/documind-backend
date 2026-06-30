import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PROJECT_REPOSITORY } from "../src/project-workspace/application/project.repository";
import { ProjectWorkspaceModule } from "../src/project-workspace/project-workspace.module";
import { InMemoryProjectRepository } from "../src/project-workspace/testing/in-memory-project.repository";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

describe("Project API", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.DATABASE_URL =
      "postgresql://documind_backend_app:example_app_password@localhost:5432/documind?schema=documind_backend";
    process.env.DOCUMIND_DEMO_OWNER_ID = "7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e";

    const moduleRef = await Test.createTestingModule({
      imports: [ProjectWorkspaceModule]
    })
      .overrideProvider(PROJECT_REPOSITORY)
      .useValue(new InMemoryProjectRepository())
      .compile();

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
  });

  afterEach(async () => {
    await app.close();
  });

  it("프로젝트 생성, 목록, 상세, 수정, 보관, 복원 흐름과 오류 응답을 검증한다", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/projects")
      .send({
        name: "  A사 제안 검토  ",
        description: " 제안서/견적서 검토 ",
        type: "PROPOSAL_REVIEW"
      })
      .expect(HttpStatus.CREATED);

    expect(createResponse.body).toMatchObject({
      name: "A사 제안 검토",
      description: "제안서/견적서 검토",
      type: "PROPOSAL_REVIEW",
      status: "ACTIVE",
      documentCount: 0,
      riskCandidateCount: 0
    });
    expect(typeof createResponse.body.id).toBe("string");
    expect(typeof createResponse.body.createdAt).toBe("string");

    const projectId = createResponse.body.id as string;

    const listResponse = await request(app.getHttpServer())
      .get("/projects")
      .expect(HttpStatus.OK);
    expect(listResponse.body).toMatchObject({
      page: 1,
      size: 20,
      total: 1,
      hasNext: false
    });
    expect(listResponse.body.items[0]).toMatchObject({
      id: projectId,
      name: "A사 제안 검토",
      lastActivityAt: createResponse.body.lastActivityAt
    });
    expect(listResponse.body.items[0]).not.toHaveProperty("createdAt");

    await request(app.getHttpServer())
      .get("/projects?size=99")
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 422,
          code: "VALIDATION_ERROR",
          message: "요청 값이 올바르지 않습니다."
        });
        expect(body.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "size" })])
        );
      });

    await request(app.getHttpServer())
      .get("/projects/not-a-uuid")
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
        expect(body.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "projectId" })])
        );
      });

    await request(app.getHttpServer())
      .get("/projects/018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99")
      .expect(HttpStatus.NOT_FOUND)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
      });

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .send({ description: null })
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body.description).toBeNull();
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
});
