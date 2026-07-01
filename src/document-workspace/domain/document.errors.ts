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

export class DocumentSecurityScanUnavailableError extends DomainError {
  constructor() {
    super("DOCUMENT_SECURITY_SCAN_UNAVAILABLE", "파일 보안 검사를 완료할 수 없습니다.", 503);
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
