import { ChatRole } from "../domain/chat-role";

export const CHAT_ANSWER_GENERATOR = Symbol("CHAT_ANSWER_GENERATOR");

export type ChatContextItem = {
  documentId: string;
  title: string;
  content: string;
};

export type ChatHistoryItem = {
  role: ChatRole;
  content: string;
};

export type ChatAnswerSource = {
  documentId: string;
  title: string;
  quote: string;
  relevance: number | null;
};

export type ChatAnswer = {
  content: string;
  sources: ChatAnswerSource[];
};

export type GenerateChatAnswerInput = {
  projectId: string;
  ownerId: string;
  question: string;
  contexts: ChatContextItem[];
  history: ChatHistoryItem[];
};

export interface ChatAnswerGenerator {
  generate(input: GenerateChatAnswerInput): Promise<ChatAnswer>;
}
