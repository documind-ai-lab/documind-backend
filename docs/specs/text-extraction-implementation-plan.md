# 문서 텍스트 추출 처리 기반 구현 계획

> **작업 기준:** 구현은 테스트를 먼저 작성하고 실패를 확인한 뒤 production code를 추가한다. 공개 HTTP API는 이번 범위에 포함하지 않는다.

**목표:** 업로드된 Document의 텍스트 추출 시작, 성공, 실패 상태 전환과 추출 텍스트 저장 계약을 백엔드 내부 application 계층에 추가한다.

**Architecture:** `document-workspace` bounded context 안에서 domain 상태 전환, application use case, repository port, Prisma adapter를 추가한다. 실제 parser, OCR, queue, worker runtime은 후속 이슈로 분리한다.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, Jest

---

## 파일 구조

- Modify: `src/document-workspace/domain/document.ts`
  - 텍스트 추출 시작, 성공, 실패 상태 전환 메서드 추가
- Modify: `test/document-domain.spec.ts`
  - 허용/거부 상태 전환 테스트 추가
- Create: `src/document-workspace/application/document-text.repository.ts`
  - `DocumentTextRepository` port와 snapshot/input type 정의
- Create: `src/document-workspace/testing/in-memory-document-text.repository.ts`
  - use case 테스트용 in-memory repository 추가
- Modify: `src/document-workspace/application/document.use-cases.ts`
  - `StartTextExtractionUseCase`, `CompleteTextExtractionUseCase`, `FailTextExtractionUseCase` 추가
- Modify: `test/document-use-cases.spec.ts`
  - 텍스트 추출 use case 성공/실패/검증 테스트 추가
- Modify: `prisma/schema.prisma`
  - `DocumentText` model과 `Document.text` relation 추가
- Create: `prisma/migrations/20260703000000_create_document_texts/migration.sql`
  - `document_texts` table, index, foreign key 생성
- Create: `src/document-workspace/infrastructure/prisma-document-text.repository.ts`
  - Prisma 기반 `DocumentTextRepository` 구현
- Create: `test/prisma-document-text.repository.spec.ts`
  - Prisma adapter upsert/find 동작 테스트 추가
- Modify: `src/document-workspace/document-workspace.module.ts`
  - `DOCUMENT_TEXT_REPOSITORY` provider와 use case provider 등록

## Task 1: Document domain 상태 전환

**Files:**
- Modify: `src/document-workspace/domain/document.ts`
- Modify: `test/document-domain.spec.ts`

- [x] **Step 1: 실패하는 domain 테스트 작성**

`TEXT_EXTRACTION_PENDING -> TEXT_EXTRACTING`, `TEXT_EXTRACTING -> READY`, 추출 실패 전환, 허용되지 않는 전환 충돌 테스트를 추가한다.

Run: `npm test -- document-domain.spec.ts`

Expected: FAIL because transition methods do not exist.

- [x] **Step 2: 상태 전환 메서드 구현**

`Document`에 `markTextExtracting`, `markTextExtractionReady`, `markTextExtractionFailed`를 추가한다.

- [x] **Step 3: domain 테스트 통과 확인**

Run: `npm test -- document-domain.spec.ts`

Expected: PASS.

## Task 2: DocumentText repository port와 use case

**Files:**
- Create: `src/document-workspace/application/document-text.repository.ts`
- Create: `src/document-workspace/testing/in-memory-document-text.repository.ts`
- Modify: `src/document-workspace/application/document.use-cases.ts`
- Modify: `test/document-use-cases.spec.ts`

- [x] **Step 1: 실패하는 use case 테스트 작성**

추출 시작, 추출 성공, 빈 content 검증 오류, 추출 실패 상태 저장, 잘못된 상태 충돌 테스트를 추가한다.

Run: `npm test -- document-use-cases.spec.ts -t "텍스트 추출"`

Expected: FAIL because text extraction use cases and repository port do not exist.

- [x] **Step 2: repository port와 in-memory 구현 추가**

`DOCUMENT_TEXT_REPOSITORY`, `SaveDocumentTextInput`, `DocumentTextSnapshot`, `DocumentTextRepository`를 정의하고 테스트용 in-memory 구현을 추가한다.

- [x] **Step 3: use case 구현**

권한 확인, Document 조회, 상태 전환, content 정규화, `contentHash` 생성, `tokenCount` 검증, repository 저장을 구현한다.

- [x] **Step 4: use case 테스트 통과 확인**

Run: `npm test -- document-use-cases.spec.ts -t "텍스트 추출"`

Expected: PASS.

## Task 3: Prisma schema, migration, adapter

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260703000000_create_document_texts/migration.sql`
- Create: `src/document-workspace/infrastructure/prisma-document-text.repository.ts`
- Create: `test/prisma-document-text.repository.spec.ts`

- [x] **Step 1: 실패하는 Prisma adapter 테스트 작성**

`upsert`가 신규 저장을 수행하고 같은 `documentId` 재저장 시 content와 hash를 갱신하며, `findByDocumentId`가 snapshot을 반환하는 테스트를 작성한다.

Run: `npm test -- prisma-document-text.repository.spec.ts`

Expected: FAIL because Prisma adapter and schema model do not exist.

- [x] **Step 2: schema와 migration 추가**

`DocumentText` model, `Document.text` relation, `document_texts` migration SQL을 추가한다.

- [x] **Step 3: Prisma adapter 구현**

`PrismaDocumentTextRepository`의 `upsert`, `findByDocumentId`를 구현한다.

- [x] **Step 4: Prisma adapter 테스트 통과 확인**

Run: `npm test -- prisma-document-text.repository.spec.ts`

Expected: PASS.

## Task 4: Nest provider wiring과 회귀 검증

**Files:**
- Modify: `src/document-workspace/document-workspace.module.ts`
- All changed files

- [x] **Step 1: provider 등록**

`DOCUMENT_TEXT_REPOSITORY`, `StartTextExtractionUseCase`, `CompleteTextExtractionUseCase`, `FailTextExtractionUseCase`를 module provider에 등록한다.

- [x] **Step 2: Prisma schema 검증**

Run: `npx prisma validate --schema prisma/schema.prisma`

Expected: PASS.

- [x] **Step 3: forbidden-term scan**

Run: `rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|docs/superpower[s]" docs/specs/text-extraction-design.md docs/specs/text-extraction-implementation-plan.md src test prisma`

Expected: no matches.

- [x] **Step 4: typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 5: lint**

Run: `npm run lint`

Expected: PASS.

- [x] **Step 6: unit tests**

Run: `npm test`

Expected: PASS.

- [x] **Step 7: e2e tests**

Run: `npm run test:e2e`

Expected: PASS.

- [x] **Step 8: build**

Run: `npm run build`

Expected: PASS.

## 완료 기준

- `Document` domain이 텍스트 추출 상태 전환 규칙을 보장한다.
- 내부 application use case가 추출 시작, 성공, 실패 흐름을 검증한다.
- `DocumentTextRepository` port와 Prisma adapter가 있다.
- `document_texts` 저장 구조가 Prisma schema와 migration에 반영된다.
- 공개 HTTP API 변경 없이 기존 Document API 회귀 테스트가 통과한다.
- PR 생성 후 Codex가 PR diff 기준 자체 리뷰를 수행하고 병합 차단 수준의 결함이 없는지 확인한다.
