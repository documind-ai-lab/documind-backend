import { createHash } from "crypto";
import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { ApplicationLogger } from "../../shared/application/application-logger";
import { PageResponse } from "../../shared/application/page-response";
import { CreateDocumentInput, Document, DocumentSnapshot } from "../domain/document";
import { DocumentNotFoundError, DocumentTextValidationError } from "../domain/document.errors";
import { DocumentFileInput, DocumentFilePolicy } from "./document-file-policy";
import { DocumentRepository } from "./document.repository";
import { DocumentSecurityScanner } from "./document-security-scanner";
import { DocumentStorage } from "./document-storage";
import { DocumentTextExtractionError, DocumentTextExtractor } from "./document-text-extractor";
import { DocumentTextRepository } from "./document-text.repository";
import { OrphanDocumentStorage } from "./orphan-document-storage";
import { ProjectAccessChecker } from "./project-access-checker";
import { ProjectDocumentSummaryUpdater } from "./project-document-summary-updater";

const MAX_DOCUMENT_TEXT_BYTES = 5 * 1024 * 1024;

export type UploadDocumentCommand = {
  projectId: string;
  ownerId: string;
  file: DocumentFileInput;
};

export type ListDocumentsCommand = {
  projectId: string;
  ownerId: string;
  page: number;
  size: number;
};

export type GetDocumentCommand = {
  projectId: string;
  ownerId: string;
  documentId: string;
};

export type RetryDocumentCommand = GetDocumentCommand;

export type CompleteTextExtractionCommand = GetDocumentCommand & {
  content: string;
  tokenCount?: number;
};

export type FailTextExtractionCommand = GetDocumentCommand & {
  reason: string;
};

export type ProcessPlainTextExtractionCommand = GetDocumentCommand;

export type RetryDocumentResult =
  | { type: "success"; document: DocumentSnapshot }
  | { type: "conflict"; document: DocumentSnapshot; reason: string };

export type ProcessPlainTextExtractionResult =
  | { type: "completed"; document: DocumentSnapshot }
  | { type: "failed"; document: DocumentSnapshot; reason: string }
  | { type: "skipped"; document: DocumentSnapshot; reason: string };

export type CleanupOrphanDocumentsOptions = {
  batchSize: number;
  retryDelayMs: number;
};

export type CleanupOrphanDocumentsResult = {
  scannedCount: number;
  cleanedCount: number;
  failedCount: number;
};

export class UploadDocumentUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: DocumentStorage,
    private readonly orphanStorage: OrphanDocumentStorage,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly summaryUpdater: ProjectDocumentSummaryUpdater,
    private readonly securityScanner: DocumentSecurityScanner,
    private readonly filePolicy: DocumentFilePolicy,
    private readonly storageProvider: string,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly logger: ApplicationLogger
  ) {}

  async execute(command: UploadDocumentCommand): Promise<DocumentSnapshot> {
    await this.accessChecker.ensureWritableProject(command.projectId, command.ownerId);

    const file = this.filePolicy.validate(command.file);
    const documentId = this.idGenerator.nextId();
    const storageKey = buildStorageKey(command.projectId, documentId, file.extension);
    const now = this.clock.now();
    const baseDocumentInput: CreateDocumentInput = {
      id: documentId,
      projectId: command.projectId,
      ownerId: command.ownerId,
      originalName: file.originalName,
      storageProvider: this.storageProvider,
      storageKey,
      mimeType: file.mimeType,
      extension: file.extension,
      sizeBytes: file.sizeBytes,
      now
    };
    const scanResult = await this.securityScanner.scan({
      documentId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      extension: file.extension,
      sizeBytes: file.sizeBytes,
      buffer: file.buffer
    });

    const document =
      scanResult.status === "infected"
        ? Document.createFailed({ ...baseDocumentInput, failureReason: scanResult.reason })
        : Document.create(baseDocumentInput);

    if (scanResult.status === "infected") {
      await this.repository.create(document);
      await this.recordProjectSummary(command.projectId, command.ownerId, now);
      return document.snapshot();
    }

    await this.storage.put(storageKey, file.buffer);

    try {
      await this.repository.create(document);
    } catch (error) {
      await this.cleanupStoredFile(storageKey);
      throw error;
    }

    await this.recordProjectSummary(command.projectId, command.ownerId, now);
    return document.snapshot();
  }

  private async cleanupStoredFile(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch {
      await this.orphanStorage.record(storageKey, "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED");
    }
  }

  private async recordProjectSummary(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    try {
      await this.summaryUpdater.recordDocumentCreated(projectId, ownerId, occurredAt);
    } catch (error) {
      this.logger.warn("Project 요약 갱신 실패", {
        projectId,
        ownerId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      // Project summary is denormalized; Document creation remains the source of truth.
    }
  }
}

export class ListDocumentsUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly accessChecker: ProjectAccessChecker
  ) {}

  async execute(command: ListDocumentsCommand): Promise<PageResponse<DocumentSnapshot>> {
    await this.accessChecker.ensureReadableProject(command.projectId, command.ownerId);
    return this.repository.listByProject(command);
  }
}

