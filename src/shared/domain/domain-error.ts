export type DomainErrorCode = "PROJECT_NOT_FOUND" | "PROJECT_STATE_CONFLICT" | "VALIDATION_ERROR";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
