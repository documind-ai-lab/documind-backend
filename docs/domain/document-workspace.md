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

파일 저장소의 기본 경로는 환경 변수 `DOCUMENT_STORAGE_BASE_PATH`로 주입한다. 이 값은 절대 경로여야 하며, 애플리케이션은 상대 경로를 그대로 저장소 base path로 사용하지 않는다.

개발 환경에서 `.storage/documents`를 사용하더라도 애플리케이션 시작 시 프로젝트 루트 기준 절대 경로로 해석한 뒤 사용한다. 운영 환경에서는 예를 들어 `/var/lib/documind/documents`처럼 배포 단위와 분리된 절대 경로를 지정한다.

파일 저장은 `storageProvider`와 `storageKey`로 식별한다. 1차 MVP의 `storageProvider`는 `local`이다.

`storageKey`는 저장소 내부의 논리적 상대 경로이며 다음 형식을 사용한다.

```text
projects/{projectId}/documents/{documentId}/{documentId}.{extension}
```

로컬 저장소의 실제 파일 경로는 `DOCUMENT_STORAGE_BASE_PATH`와 `storageKey`를 조합해 만든다.

```text
{DOCUMENT_STORAGE_BASE_PATH}/{storageKey}
```

로컬 저장 어댑터는 경로 조합 후 canonical path를 계산하고, 계산된 경로가 반드시 `DOCUMENT_STORAGE_BASE_PATH`의 하위 경로인지 확인한다. canonical path가 base path 밖으로 벗어나면 파일 저장을 중단하고 400 오류로 처리한다.

`storedName`은 `{documentId}.{extension}` 형식으로 만든다. 이미 `documentId` 디렉터리가 고유하므로 저장 파일명에 별도 UUID를 다시 만들지 않는다. 원본 파일명 충돌은 허용하지만, 저장 파일명은 충돌하지 않아야 한다.

예시는 다음과 같다.

```text
/var/lib/documind/documents/projects/8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91/documents/018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99/018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99.pdf
```

로컬 저장소는 1차 MVP 구현 방식이다. 후속 배포나 운영 단계에서 S3, MinIO 같은 객체 스토리지로 교체할 수 있도록 파일 저장은 storage port 뒤에 둔다.

로컬 저장소를 사용하는 동안 `DOCUMENT_STORAGE_BASE_PATH`는 애플리케이션 배포 단위와 분리해 영속 볼륨으로 관리한다. Docker, VM, NAS 환경에 배포할 때는 프로세스 재시작이나 컨테이너 재생성으로 업로드 파일이 사라지지 않도록 볼륨 마운트를 먼저 구성한다.

## 필드

| 필드 | 설명 |
| --- | --- |
| `id` | UUID v7 기반 문서 식별자 |
| `projectId` | 문서가 속한 Project 식별자 |
| `ownerId` | 문서 소유자 식별자 |
| `originalName` | 사용자가 업로드한 원본 파일명 |
| `storageProvider` | 파일 저장소 종류. 1차 MVP 기본값은 `local` |
| `storageKey` | 저장소 내부 논리적 상대 경로 |
| `mimeType` | 업로드 파일 MIME type |
| `extension` | 정규화된 파일 확장자 |
| `sizeBytes` | 파일 크기 |
| `status` | 문서 처리 상태 |
| `failureReason` | 실패 사유 |
| `createdAt` | 업로드 기록 생성 시각 |
| `updatedAt` | 마지막 수정 시각 |

`ownerId`는 Project와 같은 소유자 식별자를 사용한다. 1차 MVP에서는 인증/사용자 컨텍스트가 완성되기 전까지 설정 기반 owner provider가 값을 주입한다.

`storageProvider`와 `storageKey`는 내부 파일 저장 메타데이터다. 객체 스토리지 전환, 멀티 스토리지 도입, 저장소 레이아웃 변경 시 과거 파일을 추적할 수 있도록 DB에 저장한다.

