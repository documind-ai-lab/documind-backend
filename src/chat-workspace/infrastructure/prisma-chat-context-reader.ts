import { Injectable } from "@nestjs/common";
import { DocumentStatus } from "../../document-workspace/domain/document-status";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import { ChatContextItem } from "../application/chat-answer-generator";
import { ChatContextReader, ReadChatContextQuery } from "../application/chat-context-reader";

@Injectable()
export class PrismaChatContextReader implements ChatContextReader {
  constructor(private readonly prisma: PrismaService) {}

  async readProjectContexts(query: ReadChatContextQuery): Promise<ChatContextItem[]> {
    const records = await this.prisma.documentText.findMany({
      where: {
        projectId: query.projectId,
        ownerId: query.ownerId,
        document: { status: DocumentStatus.READY }
      },
      include: { document: true },
      orderBy: [{ extractedAt: "desc" }, { documentId: "desc" }],
      take: query.limit
    });
    const contexts: ChatContextItem[] = [];
    let totalChars = 0;

    for (const record of records) {
      if (totalChars >= query.totalCharLimit) {
        break;
      }

      const remaining = query.totalCharLimit - totalChars;
      const content = record.content.slice(0, Math.min(query.perDocumentCharLimit, remaining));

      if (content.trim().length === 0) {
        continue;
      }

      contexts.push({
        documentId: record.documentId,
        title: record.document.originalName,
        content
      });
      totalChars += content.length;
    }

    return contexts;
  }
}
