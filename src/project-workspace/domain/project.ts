import { ProjectStateConflictError } from "./project.errors";
import { ProjectStatus } from "./project-status";
import { ProjectType } from "./project-type";

export type ProjectSnapshot = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  documentCount: number;
  riskCandidateCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
};

export type CreateProjectInput = {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  type: ProjectType;
  now: Date;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string | null;
  now: Date;
};

export class Project {
  private constructor(private state: ProjectSnapshot) {}

  static create(input: CreateProjectInput): Project {
    return new Project({
      id: input.id,
      ownerId: input.ownerId,
      name: normalizeName(input.name),
      description: normalizeDescription(input.description),
      type: input.type,
      status: ProjectStatus.ACTIVE,
      documentCount: 0,
      riskCandidateCount: 0,
      createdAt: input.now,
      updatedAt: input.now,
      lastActivityAt: input.now
    });
  }

  static rehydrate(snapshot: ProjectSnapshot): Project {
    return new Project({ ...snapshot });
  }

  update(input: UpdateProjectInput): void {
    this.state = {
      ...this.state,
      name: input.name === undefined ? this.state.name : normalizeName(input.name),
      description:
        input.description === undefined
          ? this.state.description
          : normalizeDescription(input.description),
      updatedAt: input.now
    };
  }

  archive(now: Date): void {
    if (this.state.status !== ProjectStatus.ACTIVE) {
      throw new ProjectStateConflictError("ACTIVE 상태의 프로젝트만 보관할 수 있습니다.");
    }

    this.state = { ...this.state, status: ProjectStatus.ARCHIVED, updatedAt: now };
  }

  restore(now: Date): void {
    if (this.state.status !== ProjectStatus.ARCHIVED) {
      throw new ProjectStateConflictError("ARCHIVED 상태의 프로젝트만 복원할 수 있습니다.");
    }

    this.state = { ...this.state, status: ProjectStatus.ACTIVE, updatedAt: now };
  }

  snapshot(): ProjectSnapshot {
    return { ...this.state };
  }
}

function normalizeName(name: string): string {
  return name.trim();
}

function normalizeDescription(description: string | null | undefined): string | null {
  const normalized = description?.trim() ?? "";
  return normalized === "" ? null : normalized;
}