DB 저장 필드와 런타임 유도 필드의 구분은 다음과 같다.

| 구분 | 필드 |
| --- | --- |
| DB 저장 필드 | `id`, `projectId`, `ownerId`, `originalName`, `storageProvider`, `storageKey`, `mimeType`, `extension`, `sizeBytes`, `status`, `failureReason`, `createdAt`, `updatedAt` |
| 런타임 유도 필드 | `storedName`, `storagePath` |

`storedName`은 `id`와 `extension`으로 만들고, `storagePath`는 `DOCUMENT_STORAGE_BASE_PATH`와 `storageKey`로 만든다. `storagePath` 같은 로컬 절대 경로는 환경마다 달라질 수 있으므로 DB에 저장하지 않는다.

## 권한 정책

Document API는 Project 권한을 기준으로 접근을 판단한다.

1차 MVP에서는 현재 호출자의 `ownerId`가 Project의 `ownerId`와 같아야 Project 문서에 접근할 수 있다. 인증/멤버십 기능이 도입되기 전까지 현재 호출자는 설정 기반 owner provider가 제공한다.

권한 기준은 다음과 같다.

| 작업 | 필요한 권한 |
| --- | --- |
| 문서 목록 조회 | Project 읽기 권한 |
| 문서 상세 조회 | Project 읽기 권한 |
| 문서 업로드 | Project 쓰기 권한 |
| 문서 처리 재시도 | Project 쓰기 권한 |

후속 단계에서 프로젝트 멤버십이 도입되면 `ownerId` 비교는 Project membership 정책으로 대체한다.

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
| 경로 식별자 | 업로드 API에서는 `projectId`가 UUID v7 형식이어야 한다 |
| 프로젝트 상태 | `ACTIVE` Project에만 업로드할 수 있다 |
| 파일 크기 | 1바이트 이상, 50MB 이하 |
| 파일 확장자 | `pdf`, `docx`, `xlsx`, `pptx`, `txt`, `csv` 중 하나 |
| 확장자 문자 | 소문자 영문과 숫자만 허용하며 정규식 `^[a-z0-9]+$`를 만족해야 한다 |
| MIME type | 확장자별 허용 MIME type 목록과 일치해야 한다 |
| 원본 파일명 | 비어 있으면 안 되며 저장 전 표시용 이름으로 보존한다 |

허용 파일 타입은 다음과 같다.

| 확장자 | 대표 MIME type |
| --- | --- |
| `pdf` | `application/pdf` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `txt` | `text/plain`, `application/octet-stream` |
| `csv` | `text/csv`, `application/csv`, `application/vnd.ms-excel`, `text/plain`, `application/octet-stream` |

파일 크기 제한은 파일 1개당 50MB이다.

이미지 파일은 1차 MVP 허용 대상이 아니다. 이미지 기반 문서 처리는 OCR이 필요하므로 후속 작업으로 분리한다.

## MIME 검증 기준

1차 MVP에서는 파일 확장자 allowlist와 MIME type allowlist를 함께 검증한다. 확장자는 원본 파일명의 마지막 마침표 뒤 값을 소문자로 정규화해 판단하고, MIME type은 업로드 라이브러리가 전달한 값을 기준으로 판단한다.

이중 확장자도 같은 규칙을 적용한다. 예를 들어 `test.pdf.exe`는 `exe` 파일로 판단되어 허용 확장자 검증에서 거부되고, `archive.tar.gz`는 `gz` 파일로 판단되어 거부된다.

