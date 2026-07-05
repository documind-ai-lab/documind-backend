import { PageResponse } from "../../shared/application/page-response";
import { ChatMessage, ChatMessageSnapshot } from "../domain/chat-message";
import { ChatHistoryItem } from "./chat-answer-generator";

export const CHAT_REPOSITORY = Symbol("CHAT_REPOSITORY");

export type ListChatMessagesQuery = {
  projectId: string;
  ownerId: string;
  page: number;
  size: number;
};

export interface ChatRepository {
  saveConversation(userMessage: ChatMessage, assistantMessage: ChatMessage): Promise<void>;
  listByProject(query: ListChatMessagesQuery): Promise<PageResponse<ChatMessageSnapshot>>;
  listRecent(projectId: string, ownerId: string, limit: number): Promise<ChatHistoryItem[]>;
}
