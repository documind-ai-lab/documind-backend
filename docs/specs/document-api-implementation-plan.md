# Document API 1차 구현 Implementation Plan

> 이 문서는 Document API 1차 구현을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.
> 새 커밋은 `docs/workflow/commit-message.md`의 한국어 Conventional Commit 기준을 따릅니다.

**Goal:** NestJS와 Prisma 기반으로 프로젝트별 문서 업로드, 목록 조회, 상세 조회, 재시도 API를 구현한다.

**Architecture:** 모듈러 모놀리스 안에 `document-workspace` 모듈을 추가한다. Document 도메인은 NestJS, Prisma, 파일 시스템에 의존하지 않는다. Controller는 HTTP multipart와 DTO 검증을 담당하고, Use Case는 repository port, storage port, project access port, project summary update port, clock, id generator에만 의존한다. 1차 MVP의 `ownerId`는 인증 컨텍스트가 아니라 `X-Owner-Id` 헤더 DTO에서 검증해 use case 입력으로 전달한다.

**Tech Stack:** Node.js 20.19 이상, TypeScript 6, NestJS 11, Prisma 6.19, PostgreSQL, Jest 29, Supertest

---

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/specs/document-api-design.md`
- `docs/domain/project-workspace.md`
- `docs/specs/project-api-design.md`

## 구현 API

```http
POST /projects/:projectId/documents
GET /projects/:projectId/documents
GET /projects/:projectId/documents/:documentId
POST /projects/:projectId/documents/:documentId/retry
```

`DELETE /projects/:projectId/documents/:documentId`는 만들지 않는다.

## 파일 구조

```text
prisma/schema.prisma
src/app.module.ts
src/shared/infrastructure/env.ts
src/document-workspace/document-workspace.module.ts
src/document-workspace/domain/document-status.ts
src/document-workspace/domain/document.errors.ts
src/document-workspace/domain/document.ts
src/document-workspace/application/document.repository.ts
src/document-workspace/application/document-storage.ts
src/document-workspace/application/orphan-document-storage.ts
src/document-workspace/application/project-access-checker.ts
src/document-workspace/application/project-document-summary-updater.ts
src/document-workspace/application/document-file-policy.ts
src/document-workspace/application/document.use-cases.ts
src/document-workspace/infrastructure/local-document-storage.ts
src/document-workspace/infrastructure/prisma-document.repository.ts
src/document-workspace/infrastructure/prisma-project-access-checker.ts
src/project-workspace/infrastructure/prisma-project-document-summary-updater.ts
src/document-workspace/interface/document.dto.ts
src/document-workspace/interface/document.presenter.ts
src/document-workspace/interface/document.controller.ts
src/document-workspace/testing/in-memory-document.repository.ts
src/document-workspace/testing/fake-document-storage.ts
test/document-domain.spec.ts
test/document-use-cases.spec.ts
test/document-api.e2e-spec.ts
test/document-api.integration-spec.ts
```

## Task 1: Prisma schema와 환경 설정 확장

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/shared/infrastructure/env.ts`
- Modify: `.env.example`

- [x] **Step 1: DocumentStatus enum 추가**

`DocumentStatus`는 다음 값을 가진다.

```text
TEXT_EXTRACTION_PENDING
TEXT_EXTRACTING
READY
FAILED
```

- [x] **Step 2: Document model 추가**

`Document` model은 `docs/specs/document-api-design.md`의 데이터 모델 필드를 따른다.

주요 제약:
- `id`, `projectId`, `ownerId`는 PostgreSQL uuid 타입
- `projectId`는 Project FK
- `storageProvider`, `extension`은 짧은 문자열
- `storageKey`는 저장소 내부 논리적 상대 경로
- `failureReason`은 nullable
- `createdAt`, `updatedAt`은 `Timestamptz(6)`
- `(projectId, createdAt, id)` 복합 인덱스 추가

- [x] **Step 3: env 확장**

