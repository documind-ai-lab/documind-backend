import { DocumentFilePolicy } from "../src/document-workspace/application/document-file-policy";
import {
  DocumentSecurityScanInput,
  DocumentSecurityScanResult,
  DocumentSecurityScanner
} from "../src/document-workspace/application/document-security-scanner";
import { DocumentTextValidationError } from "../src/document-workspace/domain/document.errors";
import {
  CompleteTextExtractionUseCase,
  GetDocumentUseCase,
  FailTextExtractionUseCase,
  ListDocumentsUseCase,
  RetryDocumentUseCase,
  StartTextExtractionUseCase,
  CleanupOrphanDocumentsUseCase,
  UploadDocumentUseCase
} from "../src/document-workspace/application/document.use-cases";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import {
  DocumentFileValidationError,
  DocumentNotFoundError,
  DocumentSecurityScanUnavailableError,
  DocumentStateConflictError
} from "../src/document-workspace/domain/document.errors";
import { FakeDocumentStorage } from "../src/document-workspace/testing/fake-document-storage";
import { InMemoryDocumentRepository } from "../src/document-workspace/testing/in-memory-document.repository";
import { InMemoryDocumentTextRepository } from "../src/document-workspace/testing/in-memory-document-text.repository";
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

  it("CSV와 TXT는 MIME type과 무관하게 null byte가 있으면 거부한다", () => {
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

    expect(() =>
      policy.validate({
        originalName: "회의록.txt",
        mimeType: "text/plain",
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
  let documentTextRepository: InMemoryDocumentTextRepository;
  let storage: FakeDocumentStorage;
  let orphanStorage: FakeOrphanDocumentStorage;
  let accessChecker: FakeProjectAccessChecker;
  let summaryUpdater: FakeProjectDocumentSummaryUpdater;
  let securityScanner: FakeDocumentSecurityScanner;
  let logger: FakeApplicationLogger;
  let idGenerator: FixedIdGenerator;
  let uploadUseCase: UploadDocumentUseCase;

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    documentTextRepository = new InMemoryDocumentTextRepository(repository);
    storage = new FakeDocumentStorage();
    orphanStorage = new FakeOrphanDocumentStorage();
    accessChecker = new FakeProjectAccessChecker();
    summaryUpdater = new FakeProjectDocumentSummaryUpdater();
    securityScanner = new FakeDocumentSecurityScanner();
    logger = new FakeApplicationLogger();
    idGenerator = new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000101"]);
    uploadUseCase = new UploadDocumentUseCase(
      repository,
      storage,
      orphanStorage,
      accessChecker,
      summaryUpdater,
      securityScanner,
      new DocumentFilePolicy({ maxFileBytes: 50 * 1024 * 1024 }),
      "local",
      new FixedClock(now),
      idGenerator,
      logger
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

  it("storage provider가 s3이면 생성 Document의 storageProvider에 s3를 저장한다", async () => {
    const s3UploadUseCase = new UploadDocumentUseCase(
      repository,
      storage,
      orphanStorage,
      accessChecker,
      summaryUpdater,
      securityScanner,
      new DocumentFilePolicy({ maxFileBytes: 50 * 1024 * 1024 }),
      "s3",
      new FixedClock(now),
      idGenerator,
      logger
    );

    const document = await s3UploadUseCase.execute({
      projectId,
      ownerId,
      file: pdfFile()
    });

    expect(document.storageProvider).toBe("s3");
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

  it("보안 검사에서 감염 의심 파일이면 원본을 저장하지 않고 FAILED Document를 기록한다", async () => {
    securityScanner.result = { status: "infected", reason: "Eicar-Test-Signature" };

    const document = await uploadUseCase.execute({
      projectId,
      ownerId,
      file: pdfFile()
    });
    const saved = await repository.findByProjectAndId(projectId, document.id);

    expect(document).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "Eicar-Test-Signature",
      storageKey:
        "projects/018ff4f0-0000-7000-8000-000000000001/documents/018ff4f0-0000-7000-8000-000000000101/018ff4f0-0000-7000-8000-000000000101.pdf"
    });
    expect(saved?.snapshot()).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "Eicar-Test-Signature"
    });
    await expect(storage.exists(document.storageKey)).resolves.toBe(false);
    expect(securityScanner.inputs).toHaveLength(1);
    expect(summaryUpdater.createdRequests).toEqual([{ projectId, ownerId, occurredAt: now }]);
  });

  it("보안 검사를 완료할 수 없으면 문서와 파일을 만들지 않고 오류를 전파한다", async () => {
    securityScanner.error = new DocumentSecurityScanUnavailableError();

    await expect(
      uploadUseCase.execute({
        projectId,
        ownerId,
        file: pdfFile()
      })
    ).rejects.toThrow(DocumentSecurityScanUnavailableError);

    await expect(
      repository.findByProjectAndId(projectId, "018ff4f0-0000-7000-8000-000000000101")
    ).resolves.toBeNull();
    await expect(
      storage.exists(
        "projects/018ff4f0-0000-7000-8000-000000000001/documents/018ff4f0-0000-7000-8000-000000000101/018ff4f0-0000-7000-8000-000000000101.pdf"
      )
    ).resolves.toBe(false);
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
    expect(logger.warns).toEqual([
      {
        message: "Project 요약 갱신 실패",
        metadata: {
          projectId,
          ownerId,
          errorMessage: "summary update failed"
        }
      }
    ]);
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

  it("retry 불가능 상태에서는 원본 파일이 없어도 상태를 FAILED로 변경하지 않는다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    await storage.remove(document.storageKey);

    const retryUseCase = new RetryDocumentUseCase(repository, storage, accessChecker, new FixedClock(now));

    await expect(
      retryUseCase.execute({ projectId, ownerId, documentId: document.id })
    ).rejects.toThrow(DocumentStateConflictError);

    const saved = await repository.findByProjectAndId(projectId, document.id);
    expect(saved!.snapshot()).toMatchObject({
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null
    });
  });

  it("텍스트 추출 시작 use case는 쓰기 권한 확인 후 문서를 추출 중 상태로 저장한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const startUseCase = new StartTextExtractionUseCase(repository, accessChecker, new FixedClock(now));

    const result = await startUseCase.execute({ projectId, ownerId, documentId: document.id });
    const saved = await repository.findByProjectAndId(projectId, document.id);

    expect(result.status).toBe(DocumentStatus.TEXT_EXTRACTING);
    expect(saved!.snapshot().status).toBe(DocumentStatus.TEXT_EXTRACTING);
    expect(accessChecker.writableRequests).toContainEqual({ projectId, ownerId });
  });

  it("텍스트 추출 성공 use case는 텍스트를 저장하고 문서를 준비 상태로 전환한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const startUseCase = new StartTextExtractionUseCase(repository, accessChecker, new FixedClock(now));
    await startUseCase.execute({ projectId, ownerId, documentId: document.id });
    const completedAt = new Date("2026-07-02T02:00:00.000Z");
    const completeUseCase = new CompleteTextExtractionUseCase(
      repository,
      documentTextRepository,
      accessChecker,
      new FixedClock(completedAt),
      new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000201"])
    );

    const result = await completeUseCase.execute({
      projectId,
      ownerId,
      documentId: document.id,
      content: "  첫 줄\n둘째 줄  ",
      tokenCount: 12
    });
    const text = await documentTextRepository.findByDocumentId(document.id);

    expect(result).toMatchObject({
      status: DocumentStatus.READY,
      failureReason: null,
      updatedAt: completedAt
    });
    expect(text).toMatchObject({
      id: "018ff4f0-0000-7000-8000-000000000201",
      documentId: document.id,
      projectId,
      ownerId,
      content: "첫 줄\n둘째 줄",
      contentHash: "5fa3a5849b103ab0cf53249fd7152ff68e3f9b039da1038b0211f28de331eee0",
      tokenCount: 12,
      extractedAt: completedAt,
      createdAt: completedAt,
      updatedAt: completedAt
    });
  });

  it("텍스트 추출 성공 use case는 빈 추출 결과를 검증 오류로 거부한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const startUseCase = new StartTextExtractionUseCase(repository, accessChecker, new FixedClock(now));
    await startUseCase.execute({ projectId, ownerId, documentId: document.id });
    const completeUseCase = new CompleteTextExtractionUseCase(
      repository,
      documentTextRepository,
      accessChecker,
      new FixedClock(now),
      new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000201"])
    );

    await expect(
      completeUseCase.execute({
        projectId,
        ownerId,
        documentId: document.id,
        content: "   \n\t   "
      })
    ).rejects.toThrow(DocumentTextValidationError);

    const saved = await repository.findByProjectAndId(projectId, document.id);
    expect(saved!.snapshot().status).toBe(DocumentStatus.TEXT_EXTRACTING);
    await expect(documentTextRepository.findByDocumentId(document.id)).resolves.toBeNull();
  });

  it("텍스트 추출 실패 use case는 문서를 실패 상태와 실패 사유로 저장한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const failUseCase = new FailTextExtractionUseCase(repository, accessChecker, new FixedClock(now));

    const result = await failUseCase.execute({
      projectId,
      ownerId,
      documentId: document.id,
      reason: "  파서 오류  "
    });

    expect(result).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "파서 오류"
    });
  });

  it("텍스트 추출 use case는 잘못된 상태 전환을 상태 충돌로 거부한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const completeUseCase = new CompleteTextExtractionUseCase(
      repository,
      documentTextRepository,
      accessChecker,
      new FixedClock(now),
      new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000201"])
    );

    await expect(
      completeUseCase.execute({
        projectId,
        ownerId,
        documentId: document.id,
        content: "추출 결과"
      })
    ).rejects.toThrow(DocumentStateConflictError);
  });

  it("텍스트 추출 성공 use case는 잘못된 상태이면 content 검증보다 상태 충돌을 먼저 반환한다", async () => {
    const document = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
    const completeUseCase = new CompleteTextExtractionUseCase(
      repository,
      documentTextRepository,
      accessChecker,
      new FixedClock(now),
      new FixedIdGenerator(["018ff4f0-0000-7000-8000-000000000201"])
    );

    await expect(
      completeUseCase.execute({
        projectId,
        ownerId,
        documentId: document.id,
        content: "   "
      })
    ).rejects.toThrow(DocumentStateConflictError);
  });

  it("고아 파일 정리 대상 파일 삭제가 성공하면 후보를 resolved 처리한다", async () => {
    const cleanupUseCase = new CleanupOrphanDocumentsUseCase(
      storage,
      orphanStorage,
      new FixedClock(now),
      logger,
      { batchSize: 10, retryDelayMs: 600000 }
    );
    const storageKey = "projects/p1/documents/d1/d1.pdf";
    await storage.put(storageKey, Buffer.from("orphan"));
    orphanStorage.dueRecords.push({
      storageKey,
      reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
      attemptCount: 0
    });

    const result = await cleanupUseCase.execute();

    expect(result).toEqual({ scannedCount: 1, cleanedCount: 1, failedCount: 0 });
    await expect(storage.exists(storageKey)).resolves.toBe(false);
    expect(orphanStorage.resolvedRecords).toEqual([{ storageKey, resolvedAt: now }]);
  });

  it("고아 파일 삭제 실패는 retry 정보를 기록하고 다음 후보 처리를 계속한다", async () => {
    const cleanupUseCase = new CleanupOrphanDocumentsUseCase(
      storage,
      orphanStorage,
      new FixedClock(now),
      logger,
      { batchSize: 10, retryDelayMs: 600000 }
    );
    const failedStorageKey = "projects/p1/documents/d1/d1.pdf";
    const cleanedStorageKey = "projects/p1/documents/d2/d2.pdf";
    await storage.put(failedStorageKey, Buffer.from("failed orphan"));
    await storage.put(cleanedStorageKey, Buffer.from("cleaned orphan"));
    storage.failRemoveKeys.add(failedStorageKey);
    orphanStorage.dueRecords.push(
      {
        storageKey: failedStorageKey,
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        attemptCount: 2
      },
      {
        storageKey: cleanedStorageKey,
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        attemptCount: 0
      }
    );

    const result = await cleanupUseCase.execute();

    expect(result).toEqual({ scannedCount: 2, cleanedCount: 1, failedCount: 1 });
    await expect(storage.exists(failedStorageKey)).resolves.toBe(true);
    await expect(storage.exists(cleanedStorageKey)).resolves.toBe(false);
    expect(orphanStorage.failedRecords).toEqual([
      {
        storageKey: failedStorageKey,
        errorMessage: "remove failed",
        nextRetryAt: new Date("2026-07-02T01:10:00.000Z"),
        failedAt: now
      }
    ]);
    expect(orphanStorage.resolvedRecords).toEqual([{ storageKey: cleanedStorageKey, resolvedAt: now }]);
    expect(logger.warns).toEqual([
      {
        message: "고아 파일 정리 실패",
        metadata: {
          storageKey: failedStorageKey,
          attemptCount: 3,
          errorMessage: "remove failed"
        }
      }
    ]);
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
  readonly records: Array<{ storageKey: string; reason: string }> = [];
  readonly dueRecords: Array<{ storageKey: string; reason: string; attemptCount: number }> = [];
  readonly resolvedRecords: Array<{ storageKey: string; resolvedAt: Date }> = [];
  readonly failedRecords: Array<{
    storageKey: string;
    errorMessage: string;
    nextRetryAt: Date;
    failedAt: Date;
  }> = [];

  async record(storageKey: string, reason: string): Promise<void> {
    this.records.push({ storageKey, reason });
  }

  async listDueCleanup(limit: number): Promise<Array<{ storageKey: string; reason: string; attemptCount: number }>> {
    return this.dueRecords.slice(0, limit);
  }

  async resolve(storageKey: string, resolvedAt: Date): Promise<void> {
    this.resolvedRecords.push({ storageKey, resolvedAt });
    const index = this.records.findIndex((record) => record.storageKey === storageKey);

    if (index >= 0) {
      this.records.splice(index, 1);
    }
  }

  async markFailed(
    storageKey: string,
    errorMessage: string,
    nextRetryAt: Date,
    failedAt: Date
  ): Promise<void> {
    this.failedRecords.push({ storageKey, errorMessage, nextRetryAt, failedAt });
  }
}

class FakeApplicationLogger {
  readonly warns: Array<{ message: string; metadata?: Record<string, unknown> }> = [];

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.warns.push({ message, metadata });
  }
}
