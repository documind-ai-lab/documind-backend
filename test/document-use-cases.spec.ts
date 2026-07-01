import { DocumentFilePolicy } from "../src/document-workspace/application/document-file-policy";
import {
  GetDocumentUseCase,
  ListDocumentsUseCase,
  RetryDocumentUseCase,
  UploadDocumentUseCase
} from "../src/document-workspace/application/document.use-cases";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import {
  DocumentFileValidationError,
  DocumentNotFoundError
} from "../src/document-workspace/domain/document.errors";
import { FakeDocumentStorage } from "../src/document-workspace/testing/fake-document-storage";
import { InMemoryDocumentRepository } from "../src/document-workspace/testing/in-memory-document.repository";
import { Clock } from "../src/shared/application/clock";
import { IdGenerator } from "../src/shared/application/id-generator";

describe("Document file policy", () => {
  const policy = new DocumentFilePolicy({ maxFileBytes: 50 * 1024 * 1024 });

  it("허용된 PDF 파일의 확장자와 MIME type을 검증하고 확장자를 정규화한다", () => {
    const result = policy.validate({
      originalName: "  A사 제안서.PDF  ",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      buffer: Buffer.from("%PDF-1.7")
    });

    expect(result).toEqual({
      originalName: "A사 제안서.PDF",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extension: "pdf",
      buffer: Buffer.from("%PDF-1.7")
    });
  });

  it("파일명이 비어 있거나 확장자가 없으면 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "제안서",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("허용되지 않은 확장자와 MIME type은 415 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "악성파일.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        buffer: Buffer.from("binary")
      })
    ).toThrow(DocumentFileValidationError);

    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("비어 있거나 최대 크기를 초과한 파일은 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
        buffer: Buffer.alloc(0)
      })
    ).toThrow(DocumentFileValidationError);

    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/pdf",
        sizeBytes: 50 * 1024 * 1024 + 1,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("CSV와 TXT는 octet-stream을 허용하되 null byte가 있으면 거부한다", () => {
    expect(
      policy.validate({
        originalName: "회의록.txt",
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        buffer: Buffer.from("안녕하세요")
      }).extension
    ).toBe("txt");

    expect(() =>
      policy.validate({
        originalName: "회의록.txt",
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        buffer: Buffer.from([0x41, 0x00, 0x42])
      })
    ).toThrow(DocumentFileValidationError);
  });
});

