import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { ApplicationLogger } from "../../shared/application/application-logger";
import { PageResponse } from "../../shared/application/page-response";
import { Document, DocumentSnapshot } from "../domain/document";
import { DocumentNotFoundError } from "../domain/document.errors";
import { DocumentFileInput, DocumentFilePolicy } from "./document-file-policy";
import { DocumentRepository } from "./document.repository";
import { DocumentStorage } from "./document-storage";
import { OrphanDocumentStorage } from "./orphan-document-storage";
import { ProjectAccessChecker } from "./project-access-checker";
import { ProjectDocumentSummaryUpdater } from "./project-document-summary-updater";

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

export type RetryDocumentResult =
  | { type: "success"; document: DocumentSnapshot }
  | { type: "conflict"; document: DocumentSnapshot; reason: string };

export class UploadDocumentUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: DocumentStorage,
    private readonly orphanStorage: OrphanDocumentStorage,
    private readonly accessChecker: ProjectAccessChecker,
    private readonly summaryUpdater: ProjectDocumentSummaryUpdater,
    private readonly filePolicy: DocumentFilePolicy,
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
    const document = Document.create({
      id: documentId,
      projectId: command.projectId,
      ownerId: command.ownerId,
      originalName: file.originalName,
      storageProvider: "local",
      storageKey,
      mimeType: file.mimeType,
      extension: file.extension,
      sizeBytes: file.sizeBytes,
      now
    });

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
