# 업로드 파일 보안 검사 흐름 Implementation Plan

> 이 문서는 이슈 #36 `feat: 업로드 파일 보안 검사 흐름 구현`을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.
> 새 커밋은 `docs/workflow/commit-message.md`의 한국어 Conventional Commit 기준을 따릅니다.

**Goal:** Document 업로드 흐름에 테스트 가능한 보안 검사 port를 추가하고, 감염 의심 파일을 분석 가능 상태로 넘기지 않는다.

**Architecture:** `document-workspace` application 계층에 `DocumentSecurityScanner` port를 추가한다. 기본 infrastructure adapter는 항상 clean을 반환하는 no-op scanner이며, 테스트에서는 fake scanner로 clean, infected, unavailable 흐름을 검증한다. 감염 의심 파일은 저장하지 않고 `FAILED` Document 기록과 `failureReason`을 남긴다.

**Tech Stack:** Node.js 20.19 이상, TypeScript 6, NestJS 11, Prisma 6.19, PostgreSQL, Jest 29, Supertest

---

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/specs/document-api-design.md`
- `docs/specs/file-security-scan-design.md`

## 파일 구조

```text
src/document-workspace/domain/document.ts
src/document-workspace/domain/document.errors.ts
src/document-workspace/application/document-security-scanner.ts
src/document-workspace/application/document.use-cases.ts
src/document-workspace/document-workspace.module.ts
src/document-workspace/infrastructure/noop-document-security-scanner.ts
test/document-domain.spec.ts
test/document-use-cases.spec.ts
test/document-api.e2e-spec.ts
```

## Task 1: Document 실패 생성 규칙 추가

**Files:**
- Modify: `src/document-workspace/domain/document.ts`
- Modify: `test/document-domain.spec.ts`

- [ ] **Step 1: 실패 생성 테스트 작성**

`test/document-domain.spec.ts`에 보안 실패 문서 생성 테스트를 추가한다.

검증 항목:
- `Document.createFailed`는 `FAILED` 상태를 반환한다.
- `failureReason`이 저장된다.
- `storageKey`는 추적용으로 유지된다.
- `createdAt`과 `updatedAt`은 같은 시각으로 저장된다.

- [ ] **Step 2: 실패 테스트 실행**

Run:

```bash
npm test -- test/document-domain.spec.ts --runInBand
```

Expected: `Document.createFailed is not a function` 또는 동등한 실패.

- [ ] **Step 3: `Document.createFailed` 구현**

`src/document-workspace/domain/document.ts`에 `CreateFailedDocumentInput`과 `Document.createFailed`를 추가한다.

생성 상태:
- `status: DocumentStatus.FAILED`
- `failureReason: normalizeFailureReason(input.failureReason)`
- `originalName`, `extension`은 기존 생성 규칙과 동일하게 정규화

- [ ] **Step 4: 도메인 테스트 통과 확인**

Run:

```bash
npm test -- test/document-domain.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/document-workspace/domain/document.ts test/document-domain.spec.ts
git commit -m "feat: Document 보안 검사 실패 상태 생성 추가"
```

## Task 2: 보안 검사 port와 기본 adapter 추가

**Files:**
- Create: `src/document-workspace/application/document-security-scanner.ts`
- Create: `src/document-workspace/infrastructure/noop-document-security-scanner.ts`
- Modify: `src/document-workspace/document-workspace.module.ts`

- [ ] **Step 1: port 작성**

`DocumentSecurityScanner` port를 추가한다.

필수 타입:
- `DocumentSecurityScanInput`
- `DocumentSecurityScanResult`
- `DocumentSecurityScanner`
- `DOCUMENT_SECURITY_SCANNER`

- [ ] **Step 2: unavailable domain error 추가**

`src/document-workspace/domain/document.errors.ts`에 `DocumentSecurityScanUnavailableError`를 추가한다.

속성:
- code: `DOCUMENT_SECURITY_SCAN_UNAVAILABLE`
- status: `503`
- message: `파일 보안 검사를 완료할 수 없습니다.`

- [ ] **Step 3: no-op adapter 작성**

`NoopDocumentSecurityScanner`는 입력을 저장하지 않고 항상 `{ status: "clean" }`을 반환한다.

- [ ] **Step 4: Nest module provider 등록**

`DocumentWorkspaceModule`에 다음 provider를 등록한다.

```ts
{ provide: DOCUMENT_SECURITY_SCANNER, useClass: NoopDocumentSecurityScanner }
```

- [ ] **Step 5: 검증**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/document-workspace/application/document-security-scanner.ts src/document-workspace/infrastructure/noop-document-security-scanner.ts src/document-workspace/domain/document.errors.ts src/document-workspace/document-workspace.module.ts
git commit -m "feat: Document 보안 검사 port 추가"
```

## Task 3: UploadDocumentUseCase 보안 검사 흐름 통합

**Files:**
- Modify: `src/document-workspace/application/document.use-cases.ts`
- Modify: `src/document-workspace/document-workspace.module.ts`
- Modify: `test/document-use-cases.spec.ts`

- [ ] **Step 1: infected 흐름 실패 테스트 작성**

