import { Injectable } from "@nestjs/common";
import { ProjectNotFoundError } from "../../project-workspace/domain/project.errors";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import {
  ChatProjectAccessChecker,
  ChatProjectAccessResult
} from "../application/chat-project-access-checker";

@Injectable()
export class PrismaChatProjectAccessChecker implements ChatProjectAccessChecker {
  constructor(private readonly prisma: PrismaService) {}

  async ensureReadableProject(projectId: string, ownerId: string): Promise<ChatProjectAccessResult> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });

    if (project === null || project.ownerId !== ownerId) {
      throw new ProjectNotFoundError(projectId);
    }

    return { projectId: project.id, ownerId: project.ownerId, status: project.status };
  }
}
