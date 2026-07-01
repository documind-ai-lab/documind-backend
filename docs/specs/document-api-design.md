# Document API 1차 구현 설계

## 목적

Document API 1차 구현은 `docs/domain/document-workspace.md`에서 확정한 Document Workspace 도메인 규칙을 NestJS 백엔드 API로 옮기기 위한 작업이다.

이번 범위는 프로젝트에 문서를 업로드하고, 문서 목록과 상세 상태를 조회하며, 실패한 문서 처리를 재시도할 수 있는 API 기반을 만드는 것이다. 텍스트 추출 worker, 파일 파싱, OCR, 임베딩, RAG, AI 분석은 포함하지 않는다.

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/domain/project-workspace.md`
- `docs/specs/project-api-design.md`

## 기술 선택

기존 백엔드와 동일하게 NestJS 11, Prisma 6.19, PostgreSQL을 사용한다.

파일 업로드는 NestJS의 multipart 처리 기능을 사용하되, 파일 저장 책임은 application use case가 직접 파일 시스템에 결합하지 않도록 `DocumentStorage` port 뒤에 둔다.

1차 MVP의 저장소 구현은 로컬 파일 시스템 adapter다. 저장소 base path는 `DOCUMENT_STORAGE_BASE_PATH` 환경 변수로 주입하며, 애플리케이션은 상대 경로를 그대로 사용하지 않고 절대 경로로 해석한 뒤 사용한다.

## 아키텍처

`document-workspace` 모듈을 추가한다.

```text
src/
  document-workspace/
    domain/
    application/
    infrastructure/
    interface/
    testing/
  project-workspace/
  shared/
