import { DomainError } from "../../shared/domain/domain-error";

export class ProjectNotFoundError extends DomainError {
  constructor(projectId: string) {
    super("PROJECT_NOT_FOUND", `프로젝트를 찾을 수 없습니다: ${projectId}`, 404);
  }
}

export class ProjectStateConflictError extends DomainError {
  constructor(message: string) {
    super("PROJECT_STATE_CONFLICT", message, 409);
  }
}