export class GetDocumentUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly accessChecker: ProjectAccessChecker
  ) {}

  async execute(command: GetDocumentCommand): Promise<DocumentSnapshot> {
    await this.accessChecker.ensureReadableProject(command.projectId, command.ownerId);
    const document = await findDocumentOrThrow(
      this.repository,
      command.projectId,
      command.documentId
    );
    return document.snapshot();
  }
}

export class RetryDocumentUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: DocumentStorage,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly clock: Clock
  ) {}

  async execute(command: RetryDocumentCommand): Promise<RetryDocumentResult> {
    await this.accessChecker.ensureWritableProject(command.projectId, command.ownerId);
    const document = await findDocumentOrThrow(
      this.repository,
      command.projectId,
      command.documentId
    );
    const snapshot = document.snapshot();
    const now = this.clock.now();

    document.markRetryPending(now);

    if (!(await this.storage.exists(snapshot.storageKey))) {
      const reason = "원본 파일을 찾을 수 없습니다.";
      document.markFailed(reason, now);
      await this.repository.save(document);
      return { type: "conflict", document: document.snapshot(), reason };
    }

    await this.repository.save(document);
    return { type: "success", document: document.snapshot() };
  }
}

export class StartTextExtractionUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly clock: Clock
  ) {}

  async execute(command: GetDocumentCommand): Promise<DocumentSnapshot> {
    await this.accessChecker.ensureWritableProject(command.projectId, command.ownerId);
    const document = await findDocumentOrThrow(
      this.repository,
      command.projectId,
      command.documentId
    );
    document.markTextExtracting(this.clock.now());
    await this.repository.save(document);
    return document.snapshot();
  }
}

export class CompleteTextExtractionUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly documentTextRepository: DocumentTextRepository,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator
  ) {}

  async execute(command: CompleteTextExtractionCommand): Promise<DocumentSnapshot> {
    await this.accessChecker.ensureWritableProject(command.projectId, command.ownerId);
    const document = await findDocumentOrThrow(
      this.repository,
      command.projectId,
      command.documentId
    );
    const now = this.clock.now();

    document.markTextExtractionReady(now);
    const content = normalizeDocumentTextContent(command.content);
    const tokenCount = normalizeTokenCount(command.tokenCount);
    await this.documentTextRepository.saveExtractionResult(document, {
      id: this.idGenerator.nextId(),
      documentId: command.documentId,
      projectId: command.projectId,
      ownerId: command.ownerId,
      content,
      contentHash: hashContent(content),
      tokenCount,
      extractedAt: now,
      now
    });
    return document.snapshot();
  }
}

export class FailTextExtractionUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly clock: Clock
  ) {}

  async execute(command: FailTextExtractionCommand): Promise<DocumentSnapshot> {
    await this.accessChecker.ensureWritableProject(command.projectId, command.ownerId);
    const document = await findDocumentOrThrow(
      this.repository,
      command.projectId,
      command.documentId
    );
    document.markTextExtractionFailed(command.reason, this.clock.now());
    await this.repository.save(document);
    return document.snapshot();
  }
}

