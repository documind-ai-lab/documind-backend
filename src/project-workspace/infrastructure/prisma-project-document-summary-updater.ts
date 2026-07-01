import { Injectable } from "@nestjs/common";
import { ProjectDocumentSummaryUpdater } from "../../document-workspace/application/project-document-summary-updater";
import { ProjectNotFoundError } from "../domain/project.errors";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";

@Injectable()
export class PrismaProjectDocumentSummaryUpdater implements ProjectDocumentSummaryUpdater {
  constructor(private readonly prisma: PrismaService) {}

  async recordDocumentCreated(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    const result = await this.prisma.project.updateMany({
      where: { id: projectId, ownerId },
      data: {
        documentCount: { increment: 1 },
        lastActivityAt: occurredAt
      }
    });

    if (result.count === 0) {
      throw new ProjectNotFoundError(projectId);
    }
  }
}
