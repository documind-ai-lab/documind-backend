import { Injectable } from "@nestjs/common";
import { ProjectNotFoundError } from "../../project-workspace/domain/project.errors";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import { ChatProjectActivityUpdater } from "../application/chat-project-activity-updater";

@Injectable()
export class PrismaChatProjectActivityUpdater implements ChatProjectActivityUpdater {
  constructor(private readonly prisma: PrismaService) {}

  async recordChatActivity(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    const result = await this.prisma.project.updateMany({
      where: { id: projectId, ownerId },
      data: { lastActivityAt: occurredAt }
    });

    if (result.count === 0) {
      throw new ProjectNotFoundError(projectId);
    }
  }
}
