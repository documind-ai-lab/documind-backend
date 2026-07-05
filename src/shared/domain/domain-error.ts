export type DomainErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_STATE_CONFLICT"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_STATE_CONFLICT"
  | "DOCUMENT_STORAGE_ERROR"
  | "DOCUMENT_SECURITY_SCAN_UNAVAILABLE"
  | "CHAT_ANSWER_GENERATION_FAILED"
  | "VALIDATION_ERROR";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