환경 변수:
- `DOCUMENT_STORAGE_BASE_PATH`
- `DOCUMENT_MAX_FILE_BYTES`

기본 개발값:
- `DOCUMENT_STORAGE_BASE_PATH=./.storage/documents`
- `DOCUMENT_MAX_FILE_BYTES=52428800`

상대 경로는 애플리케이션 시작 시 프로젝트 루트 기준 절대 경로로 변환한다.

- [x] **Step 4: 검증**

Run:

```bash
npm run prisma:generate
npm run typecheck
```

## Task 2: Document 도메인 모델 구현

**Files:**
- Create: `src/document-workspace/domain/document-status.ts`
- Create: `src/document-workspace/domain/document.errors.ts`
- Create: `src/document-workspace/domain/document.ts`
- Create: `test/document-domain.spec.ts`

- [x] **Step 1: 테스트 작성**

검증 항목:
- Document 생성 시 원본 파일명, MIME type, extension, sizeBytes, storageProvider, storageKey 저장
- 생성 직후 status는 `TEXT_EXTRACTION_PENDING`
- `retry`는 `FAILED`에서만 `TEXT_EXTRACTION_PENDING`으로 전환
- 재시도 불가능 상태는 409 domain error

- [x] **Step 2: domain error 작성**

에러 예시:
- `DocumentNotFoundError`
- `DocumentStateConflictError`
- `DocumentFileValidationError`
- `DocumentStorageError`

- [x] **Step 3: Document aggregate 작성**

`Document.create`, `Document.rehydrate`, `Document.markRetryPending`, `Document.markFailed`, `snapshot`을 제공한다.

도메인 모델은 파일 시스템을 직접 다루지 않는다.

- [x] **Step 4: 검증**

Run:

```bash
npm test -- test/document-domain.spec.ts
```

## Task 3: 파일 검증 정책 구현

**Files:**
- Create: `src/document-workspace/application/document-file-policy.ts`
- Modify: `test/document-use-cases.spec.ts`

- [x] **Step 1: 파일 입력 타입 정의**

유스케이스 입력은 HTTP multipart 구현체에 직접 의존하지 않는다.

필드:
- `originalName`
- `mimeType`
- `sizeBytes`
- `buffer`

1차 구현은 메모리 기반 multipart buffer를 사용한다. 50MB 제한이 있으므로 NestJS interceptor에서 파일 크기를 제한한다.

- [x] **Step 2: 확장자 정책 구현**

규칙:
- 마지막 마침표 뒤 문자열만 확장자로 사용
- 소문자 정규화
- `^[a-z0-9]+$` 통과 필요
- 허용 확장자: `pdf`, `docx`, `xlsx`, `pptx`, `txt`, `csv`
- 확장자 없음은 415

- [x] **Step 3: MIME type 정책 구현**

확장자별 allowlist를 구현한다.

`csv`, `txt`는 `application/octet-stream`을 예외 허용한다.

- [x] **Step 4: 텍스트성 최소 검사 구현**

`csv`, `txt`가 `application/octet-stream`이면 파일 앞부분의 null byte 포함 여부를 검사한다.

null byte가 있으면 415로 처리한다.

- [x] **Step 5: 검증**

Run:

```bash
npm test -- test/document-use-cases.spec.ts
```

## Task 4: Application port와 use case 구현

**Files:**
- Create: `src/document-workspace/application/document.repository.ts`
- Create: `src/document-workspace/application/document-storage.ts`
- Create: `src/document-workspace/application/project-access-checker.ts`
- Create: `src/document-workspace/application/document.use-cases.ts`
- Create: `src/document-workspace/testing/in-memory-document.repository.ts`
- Create: `src/document-workspace/testing/fake-document-storage.ts`
- Create: `test/document-use-cases.spec.ts`

- [x] **Step 1: DocumentRepository port 작성**

필수 메서드:
- `create(document)`
- `findByProjectAndId(projectId, documentId)`
- `listByProject(query)`
- `save(document)`

