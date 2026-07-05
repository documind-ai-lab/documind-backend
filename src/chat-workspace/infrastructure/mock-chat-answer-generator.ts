import {
  ChatAnswer,
  ChatAnswerGenerator,
  GenerateChatAnswerInput
} from "../application/chat-answer-generator";

export class MockChatAnswerGenerator implements ChatAnswerGenerator {
  async generate(input: GenerateChatAnswerInput): Promise<ChatAnswer> {
    const primaryContext = input.contexts[0];

    if (primaryContext === undefined) {
      return {
        content:
          "분석 가능한 문서 텍스트가 아직 없습니다. 문서 업로드와 텍스트 추출이 완료되면 문서 근거를 포함해 답변할 수 있습니다.",
        sources: []
      };
    }

    const quote = excerpt(primaryContext.content);

    return {
      content: `업로드된 문서 기준으로 질문을 검토했습니다. [1]\n\n질문: ${input.question}\n\n핵심 근거: ${quote}`,
      sources: [
        {
          documentId: primaryContext.documentId,
          title: primaryContext.title,
          quote,
          relevance: 0.85
        }
      ]
    };
  }
}

function excerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "문서 텍스트가 비어 있습니다.";
  }

  return normalized.length > 300 ? `${normalized.slice(0, 300)}...` : normalized;
}
