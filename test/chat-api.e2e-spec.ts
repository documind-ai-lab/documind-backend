import { HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ChatWorkspaceModule } from "../src/chat-workspace/chat-workspace.module";
import {
  ChatAnswer,
  ChatAnswerGenerator,
  ChatHistoryItem,
  GenerateChatAnswerInput
} from "../src/chat-workspace/application/chat-answer-generator";
import { CHAT_ANSWER_GENERATOR } from "../src/chat-workspace/application/chat-answer-generator";
import { ChatContextReader, ReadChatContextQuery } from "../src/chat-workspace/application/chat-context-reader";
import { CHAT_CONTEXT_READER } from "../src/chat-workspace/application/chat-context-reader";
import {
  ChatProjectAccessChecker,
  ChatProjectAccessResult
} from "../src/chat-workspace/application/chat-project-access-checker";
import { CHAT_PROJECT_ACCESS_CHECKER } from "../src/chat-workspace/application/chat-project-access-checker";
import { ChatProjectActivityUpdater } from "../src/chat-workspace/application/chat-project-activity-updater";
import { CHAT_PROJECT_ACTIVITY_UPDATER } from "../src/chat-workspace/application/chat-project-activity-updater";
import { ChatRepository, ListChatMessagesQuery } from "../src/chat-workspace/application/chat.repository";
import { CHAT_REPOSITORY } from "../src/chat-workspace/application/chat.repository";
import { ChatMessage, ChatMessageSnapshot } from "../src/chat-workspace/domain/chat-message";
import { ChatRole } from "../src/chat-workspace/domain/chat-role";
import { CLOCK, Clock } from "../src/shared/application/clock";
import { ID_GENERATOR, IdGenerator } from "../src/shared/application/id-generator";
import { createPageResponse, PageResponse } from "../src/shared/application/page-response";
import { HttpExceptionFilter } from "../src/shared/interface/http-exception.filter";

describe("Chat API", () => {
  const projectId = "018ff4f0-0000-7000-8000-000000000001";
  const ownerId = "018ff4f0-0000-7000-8000-000000000002";
  const now = new Date("2026-07-05T01:00:00.000Z");

  let app: INestApplication;
  let repository: InMemoryChatRepository;
  let accessChecker: ConfigurableChatProjectAccessChecker;

  beforeEach(async () => {
    process.env.DATABASE_URL =
      "postgresql://documind_backend_app:test_password@localhost:5432/documind?schema=documind_backend";

    repository = new InMemoryChatRepository();
    accessChecker = new ConfigurableChatProjectAccessChecker();

    const moduleRef = await Test.createTestingModule({
      imports: [ChatWorkspaceModule]
    })
      .overrideProvider(CHAT_REPOSITORY)
      .useValue(repository)
      .overrideProvider(CHAT_ANSWER_GENERATOR)
      .useValue(new FakeChatAnswerGenerator())
      .overrideProvider(CHAT_CONTEXT_READER)
      .useValue(new FakeChatContextReader())
      .overrideProvider(CHAT_PROJECT_ACCESS_CHECKER)
      .useValue(accessChecker)
      .overrideProvider(CHAT_PROJECT_ACTIVITY_UPDATER)
      .useValue(new FakeChatProjectActivityUpdater())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(now))
      .overrideProvider(ID_GENERATOR)
      .useValue(
        new FixedIdGenerator([
          "018ff4f0-0000-7000-8000-000000000101",
          "018ff4f0-0000-7000-8000-000000000102",
          "018ff4f0-0000-7000-8000-000000000103"
        ])
      )
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("질문 생성 후 사용자 메시지와 AI 답변을 반환하고 목록에서 조회한다", async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/chat/messages`)
      .set("X-Owner-Id", ownerId)
      .send({ content: "  견적서 분석해줘  " })
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.userMessage).toMatchObject({
          id: "018ff4f0-0000-7000-8000-000000000101",
          projectId,
          role: ChatRole.USER,
          content: "견적서 분석해줘",
          sources: [],
          createdAt: now.toISOString()
        });
        expect(body.assistantMessage).toMatchObject({
          id: "018ff4f0-0000-7000-8000-000000000102",
          projectId,
          role: ChatRole.ASSISTANT,
          content: "견적서 기준 검토 결과입니다. [1]",
          sources: [
            {
              id: "018ff4f0-0000-7000-8000-000000000103",
              documentId: "018ff4f0-0000-7000-8000-000000000201",
              index: 1,
              title: "견적서.pdf",
              quote: "총액 1,000만원",
              relevance: 0.9,
              createdAt: now.toISOString()
            }
          ]
        });
        expect(body.userMessage).not.toHaveProperty("ownerId");
        expect(body.assistantMessage).not.toHaveProperty("ownerId");
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/chat/messages`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body).toMatchObject({ page: 1, size: 30, total: 2, hasNext: false });
        expect(body.items.map((item: { role: ChatRole }) => item.role)).toEqual([
          ChatRole.USER,
          ChatRole.ASSISTANT
        ]);
      });
  });

  it("owner header 누락, 잘못된 query, 보관 프로젝트 생성을 오류로 반환한다", async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/chat/messages`)
      .send({ content: "견적서 분석해줘" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/chat/messages?size=101`)
      .set("X-Owner-Id", ownerId)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      });

    accessChecker.status = "ARCHIVED";

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/chat/messages`)
      .set("X-Owner-Id", ownerId)
      .send({ content: "견적서 분석해줘" })
      .expect(HttpStatus.CONFLICT)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 409, code: "PROJECT_STATE_CONFLICT" });
      });
  });
});

class InMemoryChatRepository implements ChatRepository {
  private readonly messages: ChatMessageSnapshot[] = [];

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
  async generate(_input: GenerateChatAnswerInput): Promise<ChatAnswer> {
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
  async readProjectContexts(_query: ReadChatContextQuery) {
    return [
      {
        documentId: "018ff4f0-0000-7000-8000-000000000201",
        title: "견적서.pdf",
        content: "총액 1,000만원"
      }
    ];
  }
}

class ConfigurableChatProjectAccessChecker implements ChatProjectAccessChecker {
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE";

  async ensureReadableProject(projectId: string, ownerId: string): Promise<ChatProjectAccessResult> {
    return { projectId, ownerId, status: this.status };
  }
}

class FakeChatProjectActivityUpdater implements ChatProjectActivityUpdater {
  async recordChatActivity(_projectId: string, _ownerId: string, _occurredAt: Date): Promise<void> {}
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
