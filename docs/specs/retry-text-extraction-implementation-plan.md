# TXT/CSV 재시도 텍스트 추출 실행 흐름 구현 계획

> **For agentic workers:** 이 계획은 TDD 순서로 실행한다. production code 변경 전 실패 테스트를 먼저 작성하고 RED를 확인한다.

## Goal

TXT/CSV 실패 문서 retry API가 `ProcessPlainTextExtractionUseCase`를 호출해 재추출 결과를 응답하도록 연결한다.

## Architecture

`DocumentController.retry`가 `RetryDocumentUseCase` 성공 결과를 받은 뒤 `ProcessPlainTextExtractionUseCase`를 호출한다. `completed`와 `failed`는 처리 결과 Document를 응답하고, `skipped`는 retry 성공 Document를 그대로 응답한다.

## Task 1: e2e 실패 테스트 작성

**Files:**

- Modify: `test/document-api.e2e-spec.ts`

- [x] **Step 1: retry용 실패 문서 helper 추가**

테스트에서 업로드 후 repository aggregate를 `FAILED`로 전환하는 중복을 줄이기 위해 helper를 추가한다.

```ts
async function markDocumentFailed(documentId: string, reason = "텍스트 추출 실패"): Promise<void>
```

- [x] **Step 2: TXT retry READY 테스트 추가**

TXT 문서를 업로드하고 실패 상태로 만든 뒤 retry API를 호출한다.

검증:

- HTTP 201
- 응답 `status`가 `READY`
- `DocumentText` content가 TXT 원문 텍스트와 같다.

- [x] **Step 3: CSV retry READY 테스트 추가**

CSV 문서를 업로드하고 실패 상태로 만든 뒤 retry API를 호출한다.

검증:

- 응답 `status`가 `READY`
- `DocumentText` content가 CSV 원문 텍스트와 같다.

- [x] **Step 4: PDF retry pending 유지 테스트 추가**

PDF 문서를 업로드하고 실패 상태로 만든 뒤 retry API를 호출한다.

검증:

- 응답 `status`가 `TEXT_EXTRACTION_PENDING`
- `DocumentText`가 저장되지 않는다.

- [x] **Step 5: 빈 TXT retry FAILED 테스트 추가**

빈 TXT 문서를 업로드하고 실패 상태로 만든 뒤 retry API를 호출한다.

검증:

- 응답 `status`가 `FAILED`
- `failureReason`이 `추출 텍스트가 비어 있습니다.`

- [x] **Step 6: 원본 파일 없음 409 회귀 유지**

기존 원본 파일 없음 retry 테스트가 409를 유지하는지 확인한다.

- [x] **Step 7: e2e RED 확인**

Run:

```bash
npm run test:e2e -- document-api.e2e-spec.ts
```

Expected:

- TXT/CSV retry 응답이 아직 `TEXT_EXTRACTION_PENDING`이라 실패한다.

## Task 2: controller retry 흐름 연결

**Files:**

- Modify: `src/document-workspace/interface/document.controller.ts`

- [x] **Step 1: retry 성공 후 plain text 처리 helper 호출**

`retry` method에서 conflict 처리 후 다음 흐름을 추가한다.

```ts
const processedDocument = await this.processUploadedPlainTextDocument(result.document, ownerId);
return presentDocument(processedDocument);
```

- [x] **Step 2: helper 이름 일반화**

업로드와 retry가 같은 helper를 사용하므로 `processUploadedPlainTextDocument`를 `processPlainTextDocument`로 변경한다.

- [x] **Step 3: e2e GREEN 확인**

Run:

```bash
npm run test:e2e -- document-api.e2e-spec.ts
```

Expected:

- Document API e2e 통과.

## Task 3: 회귀 검증

**Files:**

- All changed files

- [x] **Step 1: forbidden-term scan**

Run:

```bash
rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|docs/superpower[s]" docs/specs/retry-text-extraction-design.md docs/specs/retry-text-extraction-implementation-plan.md src test
```

Expected: no matches.

- [x] **Step 2: diff check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [x] **Step 3: typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [x] **Step 5: unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [x] **Step 6: e2e tests**

Run:

```bash
npm run test:e2e
```

Expected: PASS.

- [x] **Step 7: build**

Run:

```bash
npm run build
```

Expected: PASS.

## 완료 기준

- TXT/CSV retry API 응답이 `READY` 또는 `FAILED` 추출 결과를 반영한다.
- PDF retry는 기존 `TEXT_EXTRACTION_PENDING` 응답을 유지한다.
- 원본 파일 없음 conflict 흐름이 유지된다.
- lint, typecheck, unit/e2e, build가 통과한다.
