import { ChatContextItem } from "./chat-answer-generator";

export const CHAT_CONTEXT_READER = Symbol("CHAT_CONTEXT_READER");

export type ReadChatContextQuery = {
  projectId: string;
  ownerId: string;
  limit: number;
  perDocumentCharLimit: number;
  totalCharLimit: number;
};

export interface ChatContextReader {
  readProjectContexts(query: ReadChatContextQuery): Promise<ChatContextItem[]>;
}
