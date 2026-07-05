import { PageResponse } from "../../shared/application/page-response";
import { ChatMessageSnapshot, ChatSourceSnapshot } from "../domain/chat-message";
import { ChatRole } from "../domain/chat-role";
import { CreateChatMessageResult } from "../application/chat.use-cases";

export type ChatSourceResponse = {
  id: string;
  documentId: string;
  index: number;
  title: string;
  quote: string;
  relevance: number | null;
  createdAt: string;
};

export type ChatMessageResponse = {
  id: string;
  projectId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources: ChatSourceResponse[];
};

export type CreateChatMessageResponse = {
  userMessage: ChatMessageResponse;
  assistantMessage: ChatMessageResponse;
};

export function presentCreateChatMessageResult(
  result: CreateChatMessageResult
): CreateChatMessageResponse {
  return {
    userMessage: presentChatMessage(result.userMessage),
    assistantMessage: presentChatMessage(result.assistantMessage)
  };
}

export function presentChatMessage(message: ChatMessageSnapshot): ChatMessageResponse {
  return {
    id: message.id,
    projectId: message.projectId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    sources: message.sources.map(presentChatSource)
  };
}

export function presentChatMessagePage(
  page: PageResponse<ChatMessageSnapshot>
): PageResponse<ChatMessageResponse> {
  return {
    ...page,
    items: page.items.map(presentChatMessage)
  };
}

function presentChatSource(source: ChatSourceSnapshot): ChatSourceResponse {
  return {
    id: source.id,
    documentId: source.documentId,
    index: source.index,
    title: source.title,
    quote: source.quote,
    relevance: source.relevance,
    createdAt: source.createdAt.toISOString()
  };
}
