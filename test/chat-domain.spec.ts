import { ChatMessage } from "../src/chat-workspace/domain/chat-message";
import { ChatMessageValidationError } from "../src/chat-workspace/domain/chat.errors";
import { ChatRole } from "../src/chat-workspace/domain/chat-role";

describe("Chat domain", () => {
  const now = new Date("2026-07-05T01:00:00.000Z");
  const projectId = "018ff4f0-0000-7000-8000-000000000001";
  const ownerId = "018ff4f0-0000-7000-8000-000000000002";

  it("사용자 메시지를 생성하면 내용을 trim하고 출처 없이 저장한다", () => {
    const message = ChatMessage.createUser({
      id: "018ff4f0-0000-7000-8000-000000000101",
      projectId,
      ownerId,
      content: "  견적서 분석해줘  ",
      createdAt: now
    });

    expect(message.snapshot()).toEqual({
      id: "018ff4f0-0000-7000-8000-000000000101",
      projectId,
      ownerId,
      role: ChatRole.USER,
      content: "견적서 분석해줘",
      createdAt: now,
      sources: []
    });
  });

  it("AI 메시지를 생성하면 출처 번호와 인용 문구를 정규화한다", () => {
    const message = ChatMessage.createAssistant({
      id: "018ff4f0-0000-7000-8000-000000000102",
      projectId,
      ownerId,
      content: "  금액 불일치 후보가 있습니다. [1]  ",
      createdAt: now,
      sources: [
        {
          id: "018ff4f0-0000-7000-8000-000000000103",
          documentId: "018ff4f0-0000-7000-8000-000000000201",
          index: 1,
          title: "  견적서.pdf  ",
          quote: "  총액 1,000만원  ",
          relevance: 0.9,
          createdAt: now
        }
      ]
    });

    expect(message.snapshot()).toMatchObject({
      role: ChatRole.ASSISTANT,
      content: "금액 불일치 후보가 있습니다. [1]",
      sources: [
        {
          messageId: "018ff4f0-0000-7000-8000-000000000102",
          index: 1,
          title: "견적서.pdf",
          quote: "총액 1,000만원",
          relevance: 0.9
        }
      ]
    });
  });

  it("빈 메시지와 중복 출처 번호는 검증 오류를 던진다", () => {
    expect(() =>
      ChatMessage.createUser({
        id: "018ff4f0-0000-7000-8000-000000000101",
        projectId,
        ownerId,
        content: "   ",
        createdAt: now
      })
    ).toThrow(ChatMessageValidationError);

    expect(() =>
      ChatMessage.createAssistant({
        id: "018ff4f0-0000-7000-8000-000000000102",
        projectId,
        ownerId,
        content: "답변",
        createdAt: now,
        sources: [
          source("018ff4f0-0000-7000-8000-000000000103", 1),
          source("018ff4f0-0000-7000-8000-000000000104", 1)
        ]
      })
    ).toThrow(ChatMessageValidationError);
  });

  function source(id: string, index: number) {
    return {
      id,
      documentId: "018ff4f0-0000-7000-8000-000000000201",
      index,
      title: "견적서.pdf",
      quote: "총액 1,000만원",
      relevance: 0.8,
      createdAt: now
    };
  }
});
