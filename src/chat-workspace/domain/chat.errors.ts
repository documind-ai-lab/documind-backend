import { DomainError } from "../../shared/domain/domain-error";

export class ChatMessageValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 422);
  }
}

export class ChatProjectStateConflictError extends DomainError {
  constructor(message: string) {
    super("PROJECT_STATE_CONFLICT", message, 409);
  }
}

export class ChatAnswerGenerationError extends DomainError {
  constructor() {
    super("CHAT_ANSWER_GENERATION_FAILED", "AI 답변을 생성할 수 없습니다.", 500);
  }
}
