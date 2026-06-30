# Document Workspace 도메인 결정

## 목적

Document Workspace는 프로젝트에 업로드된 업무 문서의 메타데이터, 파일 저장 위치, 처리 상태를 관리한다.

이 문서는 문서 업로드 API 구현 전에 합의한 도메인 용어와 규칙을 고정한다. 구현자는 이 문서를 기준으로 API 계약, 도메인 모델, 저장소, 파일 저장 어댑터, 테스트를 작성한다.

## Bounded Context

Bounded Context는 `Document Workspace`이다.

이 영역에서 `Document`는 사용자가 프로젝트에 업로드한 원본 업무 문서다. 견적서, 제안서, 계약서, 회의록, 표 계산 파일, 텍스트 파일처럼 AI 분석의 근거가 될 수 있는 파일을 관리한다.

Document Workspace는 파일 업로드와 처리 상태를 책임진다. 텍스트 추출 worker, 임베딩 생성, RAG 검색, AI 분석 결과 생성은 후속 Bounded Context 또는 후속 작업으로 분리한다.

## Aggregate Root

Aggregate Root는 `Document`이다.

`Document`는 파일 메타데이터, 저장 위치, 처리 상태 전환을 책임진다. `Project`는 문서를 소유하는 상위 업무 맥락이며, `Document`는 `projectId`로 Project에 속한다.

Project는 문서의 세부 상태를 직접 관리하지 않는다. Project는 목록과 상세 화면에 필요한 요약값인 `documentCount`와 `lastActivityAt`만 갱신 대상으로 가진다.

## Document 정의

`Document`는 특정 Project에 업로드된 하나의 파일이다.

원본 파일명은 식별자가 아니다. 같은 프로젝트에 같은 원본 파일명을 여러 번 업로드할 수 있으며, 문서의 유일한 식별자는 UUID v7 기반 `Document.id`이다.

## 파일 저장 정책

1차 MVP에서는 업로드 파일을 백엔드 서버의 로컬 디렉터리에 저장한다.

파일 저장 경로는 다음 형식을 사용한다.

```text
.storage/documents/{projectId}/{documentId}/{storedName}
```

`storedName`은 UUID 기반 이름과 원본 확장자를 조합해 만든다. 원본 파일명 충돌은 허용하지만, 저장 파일명은 충돌하지 않아야 한다.

예시는 다음과 같다.

```text
.storage/documents/8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91/018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99/018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99.pdf
```

로컬 저장소는 1차 MVP 구현 방식이다. 후속 배포나 운영 단계에서 S3, MinIO 같은 객체 스토리지로 교체할 수 있도록 파일 저장은 storage port 뒤에 둔다.

## 필드

| 필드 | 설명 |
| --- | --- |
| `id` | UUID v7 기반 문서 식별자 |
| `projectId` | 문서가 속한 Project 식별자 |
| `ownerId` | 문서 소유자 식별자 |
| `originalName` | 사용자가 업로드한 원본 파일명 |
| `storedName` | 서버에 저장된 충돌 방지 파일명 |
| `storagePath` | 서버 로컬 저장 경로 |
| `mimeType` | 업로드 파일 MIME type |
| `extension` | 정규화된 파일 확장자 |
| `sizeBytes` | 파일 크기 |
| `status` | 문서 처리 상태 |
| `failureReason` | 실패 사유 |
| `createdAt` | 업로드 기록 생성 시각 |
| `updatedAt` | 마지막 수정 시각 |

`ownerId`는 Project와 같은 소유자 식별자를 사용한다. 1차 MVP에서는 인증/사용자 컨텍스트가 완성되기 전까지 설정 기반 owner provider가 값을 주입한다.

## Document Status

문서 상태는 업로드 이후 텍스트 추출과 분석 가능 여부를 표현한다.

| 값 | 의미 |
| --- | --- |
| `TEXT_EXTRACTION_PENDING` | 파일 저장은 끝났고 텍스트 추출 작업을 기다리는 상태 |
| `TEXT_EXTRACTING` | 텍스트 추출 작업이 진행 중인 상태 |
| `READY` | 텍스트 추출이 끝나 분석과 대화 근거로 사용할 수 있는 상태 |
| `FAILED` | 업로드 이후 처리 중 실패한 상태 |

1차 업로드 API는 파일 저장과 Document 생성까지만 수행한다. 업로드 성공 직후 상태는 `TEXT_EXTRACTION_PENDING`이다.

`TEXT_EXTRACTING`, `READY`, `FAILED` 전환은 후속 텍스트 추출 worker에서 처리한다. 1차 MVP에서는 상태 값과 API 응답 계약만 먼저 둔다.

## 생성 규칙

문서 생성은 파일 업로드 성공을 전제로 한다.

업로드 요청 필수값은 multipart file이다.

업로드 시 검증 규칙은 다음과 같다.

| 항목 | 규칙 |
| --- | --- |
| 프로젝트 | 존재하는 Project여야 한다 |
| 프로젝트 상태 | `ACTIVE` Project에만 업로드할 수 있다 |
| 파일 크기 | 1바이트 이상, 50MB 이하 |
| 파일 확장자 | `pdf`, `docx`, `xlsx`, `pptx`, `txt`, `csv` 중 하나 |
| MIME type | 허용 확장자와 호환되는 MIME type이어야 한다 |
| 원본 파일명 | 비어 있으면 안 되며 저장 전 표시용 이름으로 보존한다 |

허용 파일 타입은 다음과 같다.

