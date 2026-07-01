import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import {
  ProjectAccessChecker,
  ProjectAccessResult
} from "../application/project-access-checker";
import { ProjectNotFoundError, ProjectStateConflictError } from "../../project-workspace/domain/project.errors";
import { ProjectStatus } from "../../project-workspace/domain/project-status";

@Injectable()
export class PrismaProjectAccessChecker implements ProjectAccessChecker {
  constructor(private readonly prisma: PrismaService) {}

  async ensureReadableProject(projectId: string, ownerId: string): Promise<ProjectAccessResult> {
    return this.findAccessibleProject(projectId, ownerId);
  }

  async ensureWritableProject(projectId: string, ownerId: string): Promise<ProjectAccessResult> {
    const project = await this.findAccessibleProject(projectId, ownerId);

    if (project.status !== ProjectStatus.ACTIVE) {
      throw new ProjectStateConflictError("ACTIVE 상태의 프로젝트에만 문서를 업로드할 수 있습니다.");
    }

    return project;
  }

  private async findAccessibleProject(
    projectId: string,
    ownerId: string
  ): Promise<ProjectAccessResult> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });

    if (project === null || project.ownerId !== ownerId) {
      throw new ProjectNotFoundError(projectId);
    }

    return { projectId: project.id, ownerId: project.ownerId, status: project.status };
  }
}
