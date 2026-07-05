import { ApplicationLogger } from "../../shared/application/application-logger";
import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { PageResponse } from "../../shared/application/page-response";
import { ChatMessage, ChatMessageSnapshot } from "../domain/chat-message";
import {
  ChatAnswerGenerationError,
  ChatMessageValidationError,
  ChatProjectStateConflictError
} from "../domain/chat.errors";
import { ChatAnswerGenerator } from "./chat-answer-generator";
import { ChatContextReader } from "./chat-context-reader";
import { ChatProjectAccessChecker } from "./chat-project-access-checker";
import { ChatProjectActivityUpdater } from "./chat-project-activity-updater";
import { ChatRepository } from "./chat.repository";

const MAX_QUESTION_LENGTH = 4000;
const RECENT_HISTORY_LIMIT = 10;
const CONTEXT_DOCUMENT_LIMIT = 5;
const CONTEXT_PER_DOCUMENT_CHAR_LIMIT = 6000;
const CONTEXT_TOTAL_CHAR_LIMIT = 20000;

export type CreateChatMessageCommand = {
  projectId: string;
  ownerId: string;
  content: string;
};

export type CreateChatMessageResult = {
  userMessage: ChatMessageSnapshot;
  assistantMessage: ChatMessageSnapshot;
};

export type ListChatMessagesCommand = {
  projectId: string;
  ownerId: string;
  page: number;
  size: number;
};

export class CreateChatMessageUseCase {
  constructor(
    private readonly repository: ChatRepository,
    private readonly answerGenerator: ChatAnswerGenerator,
    private readonly contextReader: ChatContextReader,
    private readonly accessChecker: ChatProjectAccessChecker,
    private readonly activityUpdater: ChatProjectActivityUpdater,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly logger: ApplicationLogger
  ) {}

  async execute(command: CreateChatMessageCommand): Promise<CreateChatMessageResult> {
    const project = await this.accessChecker.ensureReadableProject(command.projectId, command.ownerId);

    if (project.status !== "ACTIVE") {
      throw new ChatProjectStateConflictError("ACTIVE 상태의 프로젝트에서만 채팅 메시지를 생성할 수 있습니다.");
    }

    const question = normalizeQuestion(command.content);
    const history = await this.repository.listRecent(
      command.projectId,
      command.ownerId,
      RECENT_HISTORY_LIMIT
    );
    const contexts = await this.contextReader.readProjectContexts({
      projectId: command.projectId,
      ownerId: command.ownerId,
      limit: CONTEXT_DOCUMENT_LIMIT,
      perDocumentCharLimit: CONTEXT_PER_DOCUMENT_CHAR_LIMIT,
      totalCharLimit: CONTEXT_TOTAL_CHAR_LIMIT
    });
    const answer = await this.generateAnswer({
      projectId: command.projectId,
      ownerId: command.ownerId,
      question,
      contexts,
      history
    });
    const now = this.clock.now();
    const userMessage = ChatMessage.createUser({
      id: this.idGenerator.nextId(),
      projectId: command.projectId,
      ownerId: command.ownerId,
      content: question,
      createdAt: now
    });
    const assistantMessageId = this.idGenerator.nextId();
    const assistantMessage = ChatMessage.createAssistant({
      id: assistantMessageId,
      projectId: command.projectId,
      ownerId: command.ownerId,
      content: answer.content,
      createdAt: now,
      sources: answer.sources.map((source, index) => ({
        id: this.idGenerator.nextId(),
        documentId: source.documentId,
        index: index + 1,
        title: source.title,
        quote: source.quote,
        relevance: source.relevance,
        createdAt: now
      }))
    });

    await this.repository.saveConversation(userMessage, assistantMessage);
    await this.recordActivity(command.projectId, command.ownerId, now);

    return {
      userMessage: userMessage.snapshot(),
      assistantMessage: assistantMessage.snapshot()
    };
  }

  private async generateAnswer(
    input: Parameters<ChatAnswerGenerator["generate"]>[0]
  ): ReturnType<ChatAnswerGenerator["generate"]> {
    try {
      return await this.answerGenerator.generate(input);
    } catch (error) {
      this.logger.warn("Chat 답변 생성 실패", {
        projectId: input.projectId,
        ownerId: input.ownerId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new ChatAnswerGenerationError();
    }
  }

  private async recordActivity(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    try {
      await this.activityUpdater.recordChatActivity(projectId, ownerId, occurredAt);
    } catch (error) {
      this.logger.warn("Project 채팅 활동 시각 갱신 실패", {
        projectId,
        ownerId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export class ListChatMessagesUseCase {
  constructor(
    private readonly repository: ChatRepository,
    private readonly accessChecker: ChatProjectAccessChecker
  ) {}

  async execute(command: ListChatMessagesCommand): Promise<PageResponse<ChatMessageSnapshot>> {
    await this.accessChecker.ensureReadableProject(command.projectId, command.ownerId);
    return this.repository.listByProject(command);
  }
}

function normalizeQuestion(content: string): string {
  const question = content.trim();

  if (question.length === 0) {
    throw new ChatMessageValidationError("질문은 비어 있을 수 없습니다.");
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    throw new ChatMessageValidationError(`질문은 ${MAX_QUESTION_LENGTH}자를 초과할 수 없습니다.`);
  }

  return question;
}