```

각 계층의 책임은 다음과 같다.

- `domain`: Document 엔티티, Document Status, 파일 메타데이터 규칙, 상태 전환 규칙
- `application`: 업로드, 목록 조회, 상세 조회, 재시도 유스케이스
- `infrastructure`: Prisma repository, local file storage adapter
- `interface`: NestJS controller, multipart upload 처리, request DTO, response presenter
- `testing`: 인메모리 repository와 storage fake

도메인 모델은 NestJS, Prisma, 파일 시스템에 의존하지 않는다. 유스케이스는 repository port, storage port, project access port, clock, id generator와 입력으로 전달된 ownerId에 의존한다.

## 모듈 경계

Document Workspace는 Project Workspace와 직접 DB join 중심으로 결합하지 않는다. 다만 문서 업로드와 조회는 Project 권한과 상태를 확인해야 하므로 application 계층에서 `ProjectAccessChecker` port를 사용한다.

`ProjectAccessChecker`는 다음 책임을 가진다.

- Project 존재 여부 확인
- 현재 ownerId가 Project에 접근 가능한지 확인
- 업로드 시 Project가 `ACTIVE`인지 확인
- Document 생성 성공 트랜잭션 안에서 Project 요약값 갱신 요청

1차 구현에서는 같은 백엔드 모놀리스 안에서 Project Prisma adapter를 재사용하거나 별도 adapter를 둔다. Document 도메인 모델은 Project 도메인 모델을 직접 import하지 않는다.

## 데이터 모델

Prisma에는 `DocumentStatus` enum과 `Document` 모델을 추가한다.

필드는 도메인 문서의 DB 저장 필드를 따른다.

- `id`: UUID v7 기반 문서 식별자
- `projectId`: Project 식별자
- `ownerId`: Project와 같은 owner 식별자
- `originalName`: 업로드 원본 파일명
- `storageProvider`: 1차 MVP 기본값 `local`
- `storageKey`: 저장소 내부 논리적 상대 경로
- `mimeType`: 업로드 파일 MIME type
- `extension`: 정규화된 파일 확장자
- `sizeBytes`: 파일 크기
- `status`: `TEXT_EXTRACTION_PENDING`, `TEXT_EXTRACTING`, `READY`, `FAILED`
- `failureReason`: 실패 사유
- `createdAt`, `updatedAt`: UTC 기준

1차 MVP에서는 User/Auth 컨텍스트가 없으므로 `ownerId`는 외부 식별자 값으로 저장하고 사용자 테이블 FK를 강제하지 않는다.

Project와 Document는 같은 PostgreSQL schema 안에 있으므로 `projectId`는 Project FK로 연결한다. 단, 도메인 모델의 Aggregate 경계는 ID 참조로 유지한다.

목록 조회 성능을 위해 `(projectId, createdAt, id)` 기준 복합 인덱스를 둔다.

## 파일 저장 정책

`storageKey` 형식은 다음과 같다.

```text
projects/{projectId}/documents/{documentId}/{documentId}.{extension}
```

로컬 저장 adapter는 `DOCUMENT_STORAGE_BASE_PATH`와 `storageKey`를 조합한 뒤 canonical path를 계산한다. 계산된 경로가 base path 밖이면 저장을 중단하고 400 오류로 처리한다.

파일 쓰기는 DB 트랜잭션을 열기 전에 수행한다. DB 저장이나 Project 요약값 갱신에 실패하면 저장한 파일 삭제를 시도한다. 삭제 실패는 로그를 남기고 후속 정리 대상으로 둔다.

파일 시스템과 DB는 원자적 트랜잭션으로 묶을 수 없으므로, orphan file 정리는 별도 use case 또는 관리 명령으로 분리한다. 이번 구현 계획에는 정리 정책의 port와 테스트 기준까지만 포함하고, 자동 스케줄러는 후속 범위로 둔다.

## API 계약

구현 API는 다음과 같다.

```http
POST /projects/:projectId/documents
GET /projects/:projectId/documents
GET /projects/:projectId/documents/:documentId
POST /projects/:projectId/documents/:documentId/retry
```

`DELETE /projects/:projectId/documents/:documentId`는 만들지 않는다.

1차 MVP에는 User/Auth 컨텍스트가 없으므로 모든 API는 `X-Owner-Id` 요청 헤더를 필수로 받는다.

- 헤더 이름: `X-Owner-Id`
- 값 형식: UUID
- 누락 또는 UUID 형식 오류: 422 검증 오류
- controller는 헤더를 검증해 use case 입력의 `ownerId`로 전달한다.
- `ownerId`는 응답에 노출하지 않는다.

### 업로드

`POST /projects/:projectId/documents`는 multipart file을 받는다.

성공 응답은 문서 상세 응답과 같은 shape을 사용한다.

```json
{
  "id": "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99",
  "projectId": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
  "originalName": "A사 제안서.pdf",
  "extension": "pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "status": "TEXT_EXTRACTION_PENDING",
  "failureReason": null,
  "createdAt": "2026-06-30T08:00:00Z",
  "updatedAt": "2026-06-30T08:00:00Z"
}
```

응답에는 `storageProvider`, `storageKey`, `storagePath`, `storedName`, `ownerId`를 노출하지 않는다.

### 목록 조회

`GET /projects/:projectId/documents?page=1&size=20`은 offset 기반 페이징을 사용한다.

- `page` 기본값: 1
- `size` 기본값: 20
- `size` 최대값: 50
- 기본 정렬: `createdAt DESC, id DESC`
- 범위 위반: 422 검증 오류

### 상세 조회

`GET /projects/:projectId/documents/:documentId`는 문서 기본 정보와 처리 상태를 반환한다.

현재 ownerId가 Project에 접근할 수 없거나 문서가 해당 Project에 속하지 않으면 404로 처리한다. 1차 MVP의 `X-Owner-Id` 헤더 기준에서는 Project ownerId 불일치와 다른 Project의 Document 접근을 404로 숨기는 방식을 사용한다.

### 재시도

`POST /projects/:projectId/documents/:documentId/retry`는 `FAILED` 상태에서만 허용한다.

재시도 전에는 DB 트랜잭션을 열기 전에 원본 파일이 저장소에 존재하고 읽을 수 있는지 확인한다. 파일이 없거나 읽을 수 없으면 상태를 되돌리지 않고 `failureReason`을 갱신한 뒤 409 오류를 반환한다.

원본 파일 부재나 읽기 실패는 다음 순서로 처리한다.

1. Project 읽기 권한을 확인한다.
2. Document가 해당 Project에 속하는지 확인한다.
3. Document가 `FAILED` 상태인지 확인한다.
4. storage `exists` 결과가 실패이면 Document를 `FAILED`로 유지하고 `failureReason`을 갱신한다.
5. repository `save`가 성공한 뒤 use case가 `DocumentStateConflictError`를 반환한다.
6. HTTP interface는 해당 domain error를 409 응답으로 매핑한다.

성공하면 상태를 `TEXT_EXTRACTION_PENDING`으로 되돌린다. 실제 worker 재큐잉은 후속 범위다.

## 검증 규칙

업로드 검증은 다음 순서로 수행한다.

1. `projectId` UUID 형식 확인
2. Project 존재와 owner 접근 확인
3. Project 상태가 `ACTIVE`인지 확인
4. multipart file 존재 확인
5. 원본 파일명 존재 확인
6. 파일 크기 1바이트 이상 50MB 이하 확인
7. 마지막 확장자 추출과 소문자 정규화
8. 확장자 allowlist 확인
9. MIME type allowlist 확인
10. `csv`, `txt`의 `application/octet-stream` 예외 처리
11. 텍스트 계열 예외 파일의 null byte 최소 검사

허용 확장자는 `pdf`, `docx`, `xlsx`, `pptx`, `txt`, `csv`이다.

## 오류 처리

공통 오류 응답은 Project API와 같은 형식을 사용한다.

- 400: 잘못된 UUID, multipart 요청 구조 오류, storage path 탈출
- 404: Project 없음 또는 Document 없음
- 409: 보관된 Project에 업로드, 재시도 불가능한 상태, 원본 파일 부재
- 413: 파일 크기 50MB 초과
- 415: 허용되지 않은 파일 타입 또는 MIME type
- 422: 파일 누락, 원본 파일명 누락, page/size 범위 위반
- 500: 파일 저장 실패, 서버 설정 오류

## 환경 설정

`.env.example`에는 다음 변수를 추가한다.

```env
DOCUMENT_STORAGE_BASE_PATH="./.storage/documents"
DOCUMENT_MAX_FILE_BYTES="52428800"
```

개발 환경에서는 상대 경로 예시를 허용하지만, 애플리케이션 시작 시 프로젝트 루트 기준 절대 경로로 변환한다. 운영 환경에서는 절대 경로를 사용한다.

## 테스트 전략

테스트는 네 단계로 둔다.

1. 도메인 단위 테스트
   - Document 생성
   - 상태 전환
   - 재시도 가능 상태 검증

2. 유스케이스 테스트
   - 업로드 성공
   - 파일 검증 실패
   - Project 없음, Project 보관 상태
   - DB 저장 실패 시 storage cleanup 호출
   - 재시도 성공과 실패

3. API 테스트
   - multipart 업로드 요청/응답 shape
   - 목록, 상세, 재시도 API
   - 400, 404, 409, 413, 415, 422 오류 응답

4. PostgreSQL integration smoke
   - Prisma schema와 migration
   - Document 저장과 목록 정렬
   - Project documentCount와 lastActivityAt 갱신
   - 실제 임시 storage directory를 사용한 파일 저장

빠른 반복을 위해 도메인과 유스케이스 테스트는 인메모리 repository와 fake storage로 검증한다. 실제 PostgreSQL과 파일 시스템 연동은 integration smoke로 분리한다.

## 완료 기준

- `document-workspace` 모듈 구현 방향이 명확하다.
- Document Prisma 모델과 migration 방향이 명확하다.
- Document API 4개가 구현 계획에 포함된다.
- 파일 저장 port와 local adapter 책임이 분리되어 있다.
- `docs/domain/document-workspace.md`의 1차 MVP 규칙과 충돌하지 않는다.
- lint, typecheck, test, integration smoke 기준이 정의되어 있다.

## 제외 범위

- 텍스트 추출 worker 구현
- PDF, DOCX, XLSX, PPTX 파싱
- 이미지 OCR
- 임베딩 생성
- 벡터 검색
- AI 분석 요청
- 문서 삭제와 버전 관리
- 원본 파일 다운로드 API
- 바이러스 스캔
- 객체 스토리지 연동
