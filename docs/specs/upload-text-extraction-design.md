# TXT/CSV 업로드 후 텍스트 추출 실행 흐름 설계

## 목적

이번 작업은 TXT/CSV 문서 업로드 직후 plain text 추출을 실행해 `DocumentText`를 저장하고 Document를 `READY` 상태로 전환하는 실제 API 흐름을 연결한다.

직전 작업에서 `ProcessPlainTextExtractionUseCase`와 `PlainTextDocumentTextExtractor`는 준비되었다. 이번 범위는 기존 업로드 API가 해당 처리 흐름을 호출하도록 연결하는 것이다.

## 기준 문서

- `docs/specs/document-api-design.md`
- `docs/specs/text-extraction-design.md`
- `docs/specs/txt-csv-text-extractor-design.md`
- `docs/specs/txt-csv-text-extractor-implementation-plan.md`

## 범위

포함:

- `POST /projects/:projectId/documents` 업로드 후 TXT/CSV 추출 실행
- TXT/CSV 추출 성공 시 응답 상태를 `READY`로 반환
- TXT/CSV 추출 실패 시 응답 상태를 `FAILED`와 `failureReason`으로 반환
- PDF/Office 등 plain text adapter 미지원 확장자는 기존 `TEXT_EXTRACTION_PENDING` 상태 유지
- e2e 테스트에서 실제 업로드 API 응답과 `DocumentText` 저장 검증

제외:

- 비동기 queue/worker
- PDF/Office/OCR parser
- embedding/RAG 처리
- 추출 텍스트 조회 API
- retry API에서 추출 재실행

## 설계 방향

1차 MVP는 별도 worker 없이 같은 HTTP 요청 안에서 TXT/CSV만 동기 처리한다.

```text
DocumentController.upload
  -> UploadDocumentUseCase.execute
  -> ProcessPlainTextExtractionUseCase.execute
     -> unsupported: skipped
     -> completed: READY document 반환
     -> failed: FAILED document 반환
  -> presentDocument
```

이 방식은 현재 코드의 모듈 경계를 유지한다. 업로드 use case는 파일 저장과 Document 생성 책임만 유지하고, 텍스트 추출 실행 여부는 interface 계층에서 조합한다.

## API 응답 정책

TXT/CSV 업로드:

- 파일 저장과 Document 생성이 끝난 뒤 plain text 추출을 실행한다.
- 추출 성공 시 응답은 `READY` 상태를 반환한다.
- 저장된 `DocumentText`는 API 응답에 직접 포함하지 않는다.

미지원 확장자 업로드:

- `ProcessPlainTextExtractionUseCase`가 `skipped`를 반환한다.
- controller는 업로드 직후 생성된 Document를 그대로 응답한다.
- 기존 응답 상태인 `TEXT_EXTRACTION_PENDING`을 유지한다.

추출 실패:

- `ProcessPlainTextExtractionUseCase`가 `FAILED` Document를 반환한다.
- controller는 201 응답으로 `FAILED` 상태와 `failureReason`을 반환한다.
- 파일 업로드 자체는 성공했으므로 HTTP 오류로 매핑하지 않는다.

보안 검사 실패:

- 감염 의심 파일은 기존 업로드 use case가 `FAILED` Document를 생성한다.
- 이 경우 plain text 추출을 실행하지 않는다.

## 의존성 주입

`DocumentController` 생성자에 `ProcessPlainTextExtractionUseCase`를 추가한다.

```ts
constructor(
  private readonly uploadDocumentUseCase: UploadDocumentUseCase,
  private readonly processPlainTextExtractionUseCase: ProcessPlainTextExtractionUseCase,
  ...
) {}
```

Nest module에는 이미 `ProcessPlainTextExtractionUseCase` provider가 등록되어 있으므로 controller 주입만 추가한다.

## 오류 처리

controller는 `ProcessPlainTextExtractionResult`를 다음처럼 매핑한다.

- `completed`: `result.document` 응답
- `failed`: `result.document` 응답
- `skipped`: 업로드 use case가 반환한 원래 Document 응답

상태 충돌 또는 권한 오류가 발생하면 기존 예외 필터와 use case 오류 정책을 따른다.

## 테스트 전략

e2e:

- TXT 파일 업로드 시 응답 status가 `READY`이고 `DocumentText`가 저장된다.
- CSV 파일 업로드 시 응답 status가 `READY`이고 CSV 원문 텍스트가 저장된다.
- PDF 파일 업로드 시 응답 status가 `TEXT_EXTRACTION_PENDING`이고 `DocumentText`가 저장되지 않는다.
- 빈 TXT 파일 업로드 시 응답 status가 `FAILED`이고 `failureReason`이 `추출 텍스트가 비어 있습니다.`다.
- 보안 검사 감염 의심 파일은 plain text 추출을 실행하지 않고 기존 `FAILED` 응답을 유지한다.

unit:

- controller 단위 테스트는 현재 없다. 이번 범위는 e2e로 HTTP 흐름과 provider wiring을 검증한다.

## 완료 기준

- TXT/CSV 업로드 API가 동기 plain text 추출을 실행한다.
- TXT/CSV 성공 케이스가 `READY` 응답과 `DocumentText` 저장으로 검증된다.
- 미지원 확장자는 기존 pending 상태를 유지한다.
- 추출 실패는 `FAILED` 응답과 실패 사유로 검증된다.
- 기존 Document API e2e와 unit test가 통과한다.

## 후속 범위

- retry API에서 실패 문서 추출 재실행 연결
- queue 기반 비동기 추출 worker
- PDF/Office/OCR parser
- 추출 텍스트 조회 API
- embedding 생성과 vector 저장