| 확장자 | 대표 MIME type |
| --- | --- |
| `pdf` | `application/pdf` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `txt` | `text/plain` |
| `csv` | `text/csv`, `application/csv`, `application/vnd.ms-excel` |

파일 크기 제한은 파일 1개당 50MB이다.

이미지 파일은 1차 MVP 허용 대상이 아니다. 이미지 기반 문서 처리는 OCR이 필요하므로 후속 작업으로 분리한다.

## 중복 파일명 정책

같은 프로젝트 안에서 같은 원본 파일명 업로드를 허용한다.

업무 문서는 수정본, 재전달본, 최종본이 같은 파일명으로 반복 전달될 수 있다. 1차 MVP에서는 파일명 중복을 차단하지 않고 `Document.id`, 업로드 시각, 처리 상태로 구분한다.

후속 단계에서 버전 관리가 필요해지면 같은 원본 파일명을 기준으로 `version` 필드를 추가하는 방식을 별도 설계한다.

## 업로드 성공 흐름

업로드 성공 흐름은 다음 순서로 처리한다.

1. Project 존재 여부를 확인한다.
2. Project 상태가 `ACTIVE`인지 확인한다.
3. 파일 크기, 확장자, MIME type을 검증한다.
4. `Document.id`와 `storedName`을 생성한다.
5. 파일을 로컬 저장소에 저장한다.
6. Document 레코드를 `TEXT_EXTRACTION_PENDING` 상태로 생성한다.
7. Project의 `documentCount`를 1 증가시킨다.
8. Project의 `lastActivityAt`을 업로드 성공 시각으로 갱신한다.

파일 저장에는 성공했지만 DB 저장에 실패하면 저장된 파일을 삭제해 불일치를 줄인다. 파일 삭제도 실패하면 오류 로그를 남기고 후속 정리 대상이 되도록 한다.

DB 저장에는 성공했지만 Project 요약값 갱신에 실패하면 전체 업로드 트랜잭션을 실패로 처리한다. 구현에서는 Document 생성과 Project 요약값 갱신을 같은 DB 트랜잭션 안에서 처리한다.

## 목록 조회 규칙

문서 목록은 Project 상세 워크스페이스의 왼쪽 문서 목록에 필요한 정보를 반환한다.

기본 정렬은 `createdAt DESC, id DESC`이다. 최근 업로드된 문서가 가장 위에 온다.

```http
GET /projects/{projectId}/documents
```

1차 MVP의 문서 목록 조회는 Project 상세 화면에서 사용하는 범위로 시작한다. Project별 문서 수가 많아지면 `page`, `size` 기반 페이징을 추가한다.

목록 응답 예시는 다음과 같다.

```json
{
  "items": [
    {
      "id": "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99",
      "projectId": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
      "originalName": "A사 제안서.pdf",
      "extension": "pdf",
      "sizeBytes": 1048576,
      "status": "TEXT_EXTRACTION_PENDING",
      "failureReason": null,
      "createdAt": "2026-06-30T08:00:00Z",
      "updatedAt": "2026-06-30T08:00:00Z"
    }
  ]
}
```

`storagePath`, `storedName`, `ownerId`는 일반 클라이언트 응답에 노출하지 않는다.

## 상세 조회 규칙

문서 상세 조회는 1차 MVP에서 문서 기본 정보와 처리 상태만 반환한다.

```http
GET /projects/{projectId}/documents/{documentId}
```

응답 예시는 다음과 같다.

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

## 재시도 규칙

후속 텍스트 추출 worker가 실패한 문서는 `FAILED` 상태가 된다.

1차 설계의 API 후보에는 재시도 액션을 포함한다.

```http
POST /projects/{projectId}/documents/{documentId}/retry
```

재시도는 `FAILED` 상태에서만 가능하며, 성공하면 상태를 `TEXT_EXTRACTION_PENDING`으로 되돌린다. 실제 worker 재큐잉은 후속 구현 범위다.

## API 후보

1차 Document API 후보는 다음과 같다.

```http
POST /projects/{projectId}/documents
GET /projects/{projectId}/documents
GET /projects/{projectId}/documents/{documentId}
POST /projects/{projectId}/documents/{documentId}/retry
```

`DELETE /projects/{projectId}/documents/{documentId}`는 1차 MVP에서 만들지 않는다. 문서 삭제, 보관, 교체, 버전 관리는 후속 정책으로 분리한다.

## 오류 처리

주요 오류는 다음처럼 나눈다.

| 상태 코드 | 상황 |
| --- | --- |
| 400 | 잘못된 UUID, multipart 요청 구조 오류 |
| 404 | Project 없음 또는 Document 없음 |
| 409 | 보관된 Project에 업로드, 재시도 불가능한 상태 |
| 413 | 파일 크기 50MB 초과 |
| 415 | 허용되지 않은 파일 타입 |
| 422 | 파일 누락, 원본 파일명 누락 등 검증 실패 |
| 500 | 파일 저장 실패, 서버 설정 오류 |

오류 응답은 Project API와 같은 공통 오류 응답 포맷을 사용한다.

## 제외 범위

1차 Document API 구현에서 제외하는 범위는 다음과 같다.

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

## 후속 확장

후속 작업에서는 다음 기능을 별도 이슈로 분리한다.

- 텍스트 추출 worker
- 문서별 추출 텍스트 저장
- 분석 가능 상태 전환
- 문서 삭제 또는 보관 정책
- 문서 버전 관리
- S3 또는 MinIO storage adapter
- OCR 기반 이미지 문서 처리
- 파일 다운로드 권한 정책