`DocumentRepository`는 Document 테이블만 다룬다. Project `documentCount`, `lastActivityAt` 갱신 책임을 가지지 않는다.

- [x] **Step 2: DocumentStorage port 작성**

필수 메서드:
- `put(storageKey, content)`
- `exists(storageKey)`
- `remove(storageKey)`

storage port는 `DOCUMENT_STORAGE_BASE_PATH` 같은 환경 설정을 노출하지 않는다.

- [x] **Step 3: OrphanDocumentStorage port 작성**

필수 메서드:
- `record(storageKey, reason)`
- `resolve(storageKey)`

파일 저장 성공 후 Document DB 저장이 실패했는데 storage remove도 실패하면 `record`를 호출한다.

이번 구현은 port와 fake 구현, use case 호출 테스트까지만 포함한다. 백그라운드 스케줄러와 실제 정리 명령은 후속 이슈로 분리한다.

- [x] **Step 4: ProjectAccessChecker port 작성**

필수 메서드:
- `ensureWritableProject(projectId, ownerId)`
- `ensureReadableProject(projectId, ownerId)`

반환값에는 Project ownerId와 Project status 확인 결과를 포함한다.

- [x] **Step 5: ProjectDocumentSummaryUpdater port 작성**

필수 메서드:
- `recordDocumentCreated(projectId, ownerId, occurredAt)`

이 port는 `project-workspace` adapter가 구현한다. `document-workspace`의 repository나 infrastructure adapter가 Project 테이블을 직접 수정하지 않는다.

Project summary는 조회 편의를 위한 denormalized summary다. Document 생성 성공 후 summary 갱신을 요청하되, 실패하면 로그와 후속 reconciliation 대상으로 기록하고 Document 생성 자체를 롤백하지 않는다.

- [x] **Step 6: UploadDocumentUseCase 작성**

순서:
1. 입력 ownerId 검증 결과 사용
2. Project 접근 및 ACTIVE 상태 확인
3. 파일 검증
4. documentId, storageKey 생성
5. DB 트랜잭션 전 storage에 파일 저장
6. Document 생성
7. Document 생성 실패 시 저장 파일 삭제 시도
8. 삭제 실패 시 OrphanDocumentStorage에 정리 대상 기록
9. Document 생성 성공 후 ProjectDocumentSummaryUpdater 호출

- [x] **Step 7: List/Get/Retry use case 작성**

목록과 상세는 Project 읽기 권한을 확인한다.

재시도는 `FAILED` 상태와 원본 파일 존재 여부를 확인한다.

재시도에서 Project가 없거나 ownerId가 다르거나 Document가 해당 Project에 속하지 않으면 404를 반환한다.

원본 파일이 없거나 읽을 수 없으면 use case 전체를 감싸는 DB 트랜잭션을 열지 않는다. Document 상태는 `FAILED`로 유지하고 `failureReason`을 repository `save`로 먼저 저장한다. 저장이 성공한 뒤 use case는 예외를 throw하지 않고 `RetryDocumentResult.conflict`를 반환한다. HTTP interface는 해당 result를 409로 매핑한다.

이 경로에서는 예외 기반 rollback에 `failureReason` 저장이 휘말리지 않도록 테스트로 고정한다.

- [x] **Step 8: 검증**

Run:

```bash
npm test -- test/document-use-cases.spec.ts
```

## Task 5: Prisma repository와 Project adapter 구현

**Files:**
- Create: `src/document-workspace/infrastructure/prisma-document.repository.ts`
- Create: `src/document-workspace/infrastructure/prisma-project-access-checker.ts`
- Create: `src/project-workspace/infrastructure/prisma-project-document-summary-updater.ts`
- Modify: `src/document-workspace/document-workspace.module.ts`

- [x] **Step 1: PrismaDocumentRepository 작성**

`DocumentRepository`를 구현한다.

Document record create, list, find, save만 처리한다.