정규화된 확장자는 `^[a-z0-9]+$` 정규식을 만족해야 한다. 확장자에 `/`, `\`, `.`, 공백, 제어 문자, URL 인코딩된 경로 조작 문자가 포함되면 415 오류로 처리한다.

MIME type이 비어 있으면 415 오류로 처리한다. 클라이언트가 확장자와 호환되지 않는 MIME type을 보내는 경우도 415 오류로 처리한다.

`application/octet-stream`은 실제 파일 타입을 알 수 없는 값이므로 기본적으로 허용하지 않는다. 다만 CSV와 TXT는 사용자 OS, 브라우저, 업로드 도구에 따라 `application/octet-stream`으로 전달될 수 있으므로 확장자가 `csv` 또는 `txt`인 경우에만 예외적으로 허용한다.

CSV와 TXT의 `application/octet-stream` 예외는 업로드 편의를 위한 1차 MVP 정책이다. 악성 바이너리를 `.txt`나 `.csv`로 위장할 수 있는 위험이 있으므로, 업로드 API는 파일 앞부분에 null byte가 포함되는지 확인하는 최소 텍스트성 검사를 수행한다. 텍스트 추출 worker 구현 단계에서는 파일 파서 기반 2차 검증과 비정상 바이너리 감지 실패 처리를 추가한다.

파일 바이너리 시그니처인 Magic Number 검증은 1차 MVP 범위에서 제외한다. 다만 보안 강화 단계에서는 PDF, Office Open XML, 텍스트 계열 파일에 대해 Magic Number 또는 파일 파서 기반 검증을 추가한다.

## 중복 파일명 정책

같은 프로젝트 안에서 같은 원본 파일명 업로드를 허용한다.

업무 문서는 수정본, 재전달본, 최종본이 같은 파일명으로 반복 전달될 수 있다. 1차 MVP에서는 파일명 중복을 차단하지 않고 `Document.id`, 업로드 시각, 처리 상태로 구분한다.

후속 단계에서 버전 관리가 필요해지면 같은 원본 파일명을 기준으로 `version` 필드를 추가하는 방식을 별도 설계한다.

## 업로드 성공 흐름

업로드 성공 흐름은 다음 순서로 처리한다.

1. Project 존재 여부를 확인한다.
2. Project 상태가 `ACTIVE`인지 확인한다.
3. 파일 크기, 확장자, MIME type을 검증한다.
4. `Document.id`, `storedName`, `storageProvider`, `storageKey`를 생성한다.
5. DB 트랜잭션을 열기 전에 `storageKey` 위치에 파일을 로컬 저장소에 저장한다.
6. DB 트랜잭션 안에서 Document 레코드를 `TEXT_EXTRACTION_PENDING` 상태로 생성한다. 이때 `storageProvider`와 `storageKey`를 함께 저장한다.
7. 같은 DB 트랜잭션 안에서 Project의 `documentCount`를 1 증가시킨다.
8. 같은 DB 트랜잭션 안에서 Project의 `lastActivityAt`을 업로드 성공 시각으로 갱신한다.
9. DB 트랜잭션 커밋 후 업로드 성공 응답을 반환한다.

파일 저장에는 성공했지만 DB 저장에 실패하면 저장된 파일을 삭제해 불일치를 줄인다. 구현에서는 `try/finally` 또는 트랜잭션 실패 후처리 흐름을 사용해 예외가 발생해도 삭제 시도가 누락되지 않게 한다. 파일 삭제도 실패하면 오류 로그를 남기고 후속 정리 대상이 되도록 한다.

DB 저장에는 성공했지만 Project 요약값 갱신에 실패하면 전체 업로드 트랜잭션을 실패로 처리한다. 구현에서는 Document 생성과 Project 요약값 갱신을 같은 DB 트랜잭션 안에서 처리한다. DB 트랜잭션 안에서는 파일 쓰기, 파일 읽기, MIME 재검사 같은 외부 I/O를 수행하지 않는다.

## 업로드 불일치 정리 정책

파일 시스템과 DB 트랜잭션은 하나의 원자적 트랜잭션으로 묶을 수 없다. 따라서 파일 저장 후 DB 저장 또는 커밋 전에 서버 프로세스가 종료되면 DB 레코드가 없는 잔류 파일이 생길 수 있다.

1차 MVP에서는 별도 `UPLOAD_STARTED` 상태를 추가하지 않는다. 대신 다음 정리 정책을 구현 기준으로 둔다.

1. 업로드 실패 시 현재 요청 안에서 저장 파일 삭제를 먼저 시도한다.
2. 삭제 실패 또는 프로세스 종료로 남은 파일은 스토리지 정리 작업의 대상으로 둔다.
3. 스토리지 정리 작업은 `DOCUMENT_STORAGE_BASE_PATH` 아래의 `projects/{projectId}/documents/{documentId}` 경로를 순회하며 DB에 존재하지 않는 `documentId` 디렉터리를 정리 후보로 본다.
4. 정리 후보 디렉터리는 생성 또는 마지막 수정 시각이 최소 1시간 이상 지난 경우에만 삭제한다.
5. 정리 작업은 기본적으로 최근 7일 이내 생성 또는 수정된 디렉터리만 스캔한다. 스캔 기간은 운영 설정으로 조정할 수 있다.
6. 정리 작업은 1회 실행당 최대 처리 건수와 실행 타임아웃을 둔다. 기본값은 최대 500건, 최대 5분으로 시작한다.
7. 정리 작업은 삭제 전 대상 경로, 디렉터리 시각, 판단 근거를 로그로 남긴다.
8. 정리 작업은 운영 초기에는 수동 관리 명령으로 시작하고, 필요해지면 주기 실행 배치로 전환한다.

이 정책은 로컬 저장소 기준이다. 후속 객체 스토리지 전환 시에는 같은 개념을 객체 key 정리 작업으로 옮긴다. 문서 수가 늘어나면 파일 시스템 재귀 스캔 대신 업로드 실패 후보를 DB 로그 또는 cleanup candidate 테이블에 남기고 해당 목록을 기준으로 정리한다.

## Project 요약값 갱신 전략

1차 MVP에서는 Document 생성과 Project 요약값 갱신을 같은 DB 트랜잭션에서 처리한다. 같은 데이터베이스 안에서 문서 업로드 성공 여부와 Project 목록 화면의 요약값을 일관되게 보여주는 것이 우선이기 때문이다.

다만 `Project`와 `Document`는 별도의 Aggregate Root이다. 1차 MVP 구현에서도 파일 저장처럼 오래 걸릴 수 있는 작업을 DB 트랜잭션 밖에서 처리하고, DB 트랜잭션 안에서는 Document 생성과 Project 요약값 갱신만 짧게 수행한다.

Project 요약값 갱신은 조회 후 값 계산 방식이 아니라 원자적 update 방식으로 처리한다. 예시는 다음과 같다.

```sql
UPDATE projects
SET document_count = document_count + 1,
    last_activity_at = :uploaded_at
