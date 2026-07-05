# Chat API 1차 설계

## 목적

Chat API 1차 설계는 사용자가 Project 안에서 업로드된 문서를 근거로 질문하고, AI 답변과 출처를 함께 받을 수 있는 백엔드 기반을 정의한다.

이번 범위는 제품의 첫 문서 기반 대화 흐름을 만드는 것이다. 고도화된 embedding 검색, 장기 메모리, 법령 검색, 스트리밍 응답, 멀티 사용자 권한은 후속 범위로 분리한다.

## 기준 문서

- `docs/domain/project-workspace.md`
- `docs/domain/document-workspace.md`
- `docs/specs/project-api-design.md`
- `docs/specs/document-api-design.md`
- `docs/specs/text-extraction-design.md`

## 핵심 사용자 흐름

1. 사용자는 Project Workspace에 진입한다.
2. 사용자는 채팅 입력창에 질문을 입력한다.
3. 백엔드는 Project 접근 권한을 확인한다.
4. 백엔드는 해당 Project의 `READY` DocumentText를 조회한다.
5. 백엔드는 질문과 문서 텍스트 일부를 AI provider에 전달한다.
6. AI provider는 답변과 근거 후보를 반환한다.
7. 백엔드는 사용자 질문, AI 답변, 출처 정보를 저장한다.
8. 클라이언트는 답변 본문과 `[1]`, `[2]` 출처를 함께 표시한다.

## 범위

포함한다.

- Project 단위 Chat Message 저장
- 사용자 질문 생성 API
- Project별 대화 목록 조회 API
- AI provider port 설계
- DocumentText 기반 context 수집 port 설계
- 답변 출처 응답 shape
- 오류 응답과 권한 검증 기준

포함하지 않는다.

- token streaming
- embedding 생성과 vector search
- PDF 페이지 단위 위치 추적
- 법령과 공공자료 웹 검색
- 장기 메모리 요약 생성
- 첨부 파일 직접 업로드
- 사용자 계정과 멤버십 권한

## 아키텍처

`chat-workspace` 모듈을 추가한다.

```text
src/
  chat-workspace/
    domain/
    application/
    infrastructure/
    interface/
    testing/
  document-workspace/
  project-workspace/
  shared/
```

각 계층의 책임은 다음과 같다.

- `domain`: ChatMessage, ChatRole, ChatSource, 답변 상태
- `application`: 질문 생성, 대화 목록 조회 use case
- `infrastructure`: Prisma repository, AI provider adapter, DocumentText context reader
- `interface`: NestJS controller, request DTO, response presenter
- `testing`: fake AI provider, in-memory repository, fake context reader

Chat Workspace는 Document Workspace의 Prisma 모델에 직접 의존하지 않는다. application 계층에서는 `ChatContextReader` port를 사용하고, infrastructure adapter가 `DocumentText`를 조회한다.

Project 접근 확인은 기존 `ProjectAccessChecker` port를 재사용한다.

## 데이터 모델

### ChatMessage

Project 안의 질문과 답변을 같은 테이블에 저장한다.

```prisma
enum ChatRole {
  USER
  ASSISTANT

  @@schema("documind_backend")
}

model ChatMessage {
  id        String   @id @db.Uuid
  projectId String   @map("project_id") @db.Uuid
  ownerId   String   @map("owner_id") @db.Uuid
  role      ChatRole
  content   String
  createdAt DateTime @map("created_at") @db.Timestamptz(6)
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Restrict)
  sources   ChatSource[]

  @@index([projectId, createdAt, id], map: "idx_chat_messages_project_created_id")
  @@map("chat_messages")
  @@schema("documind_backend")
}
```

`Project` 모델에는 `chatMessages ChatMessage[]` relation을 추가한다.

### ChatSource

Assistant 답변의 출처 후보를 저장한다.

```prisma
model ChatSource {
  id          String      @id @db.Uuid
  messageId   String      @map("message_id") @db.Uuid
  documentId  String      @map("document_id") @db.Uuid
  sourceIndex Int         @map("source_index")
  title       String      @db.VarChar(255)
  quote       String      @db.VarChar(1000)
  relevance   Decimal?    @db.Decimal(5, 4)
  createdAt   DateTime    @map("created_at") @db.Timestamptz(6)
  message     ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([messageId, sourceIndex], map: "uq_chat_sources_message_source_index")
  @@index([documentId], map: "idx_chat_sources_document_id")
  @@map("chat_sources")
  @@schema("documind_backend")
}
```

