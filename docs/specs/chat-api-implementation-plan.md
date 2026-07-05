# Chat API 1차 구현 계획

## 배경

`docs/specs/chat-api-design.md`에서 Project 단위 문서 기반 대화 API의 1차 설계를 정의했다.

이 문서는 해당 설계를 NestJS, Prisma, PostgreSQL 기반 백엔드에 구현하기 위한 작업 순서를 정의한다.

## 목표

- `chat-workspace` 모듈을 추가한다.
- Project별 User와 Assistant message를 저장한다.
- Assistant message에 출처 후보를 연결한다.
- `POST /projects/:projectId/chat/messages` API를 구현한다.
- `GET /projects/:projectId/chat/messages` API를 구현한다.
- AI provider를 port 뒤에 두고 1차 구현은 mock provider로 시작한다.

## 파일 구조

```text
prisma/schema.prisma
src/app.module.ts
src/chat-workspace/chat-workspace.module.ts
src/chat-workspace/domain/chat-role.ts
src/chat-workspace/domain/chat.errors.ts
src/chat-workspace/domain/chat-message.ts
src/chat-workspace/application/chat-answer-generator.ts
src/chat-workspace/application/chat-context-reader.ts
src/chat-workspace/application/chat-project-access-checker.ts
src/chat-workspace/application/chat-project-activity-updater.ts
src/chat-workspace/application/chat.repository.ts
src/chat-workspace/application/chat.use-cases.ts
src/chat-workspace/infrastructure/mock-chat-answer-generator.ts
src/chat-workspace/infrastructure/prisma-chat-context-reader.ts
src/chat-workspace/infrastructure/prisma-chat.repository.ts
src/project-workspace/infrastructure/prisma-chat-project-access-checker.ts
src/project-workspace/infrastructure/prisma-chat-project-activity-updater.ts
src/chat-workspace/interface/chat.controller.ts
src/chat-workspace/interface/chat.dto.ts
src/chat-workspace/interface/chat.presenter.ts
src/chat-workspace/testing/fake-chat-answer-generator.ts
src/chat-workspace/testing/in-memory-chat.repository.ts
test/chat-domain.spec.ts
test/chat-use-cases.spec.ts
test/chat-api.e2e-spec.ts
test/chat-api.integration-spec.ts
```

## Task 1: Prisma schema와 migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_create_chat_workspace/migration.sql`

- [ ] **Step 1: ChatRole enum 추가**

값:

```text
USER
ASSISTANT
```

- [ ] **Step 2: ChatMessage model 추가**

필드:

- `id`
- `projectId`
- `ownerId`
- `role`
- `content`
- `createdAt`

index:

- `(projectId, createdAt, id)`

- [ ] **Step 3: ChatSource model 추가**

필드:

- `id`
- `messageId`
- `documentId`
- `sourceIndex`
- `title`
- `quote`
- `relevance`
- `createdAt`

제약:

- `(messageId, sourceIndex)` unique
- `messageId` cascade delete
- `documentId` index

- [ ] **Step 4: Prisma 검증**

Run:

```bash
npm run prisma:generate
npm run typecheck
```

## Task 2: Domain 모델과 오류

**Files:**
- Create: `src/chat-workspace/domain/chat-role.ts`
- Create: `src/chat-workspace/domain/chat.errors.ts`
- Create: `src/chat-workspace/domain/chat-message.ts`
- Create: `test/chat-domain.spec.ts`

- [ ] **Step 1: 도메인 테스트 작성**

검증 항목:

- User message 생성
- Assistant message 생성
- source index가 1 이상인지 검증
- source index 중복 거부
- 빈 sources 허용

- [ ] **Step 2: domain error 작성**

오류:

- `ChatMessageValidationError`
- `ChatAnswerGenerationError`

- [ ] **Step 3: ChatMessage aggregate 작성**

메서드:

- `createUser`
- `createAssistant`
- `rehydrate`
- `snapshot`

- [ ] **Step 4: 도메인 테스트 통과 확인**

Run:

```bash
npm test -- test/chat-domain.spec.ts
```

## Task 3: Application port와 use case

**Files:**
- Create: `src/chat-workspace/application/chat-answer-generator.ts`
- Create: `src/chat-workspace/application/chat-context-reader.ts`
- Create: `src/chat-workspace/application/chat-project-access-checker.ts`
- Create: `src/chat-workspace/application/chat-project-activity-updater.ts`
- Create: `src/chat-workspace/application/chat.repository.ts`
- Create: `src/chat-workspace/application/chat.use-cases.ts`
- Create: `src/chat-workspace/testing/fake-chat-answer-generator.ts`
- Create: `src/chat-workspace/testing/in-memory-chat.repository.ts`
- Create: `test/chat-use-cases.spec.ts`

- [ ] **Step 1: port 작성**

필수 port:

- `ChatRepository`
- `ChatAnswerGenerator`
- `ChatContextReader`
- `ChatProjectAccessChecker`
- `ChatProjectActivityUpdater`

- [ ] **Step 2: 질문 생성 use case 테스트 작성**

검증 항목:

- Project 접근 가능 시 User와 Assistant message 저장
- context가 없어도 답변 생성
- AI provider 실패 시 message 저장 없음
- ARCHIVED Project면 409 domain error
- Assistant sources 저장

