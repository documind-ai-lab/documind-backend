import { ApplicationLogger } from "../src/shared/application/application-logger";
import { Clock } from "../src/shared/application/clock";
import { IdGenerator } from "../src/shared/application/id-generator";
import { createPageResponse, PageResponse } from "../src/shared/application/page-response";
import {
  ChatAnswer,
  ChatAnswerGenerator,
  ChatContextItem,
  ChatHistoryItem,
  GenerateChatAnswerInput
} from "../src/chat-workspace/application/chat-answer-generator";
import { ChatContextReader, ReadChatContextQuery } from "../src/chat-workspace/application/chat-context-reader";
import {
  ChatProjectAccessChecker,
  ChatProjectAccessResult
} from "../src/chat-workspace/application/chat-project-access-checker";
import { ChatProjectActivityUpdater } from "../src/chat-workspace/application/chat-project-activity-updater";
import { ChatRepository, ListChatMessagesQuery } from "../src/chat-workspace/application/chat.repository";
import {
  CreateChatMessageUseCase,
  ListChatMessagesUseCase
} from "../src/chat-workspace/application/chat.use-cases";
import { ChatMessage, ChatMessageSnapshot } from "../src/chat-workspace/domain/chat-message";
import { ChatAnswerGenerationError, ChatProjectStateConflictError } from "../src/chat-workspace/domain/chat.errors";
import { ChatRole } from "../src/chat-workspace/domain/chat-role";

describe("Chat use cases", () => {
  const now = new Date("2026-07-05T01:00:00.000Z");
  const projectId = "018ff4f0-0000-7000-8000-000000000001";
  const ownerId = "018ff4f0-0000-7000-8000-000000000002";

  let repository: InMemoryChatRepository;
  let answerGenerator: FakeChatAnswerGenerator;
  let contextReader: FakeChatContextReader;
  let accessChecker: FakeChatProjectAccessChecker;
  let activityUpdater: FakeChatProjectActivityUpdater;
  let createUseCase: CreateChatMessageUseCase;

  beforeEach(() => {
    repository = new InMemoryChatRepository();
    answerGenerator = new FakeChatAnswerGenerator();
    contextReader = new FakeChatContextReader();
    accessChecker = new FakeChatProjectAccessChecker();
    activityUpdater = new FakeChatProjectActivityUpdater();
    createUseCase = new CreateChatMessageUseCase(
      repository,
      answerGenerator,
      contextReader,
      accessChecker,
      activityUpdater,
      new FixedClock(now),
      new FixedIdGenerator([
        "018ff4f0-0000-7000-8000-000000000101",
        "018ff4f0-0000-7000-8000-000000000102",
        "018ff4f0-0000-7000-8000-000000000103"
      ]),
      new FakeApplicationLogger()
    );
  });

  it("사용자 메시지와 AI 답변을 저장하고 Project 활동 시각을 갱신한다", async () => {
    const result = await createUseCase.execute({
      projectId,
      ownerId,
      content: "  견적서 분석해줘  "
    });

    expect(result.userMessage).toMatchObject({
      id: "018ff4f0-0000-7000-8000-000000000101",
      role: ChatRole.USER,
      content: "견적서 분석해줘",
      sources: []
    });
    expect(result.assistantMessage).toMatchObject({
      id: "018ff4f0-0000-7000-8000-000000000102",
      role: ChatRole.ASSISTANT,
      content: "견적서 기준 검토 결과입니다. [1]",
      sources: [
        {
          id: "018ff4f0-0000-7000-8000-000000000103",
          index: 1,
          documentId: "018ff4f0-0000-7000-8000-000000000201"
        }
      ]
    });
    expect(repository.messages.map((message) => message.role)).toEqual([
      ChatRole.USER,
      ChatRole.ASSISTANT
    ]);
    expect(contextReader.queries[0]).toMatchObject({
      projectId,
      ownerId,
      limit: 5,
      perDocumentCharLimit: 6000,
      totalCharLimit: 20000
    });
    expect(answerGenerator.inputs[0]).toMatchObject({
      projectId,
      ownerId,
      question: "견적서 분석해줘"
    });
    expect(activityUpdater.requests).toEqual([{ projectId, ownerId, occurredAt: now }]);
  });

  it("보관된 프로젝트에는 메시지를 생성하지 않는다", async () => {
    accessChecker.status = "ARCHIVED";

    await expect(
      createUseCase.execute({
        projectId,
        ownerId,
        content: "견적서 분석해줘"
      })
    ).rejects.toThrow(ChatProjectStateConflictError);
    expect(repository.messages).toEqual([]);
  });

  it("AI 답변 생성 실패 시 메시지를 저장하지 않고 생성 오류를 반환한다", async () => {
    answerGenerator.error = new Error("llm failed");

    await expect(
      createUseCase.execute({
        projectId,
        ownerId,
        content: "견적서 분석해줘"
      })
    ).rejects.toThrow(ChatAnswerGenerationError);
    expect(repository.messages).toEqual([]);
  });

  it("목록 조회는 프로젝트 접근을 확인하고 저장된 메시지를 페이지로 반환한다", async () => {
    await createUseCase.execute({ projectId, ownerId, content: "견적서 분석해줘" });

    const listUseCase = new ListChatMessagesUseCase(repository, accessChecker);
    const page = await listUseCase.execute({ projectId, ownerId, page: 1, size: 10 });

    expect(page).toMatchObject({ page: 1, size: 10, total: 2, hasNext: false });
    expect(page.items.map((message) => message.role)).toEqual([ChatRole.USER, ChatRole.ASSISTANT]);
    expect(accessChecker.readableRequests).toEqual([
      { projectId, ownerId },
      { projectId, ownerId }
    ]);
  });
});