WHERE id = :project_id;
```

이 쿼리는 Document 생성과 같은 트랜잭션 안에서 실행하되, Project row를 오래 점유하지 않도록 트랜잭션 안에서 외부 파일 I/O나 긴 작업을 수행하지 않는다.

Project 요약값 갱신 중 락 타임아웃이나 데드락이 발생하면 업로드 트랜잭션을 실패로 처리한다. 이 경우 이미 저장된 파일은 업로드 실패 정리 흐름에 따라 삭제를 시도하고, 삭제 실패 시 orphan 정리 대상으로 남긴다.

문서 업로드 동시성이 높아져 Project 레코드 락 경합이나 데드락 가능성이 커지면 `DocumentCreatedEvent`를 발행하고 Project 요약값을 비동기 이벤트 리스너에서 갱신하는 방식으로 전환한다.

## 목록 조회 규칙

문서 목록은 Project 상세 워크스페이스의 왼쪽 문서 목록에 필요한 정보를 반환한다.

기본 정렬은 `createdAt DESC, id DESC`이다. 최근 업로드된 문서가 가장 위에 온다.

```http
GET /projects/{projectId}/documents?page=1&size=20
```

문서 목록 조회는 1차 MVP부터 offset 기반 페이징을 사용한다. Project API와 같은 규칙을 적용한다.

- `page` 기본값: 1
- `size` 기본값: 20
- `size` 최대값: 50
- 범위 위반: 422 검증 오류

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
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "hasNext": false
}
```