Project 테이블을 직접 update하지 않는다.

파일 쓰기, 파일 읽기, MIME 재검사는 repository 내부에서 수행하지 않는다.

- [x] **Step 2: 목록 조회 구현**

정렬:
- `createdAt DESC`
- `id DESC`

페이징:
- offset 기반
- `page`, `size`

- [x] **Step 3: PrismaProjectAccessChecker 작성**

Project가 없거나 owner가 다르면 not found로 처리한다.

업로드 시 Project가 `ARCHIVED`이면 409로 처리한다.

- [x] **Step 4: PrismaProjectDocumentSummaryUpdater 작성**

`ProjectDocumentSummaryUpdater`를 구현한다.

구현 위치는 `project-workspace` infrastructure 계층에 둔다.

처리:
- Project `documentCount` 원자적 increment
- Project `lastActivityAt` 갱신

이 adapter는 Project Workspace 소유 테이블을 다루며, Document repository가 Project 테이블을 직접 갱신하지 않게 하는 경계 역할을 한다.

- [x] **Step 5: 검증**

Run:

```bash
npm run typecheck
npm test
```

## Task 6: Local document storage adapter 구현

**Files:**
- Create: `src/document-workspace/infrastructure/local-document-storage.ts`
- Modify: `src/shared/infrastructure/env.ts`
- Create: `test/local-document-storage.spec.ts`

- [x] **Step 1: base path 초기화**

`DOCUMENT_STORAGE_BASE_PATH`를 절대 경로로 해석한다.

디렉터리가 없으면 생성한다.

- [x] **Step 2: canonical path 검증**

`storageKey`와 base path를 조합한 뒤 canonical path가 base path 하위인지 확인한다.

탈출 시 400 오류로 처리한다.

- [x] **Step 3: put/remove/exists 구현**

파일 저장은 필요한 상위 디렉터리를 만든 뒤 수행한다.

삭제 실패는 호출자에게 전달해 use case가 로그와 후속 정리 대상으로 판단할 수 있게 한다.

- [x] **Step 4: 검증**

Run:

```bash
npm test -- test/local-document-storage.spec.ts
npm run typecheck
npm test
```

## Task 7: HTTP interface 구현

**Files:**
- Create: `src/document-workspace/interface/document.dto.ts`
- Create: `src/document-workspace/interface/document.presenter.ts`
- Create: `src/document-workspace/interface/document.controller.ts`
- Create: `src/document-workspace/document-workspace.module.ts`
- Modify: `src/app.module.ts`

- [x] **Step 1: DTO 작성**

DTO:
- `ListDocumentsQueryDto`
- `ProjectIdParamDto`
- `DocumentIdParamDto`
- `OwnerIdHeaderDto`

`page`, `size` 규칙은 Project API와 동일하다.

`OwnerIdHeaderDto`는 `X-Owner-Id` 헤더를 필수 UUID로 검증한다. controller는 검증된 값을 모든 use case 입력의 `ownerId`로 전달한다.

- [x] **Step 2: multipart upload controller 작성**

`POST /projects/:projectId/documents`는 file field 하나를 받는다.

업로드 field 이름은 `file`로 고정한다.

Multer `limits.fileSize`를 `DOCUMENT_MAX_FILE_BYTES`로 설정해 50MB 초과 파일은 애플리케이션 메모리에 로드하기 전에 413으로 차단한다.

controller는 multipart 처리와 DTO 검증만 담당하고, 파일 검증 세부 정책은 use case에 위임한다.

- [x] **Step 3: presenter 작성**

응답에서 제외:
- `storageProvider`
- `storageKey`
- `storagePath`
- `storedName`
- `ownerId`

- [x] **Step 4: module 등록**

`DocumentWorkspaceModule`에 use case, repository, storage, access checker provider를 등록한다.

`AppModule`에 DocumentWorkspaceModule을 추가한다.

- [x] **Step 5: 검증**

Run:

```bash
npm run typecheck
npm test
```

