# 고아 파일 자동 정리 설계

## 배경

Document 업로드는 파일 시스템 저장과 DB 저장을 하나의 원자적 트랜잭션으로 묶을 수 없다. 현재 흐름은 DB 저장 실패 이후 파일 삭제까지 실패하면 `OrphanDocumentStorage`에 후보를 기록하도록 되어 있지만, 실제 구현은 `NoopOrphanDocumentStorage`라서 재시도 가능한 정리 기록이 남지 않는다.

이번 범위는 업로드 실패로 남은 로컬 파일을 DB 후보 목록에 기록하고, 백그라운드 정리 루프가 후보를 삭제한 뒤 결과를 남기는 것이다.

## 목표

- 고아 파일 후보를 DB에 저장한다.
- 정리 대상 후보를 시간과 batch size 기준으로 조회한다.
- 파일 삭제 성공 시 후보를 `CLEANED`로 마킹한다.
- 파일 삭제 실패 시 실패 사유, 시도 횟수, 다음 재시도 시각을 갱신한다.
- 자동 정리 루프는 환경 변수로 켜고 끈다.

## 비목표

- S3 같은 객체 스토리지 어댑터 구현
- 분산 락 또는 queue 기반 worker 구현
- 관리자 API 제공
- 오래된 `CLEANED` 기록 삭제 정책

## 데이터 모델

`orphan_document_files` 테이블을 추가한다.

- `id`: UUID primary key
- `storage_provider`: 현재는 `local`
- `storage_key`: 삭제 대상 파일 key, unique
- `reason`: 후보로 기록된 이유
- `status`: `PENDING`, `CLEANED`
- `attempt_count`: 삭제 시도 횟수
- `last_error`: 마지막 삭제 실패 사유
- `next_retry_at`: 다음 정리 시도 가능 시각
- `created_at`, `updated_at`, `cleaned_at`

삭제 실패 상태를 별도 enum으로 두지 않는다. 실패한 후보도 `PENDING`으로 유지하고 `next_retry_at`만 미래로 미뤄 재시도 가능 상태를 보존한다.

## 애플리케이션 흐름

### 후보 기록

`UploadDocumentUseCase`에서 DB 저장 실패 후 `DocumentStorage.remove`까지 실패하면 `OrphanDocumentStorage.record(storageKey, reason)`을 호출한다.

`PrismaOrphanDocumentStorage.record`는 같은 `storageKey`가 이미 있으면 기존 row를 `PENDING`으로 되돌리고 `reason`, `nextRetryAt`, `lastError`를 갱신한다.

### 정리 실행

`CleanupOrphanDocumentsUseCase`는 다음 순서로 동작한다.

1. 현재 시각을 기준으로 정리 가능한 후보를 batch size만큼 조회한다.
2. 후보별로 `DocumentStorage.remove(storageKey)`를 호출한다.
3. 삭제 성공 시 `OrphanDocumentStorage.resolve(storageKey, now)`를 호출한다.
4. 삭제 실패 시 `OrphanDocumentStorage.markFailed(storageKey, errorMessage, nextRetryAt, now)`를 호출한다.
5. 성공/실패 개수를 결과로 반환하고 실패는 다음 후보 처리를 막지 않는다.

로컬 저장소의 `remove`는 `force: true`를 사용하므로 파일이 이미 없어진 경우도 성공으로 간주한다.

### 자동 실행

`OrphanDocumentCleanupScheduler`는 Nest module lifecycle에서 interval을 관리한다.

- `ORPHAN_DOCUMENT_CLEANUP_ENABLED=false` 기본값
- `ORPHAN_DOCUMENT_CLEANUP_INTERVAL_MS=600000` 기본값
- `ORPHAN_DOCUMENT_CLEANUP_BATCH_SIZE=50` 기본값
- `ORPHAN_DOCUMENT_CLEANUP_RETRY_DELAY_MS=600000` 기본값

자동 정리는 기본 비활성화다. 개발과 테스트 중 의도하지 않은 파일 삭제를 피하기 위해 운영자가 명시적으로 활성화해야 한다.

## 테스트 전략

- application unit test
  - 정리 대상 파일 삭제 성공 시 후보가 resolved 처리된다.
  - 삭제 실패 시 실패 사유와 다음 재시도 시각이 기록되고 다음 후보 처리는 계속된다.
- infrastructure unit test
  - `PrismaOrphanDocumentStorage`가 `record`, due 조회, resolve, failure 기록을 수행한다.
- scheduler unit test
  - 비활성화 상태에서는 interval을 만들지 않는다.
  - 활성화 상태에서는 module init 시 cleanup use case를 반복 실행하도록 준비한다.

## 운영 메모

1차 MVP에서는 자동 정리 루프만 제공한다. 수동 관리 명령은 운영 중 필요성이 확인되면 별도 이슈로 분리한다.
