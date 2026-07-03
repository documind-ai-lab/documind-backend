# TXT/CSV 문서 텍스트 추출 adapter 설계

## 목적

이번 작업은 업로드된 TXT/CSV 원본 파일을 실제 텍스트로 읽어 `DocumentText`에 저장하는 첫 번째 추출 흐름을 만든다.

직전 작업에서 `DocumentText` 저장 구조와 `StartTextExtractionUseCase`, `CompleteTextExtractionUseCase`, `FailTextExtractionUseCase`는 준비되었다. 이번 범위는 그 계약을 실제 파일 읽기와 TXT/CSV 추출 adapter에 연결하는 것이다.

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/specs/document-api-design.md`
- `docs/specs/text-extraction-design.md`
- `docs/specs/text-extraction-implementation-plan.md`
- `docs/specs/object-storage-adapter-design.md`

## 범위

포함:

- `DocumentStorage` 읽기 계약 추가
- local, S3, fake storage의 `read` 구현
- TXT/CSV 전용 텍스트 추출 adapter
- TXT/CSV 처리 runner 또는 use case
- 지원하지 않는 확장자는 상태를 바꾸지 않고 `skipped`로 반환
- UTF-8 decode, BOM 제거, 빈 텍스트, 크기 제한, storage read 실패 테스트

제외:

- PDF parser
- DOCX, XLSX, PPTX parser
- OCR
- queue, scheduler, worker process 운영 구성
- embedding 생성
- RAG 검색
- 사용자용 추출 텍스트 조회 API

## 설계 방향

1차 구현은 backend process 내부 application use case로 둔다.

```text
document-workspace
  application
    ProcessPlainTextExtractionUseCase
    DocumentTextExtractor port
  infrastructure
    PlainTextDocumentTextExtractor
  storage
    DocumentStorage.read(storageKey)
```

이름에 `PlainText`를 사용하는 이유는 TXT/CSV를 구조화 파싱하지 않고 텍스트 파일 계열로만 취급하기 때문이다. CSV는 표 구조를 분석하지 않고 원본 텍스트를 줄바꿈 포함 문자열로 저장한다.

## 처리 흐름

`ProcessPlainTextExtractionUseCase` 입력:

```ts
{
  projectId: string;
  ownerId: string;
  documentId: string;
}
```

동작:

1. Project 쓰기 권한과 Document 소속은 기존 use case들이 확인한다.
2. Document 상세를 조회한다.
3. 확장자가 `txt` 또는 `csv`가 아니면 상태를 바꾸지 않고 `skipped`를 반환한다.
4. `StartTextExtractionUseCase`를 호출해 `TEXT_EXTRACTING`으로 전환한다.
5. `DocumentStorage.read(storageKey)`로 원본 파일을 읽는다.
6. `PlainTextDocumentTextExtractor`가 Buffer를 UTF-8 문자열로 decode한다.
7. `CompleteTextExtractionUseCase`를 호출해 `DocumentText` 저장과 `READY` 전환을 처리한다.
8. storage read 또는 decode 오류가 발생하면 `FailTextExtractionUseCase`를 호출해 `FAILED`로 전환한다.

반환:

```ts
type ProcessPlainTextExtractionResult =
  | { type: "completed"; document: DocumentSnapshot }
  | { type: "failed"; document: DocumentSnapshot; reason: string }
  | { type: "skipped"; document: DocumentSnapshot; reason: string };
```

## 상태 정책

- `txt`, `csv`: 처리 대상이다.
- 그 외 확장자: 이번 adapter의 처리 대상이 아니므로 `skipped`로 반환하고 Document 상태를 변경하지 않는다.
- `TEXT_EXTRACTION_PENDING`이 아닌 대상 TXT/CSV 문서는 기존 `StartTextExtractionUseCase`의 상태 충돌 오류를 그대로 따른다.
- 추출 중 storage read 또는 decode 실패가 나면 `FAILED`로 전환한다.
- 추출 결과가 빈 문자열이면 `CompleteTextExtractionUseCase`의 422 검증 오류가 발생한다. 이 경우 처리 runner는 사용자 재시도 가능성을 위해 `FailTextExtractionUseCase`로 `FAILED` 전환하고 실패 사유를 저장한다.

## Storage 읽기 계약

`DocumentStorage` port에 다음 메서드를 추가한다.

```ts
read(storageKey: string): Promise<Buffer>;
```

구현 기준:

- Local storage는 기존 `readFile` 기반 구현을 port에 노출한다.
- S3 storage는 `GetObjectCommand`로 object body를 읽어 Buffer로 반환한다.
- Fake storage는 저장된 Buffer 복사본을 반환한다.
- 파일이 없으면 storage adapter의 원래 오류를 전파한다. 처리 runner가 이를 실패 사유로 변환한다.

## TXT/CSV extractor

`PlainTextDocumentTextExtractor`는 다음 계약을 가진다.

```ts
type ExtractDocumentTextInput = {
  extension: string;
  content: Buffer;
};

type ExtractDocumentTextResult = {
  content: string;
  tokenCount: number | null;
};
```

규칙:

- 지원 확장자는 `txt`, `csv`다.
- UTF-8로 decode한다.
- UTF-8 BOM은 제거한다.
- null byte가 있으면 실패한다.
- UTF-8로 decode할 수 없으면 실패한다.
- 결과 content는 앞뒤 공백 제거를 `CompleteTextExtractionUseCase`에 맡긴다.
- `tokenCount`는 tokenizer가 아직 없으므로 `null`을 반환한다.

## 오류 처리

처리 runner는 내부 오류 메시지를 그대로 사용자에게 노출하지 않는다.

- storage read 실패: `원본 파일을 읽을 수 없습니다.`
- UTF-8 decode 실패: `텍스트 파일을 UTF-8로 해석할 수 없습니다.`
- null byte 포함: `텍스트 파일에 허용되지 않는 바이트가 포함되어 있습니다.`
- 빈 추출 결과: `추출 텍스트가 비어 있습니다.`

## 테스트 전략

Storage:

- local storage `read`가 저장된 Buffer를 반환한다.
- S3 storage `read`가 `GetObjectCommand`로 object를 읽고 Buffer를 반환한다.
- fake storage `read`가 저장된 Buffer 복사본을 반환한다.

Extractor:

- TXT Buffer를 UTF-8 문자열로 추출한다.
- CSV Buffer를 원본 텍스트로 추출한다.
- UTF-8 BOM을 제거한다.
- null byte와 잘못된 UTF-8을 거부한다.
- 지원하지 않는 확장자를 거부한다.

Application:

- TXT/CSV 문서는 `TEXT_EXTRACTION_PENDING -> TEXT_EXTRACTING -> READY`로 전환되고 `DocumentText`가 저장된다.
- 지원하지 않는 확장자는 `skipped`를 반환하고 상태를 유지한다.
- 원본 파일 읽기 실패는 `FAILED`와 실패 사유를 저장한다.
- 빈 텍스트는 `FAILED`와 실패 사유를 저장한다.

## 완료 기준

- 설계 문서와 구현 계획이 `docs/specs` 아래에 있다.
- `DocumentStorage.read` 계약과 adapter 구현이 테스트로 검증된다.
- TXT/CSV extractor가 독립 테스트로 검증된다.
- 내부 처리 use case가 성공, skipped, failed 흐름을 검증한다.
- 기존 Document API e2e가 깨지지 않는다.

## 후속 범위

- PDF parser adapter
- Office parser adapter
- OCR 처리
- queue 기반 worker
- 추출 작업 재시도 스케줄러
- embedding 생성과 vector 저장
- RAG 검색