describe("Document use cases", () => {
  const now = new Date("2026-07-02T01:00:00.000Z");
  const projectId = "018ff4f0-0000-7000-8000-000000000001";
  const ownerId = "018ff4f0-0000-7000-8000-000000000002";

  let repository: InMemoryDocumentRepository;
  let storage: FakeDocumentStorage;
  let orphanStorage: FakeOrphanDocumentStorage;
  let accessChecker: FakeProjectAccessChecker;
  let summaryUpdater: FakeProjectDocumentSummaryUpdater;
  let idGenerator: FixedIdGenerator;
  let uploadUseCase: UploadDocumentUseCase;

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    storage = new FakeDocumentStorage();
    orphanStorage = new FakeOrphanDocumentStorage();
    accessChecker = new FakeProjectAccessChecker();
    summaryUpdater = new FakeProjectDocumentSummaryUpdater();
    idGenerator = new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000101"]);
    uploadUseCase = new UploadDocumentUseCase(
      repository,
      storage,
      orphanStorage,
      accessChecker,
      summaryUpdater,
      new DocumentFilePolicy({ maxFileBytes: 50 * 1024 * 1024 }),
      new FixedClock(now),
      idGenerator
    );
  });

  it("파일을 저장하고 Document를 생성한 뒤 Project 요약 갱신을 요청한다", async () => {
    const document = await uploadUseCase.execute({
      projectId,
      ownerId,
      file: pdfFile()
    });

    expect(document).toMatchObject({
      id: "018ff4f0-0000-7000-8000-000000000101",
      projectId,
      ownerId,
      originalName: "제안서.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      storageProvider: "local",
      storageKey:
        "projects/018ff4f0-0000-7000-8000-000000000001/documents/018ff4f0-0000-7000-8000-000000000101/018ff4f0-0000-7000-8000-000000000101.pdf"
    });
    await expect(storage.exists(document.storageKey)).resolves.toBe(true);
    expect(accessChecker.writableRequests).toEqual([{ projectId, ownerId }]);
    expect(summaryUpdater.createdRequests).toEqual([{ projectId, ownerId, occurredAt: now }]);
  });

  it("Document 저장 실패 시 저장한 파일 삭제를 시도하고 삭제 실패는 orphan 후보로 기록한다", async () => {
    repository.failNextCreate = true;
    storage.failRemove = true;

    await expect(
      uploadUseCase.execute({
        projectId,
        ownerId,
        file: pdfFile()
      })
    ).rejects.toThrow("create failed");

    expect(storage.removedKeys).toEqual([
      "projects/018ff4f0-0000-7000-8000-000000000001/documents/018ff4f0-0000-7000-8000-000000000101/018ff4f0-0000-7000-8000-000000000101.pdf"
    ]);
    expect(orphanStorage.records).toEqual([
      {
        storageKey:
          "projects/018ff4f0-0000-7000-8000-000000000001/documents/018ff4f0-0000-7000-8000-000000000101/018ff4f0-0000-7000-8000-000000000101.pdf",
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED"
      }
    ]);
    expect(summaryUpdater.createdRequests).toEqual([]);
  });

  it("Project 요약 갱신이 실패해도 생성된 Document 응답을 반환한다", async () => {
    summaryUpdater.failNextRecord = true;

    const document = await uploadUseCase.execute({
      projectId,
      ownerId,
      file: pdfFile()
    });

    await expect(repository.findByProjectAndId(projectId, document.id)).resolves.not.toBeNull();
    expect(document.status).toBe(DocumentStatus.TEXT_EXTRACTION_PENDING);
  });

  it("목록과 상세 조회는 Project 읽기 권한을 확인하고 해당 Project 문서만 반환한다", async () => {
    const first = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile("첫번째.pdf") });
    idGenerator.ids.push("018ff4f0-0000-7000-8000-000000000102");
    await uploadUseCase.execute({ projectId, ownerId, file: pdfFile("두번째.pdf") });

    const listUseCase = new ListDocumentsUseCase(repository, accessChecker);
    const getUseCase = new GetDocumentUseCase(repository, accessChecker);
    const list = await listUseCase.execute({ projectId, ownerId, page: 1, size: 20 });
    const detail = await getUseCase.execute({ projectId, ownerId, documentId: first.id });

    expect(list.items.map((item) => item.originalName)).toEqual(["두번째.pdf", "첫번째.pdf"]);
    expect(detail.id).toBe(first.id);
    expect(accessChecker.readableRequests).toEqual([
      { projectId, ownerId },
      { projectId, ownerId }
    ]);
  });

  it("상세 조회에서 문서가 Project에 속하지 않으면 not found를 던진다", async () => {
    const getUseCase = new GetDocumentUseCase(repository, accessChecker);

    await expect(
      getUseCase.execute({
        projectId,
        ownerId,
        documentId: "018ff4f0-0000-7000-8000-000000009999"
      })
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it("FAILED 문서는 원본 파일이 존재하면 재시도 대기 상태로 전환한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const aggregate = await repository.findByProjectAndId(projectId, document.id);
    aggregate?.markFailed("텍스트 추출 실패", now);
    await repository.save(aggregate!);

    const retryUseCase = new RetryDocumentUseCase(repository, storage, accessChecker, new FixedClock(now));
    const result = await retryUseCase.execute({ projectId, ownerId, documentId: document.id });

    expect(result.type).toBe("success");
    expect(result.document.status).toBe(DocumentStatus.TEXT_EXTRACTION_PENDING);
    expect(result.document.failureReason).toBeNull();
  });

  it("retry 원본 파일이 없으면 failureReason을 저장하고 conflict result를 반환한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const aggregate = await repository.findByProjectAndId(projectId, document.id);
    aggregate?.markFailed("텍스트 추출 실패", now);
    await repository.save(aggregate!);
    await storage.remove(document.storageKey);

    const retryUseCase = new RetryDocumentUseCase(repository, storage, accessChecker, new FixedClock(now));
    const result = await retryUseCase.execute({ projectId, ownerId, documentId: document.id });
    const saved = await repository.findByProjectAndId(projectId, document.id);

    expect(result).toEqual({
      type: "conflict",
      document: saved!.snapshot(),
      reason: "원본 파일을 찾을 수 없습니다."
    });
    expect(saved!.snapshot()).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "원본 파일을 찾을 수 없습니다."
    });
  });
});

function pdfFile(originalName = "제안서.pdf") {
  return {
    originalName,
    mimeType: "application/pdf",
    sizeBytes: 8,
    buffer: Buffer.from("%PDF-1.7")
  };
}

class FixedClock implements Clock {
  constructor(private readonly fixedNow: Date) {}

  now(): Date {
    return this.fixedNow;
  }
}

class FixedIdGenerator implements IdGenerator {
  constructor(readonly ids: string[]) {}

  nextId(): string {
    const id = this.ids.shift();

    if (id === undefined) {
      throw new Error("id exhausted");
    }

    return id;
  }
}

class FakeProjectAccessChecker {
  readonly readableRequests: Array<{ projectId: string; ownerId: string }> = [];
  readonly writableRequests: Array<{ projectId: string; ownerId: string }> = [];

  async ensureReadableProject(projectId: string, ownerId: string): Promise<void> {
    this.readableRequests.push({ projectId, ownerId });
  }

  async ensureWritableProject(projectId: string, ownerId: string): Promise<void> {
    this.writableRequests.push({ projectId, ownerId });
  }
}

class FakeProjectDocumentSummaryUpdater {
  readonly createdRequests: Array<{ projectId: string; ownerId: string; occurredAt: Date }> = [];
  failNextRecord = false;

  async recordDocumentCreated(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    if (this.failNextRecord) {
      this.failNextRecord = false;
      throw new Error("summary update failed");
    }

    this.createdRequests.push({ projectId, ownerId, occurredAt });
  }
}

class FakeOrphanDocumentStorage {
  readonly records: Array<{ storageKey: string; reason: string }> = [];

  async record(storageKey: string, reason: string): Promise<void> {
    this.records.push({ storageKey, reason });
  }

  async resolve(storageKey: string): Promise<void> {
    const index = this.records.findIndex((record) => record.storageKey === storageKey);

    if (index >= 0) {
      this.records.splice(index, 1);
    }
  }
}
