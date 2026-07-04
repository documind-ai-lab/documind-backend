# TXT/CSV 재시도 시 텍스트 추출 재실행 설계

## 목적

이번 작업은 실패한 TXT/CSV 문서에 대해 retry API를 호출했을 때 원본 파일을 확인한 뒤 plain text 추출을 즉시 재실행하는 흐름을 연결한다.

현재 업로드 API는 TXT/CSV 업로드 직후 추출을 실행하지만, retry API는 `FAILED` 문서를 `TEXT_EXTRACTION_PENDING`으로 되돌리는 데서 멈춘다. 사용자는 재시도 후 다시 처리 결과를 확인해야 하므로 1차 MVP에서는 TXT/CSV에 한해 retry 요청 안에서 동기 재추출까지 수행한다.

## 기준 문서

- `docs/specs/document-api-design.md`
- `docs/specs/text-extraction-design.md`
- `docs/specs/txt-csv-text-extractor-design.md`
- `docs/specs/upload-text-extraction-design.md`

## 범위

포함:

- `POST /projects/:projectId/documents/:documentId/retry` 성공 후 TXT/CSV plain text 추출 재실행
- TXT/CSV 재추출 성공 시 `READY` 응답 반환
- TXT/CSV 재추출 실패 시 `FAILED`와 `failureReason` 응답 반환
- PDF/Office 등 plain text adapter 미지원 확장자는 기존 `TEXT_EXTRACTION_PENDING` 응답 유지
- 원본 파일 없음 또는 읽기 실패 시 기존 409 conflict 정책 유지

제외:

- 비동기 queue/worker
- PDF/Office/OCR parser
- embedding/RAG 처리
- 추출 텍스트 조회 API

## 설계 방향

기존 `RetryDocumentUseCase`는 원본 파일 존재 여부를 확인하고 `FAILED -> TEXT_EXTRACTION_PENDING` 상태 전환만 책임진다. 이번 작업에서도 이 책임은 유지한다.

재추출 실행은 `DocumentController.retry`에서 retry 성공 결과를 받은 뒤 `ProcessPlainTextExtractionUseCase`를 호출해 조합한다.

```text
DocumentController.retry
  -> RetryDocumentUseCase.execute
     -> conflict: 409
     -> success: TEXT_EXTRACTION_PENDING document
  -> ProcessPlainTextExtractionUseCase.execute
     -> completed: READY document 반환
     -> failed: FAILED document 반환
     -> skipped: retry success document 반환
  -> presentDocument
```

이 방식은 업로드 후 추출 실행 흐름과 동일한 조합 패턴을 사용한다. `UploadDocumentUseCase`와 `RetryDocumentUseCase`는 각각 파일 생성, 재시도 상태 전환 책임만 유지한다.

## API 응답 정책

TXT/CSV 재시도:

- retry use case가 성공하면 plain text 추출을 실행한다.
- 추출 성공 시 `READY` 응답을 반환한다.
- 추출 실패 시 `FAILED`와 `failureReason` 응답을 반환한다.

미지원 확장자 재시도:

- retry use case 성공 결과인 `TEXT_EXTRACTION_PENDING` 응답을 그대로 반환한다.
- `DocumentText`는 새로 저장하지 않는다.

원본 파일 없음:

- 기존 retry use case가 `conflict`를 반환한다.
- controller는 기존처럼 409 응답을 반환한다.
- plain text 추출은 실행하지 않는다.

## 오류 처리

controller는 `RetryDocumentUseCase`의 `conflict` result를 먼저 처리한다.

그 외에는 `ProcessPlainTextExtractionResult`를 다음처럼 매핑한다.

- `completed`: `result.document` 응답
- `failed`: `result.document` 응답
- `skipped`: retry 성공으로 받은 Document 응답

권한 오류, 문서 없음, 상태 충돌은 기존 use case와 exception filter 정책을 따른다.

## 테스트 전략

e2e:

- 실패 상태의 TXT 문서를 retry하면 응답 status가 `READY`이고 `DocumentText`가 저장된다.
- 실패 상태의 CSV 문서를 retry하면 응답 status가 `READY`이고 CSV 원문 텍스트가 저장된다.
- 실패 상태의 PDF 문서를 retry하면 응답 status가 `TEXT_EXTRACTION_PENDING`이고 `DocumentText`가 저장되지 않는다.
- 실패 상태의 빈 TXT 문서를 retry하면 응답 status가 `FAILED`이고 `failureReason`이 `추출 텍스트가 비어 있습니다.`다.
- 원본 파일이 없는 실패 문서는 기존 409 conflict 응답을 유지한다.

unit:

- controller 단위 테스트는 현재 없다. 이번 범위는 e2e로 HTTP 흐름과 상태 변화를 검증한다.

## 완료 기준

- TXT/CSV retry API 응답이 재추출 결과를 반영한다.
- unsupported 파일 retry는 기존 pending 응답을 유지한다.
- 원본 파일 없음 conflict 흐름이 깨지지 않는다.
- lint, typecheck, unit/e2e, build가 통과한다.

## 후속 범위

- queue 기반 비동기 재처리
- PDF/Office/OCR parser 도입 후 retry 재처리 확장
- 추출 작업 이력 저장
- 추출 텍스트 조회 API
