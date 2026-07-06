import {
  ChatAnswer,
  ChatAnswerGenerator,
  ChatAnswerSource,
  GenerateChatAnswerInput
} from "../application/chat-answer-generator";

export type ChatAnswerHttpResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type ChatAnswerFetch = (
  url: string,
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
    signal: AbortSignal;
  }
) => Promise<ChatAnswerHttpResponse>;

export type AiServiceChatAnswerGeneratorOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchFn?: ChatAnswerFetch;
};

export class AiServiceChatAnswerGenerator implements ChatAnswerGenerator {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: ChatAnswerFetch;

  constructor(options: AiServiceChatAnswerGeneratorOptions) {
    this.endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/answers`;
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(input: GenerateChatAnswerInput): Promise<ChatAnswer> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: abortController.signal
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`AI 서비스 응답 실패: status=${response.status}`);
      }

      return parseChatAnswerResponse(responseText);
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error(`AI 서비스 응답 시간이 ${this.timeoutMs}ms를 초과했습니다.`, {
          cause: error
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseChatAnswerResponse(responseText: string): ChatAnswer {
  const payload: unknown = JSON.parse(responseText);

  if (!isRecord(payload)) {
    throw new Error("AI 서비스 응답은 JSON object여야 합니다.");
  }

  const content = payload.content;
  const sources = payload.sources;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("AI 서비스 응답 content는 비어 있지 않은 문자열이어야 합니다.");
  }

  if (!Array.isArray(sources)) {
    throw new Error("AI 서비스 응답 sources는 배열이어야 합니다.");
  }

  return {
    content,
    sources: sources.map(parseChatAnswerSource)
  };
}

function parseChatAnswerSource(source: unknown, index: number): ChatAnswerSource {
  if (!isRecord(source)) {
    throw new Error(`AI 서비스 응답 sources[${index}]는 JSON object여야 합니다.`);
  }

  const documentId = source.documentId;
  const title = source.title;
  const quote = source.quote;
  const relevance = source.relevance;

  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new Error(`AI 서비스 응답 sources[${index}].documentId는 비어 있지 않은 문자열이어야 합니다.`);
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error(`AI 서비스 응답 sources[${index}].title은 비어 있지 않은 문자열이어야 합니다.`);
  }

  if (typeof quote !== "string" || quote.trim().length === 0) {
    throw new Error(`AI 서비스 응답 sources[${index}].quote는 비어 있지 않은 문자열이어야 합니다.`);
  }

  if (relevance !== null && typeof relevance !== "number") {
    throw new Error(`AI 서비스 응답 sources[${index}].relevance는 number 또는 null이어야 합니다.`);
  }

  return { documentId, title, quote, relevance };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
