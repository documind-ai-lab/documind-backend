import { ChatMessageValidationError } from "./chat.errors";
import { ChatRole } from "./chat-role";

export type ChatSourceSnapshot = {
  id: string;
  messageId: string;
  documentId: string;
  index: number;
  title: string;
  quote: string;
  relevance: number | null;
  createdAt: Date;
};

export type ChatMessageSnapshot = {
  id: string;
  projectId: string;
  ownerId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
  sources: ChatSourceSnapshot[];
};

export type CreateChatMessageInput = {
  id: string;
  projectId: string;
  ownerId: string;
  content: string;
  createdAt: Date;
};

export type CreateAssistantChatMessageInput = CreateChatMessageInput & {
  sources: Omit<ChatSourceSnapshot, "messageId">[];
};

export class ChatMessage {
  private constructor(private readonly props: ChatMessageSnapshot) {}

  static createUser(input: CreateChatMessageInput): ChatMessage {
    return new ChatMessage({
      id: input.id,
      projectId: input.projectId,
      ownerId: input.ownerId,
      role: ChatRole.USER,
      content: normalizeContent(input.content),
      createdAt: input.createdAt,
      sources: []
    });
  }

  static createAssistant(input: CreateAssistantChatMessageInput): ChatMessage {
    return new ChatMessage({
      id: input.id,
      projectId: input.projectId,
      ownerId: input.ownerId,
      role: ChatRole.ASSISTANT,
      content: normalizeContent(input.content),
      createdAt: input.createdAt,
      sources: normalizeSources(input.id, input.sources)
    });
  }

  static rehydrate(snapshot: ChatMessageSnapshot): ChatMessage {
    return new ChatMessage({
      ...snapshot,
      content: normalizeContent(snapshot.content),
      sources: normalizeSources(
        snapshot.id,
        snapshot.sources.map((source) => ({
          id: source.id,
          documentId: source.documentId,
          index: source.index,
          title: source.title,
          quote: source.quote,
          relevance: source.relevance,
          createdAt: source.createdAt
        }))
      )
    });
  }

  snapshot(): ChatMessageSnapshot {
    return {
      ...this.props,
      sources: this.props.sources.map((source) => ({ ...source }))
    };
  }
}

function normalizeContent(content: string): string {
  const normalized = content.trim();

  if (normalized.length === 0) {
    throw new ChatMessageValidationError("채팅 메시지는 비어 있을 수 없습니다.");
  }

  return normalized;
}

function normalizeSources(
  messageId: string,
  sources: Omit<ChatSourceSnapshot, "messageId">[]
): ChatSourceSnapshot[] {
  const indexes = new Set<number>();

  return sources.map((source) => {
    if (!Number.isInteger(source.index) || source.index < 1) {
      throw new ChatMessageValidationError("출처 번호는 1 이상의 정수여야 합니다.");
    }

    if (indexes.has(source.index)) {
      throw new ChatMessageValidationError("출처 번호는 중복될 수 없습니다.");
    }
    indexes.add(source.index);

    const title = source.title.trim();
    const quote = source.quote.trim();

    if (title.length === 0 || quote.length === 0) {
      throw new ChatMessageValidationError("출처 제목과 인용 문구는 비어 있을 수 없습니다.");
    }

    if (source.relevance !== null && (source.relevance < 0 || source.relevance > 1)) {
      throw new ChatMessageValidationError("출처 관련도는 0 이상 1 이하로 입력해야 합니다.");
    }

    return {
      ...source,
      messageId,
      title,
      quote,
      relevance: source.relevance
    };
  });
}