`storageProvider`, `storageKey`, `storagePath`, `storedName`, `ownerId`는 일반 클라이언트 응답에 노출하지 않는다.

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

재시도는 기본적으로 `FAILED` 상태에서만 가능하며, 성공하면 상태를 `TEXT_EXTRACTION_PENDING`으로 되돌린다. 실제 worker 재큐잉은 후속 구현 범위다.

재시도 전에는 DB 트랜잭션을 열기 전에 `storageProvider`와 `storageKey` 기준으로 원본 파일이 실제 저장소에 존재하는지 확인한다. 물리 파일이 없거나 읽을 수 없으면 `TEXT_EXTRACTION_PENDING`으로 되돌리지 않고 재시도 불가능한 상태로 409 오류를 반환한다. 이 경우 Document 상태는 `FAILED`로 유지하고 `failureReason`을 원본 파일 없음 또는 읽기 불가 사유로 갱신한다. 파일 존재 검증이 끝난 뒤 짧은 DB 트랜잭션 안에서 상태를 갱신한다.

후속 텍스트 추출 worker 구현 단계에서는 장시간 정체된 `TEXT_EXTRACTING` 문서도 재시도 대상으로 확장한다. 기준 시간은 30분을 기본값으로 두고, `updatedAt`이 기준 시간보다 오래된 `TEXT_EXTRACTING` 문서는 worker 비정상 종료 가능성이 있는 것으로 간주해 운영자 또는 시스템 재시도를 허용한다.

후속 worker 운영 단계에서는 30분 이상 정체된 `TEXT_EXTRACTING` 문서를 스케줄러가 `FAILED` 상태로 자동 전환하는 정책도 함께 둔다. 이때 `failureReason`에는 처리 타임아웃임을 기록한다.

## API 후보

1차 Document API 후보는 다음과 같다.

```http
POST /projects/{projectId}/documents
GET /projects/{projectId}/documents
GET /projects/{projectId}/documents/{documentId}
POST /projects/{projectId}/documents/{documentId}/retry
```

`DELETE /projects/{projectId}/documents/{documentId}`는 1차 MVP에서 만들지 않는다. 문서 삭제, 보관, 교체, 버전 관리는 후속 정책으로 분리한다.

목록 조회, 상세 조회, 재시도 API의 경로 식별자인 `projectId`와 `documentId`는 모두 UUID v7 형식이어야 한다.

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

409는 리소스 상태 때문에 요청을 완료할 수 없는 업무 규칙 충돌에 사용한다. 보관된 Project에 업로드하거나 재시도할 수 없는 상태의 Document에 재시도를 요청하는 경우가 여기에 해당한다. 422는 요청 필드나 파일 값 자체가 유효하지 않은 검증 실패에 사용한다.

## 운영 확인 사항

문서 업로드 API를 실제 환경에서 사용하기 전 다음 설정을 확인한다.

| 항목 | 확인 기준 |
| --- | --- |
| 로컬 저장소 볼륨 | `DOCUMENT_STORAGE_BASE_PATH`가 절대 경로이며 재시작 후에도 유지되는 영속 볼륨이어야 한다 |
| 다중 서버 공유 스토리지 | API 서버와 worker가 분리되거나 API 서버가 2대 이상이면 `DOCUMENT_STORAGE_BASE_PATH`는 NAS, EFS 같은 공유 볼륨이어야 한다 |
| 백엔드 multipart 제한 | 파일 1개당 50MB 업로드를 받을 수 있도록 요청 크기 제한을 50MB 이상으로 둔다 |
| 프록시 업로드 제한 | Nginx 등 앞단 프록시를 사용하면 `client_max_body_size` 같은 제한을 50MB 이상으로 둔다 |
| UUID v7 생성기 | Project API에서 사용하는 식별자 생성 방식과 같은 UUID v7 생성기를 사용한다 |

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