## Task 8: API e2e 테스트 구현

**Files:**
- Create: `test/document-api.e2e-spec.ts`

- [x] **Step 1: 성공 흐름 테스트**

검증:
- 업로드 성공
- 목록 조회
- 상세 조회
- FAILED 문서 재시도 성공

e2e 테스트는 빠른 실행을 위해 in-memory repository와 fake storage provider를 override한다.

- [x] **Step 2: 오류 흐름 테스트**

검증:
- 잘못된 UUID: 400
- 파일 누락: 422
- 원본 파일명 누락: 422
- 파일 크기 초과: 413
- 허용되지 않은 확장자: 415
- Project 없음: 404
- 보관된 Project 업로드: 409
- 재시도 불가능 상태: 409
- `X-Owner-Id` 누락 또는 UUID 형식 오류: 422
- 다른 Project의 Document ID로 상세 조회: 404
- 다른 Project의 Document ID로 retry 요청: 404
- retry 원본 파일 부재 시 `failureReason` 저장 후 409

- [x] **Step 3: 응답 shape 테스트**

`storageProvider`, `storageKey`, `storagePath`, `storedName`, `ownerId`가 응답에 없는지 확인한다.

- [x] **Step 4: 검증**

Run:

```bash
npm run test:e2e
```

## Task 9: PostgreSQL integration smoke 구현

**Files:**
- Create: `test/document-api.integration-spec.ts`
- Modify: `docs/development/backend-local-run.md`

- [x] **Step 1: migration 적용 검증**

Run:

```bash
npm run prisma:migrate:dev
```

- [x] **Step 2: 실제 DB round-trip 테스트 구현**

검증:
- Project 생성 후 Document 업로드
- Document 목록 정렬
- Document 상세 조회
- Project `documentCount` 증가
- Project `lastActivityAt` 갱신
- 원본 파일 저장 확인
- retry 원본 파일 부재 시 DB의 `failureReason` 갱신 확인

- [x] **Step 2-1: 실제 DB round-trip 실행 검증**

Run:

```bash
RUN_DB_INTEGRATION=true npm run test:integration
```

- [x] **Step 3: 테스트 데이터 정리**

통합 테스트 ownerId와 storage temp directory를 분리한다.

테스트 후 DB 데이터와 파일을 정리한다.

- [x] **Step 4: 실행 문서 보완**

`docs/development/backend-local-run.md`에 다음을 추가한다.

- `DOCUMENT_STORAGE_BASE_PATH`
- 문서 업로드 curl 예시
- 파일 저장 확인 방법
- 통합 테스트 실행 방법

## Task 10: 최종 검증과 PR 준비

- [x] **Step 1: 전체 검증**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:integration
```

- [x] **Step 2: 문서 검증**

Run:

```bash
rg -n "TB[D]|TO[D]O|placeholde[r]|fill i[n]|나중[e]|적[절]|미[정]|CHANGE_M[E]" docs src test prisma
```

- [x] **Step 3: PR 생성**

PR 본문은 `.github/pull_request_template.md` 구조를 사용한다.

연결 이슈는 `Refs #<구현 이슈 번호>`로 적고, 병합 후 이슈 close와 Project `Done` 확인을 완료 루프에서 처리한다.

PR: `#39`

- [ ] **Step 4: 병합 전 자체 리뷰**

Codex가 PR diff 기준으로 버그, API 계약 불일치, 테스트 누락을 점검한다.

병합 전에는 자체 리뷰 결과와 검증 명령을 PR 댓글에 남기고, 추가 반영 항목이 없는지 확인한다.

## 완료 기준

- Document API 4개 구현 단계가 Task 단위로 나뉘어 있다.
- Prisma schema, storage port, local adapter, HTTP interface, 테스트 전략이 포함되어 있다.
- 텍스트 추출 worker와 AI 분석은 후속 범위로 분리되어 있다.
- 기준 도메인 문서와 충돌하는 내용이 없다.
