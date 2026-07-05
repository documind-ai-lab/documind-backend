import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createPageResponse, PageResponse } from "../../shared/application/page-response";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import { ChatMessage, ChatMessageSnapshot, ChatSourceSnapshot } from "../domain/chat-message";
import { ChatRole } from "../domain/chat-role";
import { ChatHistoryItem } from "../application/chat-answer-generator";
import { ChatRepository, ListChatMessagesQuery } from "../application/chat.repository";

type ChatMessageRecord = Prisma.ChatMessageGetPayload<{ include: { sources: true } }>;

@Injectable()
export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveConversation(userMessage: ChatMessage, assistantMessage: ChatMessage): Promise<void> {
    const user = userMessage.snapshot();
    const assistant = assistantMessage.snapshot();

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          id: user.id,
          projectId: user.projectId,
          ownerId: user.ownerId,
          role: user.role,
          content: user.content,
          createdAt: user.createdAt
        }
      }),
      this.prisma.chatMessage.create({
        data: {
          id: assistant.id,
          projectId: assistant.projectId,
          ownerId: assistant.ownerId,
          role: assistant.role,
          content: assistant.content,
          createdAt: assistant.createdAt,
          sources: {
            create: assistant.sources.map((source) => ({
              id: source.id,
              documentId: source.documentId,
              sourceIndex: source.index,
              title: source.title,
              quote: source.quote,
              relevance: source.relevance,
              createdAt: source.createdAt
            }))
          }
        }
      })
    ]);
  }

  async listByProject(query: ListChatMessagesQuery): Promise<PageResponse<ChatMessageSnapshot>> {
    const where = { projectId: query.projectId, ownerId: query.ownerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chatMessage.findMany({
        where,
        include: { sources: { orderBy: { sourceIndex: "asc" } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.size,
        take: query.size
      }),
      this.prisma.chatMessage.count({ where })
    ]);

    return createPageResponse({
      items: items.map(toSnapshot),
      page: query.page,
      size: query.size,
      total
    });
  }

  async listRecent(projectId: string, ownerId: string, limit: number): Promise<ChatHistoryItem[]> {
    const records = await this.prisma.chatMessage.findMany({
      where: { projectId, ownerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });

    return records
      .reverse()
      .map((record) => ({ role: record.role as ChatRole, content: record.content }));
  }
}

function toSnapshot(record: ChatMessageRecord): ChatMessageSnapshot {
  return {
    id: record.id,
    projectId: record.projectId,
    ownerId: record.ownerId,
    role: record.role as ChatRole,
    content: record.content,
    createdAt: record.createdAt,
    sources: record.sources.map(toSourceSnapshot)
  };
}

function toSourceSnapshot(source: ChatMessageRecord["sources"][number]): ChatSourceSnapshot {
  return {
    id: source.id,
    messageId: source.messageId,
    documentId: source.documentId,
    index: source.sourceIndex,
    title: source.title,
    quote: source.quote,
    relevance: source.relevance === null ? null : source.relevance.toNumber(),
    createdAt: source.createdAt
  };
}
