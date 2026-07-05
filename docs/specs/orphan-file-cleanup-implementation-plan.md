# Orphan File Cleanup Implementation Plan

> 이 문서는 고아 파일 정리 흐름을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.

**Goal:** 업로드 실패 후 남은 로컬 고아 파일을 DB 후보 목록에 기록하고 자동 정리 루프가 재시도 가능하게 삭제한다.

**Architecture:** Document Workspace 내부에 DB-backed `OrphanDocumentStorage` port 구현체와 `CleanupOrphanDocumentsUseCase`를 둔다. 자동 실행은 새 의존성 없이 Nest lifecycle 기반 scheduler provider가 `setInterval`을 관리하며 환경 변수로 비활성화 기본값을 유지한다.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, Jest

---

## 파일 구조

- Modify: `prisma/schema.prisma`
  - `OrphanDocumentFileStatus` enum과 `OrphanDocumentFile` model 추가
- Create: `prisma/migrations/20260702010000_create_orphan_document_files/migration.sql`
  - 고아 파일 후보 테이블과 index 생성
- Modify: `src/shared/infrastructure/env.ts`
  - orphan cleanup 환경 변수 파싱 추가
- Modify: `src/document-workspace/application/orphan-document-storage.ts`
  - due 조회, 실패 기록, resolve 시각 인자 추가
- Modify: `src/document-workspace/application/document.use-cases.ts`
  - `CleanupOrphanDocumentsUseCase` 추가
- Create: `src/document-workspace/infrastructure/prisma-orphan-document-storage.ts`
  - Prisma 기반 후보 기록 저장소 구현
- Create: `src/document-workspace/infrastructure/orphan-document-cleanup-scheduler.ts`
  - env toggle 기반 interval scheduler 구현
- Modify: `src/document-workspace/infrastructure/noop-orphan-document-storage.ts`
  - 확장된 port 시그니처 맞춤
- Modify: `src/document-workspace/document-workspace.module.ts`
  - Prisma 구현체, cleanup use case, scheduler provider 등록
- Modify: `test/document-use-cases.spec.ts`
  - cleanup use case 단위 테스트 추가
- Create: `test/prisma-orphan-document-storage.spec.ts`
  - Prisma 저장소 동작 테스트 추가
- Create: `test/orphan-document-cleanup-scheduler.spec.ts`
  - scheduler 활성화/비활성화 테스트 추가

## Task 1: Application cleanup use case

**Files:**
- Modify: `src/document-workspace/application/orphan-document-storage.ts`
- Modify: `src/document-workspace/application/document.use-cases.ts`
- Modify: `test/document-use-cases.spec.ts`

- [ ] **Step 1: Write failing cleanup success test**

`test/document-use-cases.spec.ts`의 `Document use cases` describe 안에 다음 테스트를 추가한다.

```ts
it("고아 파일 정리 대상 파일 삭제가 성공하면 후보를 resolved 처리한다", async () => {
  const cleanupUseCase = new CleanupOrphanDocumentsUseCase(
    storage,
    orphanStorage,
    new FixedClock(now),
    logger,
    { batchSize: 10, retryDelayMs: 600000 }
  );
  const storageKey = "projects/p1/documents/d1/d1.pdf";
  await storage.put(storageKey, Buffer.from("orphan"));
  orphanStorage.dueRecords.push({
    storageKey,
    reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
    attemptCount: 0
  });

  const result = await cleanupUseCase.execute();

  expect(result).toEqual({ scannedCount: 1, cleanedCount: 1, failedCount: 0 });
  await expect(storage.exists(storageKey)).resolves.toBe(false);
  expect(orphanStorage.resolvedRecords).toEqual([{ storageKey, resolvedAt: now }]);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- document-use-cases.spec.ts -t "고아 파일 정리 대상 파일 삭제가 성공하면 후보를 resolved 처리한다"`

Expected: FAIL because `CleanupOrphanDocumentsUseCase` is not exported.

- [ ] **Step 3: Implement minimal cleanup use case and port expansion**