`test/document-use-cases.spec.ts`에 fake scanner를 추가하고 infected 결과를 반환하게 한다.

검증 항목:
- `UploadDocumentUseCase.execute` 응답 status는 `FAILED`
- `failureReason`은 scanner reason을 포함
- `storage.exists(document.storageKey)`는 false
- repository에는 FAILED 문서가 저장됨
- Project summary update는 Document 생성 후 기존 정책대로 호출됨

- [ ] **Step 2: unavailable 흐름 실패 테스트 작성**

scanner가 `DocumentSecurityScanUnavailableError`를 던지는 테스트를 추가한다.

검증 항목:
- use case는 같은 오류를 throw
- repository에 문서가 생성되지 않음
- storage에 파일이 저장되지 않음
- Project summary update가 호출되지 않음

- [ ] **Step 3: 실패 테스트 실행**

Run:

```bash
npm test -- test/document-use-cases.spec.ts --runInBand
```

Expected: 새 테스트 FAIL.

- [ ] **Step 4: use case 생성자에 scanner 주입**

`UploadDocumentUseCase` 생성자에 `DocumentSecurityScanner`를 추가한다.

`DocumentWorkspaceModule` factory의 inject 목록에도 `DOCUMENT_SECURITY_SCANNER`를 추가한다.

- [ ] **Step 5: 업로드 흐름에 검사 단계 추가**

검사 순서:
1. 파일 정책 검증
2. documentId와 storageKey 생성
3. `securityScanner.scan` 호출
4. clean이면 기존 `storage.put`과 `repository.create`
5. infected이면 `storage.put` 생략
6. infected이면 `Document.createFailed`로 FAILED 문서 생성
7. infected이면 `repository.create` 후 `recordProjectSummary` 호출
8. unavailable이면 예외 전파

- [ ] **Step 6: use case 테스트 통과 확인**

Run:

```bash
npm test -- test/document-use-cases.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/document-workspace/application/document.use-cases.ts src/document-workspace/document-workspace.module.ts test/document-use-cases.spec.ts
git commit -m "feat: Document 업로드 보안 검사 흐름 구현"
```

## Task 4: HTTP e2e 보안 검사 흐름 검증

**Files:**
- Modify: `test/document-api.e2e-spec.ts`

- [ ] **Step 1: e2e fake scanner provider 추가**

`DocumentWorkspaceModule` override에서 `DOCUMENT_SECURITY_SCANNER`를 fake scanner로 교체할 수 있게 한다.

기존 e2e 성공 테스트는 fake scanner 기본값을 clean으로 둔다.

- [ ] **Step 2: infected e2e 테스트 작성**

업로드 요청이 infected 결과를 받으면 다음을 검증한다.

- HTTP status: `201`
- response `status`: `FAILED`
- response `failureReason`: 보안 검사 실패 사유 포함
- response에 `storageKey`, `storageProvider`, `ownerId` 없음

- [ ] **Step 3: unavailable e2e 테스트 작성**

scanner unavailable이면 다음을 검증한다.

- HTTP status: `503`
- response `code`: `DOCUMENT_SECURITY_SCAN_UNAVAILABLE`
- response `message`: `파일 보안 검사를 완료할 수 없습니다.`

- [ ] **Step 4: e2e 테스트 실행**

Run:

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add test/document-api.e2e-spec.ts
git commit -m "test: Document 보안 검사 e2e 추가"
```

## Task 5: 문서와 최종 검증

**Files:**
- Modify: `docs/development/backend-local-run.md`
- Modify: `docs/specs/file-security-scan-implementation-plan.md`

- [ ] **Step 1: 로컬 실행 문서 보완**

`docs/development/backend-local-run.md`에 다음 내용을 추가한다.

- 1차 구현의 기본 scanner는 no-op임
- 실제 ClamAV adapter는 후속 범위임
- infected 흐름은 테스트 fake scanner로 검증함

- [ ] **Step 2: 전체 검증 실행**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
RUN_DB_INTEGRATION=true npm run test:integration
git diff --check
```

Expected: PASS.

- [ ] **Step 3: 문서 금지어 검색**

Run:

```bash
rg -n "TB[D]|TO[D]O|placeholde[r]|fill i[n]|나중[e]|적[절]|미[정]|CHANGE_M[E]" docs src test prisma
```

Expected: no matches.

- [ ] **Step 4: 구현 계획 완료 상태 반영**

완료된 task의 checkbox를 실제 결과에 맞게 갱신한다.

- [ ] **Step 5: 커밋**

```bash
git add docs/development/backend-local-run.md docs/specs/file-security-scan-implementation-plan.md
git commit -m "docs: Document 보안 검사 실행 문서 보완"
```

## PR 준비

- PR title: `feat: 업로드 파일 보안 검사 흐름 구현`
- 연결 이슈: `Refs #36`
- PR base: `develop`
- PR head: `feat-36-file-security-scan`

PR 생성 전 필수 검증:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
RUN_DB_INTEGRATION=true npm run test:integration
```

Antigravity 리뷰:

```bash
scripts/agy-pr-review <PR번호> --post --timeout 10m
```