class InMemoryChatRepository implements ChatRepository {
  readonly messages: ChatMessageSnapshot[] = [];

  async saveConversation(userMessage: ChatMessage, assistantMessage: ChatMessage): Promise<void> {
    this.messages.push(userMessage.snapshot(), assistantMessage.snapshot());
  }

  async listByProject(query: ListChatMessagesQuery): Promise<PageResponse<ChatMessageSnapshot>> {
    const filtered = this.messages.filter(
      (message) => message.projectId === query.projectId && message.ownerId === query.ownerId
    );
    const offset = (query.page - 1) * query.size;

    return createPageResponse({
      items: filtered.slice(offset, offset + query.size),
      page: query.page,
      size: query.size,
      total: filtered.length
    });
  }

  async listRecent(projectId: string, ownerId: string, limit: number): Promise<ChatHistoryItem[]> {
    return this.messages
      .filter((message) => message.projectId === projectId && message.ownerId === ownerId)
      .slice(-limit)
      .map((message) => ({ role: message.role, content: message.content }));
  }
}

class FakeChatAnswerGenerator implements ChatAnswerGenerator {
  readonly inputs: GenerateChatAnswerInput[] = [];
  error: Error | null = null;

  async generate(input: GenerateChatAnswerInput): Promise<ChatAnswer> {
    this.inputs.push(input);

    if (this.error !== null) {
      throw this.error;
    }

    return {
      content: "견적서 기준 검토 결과입니다. [1]",
      sources: [
        {
          documentId: "018ff4f0-0000-7000-8000-000000000201",
          title: "견적서.pdf",
          quote: "총액 1,000만원",
          relevance: 0.9
        }
      ]
    };
  }
}

class FakeChatContextReader implements ChatContextReader {
  readonly queries: ReadChatContextQuery[] = [];

  async readProjectContexts(query: ReadChatContextQuery): Promise<ChatContextItem[]> {
    this.queries.push(query);
    return [
      {
        documentId: "018ff4f0-0000-7000-8000-000000000201",
        title: "견적서.pdf",
        content: "총액 1,000만원"
      }
    ];
  }
}

class FakeChatProjectAccessChecker implements ChatProjectAccessChecker {
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE";
  readonly readableRequests: { projectId: string; ownerId: string }[] = [];

  async ensureReadableProject(projectId: string, ownerId: string): Promise<ChatProjectAccessResult> {
    this.readableRequests.push({ projectId, ownerId });
    return { projectId, ownerId, status: this.status };
  }
}

class FakeChatProjectActivityUpdater implements ChatProjectActivityUpdater {
  readonly requests: { projectId: string; ownerId: string; occurredAt: Date }[] = [];

  async recordChatActivity(projectId: string, ownerId: string, occurredAt: Date): Promise<void> {
    this.requests.push({ projectId, ownerId, occurredAt });
  }
}

class FixedClock implements Clock {
  constructor(private readonly fixedNow: Date) {}

  now(): Date {
    return this.fixedNow;
  }
}

class FixedIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly ids: string[]) {}

  nextId(): string {
    const id = this.ids[this.index];
    this.index += 1;

    if (id === undefined) {
      throw new Error("테스트 ID가 부족합니다.");
    }

    return id;
  }
}

class FakeApplicationLogger implements ApplicationLogger {
  warn(_message: string, _metadata?: Record<string, unknown>): void {}
}
