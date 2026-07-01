import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { CLOCK, Clock } from "../src/shared/application/clock";
import { ID_GENERATOR, IdGenerator } from "../src/shared/application/id-generator";
import { DocumentWorkspaceModule } from "../src/document-workspace/document-workspace.module";
import { DOCUMENT_REPOSITORY } from "../src/document-workspace/application/document.repository";
import {
  DOCUMENT_SECURITY_SCANNER,
  DocumentSecurityScanInput,
  DocumentSecurityScanResult,
  DocumentSecurityScanner
} from "../src/document-workspace/application/document-security-scanner";
import { DOCUMENT_STORAGE } from "../src/document-workspace/application/document-storage";
import { ORPHAN_DOCUMENT_STORAGE } from "../src/document-workspace/application/orphan-document-storage";
import { PROJECT_ACCESS_CHECKER } from "../src/document-workspace/application/project-access-checker";
import { PROJECT_DOCUMENT_SUMMARY_UPDATER } from "../src/document-workspace/application/project-document-summary-updater";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import { DocumentSecurityScanUnavailableError } from "../src/document-workspace/domain/document.errors";
import { FakeDocumentStorage } from "../src/document-workspace/testing/fake-document-storage";
import { InMemoryDocumentRepository } from "../src/document-workspace/testing/in-memory-document.repository";
import { ProjectNotFoundError, ProjectStateConflictError } from "../src/project-workspace/domain/project.errors";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

