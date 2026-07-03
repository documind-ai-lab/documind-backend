# 문서 텍스트 추출 처리 기반 설계

## 목적

이번 작업은 업로드된 Document를 AI 분석과 RAG의 근거로 사용할 수 있도록, 텍스트 추출 결과를 저장하고 Document 처리 상태를 전환하는 백엔드 기반을 만든다.

1차 범위는 실제 PDF, Office, OCR parser 구현이 아니라 상태 전환과 저장 계약이다. 후속 AI worker 또는 backend worker가 같은 계약으로 추출 작업을 수행할 수 있게 만드는 것이 목표다.

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/specs/document-api-design.md`
- `docs/specs/document-api-implementation-plan.md`
- `docs/specs/object-storage-adapter-design.md`

## 범위

포함:

- Document 상태 전환 규칙 구체화
- 추출 텍스트 저장 모델 설계
- 추출 시작, 성공, 실패 use case 계약
- repository port와 Prisma adapter 경계 설계
- fake extractor 또는 테스트 입력으로 성공/실패 흐름 검증

제외:

- 실제 PDF parser 구현
- 실제 DOCX, XLSX, PPTX parser 구현
- OCR 구현
- queue, scheduler, worker process 운영 구성
- embedding 생성
- RAG 검색
- AI 분석 요청
- 사용자용 추출 텍스트 조회 API

## 설계 방향

추천 구조는 `document-workspace` 내부에 텍스트 추출 처리 use case와 저장소 port를 추가하는 방식이다.

```text
document-workspace
  domain
    Document 상태 전환 규칙
  application
    StartTextExtractionUseCase
    CompleteTextExtractionUseCase
    FailTextExtractionUseCase
    DocumentTextRepository port
  infrastructure
    PrismaDocumentTextRepository
  testing
    InMemoryDocumentTextRepository
```

Document 파일 저장소는 이미 `DocumentStorage` port 뒤에 있다. 텍스트 추출 처리는 원본 파일을 읽어 파싱하는 worker가 후속으로 담당하되, 이번 범위에서는 worker가 호출할 백엔드 application 계약을 먼저 만든다.

## 상태 전환 규칙

Document 상태는 다음 흐름을 따른다.

```text
TEXT_EXTRACTION_PENDING
  -> TEXT_EXTRACTING
  -> READY

TEXT_EXTRACTING
  -> FAILED

TEXT_EXTRACTION_PENDING
  -> FAILED
```

허용 규칙:

- 추출 시작은 `TEXT_EXTRACTION_PENDING`에서만 가능하다.
- 추출 성공은 `TEXT_EXTRACTING`에서만 가능하다.
- 추출 실패는 `TEXT_EXTRACTION_PENDING` 또는 `TEXT_EXTRACTING`에서 가능하다.
- `READY` 문서는 같은 추출 작업으로 다시 완료 처리하지 않는다.
- `FAILED` 문서는 기존 retry API로 `TEXT_EXTRACTION_PENDING`으로 되돌린 뒤 다시 추출 대상이 된다.

실패 사유는 `Document.failureReason`에 저장한다. 성공 시 `failureReason`은 `null`로 초기화한다.

## 데이터 모델

추출 텍스트는 Document와 분리된 `DocumentText` 모델로 저장한다.

```prisma
model DocumentText {
  id           String   @id @db.Uuid
  documentId   String   @unique @map("document_id") @db.Uuid
  projectId    String   @map("project_id") @db.Uuid
  ownerId      String   @map("owner_id") @db.Uuid
  content      String
  contentHash  String   @map("content_hash") @db.VarChar(64)
  tokenCount   Int?     @map("token_count")
  extractedAt  DateTime @map("extracted_at") @db.Timestamptz(6)
  createdAt    DateTime @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @map("updated_at") @db.Timestamptz(6)
  document     Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([projectId, extractedAt, documentId], map: "idx_document_texts_project_extracted")
  @@map("document_texts")
  @@schema("documind_backend")
}
```

설계 판단:

- `Document`는 파일 메타데이터와 처리 상태를 책임진다.
- `DocumentText`는 추출 결과를 책임진다.
- `documentId`는 unique로 둔다. 1차 범위에서는 Document당 최신 추출 텍스트 1개만 저장한다.
- `projectId`, `ownerId`를 중복 저장해 후속 검색, 권한 필터, worker cleanup에서 join 의존을 줄인다.
- `contentHash`는 같은 문서의 재처리 결과 비교와 후속 embedding 재생성 판단에 사용한다.
- `tokenCount`는 후속 tokenizer 연동 전까지 `null`을 허용한다.

## Application 계약

### StartTextExtractionUseCase

입력:

```ts
{
  projectId: string;
  documentId: string;
  ownerId: string;
}
```

동작:

1. Project 쓰기 권한을 확인한다.
2. Document가 project에 속하는지 조회한다.
3. 상태가 `TEXT_EXTRACTION_PENDING`인지 확인한다.
4. 상태를 `TEXT_EXTRACTING`으로 전환하고 저장한다.
5. 변경된 Document snapshot을 반환한다.

오류:

- Document 없음: 404
- Project 접근 불가: 404 또는 기존 ProjectAccessChecker 오류
- 상태 전환 불가: 409

### CompleteTextExtractionUseCase

입력:

```ts
{
  projectId: string;
  documentId: string;
  ownerId: string;
  content: string;
  tokenCount?: number;
}
```

동작:

1. Project 쓰기 권한을 확인한다.
2. Document가 project에 속하는지 조회한다.
3. 상태가 `TEXT_EXTRACTING`인지 확인한다.
4. `content`를 정규화하고 비어 있지 않은지 확인한다.
5. `DocumentText`를 upsert한다.
6. Document 상태를 `READY`로 전환하고 `failureReason`을 초기화한다.
7. 저장된 Document snapshot을 반환한다.

텍스트 정규화:

- 앞뒤 공백은 제거한다.
- 줄바꿈은 보존한다.
- 빈 문자열이면 실패 처리 대신 422 검증 오류로 본다.
- 최대 저장 길이는 1차 범위에서 5MB 문자열로 제한한다.

### FailTextExtractionUseCase

입력:

```ts
{
  projectId: string;
  documentId: string;
  ownerId: string;
  reason: string;
}
```

동작:

1. Project 쓰기 권한을 확인한다.
2. Document가 project에 속하는지 조회한다.
3. 상태가 `TEXT_EXTRACTION_PENDING` 또는 `TEXT_EXTRACTING`인지 확인한다.
4. Document 상태를 `FAILED`로 전환하고 `failureReason`을 저장한다.
5. 기존 `DocumentText`는 삭제하지 않는다.

기존 텍스트를 삭제하지 않는 이유는 재처리 실패가 이전 성공 결과를 즉시 무효화하지 않도록 하기 위해서다. 1차 범위에서는 `READY`에서 재처리를 시작하지 않으므로 실제 충돌 가능성은 낮다.

## Repository 계약

`DocumentTextRepository` port는 다음 메서드를 가진다.

```ts
export const DOCUMENT_TEXT_REPOSITORY = Symbol("DOCUMENT_TEXT_REPOSITORY");