export class ProcessPlainTextExtractionUseCase {
  constructor(
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly startUseCase: StartTextExtractionUseCase,
    private readonly completeUseCase: CompleteTextExtractionUseCase,
    private readonly failUseCase: FailTextExtractionUseCase,
    private readonly storage: DocumentStorage,
    private readonly extractor: DocumentTextExtractor
  ) {}

  async execute(command: ProcessPlainTextExtractionCommand): Promise<ProcessPlainTextExtractionResult> {
    const document = await this.getDocumentUseCase.execute(command);

    if (!this.extractor.supports(document.extension)) {
      return {
        type: "skipped",
        document,
        reason: "지원하지 않는 텍스트 추출 형식입니다."
      };
    }

    const extractingDocument = await this.startUseCase.execute(command);

    try {
      const content = await this.storage.read(extractingDocument.storageKey);
      const extracted = this.extractor.extract({
        extension: extractingDocument.extension,
        content
      });
      const completedDocument = await this.completeUseCase.execute({
        ...command,
        content: extracted.content,
        tokenCount: extracted.tokenCount ?? undefined
      });

      return { type: "completed", document: completedDocument };
    } catch (error) {
      const reason = plainTextExtractionFailureReason(error);
      const failedDocument = await this.failUseCase.execute({ ...command, reason });

      return { type: "failed", document: failedDocument, reason };
    }
  }
}

export class CleanupOrphanDocumentsUseCase {
  constructor(
    private readonly storage: DocumentStorage,
    private readonly orphanStorage: OrphanDocumentStorage,
    private readonly clock: Clock,
    private readonly logger: ApplicationLogger,
    private readonly options: CleanupOrphanDocumentsOptions
  ) {}

  async execute(): Promise<CleanupOrphanDocumentsResult> {
    const now = this.clock.now();
    const records = await this.orphanStorage.listDueCleanup(this.options.batchSize, now);
    let cleanedCount = 0;
    let failedCount = 0;

    for (const record of records) {
      try {
        await this.storage.remove(record.storageKey);
        await this.orphanStorage.resolve(record.storageKey, now);
        cleanedCount += 1;
      } catch (error) {
        failedCount += 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const nextRetryAt = new Date(now.getTime() + this.options.retryDelayMs);
        await this.orphanStorage.markFailed(record.storageKey, errorMessage, nextRetryAt, now);
        this.logger.warn("고아 파일 정리 실패", {
          storageKey: record.storageKey,
          attemptCount: record.attemptCount + 1,
          errorMessage
        });
      }
    }

    return {
      scannedCount: records.length,
      cleanedCount,
      failedCount
    };
  }
}

async function findDocumentOrThrow(
  repository: DocumentRepository,
  projectId: string,
  documentId: string
): Promise<Document> {
  const document = await repository.findByProjectAndId(projectId, documentId);

  if (document === null) {
    throw new DocumentNotFoundError(documentId);
  }

  return document;
}

function buildStorageKey(projectId: string, documentId: string, extension: string): string {
  return `projects/${projectId}/documents/${documentId}/${documentId}.${extension}`;
}

function normalizeDocumentTextContent(content: string): string {
  const normalized = content.trim();

  if (normalized.length === 0) {
    throw new DocumentTextValidationError("추출 텍스트가 비어 있습니다.");
  }

  if (Buffer.byteLength(normalized, "utf8") > MAX_DOCUMENT_TEXT_BYTES) {
    throw new DocumentTextValidationError("추출 텍스트가 최대 저장 크기를 초과했습니다.");
  }

  return normalized;
}

function normalizeTokenCount(tokenCount: number | undefined): number | null {
  if (tokenCount === undefined) {
    return null;
  }

  if (!Number.isInteger(tokenCount) || tokenCount < 0) {
    throw new DocumentTextValidationError("tokenCount는 0 이상의 정수여야 합니다.");
  }

  return tokenCount;
}

function plainTextExtractionFailureReason(error: unknown): string {
  if (error instanceof DocumentTextValidationError || error instanceof DocumentTextExtractionError) {
    return error.message;
  }

  return "원본 파일을 읽을 수 없습니다.";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