설계 판단:

- User 질문과 Assistant 답변은 동일한 `ChatMessage` aggregate로 다룬다.
- 출처는 Assistant message에만 연결한다.
- 1차 범위에서는 문서 페이지 번호를 저장하지 않는다. 현재 `DocumentText`는 페이지 단위 정보를 갖지 않기 때문이다.
- `sourceIndex`는 응답 본문의 `[1]`, `[2]` 표시와 연결된다.
- `quote`는 출처 패널에 보여줄 짧은 근거 문구다.
- `relevance`는 후속 검색 점수 표현을 위해 nullable로 둔다.

## AI provider port

AI 호출은 `ChatAnswerGenerator` port 뒤에 둔다.

```ts
export const CHAT_ANSWER_GENERATOR = Symbol("CHAT_ANSWER_GENERATOR");

export type GenerateChatAnswerInput = {
  projectId: string;
  question: string;
  contexts: ChatContextCandidate[];
  recentMessages: ChatHistoryItem[];
};

export type ChatHistoryItem = {
  role: "USER" | "ASSISTANT";
  content: string;
};

export type GeneratedChatAnswer = {
  content: string;
  sources: GeneratedChatSource[];
};

export type GeneratedChatSource = {
  documentId: string;
  title: string;
  quote: string;
  relevance: number | null;
};

export interface ChatAnswerGenerator {
  generate(input: GenerateChatAnswerInput): Promise<GeneratedChatAnswer>;
}
```

1차 구현 adapter는 환경 변수로 provider를 선택한다.

- `CHAT_AI_PROVIDER=mock`: 개발과 테스트 기본값
- `CHAT_AI_PROVIDER=openai`: OpenAI API adapter
- `CHAT_AI_PROVIDER=ollama`: 로컬 LLM adapter

초기 MVP 구현은 `mock` provider를 먼저 만든다. OpenAI와 Ollama adapter는 같은 port를 구현하는 후속 작업으로 분리할 수 있다.

## Context reader port

문서 텍스트 조회는 `ChatContextReader` port 뒤에 둔다.

```ts
export const CHAT_CONTEXT_READER = Symbol("CHAT_CONTEXT_READER");

export type ChatContextCandidate = {
  documentId: string;
  title: string;
  content: string;
  excerpt: string;
};

export interface ChatContextReader {
  findProjectContexts(input: {
    projectId: string;
    ownerId: string;
    question: string;
    limit: number;
  }): Promise<ChatContextCandidate[]>;
}
```

1차 구현은 embedding 없이 `READY` DocumentText 중 최근 추출 문서 일부를 조회한다. 질문 키워드 기반 검색은 후속 개선으로 둔다.

context 제한:

- 최대 문서 수: 5개
- 문서당 content 최대 길이: 6000자
- AI provider에 전달하는 전체 context 최대 길이: 20000자

제한을 두는 이유는 비용과 응답 지연을 제어하기 위해서다.

## Project activity port

Chat Workspace는 질문 생성 성공 후 Project의 `lastActivityAt` 갱신을 요청한다. 이 책임은 Project Workspace adapter가 구현하는 port 뒤에 둔다.

```ts
export const CHAT_PROJECT_ACTIVITY_UPDATER = Symbol("CHAT_PROJECT_ACTIVITY_UPDATER");

export interface ChatProjectActivityUpdater {
  recordChatActivity(projectId: string, ownerId: string, occurredAt: Date): Promise<void>;
}
```

활동 시각 갱신 실패는 Chat message 저장을 롤백하지 않는다. Chat message가 source of truth이며, Project의 `lastActivityAt`은 목록 정렬 편의를 위한 요약값으로 취급한다.

## API 계약

1차 구현 API는 다음과 같다.

```http
POST /projects/:projectId/chat/messages
GET /projects/:projectId/chat/messages
```

1차 MVP에는 User/Auth 컨텍스트가 없으므로 모든 API는 기존 Document API와 동일하게 `X-Owner-Id` 요청 헤더를 필수로 받는다.

### 질문 생성

`POST /projects/:projectId/chat/messages`

요청:

```json
{
  "content": "이 견적서에서 누락된 항목과 리스크를 알려줘"
}
```

검증:

- `content` 필수
- 앞뒤 공백 제거 후 1자 이상
- 최대 4000자
- Project 읽기 권한 필요

성공 응답:

```json
{
  "userMessage": {
    "id": "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99",
    "projectId": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
    "role": "USER",
    "content": "이 견적서에서 누락된 항목과 리스크를 알려줘",
    "createdAt": "2026-07-05T08:00:00Z"
  },
  "assistantMessage": {
    "id": "018f1f51-7a51-78fd-9a40-94b85175f111",
    "projectId": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
    "role": "ASSISTANT",
    "content": "견적서 기준으로 확인되는 주요 리스크는 다음입니다. [1]",
    "sources": [
      {
        "index": 1,
        "documentId": "018f1f39-9c2e-70ef-b706-46f764cf0551",
        "title": "A사 견적서.pdf",
        "quote": "공급가액 12,000,000원, VAT 별도",
        "relevance": null
      }
    ],
    "createdAt": "2026-07-05T08:00:01Z"
  }
}
```

응답에는 `ownerId`를 노출하지 않는다.

### 대화 목록 조회

`GET /projects/:projectId/chat/messages?page=1&size=30`

응답:

```json
{
  "items": [
    {
      "id": "018f1f51-7a51-78fd-9a40-94b85175f111",
      "projectId": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
      "role": "ASSISTANT",
      "content": "견적서 기준으로 확인되는 주요 리스크는 다음입니다. [1]",
      "sources": [
        {
          "index": 1,
          "documentId": "018f1f39-9c2e-70ef-b706-46f764cf0551",
          "title": "A사 견적서.pdf",
          "quote": "공급가액 12,000,000원, VAT 별도",
          "relevance": null
        }
      ],
      "createdAt": "2026-07-05T08:00:01Z"
    }
  ],
  "page": 1,
  "size": 30,
  "total": 2
}
```

정렬:

- 기본 정렬: `createdAt ASC, id ASC`
- `page` 기본값: 1
- `size` 기본값: 30
- `size` 최대값: 100

## 오류 처리

공통 오류 응답은 기존 Project API 형식을 따른다.

- 404: Project 없음 또는 owner 접근 불가
- 409: Project가 `ARCHIVED` 상태라 새 질문 생성 불가
- 422: 질문 내용 누락, 질문 길이 초과, page/size 범위 위반
- 500: AI provider 응답 생성 실패, 저장소 오류

문서 텍스트가 하나도 없거나 `READY` 문서가 없으면 422가 아니라 정상 답변을 생성한다. 이 경우 AI provider에는 빈 context를 전달하고, 답변에는 업로드된 분석 가능 문서가 없다는 안내를 포함한다.

## 저장 순서

질문 생성 use case는 다음 순서로 처리한다.

1. Project 읽기 권한을 확인한다.
2. Project가 `ACTIVE` 상태인지 확인한다.
3. 사용자 질문을 정규화하고 검증한다.
4. 최근 대화 일부를 조회한다.
5. Project 문서 context 후보를 조회한다.
6. AI provider에 질문, 최근 대화, context 후보를 전달한다.
7. User message와 Assistant message, ChatSource를 저장한다.
8. Project `lastActivityAt` 갱신을 요청한다.
9. 저장된 응답 shape을 반환한다.

User message와 Assistant message는 같은 DB 트랜잭션으로 저장한다. AI provider 호출은 DB 트랜잭션 밖에서 수행한다.

AI provider 호출에 실패하면 message를 저장하지 않는다. 사용자가 같은 질문을 다시 보낼 수 있게 클라이언트가 오류 상태를 표시한다.

## 테스트 전략

1. 도메인 테스트
   - ChatMessage 생성
   - ChatSource index 정렬
   - 빈 출처 허용

2. 유스케이스 테스트
   - 질문 생성 성공
   - READY 문서가 없는 경우
   - Project 없음과 접근 불가
   - ARCHIVED Project 질문 생성 차단
   - AI provider 실패 시 message 저장 없음
   - 출처가 Assistant message에 저장됨

3. API 테스트
   - 요청/응답 shape
   - `X-Owner-Id` 누락 422
   - 질문 내용 누락 422
   - Project 없음 404
   - ARCHIVED Project 409

4. Prisma integration smoke
   - ChatMessage와 ChatSource 저장
   - Project별 대화 목록 정렬
   - 다른 Project message가 조회되지 않음

## 완료 기준

- Chat API의 요청/응답 계약이 정의되어 있다.
- AI provider 교체 지점이 port로 분리되어 있다.
- DocumentText 조회가 Chat Workspace 내부 구현에 직접 결합되지 않는다.
- 1차 MVP 범위와 후속 범위가 분리되어 있다.
- 후속 구현 계획에서 Task 단위로 실행할 수 있다.