`OrphanDocumentStorage`에 due 조회와 실패 기록을 추가하고 `CleanupOrphanDocumentsUseCase`를 구현한다.

- [ ] **Step 4: Run success test to verify GREEN**

Run: `npm test -- document-use-cases.spec.ts -t "고아 파일 정리 대상 파일 삭제가 성공하면 후보를 resolved 처리한다"`

Expected: PASS.

- [ ] **Step 5: Write failing cleanup failure test**

삭제 실패 시 다음 후보 처리가 계속되고 retry 정보가 기록되는 테스트를 추가한다.

- [ ] **Step 6: Run failure test to verify RED**

Run: `npm test -- document-use-cases.spec.ts -t "고아 파일 삭제 실패"`

Expected: FAIL until failure recording is implemented.

- [ ] **Step 7: Implement failure recording path**

`CleanupOrphanDocumentsUseCase`에서 삭제 실패를 catch하고 `markFailed`를 호출한다.

- [ ] **Step 8: Run document use case tests**

Run: `npm test -- document-use-cases.spec.ts`

Expected: PASS.

## Task 2: Prisma persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702010000_create_orphan_document_files/migration.sql`
- Create: `src/document-workspace/infrastructure/prisma-orphan-document-storage.ts`
- Create: `test/prisma-orphan-document-storage.spec.ts`

- [ ] **Step 1: Write failing Prisma storage tests**

`record`, `listDueCleanup`, `resolve`, `markFailed` 동작을 검증하는 테스트를 작성한다.

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- prisma-orphan-document-storage.spec.ts`

Expected: FAIL because `PrismaOrphanDocumentStorage` does not exist.

- [ ] **Step 3: Add Prisma schema and migration**

`OrphanDocumentFileStatus` enum, `OrphanDocumentFile` model, migration SQL을 추가한다.

- [ ] **Step 4: Implement Prisma storage**

Prisma Client의 `orphanDocumentFile` delegate를 사용해 port를 구현한다.

- [ ] **Step 5: Run Prisma storage tests**

Run: `npm test -- prisma-orphan-document-storage.spec.ts`

Expected: PASS with mocked Prisma delegate.

## Task 3: Scheduler and module wiring

**Files:**
- Modify: `src/shared/infrastructure/env.ts`
- Create: `src/document-workspace/infrastructure/orphan-document-cleanup-scheduler.ts`
- Modify: `src/document-workspace/document-workspace.module.ts`
- Create: `test/orphan-document-cleanup-scheduler.spec.ts`

- [ ] **Step 1: Write failing scheduler disabled test**

비활성화 설정에서는 cleanup use case가 호출되지 않는 테스트를 작성한다.

- [ ] **Step 2: Run scheduler disabled test to verify RED**

Run: `npm test -- orphan-document-cleanup-scheduler.spec.ts -t "비활성화"`

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement env parsing and scheduler**

환경 변수 기본값을 추가하고 lifecycle 기반 scheduler를 구현한다.

- [ ] **Step 4: Run scheduler tests**

Run: `npm test -- orphan-document-cleanup-scheduler.spec.ts`

Expected: PASS.

- [ ] **Step 5: Wire providers in module**

`DocumentWorkspaceModule`에 `PrismaOrphanDocumentStorage`, `CleanupOrphanDocumentsUseCase`, `OrphanDocumentCleanupScheduler`를 등록한다.

## Task 4: Final verification

**Files:**
- All changed files

- [ ] **Step 1: Static forbidden-term scan**

Run: `rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]" docs/specs/orphan-file-cleanup-design.md docs/specs/orphan-file-cleanup-implementation-plan.md src test prisma`

Expected: no matches.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 4: Unit tests**

Run: `npm test`

Expected: all test suites pass.

- [ ] **Step 5: E2E tests**

Run: `npm run test:e2e`

Expected: all e2e suites pass.

- [ ] **Step 6: Integration test note**

Run only if DB is reachable: `RUN_DB_INTEGRATION=true npm run test:integration`

Expected if DB is reachable: all integration suites pass. If DB is unreachable, record the connection failure as remaining risk.
