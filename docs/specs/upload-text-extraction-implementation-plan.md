# TXT/CSV 업로드 후 텍스트 추출 실행 흐름 구현 계획

> **For agentic workers:** 이 계획은 TDD 순서로 실행한다. production code 변경 전 실패 테스트를 먼저 작성하고 RED를 확인한다.

## Goal

TXT/CSV 업로드 API가 `ProcessPlainTextExtractionUseCase`를 호출해 업로드 응답에서 `READY` 또는 `FAILED` 상태를 반환하도록 연결한다.

## Architecture

`DocumentController.upload`가 `UploadDocumentUseCase` 실행 후 `ProcessPlainTextExtractionUseCase`를 호출한다. 추출 결과가 `completed` 또는 `failed`이면 결과 Document를 응답하고, `skipped`이면 업로드 직후 Document를 그대로 응답한다.

## Task 1: e2e 실패 테스트 작성

**Files:**

- Modify: `test/document-api.e2e-spec.ts`

- [ ] **Step 1: e2e 테스트 repository 공유 보정**

현재 e2e는 `InMemoryDocumentTextRepository`를 provider override에 inline 생성한다. 테스트에서 저장된 `DocumentText`를 검증할 수 있도록 `documentTextRepository` 변수를 추가하고 override에 같은 인스턴스를 주입한다.

- [ ] **Step 2: TXT 업로드 READY 테스트 추가**

`POST /projects/:projectId/documents`에 TXT 파일을 업로드했을 때 다음을 검증한다.

- HTTP 201
- 응답 `status`가 `READY`
- `failureReason`이 `null`
- `DocumentText` content가 업로드 텍스트와 같다.

- [ ] **Step 3: CSV 업로드 READY 테스트 추가**

CSV 파일 업로드 후 다음을 검증한다.

- 응답 `status`가 `READY`
- 저장된 `DocumentText` content가 CSV 원문 텍스트와 같다.

- [ ] **Step 4: PDF 업로드 pending 유지 테스트 추가**

PDF 파일 업로드 후 다음을 검증한다.

- 응답 `status`가 `TEXT_EXTRACTION_PENDING`
- `DocumentText`가 저장되지 않는다.

- [ ] **Step 5: 빈 TXT 업로드 FAILED 테스트 추가**

공백만 있는 TXT 파일 업로드 후 다음을 검증한다.

- 응답 `status`가 `FAILED`
- `failureReason`이 `추출 텍스트가 비어 있습니다.`
- `DocumentText`가 저장되지 않는다.

- [ ] **Step 6: e2e RED 확인**

Run:

```bash
npm run test:e2e -- document-api.e2e-spec.ts
```

Expected:

- TXT/CSV 업로드 응답이 아직 `TEXT_EXTRACTION_PENDING`이라 실패한다.

## Task 2: controller 흐름 연결

**Files:**

- Modify: `src/document-workspace/interface/document.controller.ts`

- [ ] **Step 1: controller에 ProcessPlainTextExtractionUseCase 주입**

`document.use-cases` import에 `ProcessPlainTextExtractionUseCase`를 추가한다.

생성자에 다음 의존성을 추가한다.

```ts
private readonly processPlainTextExtractionUseCase: ProcessPlainTextExtractionUseCase
```

- [ ] **Step 2: upload 응답 전 추출 실행**

업로드 use case 실행 직후 다음 helper를 호출한다.

```ts
const processedDocument = await this.processPlainTextExtraction(document, ownerId);
return presentDocument(processedDocument);
```

helper 정책:

- `completed`: `result.document`
- `failed`: `result.document`
- `skipped`: upload 결과 `document`

- [ ] **Step 3: e2e GREEN 확인**

Run:

```bash
npm run test:e2e -- document-api.e2e-spec.ts
```

Expected:

- Document API e2e 통과.

## Task 3: 회귀 검증

**Files:**

- All changed files

- [ ] **Step 1: forbidden-term scan**

Run:

```bash
rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|docs/superpower[s]" docs/specs/upload-text-extraction-design.md docs/specs/upload-text-extraction-implementation-plan.md src test
```

Expected: no matches.

- [ ] **Step 2: diff check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 3: typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: e2e tests**

Run:

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 7: build**

Run:

```bash
npm run build
```

Expected: PASS.

## 완료 기준

- TXT/CSV 업로드 API 응답이 `READY`를 반환한다.
- TXT/CSV 업로드 후 `DocumentText`가 저장된다.
- PDF 업로드 응답은 기존 `TEXT_EXTRACTION_PENDING`을 유지한다.
- 빈 TXT 업로드 응답은 `FAILED`와 실패 사유를 반환한다.
- lint, typecheck, unit/e2e, build가 통과한다.
