import { DomainError } from "../../shared/domain/domain-error";

export class DocumentNotFoundError extends DomainError {
  constructor(documentId: string) {
    super("DOCUMENT_NOT_FOUND", `문서를 찾을 수 없습니다: ${documentId}`, 404);
  }
}

export class DocumentStateConflictError extends DomainError {
  constructor(message: string) {
    super("DOCUMENT_STATE_CONFLICT", message, 409);
  }
}

export class DocumentStorageError extends DomainError {
  constructor(message: string) {
    super("DOCUMENT_STORAGE_ERROR", message, 500);
  }
}

export class DocumentStoragePathError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class DocumentFileValidationError extends DomainError {
  constructor(
    message: string,
    status: number = 422
  ) {
    super("VALIDATION_ERROR", message, status);
  }
}
