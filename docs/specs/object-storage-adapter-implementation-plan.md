# Object Storage Adapter Implementation Plan

> 이 문서는 Object Storage adapter 작업을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.

**Goal:** 기존 `DocumentStorage` port를 유지하면서 local 또는 S3-compatible object storage adapter를 환경 변수로 선택할 수 있게 한다.

**Architecture:** `DocumentStorage` port는 그대로 유지하고, infrastructure layer에 `S3DocumentStorage`를 추가한다. `DocumentWorkspaceModule` provider factory는 env 설정에 따라 local 또는 s3 구현체를 선택하며, `UploadDocumentUseCase`는 실제 storage provider 값을 Document에 저장한다.

**Tech Stack:** NestJS, TypeScript, AWS SDK for JavaScript v3, Jest

---

## 파일 구조

- Modify: `package.json`, `package-lock.json`
  - `@aws-sdk/client-s3` dependency 추가
- Modify: `src/shared/infrastructure/env.ts`
  - `DOCUMENT_STORAGE_PROVIDER`, S3 bucket, region, endpoint, force path style 파싱 추가
- Modify: `src/document-workspace/application/document.use-cases.ts`
  - `UploadDocumentUseCase`에 storage provider 인자 추가
- Create: `src/document-workspace/infrastructure/s3-document-storage.ts`
  - AWS SDK v3 기반 `DocumentStorage` 구현
- Modify: `src/document-workspace/document-workspace.module.ts`
  - provider 값에 따라 local 또는 s3 storage 선택
- Modify: `docs/development/backend-local-run.md`
  - local, s3 환경 변수 예시와 credential 주입 방식 문서화
- Test: `test/env.spec.ts`
  - storage provider env parsing 검증
- Test: `test/s3-document-storage.spec.ts`
  - S3 command 전송과 404 exists 처리 검증
- Modify: `test/document-use-cases.spec.ts`
  - `storageProvider: "s3"` 저장 동작 검증
- Verify: `test/document-api.e2e-spec.ts`
  - `UploadDocumentUseCase`를 직접 생성하지 않으므로 파일 수정 없이 e2e 회귀 검증만 수행

## Task 1: Dependency and env contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/shared/infrastructure/env.ts`
- Test: `test/env.spec.ts`

- [x] **Step 1: Install AWS SDK dependency**

Run: `npm install @aws-sdk/client-s3`

Expected: `package.json`과 `package-lock.json`에 dependency가 추가된다.

- [x] **Step 2: Write failing env tests**

`test/env.spec.ts`에 provider 기본값, s3 필수 env, force path style boolean 검증 테스트를 작성한다.

- [x] **Step 3: Run env tests to verify RED**

Run: `npm test -- env.spec.ts`

Expected: FAIL because `documentStorageProvider` and S3 env fields do not exist.

- [x] **Step 4: Implement env parsing**

`loadEnv`가 `local` 기본값과 `s3` 설정을 반환하도록 구현한다.

- [x] **Step 5: Run env tests to verify GREEN**

Run: `npm test -- env.spec.ts`

Expected: PASS.

## Task 2: S3 DocumentStorage adapter

**Files:**
- Create: `src/document-workspace/infrastructure/s3-document-storage.ts`
- Test: `test/s3-document-storage.spec.ts`

- [x] **Step 1: Write failing S3 adapter tests**

`put`, `exists` true, `exists` 404 false, `remove` command 전송 테스트를 작성한다.

- [x] **Step 2: Run S3 tests to verify RED**

Run: `npm test -- s3-document-storage.spec.ts`

Expected: FAIL because `S3DocumentStorage` does not exist.

- [x] **Step 3: Implement S3 adapter**

`S3DocumentStorage`를 만들고 `S3Client` compatible client를 생성자 주입으로 받게 한다.

- [x] **Step 4: Run S3 tests to verify GREEN**

Run: `npm test -- s3-document-storage.spec.ts`

Expected: PASS.

## Task 3: Wire provider into upload flow

**Files:**
- Modify: `src/document-workspace/application/document.use-cases.ts`
- Modify: `src/document-workspace/document-workspace.module.ts`
- Modify: `test/document-use-cases.spec.ts`
- Verify: `test/document-api.e2e-spec.ts`

- [x] **Step 1: Write failing provider persistence test**

`UploadDocumentUseCase`가 `"s3"` provider를 받으면 생성 Document의 `storageProvider`가 `"s3"`인지 검증한다.

- [x] **Step 2: Run provider persistence test to verify RED**

Run: `npm test -- document-use-cases.spec.ts -t "storage provider"`

Expected: FAIL because upload use case still writes `"local"`.

- [x] **Step 3: Inject storage provider into UploadDocumentUseCase**

생성자에 `storageProvider`를 추가하고 Document 생성 시 해당 값을 저장한다.

- [x] **Step 4: Wire module factory**

`DocumentWorkspaceModule`에서 `DOCUMENT_STORAGE_PROVIDER` 값에 따라 `LocalDocumentStorage` 또는 `S3DocumentStorage`를 생성한다.

- [x] **Step 5: Run document tests**

Run: `npm test -- document-use-cases.spec.ts`

Expected: PASS.

Note: `test/document-api.e2e-spec.ts`는 `UploadDocumentUseCase`를 직접 인스턴스화하지 않고 `DocumentWorkspaceModule`의 provider wiring을 사용한다. 생성자 변경에 따른 파일 수정은 필요하지 않으며, 최종 검증 단계의 `npm run test:e2e`로 회귀 여부를 확인한다.

## Task 4: Documentation and final verification

**Files:**
- Modify: `docs/development/backend-local-run.md`
- All changed files

- [x] **Step 1: Update local run docs**

local 기본값과 s3 설정 예시, credential 주입 방식, 실제 key를 커밋하지 않는 기준을 문서화한다.

- [x] **Step 2: Static forbidden-term scan**

Run: `rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]" docs/specs/object-storage-adapter-design.md docs/specs/object-storage-adapter-implementation-plan.md docs/development/backend-local-run.md src test`

Expected: no matches.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [x] **Step 4: Lint**

Run: `npm run lint`

Expected: exit code 0.

- [x] **Step 5: Unit tests**

Run: `npm test`

Expected: all unit test suites pass.

- [x] **Step 6: E2E tests**

Run: `npm run test:e2e`

Expected: all e2e suites pass.

- [ ] **Step 7: Integration tests**

Run: `RUN_DB_INTEGRATION=true npm run test:integration`

Expected: all integration suites pass when PostgreSQL is reachable.

실행 메모: 현재 환경에서는 `192.168.50.3:5433` PostgreSQL 연결 실패로 통합 테스트가 완료되지 않았다. 코드 변경 경로는 unit, e2e, typecheck, lint, build로 검증했다.
