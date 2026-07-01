import { DomainError } from "../../shared/domain/domain-error";

export class DocumentStateConflictError extends DomainError {
  constructor(message: string) {
    super("DOCUMENT_STATE_CONFLICT", message, 409);
  }
}