describe("Document API", () => {
  const projectId = "018ff4f0-0000-7000-8000-000000000001";
  const ownerId = "018ff4f0-0000-7000-8000-000000000002";
  const now = new Date("2026-07-02T01:00:00.000Z");

  let app: INestApplication;
  let repository: InMemoryDocumentRepository;
  let storage: FakeDocumentStorage;
  let idGenerator: FixedIdGenerator;
  let accessChecker: ConfigurableProjectAccessChecker;
  let securityScanner: FakeDocumentSecurityScanner;

  beforeEach(async () => {
    process.env.DATABASE_URL =
      "postgresql://documind_backend_app:test_password@localhost:5432/documind?schema=documind_backend";
    process.env.DOCUMIND_DEMO_OWNER_ID = ownerId;
    process.env.DOCUMENT_STORAGE_BASE_PATH = "./.storage/test-documents";
    process.env.DOCUMENT_MAX_FILE_BYTES = String(50 * 1024 * 1024);

    repository = new InMemoryDocumentRepository();
    storage = new FakeDocumentStorage();
    accessChecker = new ConfigurableProjectAccessChecker();
    securityScanner = new FakeDocumentSecurityScanner();
    idGenerator = new FixedIdGenerator([
      "018ff4f0-0000-7000-8000-000000000101",
      "018ff4f0-0000-7000-8000-000000000102",
      "018ff4f0-0000-7000-8000-000000000103",
      "018ff4f0-0000-7000-8000-000000000104",
      "018ff4f0-0000-7000-8000-000000000105"
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [DocumentWorkspaceModule]
    })
      .overrideProvider(DOCUMENT_REPOSITORY)
      .useValue(repository)
      .overrideProvider(DOCUMENT_STORAGE)
      .useValue(storage)
      .overrideProvider(DOCUMENT_SECURITY_SCANNER)
      .useValue(securityScanner)
      .overrideProvider(ORPHAN_DOCUMENT_STORAGE)
      .useValue(new FakeOrphanDocumentStorage())
      .overrideProvider(PROJECT_ACCESS_CHECKER)
      .useValue(accessChecker)
      .overrideProvider(PROJECT_DOCUMENT_SUMMARY_UPDATER)
      .useValue(new FakeProjectDocumentSummaryUpdater())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(now))
      .overrideProvider(ID_GENERATOR)
      .useValue(idGenerator)
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

  it("업로드, 목록, 상세, 재시도 흐름과 응답 shape을 검증한다", async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.CREATED);

    expect(uploadResponse.body).toMatchObject({
      id: "018ff4f0-0000-7000-8000-000000000101",
      projectId,
      originalName: "proposal.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    expect(uploadResponse.body).not.toHaveProperty("ownerId");
    expect(uploadResponse.body).not.toHaveProperty("storageProvider");
    expect(uploadResponse.body).not.toHaveProperty("storageKey");
    expect(uploadResponse.body).not.toHaveProperty("storagePath");
    expect(uploadResponse.body).not.toHaveProperty("storedName");

    const documentId = uploadResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ page: 1, size: 20, total: 1, hasNext: false });
        expect(body.items[0]).toMatchObject({ id: documentId, originalName: "proposal.pdf" });
        expect(body.items[0]).not.toHaveProperty("storageKey");
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/${documentId}`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: documentId, status: DocumentStatus.TEXT_EXTRACTION_PENDING });
      });

    const aggregate = await repository.findByProjectAndId(projectId, documentId);
    aggregate?.markFailed("텍스트 추출 실패", now);
    await repository.save(aggregate!);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${documentId}/retry`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: documentId,
          status: DocumentStatus.TEXT_EXTRACTION_PENDING,
          failureReason: null
        });
      });
  });

  it("헤더, UUID, 파일 누락과 파일 타입 검증 오류를 HTTP 오류로 반환한다", async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", "not-a-uuid")
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents?size=99`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      });

    await request(app.getHttpServer())
      .get("/projects/not-a-uuid/documents")
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.BAD_REQUEST);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("binary"), {
        filename: "악성파일.exe",
        contentType: "application/x-msdownload"
      })
      .expect(HttpStatus.UNSUPPORTED_MEDIA_TYPE);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.alloc(50 * 1024 * 1024 + 1), {
        filename: "large.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it("보안 검사에서 감염 의심 파일이면 FAILED 응답을 반환하고 저장소 필드는 노출하지 않는다", async () => {
    securityScanner.result = { status: "infected", reason: "Eicar-Test-Signature" };

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: "018ff4f0-0000-7000-8000-000000000101",
          projectId,
          originalName: "proposal.pdf",
          status: DocumentStatus.FAILED,
          failureReason: "Eicar-Test-Signature"
        });
        expect(body).not.toHaveProperty("ownerId");
        expect(body).not.toHaveProperty("storageProvider");
        expect(body).not.toHaveProperty("storageKey");
      });
  });

  it("보안 검사를 완료할 수 없으면 503 오류를 반환한다", async () => {
    securityScanner.error = new DocumentSecurityScanUnavailableError();

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.SERVICE_UNAVAILABLE)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 503,
          code: "DOCUMENT_SECURITY_SCAN_UNAVAILABLE",
          message: "파일 보안 검사를 완료할 수 없습니다."
        });
      });
  });

  it("Project 접근 오류와 보관 상태를 HTTP 오류로 반환한다", async () => {
    accessChecker.readableError = new ProjectNotFoundError(projectId);

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.NOT_FOUND)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
      });

    accessChecker.readableError = undefined;
    accessChecker.writableError = new ProjectStateConflictError(
      "ACTIVE 상태의 프로젝트에만 문서를 업로드할 수 있습니다."
    );

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 409, code: "PROJECT_STATE_CONFLICT" });
      });
  });

  it("다른 Project 문서 접근과 retry 충돌을 HTTP 오류로 반환한다", async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set("X-Owner-Id", ownerId)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "proposal.pdf",
        contentType: "application/pdf"
      })
      .expect(HttpStatus.CREATED);
    const documentId = uploadResponse.body.id as string;
    const otherProjectId = "018ff4f0-0000-7000-8000-000000009999";

    await request(app.getHttpServer())
      .get(`/projects/${otherProjectId}/documents/${documentId}`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.NOT_FOUND)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 404, code: "DOCUMENT_NOT_FOUND" });
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${documentId}/retry`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 409, code: "DOCUMENT_STATE_CONFLICT" });
      });

    const aggregate = await repository.findByProjectAndId(projectId, documentId);
    aggregate?.markFailed("텍스트 추출 실패", now);
    await repository.save(aggregate!);
    await storage.remove(aggregate!.snapshot().storageKey);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${documentId}/retry`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 409,
          code: "CONFLICT",
          message: "원본 파일을 찾을 수 없습니다."
        });
      });

    const saved = await repository.findByProjectAndId(projectId, documentId);
    expect(saved!.snapshot().failureReason).toBe("원본 파일을 찾을 수 없습니다.");
  });
});

class FixedClock implements Clock {
  constructor(private readonly fixedNow: Date) {}

  now(): Date {
    return this.fixedNow;
  }
}

class FixedIdGenerator implements IdGenerator {
  constructor(private readonly ids: string[]) {}

  nextId(): string {
    const id = this.ids.shift();

    if (id === undefined) {
      throw new Error("id exhausted");
    }

    return id;
  }
}

class ConfigurableProjectAccessChecker {
  readableError?: Error;
  writableError?: Error;

  async ensureReadableProject(): Promise<void> {
    if (this.readableError !== undefined) {
      throw this.readableError;
    }
  }

  async ensureWritableProject(): Promise<void> {
    if (this.writableError !== undefined) {
      throw this.writableError;
    }
  }
}

class FakeProjectDocumentSummaryUpdater {
  async recordDocumentCreated(): Promise<void> {}
}

class FakeDocumentSecurityScanner implements DocumentSecurityScanner {
  readonly inputs: DocumentSecurityScanInput[] = [];
  result: DocumentSecurityScanResult = { status: "clean" };
  error: Error | null = null;

  async scan(input: DocumentSecurityScanInput): Promise<DocumentSecurityScanResult> {
    this.inputs.push(input);

    if (this.error !== null) {
      throw this.error;
    }

    return this.result;
  }
}

class FakeOrphanDocumentStorage {
  async record(): Promise<void> {}
  async resolve(): Promise<void> {}
}
