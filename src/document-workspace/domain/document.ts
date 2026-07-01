import { DocumentStateConflictError } from "./document.errors";
import { DocumentStatus } from "./document-status";

export type DocumentSnapshot = {
  id: string;
  projectId: string;
  ownerId: string;
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  status: DocumentStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDocumentInput = {
  id: string;
  projectId: string;
  ownerId: string;
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  now: Date;
};

export type CreateFailedDocumentInput = CreateDocumentInput & {
  failureReason: string;
};

export class Document {
  private constructor(private state: DocumentSnapshot) {}

  static create(input: CreateDocumentInput): Document {
    return new Document({
      id: input.id,
      projectId: input.projectId,
      ownerId: input.ownerId,
      originalName: normalizeOriginalName(input.originalName),
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      extension: normalizeExtension(input.extension),
      sizeBytes: input.sizeBytes,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      createdAt: input.now,
      updatedAt: input.now
    });
  }

  static createFailed(input: CreateFailedDocumentInput): Document {
    return new Document({
      id: input.id,
      projectId: input.projectId,
      ownerId: input.ownerId,
      originalName: normalizeOriginalName(input.originalName),
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      extension: normalizeExtension(input.extension),
      sizeBytes: input.sizeBytes,
      status: DocumentStatus.FAILED,
      failureReason: normalizeFailureReason(input.failureReason),
      createdAt: input.now,
      updatedAt: input.now
    });
  }

  static rehydrate(snapshot: DocumentSnapshot): Document {
    return new Document({ ...snapshot });
  }

  markRetryPending(now: Date): void {
    if (this.state.status !== DocumentStatus.FAILED) {
      throw new DocumentStateConflictError("FAILED 상태의 문서만 재시도할 수 있습니다.");
    }

    this.state = {
      ...this.state,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      updatedAt: now
    };
  }

  markFailed(reason: string, now: Date): void {
    this.state = {
      ...this.state,
      status: DocumentStatus.FAILED,
      failureReason: normalizeFailureReason(reason),
      updatedAt: now
    };
  }

  snapshot(): DocumentSnapshot {
    return { ...this.state };
  }
}

function normalizeOriginalName(originalName: string): string {
  return originalName.trim();
}

function normalizeExtension(extension: string): string {
  return extension.trim().toLowerCase();
}

function normalizeFailureReason(reason: string): string {
  return reason.trim();
}