export type SaveDocumentTextInput = {
  id: string;
  documentId: string;
  projectId: string;
  ownerId: string;
  content: string;
  contentHash: string;
  tokenCount: number | null;
  extractedAt: Date;
  now: Date;
};

export interface DocumentTextRepository {
  upsert(input: SaveDocumentTextInput): Promise<void>;
  findByDocumentId(documentId: string): Promise<DocumentTextSnapshot | null>;
}
```

이번 구현에서 사용자용 조회 API는 만들지 않지만, 테스트와 후속 RAG 구현을 위해 `findByDocumentId`는 포함한다.

## HTTP API

1차 구현에서는 공개 사용자 API를 추가하지 않는다.

텍스트 추출 작업은 내부 application use case 계약으로만 제공한다. 실제 worker가 분리되면 다음 중 하나를 후속 설계로 선택한다.

- backend process 내부 scheduler/worker가 use case를 직접 호출
- ai worker가 backend internal API를 호출
- message queue consumer가 use case를 호출

이번 작업에서 HTTP endpoint를 만들지 않는 이유는 인증/worker 보안 경계가 아직 확정되지 않았기 때문이다.

## 트랜잭션 기준

추출 성공 처리는 `DocumentText` 저장과 Document 상태 전환이 함께 성공해야 한다.

Prisma adapter는 같은 database 안에서 다음 작업을 하나의 transaction으로 처리한다.

1. `document_texts` upsert
2. `documents.status = READY`
3. `documents.failureReason = null`
4. `documents.updatedAt = now`

추출 시작과 실패 처리는 Document 상태만 갱신하므로 단일 save로 충분하다.

## 테스트 전략

Domain:

- `TEXT_EXTRACTION_PENDING`에서 `TEXT_EXTRACTING`으로 전환된다.
- `TEXT_EXTRACTING`에서 `READY`로 전환된다.
- `TEXT_EXTRACTION_PENDING` 또는 `TEXT_EXTRACTING`에서 `FAILED`로 전환된다.
- 허용되지 않는 상태 전환은 `DocumentStateConflictError`를 던진다.

Application:

- 추출 시작 use case는 권한 확인 후 상태를 `TEXT_EXTRACTING`으로 저장한다.
- 추출 성공 use case는 텍스트를 저장하고 Document를 `READY`로 저장한다.
- 빈 추출 결과는 422 검증 오류로 처리한다.
- 추출 실패 use case는 `FAILED`와 `failureReason`을 저장한다.

Infrastructure:

- Prisma repository는 `DocumentText`를 upsert한다.
- 같은 documentId에 대해 재저장하면 content와 hash가 갱신된다.
- `findByDocumentId`는 저장된 텍스트 snapshot을 반환한다.

E2E:

- 공개 HTTP endpoint가 없으므로 이번 범위에서는 e2e 추가를 필수로 보지 않는다.
- 기존 Document API e2e가 상태 응답 shape을 깨지 않는지 확인한다.

## 완료 기준

- 설계 문서와 구현 계획이 `docs/specs` 아래에 있다.
- Prisma schema와 migration이 `document_texts` 저장 구조를 반영한다.
- Document domain에 추출 상태 전환 메서드가 추가된다.
- Application use case와 repository port가 테스트로 검증된다.
- 기존 Document upload, retry, list, detail 흐름이 깨지지 않는다.

## 후속 범위

- 실제 PDF parser adapter
- Office parser adapter
- OCR 처리
- queue 기반 worker
- ai worker 저장소와의 HTTP 또는 queue 계약
- embedding 생성과 vector 저장
- RAG 검색
- 사용자용 추출 텍스트 preview API
