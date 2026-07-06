import {
  AiServiceChatAnswerGenerator,
  ChatAnswerFetch,
  ChatAnswerHttpResponse
} from "../src/chat-workspace/infrastructure/ai-service-chat-answer-generator";
import { ChatRole } from "../src/chat-workspace/domain/chat-role";

describe("AiServiceChatAnswerGenerator", () => {
  it("AI service /chat/answers로 질문, 컨텍스트, 대화 이력을 전송하고 응답을 반환한다", async () => {
    const fetchFn = new RecordingFetch({
      ok: true,
      status: 200,
      body: {
        content: "견적서 기준 검토 결과입니다. [1]",
        sources: [
          {
            documentId: "document-1",
            title: "견적서.txt",
            quote: "총액 1,000만원",
            relevance: 0.92
          }
        ]
      }
    });
    const generator = new AiServiceChatAnswerGenerator({
      baseUrl: "http://localhost:8001/",
      timeoutMs: 5000,
      fetchFn: fetchFn.fetch
    });

    const answer = await generator.generate({
      projectId: "project-1",
      ownerId: "owner-1",
      question: "견적서 리스크를 알려줘",
      contexts: [{ documentId: "document-1", title: "견적서.txt", content: "총액 1,000만원" }],
      history: [{ role: ChatRole.USER, content: "이전 질문" }]
    });

    expect(fetchFn.calls).toEqual([
      {
        url: "http://localhost:8001/chat/answers",
        method: "POST",
        body: {
          projectId: "project-1",
          ownerId: "owner-1",
          question: "견적서 리스크를 알려줘",
          contexts: [{ documentId: "document-1", title: "견적서.txt", content: "총액 1,000만원" }],
          history: [{ role: ChatRole.USER, content: "이전 질문" }]
        }
      }
    ]);
    expect(answer).toEqual({
      content: "견적서 기준 검토 결과입니다. [1]",
      sources: [
        {
          documentId: "document-1",
          title: "견적서.txt",
          quote: "총액 1,000만원",
          relevance: 0.92
        }
      ]
    });
  });

  it("AI service 오류 status를 답변 생성 실패로 반환한다", async () => {
    const generator = new AiServiceChatAnswerGenerator({
      baseUrl: "http://localhost:8001",
      timeoutMs: 5000,
      fetchFn: new RecordingFetch({ ok: false, status: 500, body: { message: "failed" } }).fetch
    });

    await expect(
      generator.generate({
        projectId: "project-1",
        ownerId: "owner-1",
        question: "분석해줘",
        contexts: [],
        history: []
      })
    ).rejects.toThrow("AI 서비스 응답 실패: status=500");
  });

  it("AI service 응답 shape를 검증한다", async () => {
    const generator = new AiServiceChatAnswerGenerator({
      baseUrl: "http://localhost:8001",
      timeoutMs: 5000,
      fetchFn: new RecordingFetch({
        ok: true,
        status: 200,
        body: { content: "", sources: [] }
      }).fetch
    });

    await expect(
      generator.generate({
        projectId: "project-1",
        ownerId: "owner-1",
        question: "분석해줘",
        contexts: [],
        history: []
      })
    ).rejects.toThrow("AI 서비스 응답 content는 비어 있지 않은 문자열이어야 합니다.");
  });
});

type RecordingFetchResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};

type RecordingFetchCall = {
  url: string;
  method: string;
  body: unknown;
};

class RecordingFetch {
  readonly calls: RecordingFetchCall[] = [];

  constructor(private readonly response: RecordingFetchResponse) {}

  fetch: ChatAnswerFetch = async (url, init) => {
    this.calls.push({
      url,
      method: init.method,
      body: JSON.parse(init.body) as unknown
    });

    return new JsonHttpResponse(this.response);
  };
}

class JsonHttpResponse implements ChatAnswerHttpResponse {
  readonly ok: boolean;
  readonly status: number;

  constructor(private readonly response: RecordingFetchResponse) {
    this.ok = response.ok;
    this.status = response.status;
  }

  async text(): Promise<string> {
    return JSON.stringify(this.response.body);
  }
}