- [ ] **Step 3: CreateChatMessageUseCase 구현**

순서:

1. Project 읽기 권한 확인
2. Project 활성 상태 확인
3. 질문 정규화와 길이 검증
4. 최근 대화 조회
5. context 후보 조회
6. AI provider 호출
7. User와 Assistant message 저장
8. Project activity 갱신 요청. 실패하면 로그를 남기고 Chat message 저장은 유지한다.

- [ ] **Step 4: 목록 조회 use case 구현**

검증 항목:

- Project 읽기 권한 확인
- page/size 검증
- Project별 message만 반환
- createdAt ASC, id ASC 정렬

- [ ] **Step 5: 유스케이스 테스트 통과 확인**

Run:

```bash
npm test -- test/chat-use-cases.spec.ts
```

## Task 4: Infrastructure adapter

**Files:**
- Create: `src/chat-workspace/infrastructure/mock-chat-answer-generator.ts`
- Create: `src/chat-workspace/infrastructure/prisma-chat-context-reader.ts`
- Create: `src/chat-workspace/infrastructure/prisma-chat.repository.ts`
- Create: `src/project-workspace/infrastructure/prisma-chat-project-access-checker.ts`
- Create: `src/project-workspace/infrastructure/prisma-chat-project-activity-updater.ts`
- Create: `test/chat-api.integration-spec.ts`

- [ ] **Step 1: mock AI provider 구현**

`MockChatAnswerGenerator`는 context가 있으면 첫 context를 출처로 사용하고, context가 없으면 출처 없는 안내 답변을 반환한다.

- [ ] **Step 2: PrismaChatContextReader 구현**

`DocumentText`와 `Document`를 조회해 `READY` 문서의 context 후보를 반환한다.

제한:

- 최대 5개 문서
- 문서당 최대 6000자
- 최신 추출 순서 우선

- [ ] **Step 3: PrismaChatRepository 구현**

기능:

- User와 Assistant message를 같은 transaction으로 저장
- Assistant source 저장
- Project별 목록 조회

- [ ] **Step 4: Project adapter 구현**

구현 항목:

- `PrismaChatProjectAccessChecker`
- `PrismaChatProjectActivityUpdater`

`PrismaChatProjectAccessChecker`는 Project 존재, owner 일치, Project 상태를 반환한다.

`PrismaChatProjectActivityUpdater`는 Project의 `lastActivityAt`을 갱신한다.

- [ ] **Step 5: integration smoke 작성**

검증 항목:

- ChatMessage와 ChatSource 저장
- Project별 목록 정렬
- 다른 Project message 제외

## Task 5: HTTP interface

**Files:**
- Create: `src/chat-workspace/interface/chat.dto.ts`
- Create: `src/chat-workspace/interface/chat.presenter.ts`
- Create: `src/chat-workspace/interface/chat.controller.ts`
- Create: `src/chat-workspace/chat-workspace.module.ts`
- Modify: `src/app.module.ts`
- Create: `test/chat-api.e2e-spec.ts`

- [ ] **Step 1: DTO 작성**

DTO:

- `ProjectIdParamDto`
- `OwnerIdHeaderDto`
- `CreateChatMessageBodyDto`
- `ListChatMessagesQueryDto`

- [ ] **Step 2: presenter 작성**

응답에서 `ownerId`는 제거한다.

Assistant message에는 `sources`를 포함하고, User message에는 빈 배열을 포함한다.

- [ ] **Step 3: controller 작성**

API:

```http
POST /projects/:projectId/chat/messages
GET /projects/:projectId/chat/messages
```

- [ ] **Step 4: module provider 연결**

`ChatWorkspaceModule`에 use case와 adapter provider를 등록한다.

- [ ] **Step 5: e2e 테스트 작성**

검증 항목:

- 질문 생성 성공
- 대화 목록 조회 성공
- `X-Owner-Id` 누락 422
- 질문 내용 누락 422
- Project 없음 404
- ARCHIVED Project 409

## Task 6: 최종 검증

**Files:**
- All changed files

- [ ] **Step 1: 금지 표현 검색**

Run:

```bash
rg -n "TB[D]|TO[D]O|placeholde[r]|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|자체 리[뷰]|자체 점[검]|머[지]" docs/specs/chat-api-design.md docs/specs/chat-api-implementation-plan.md src test prisma
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npm run typecheck
```

- [ ] **Step 3: Lint**

Run:

```bash
npm run lint
```

- [ ] **Step 4: Unit tests**

Run:

```bash
npm test
```

- [ ] **Step 5: E2E tests**

Run:

```bash
npm run test:e2e
```

- [ ] **Step 6: Integration tests**

Run:

```bash
RUN_DB_INTEGRATION=true npm run test:integration
```

실행 환경에서 PostgreSQL 연결이 가능할 때 수행한다. 연결할 수 없으면 PR에 실행하지 못한 이유를 기록한다.

## 완료 기준

- Chat API schema, domain, use case, infrastructure, HTTP interface 작업 순서가 Task 단위로 정리되어 있다.
- AI provider가 port 뒤에 있어 OpenAI API와 로컬 LLM adapter로 교체할 수 있다.
- `DocumentText` 기반 context 조회가 Chat Workspace application 계층에 직접 결합되지 않는다.
- 검증 명령과 병합 전 Codex 리뷰 기준이 포함되어 있다.
