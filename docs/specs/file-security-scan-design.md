# 업로드 파일 보안 검사 흐름 설계

## 목적

업로드 파일 보안 검사 흐름은 Document API가 악성 파일 또는 감염 의심 파일을 분석 가능 상태로 넘기지 않도록 막기 위한 보완 작업이다.

이번 범위는 실제 백신 엔진을 운영 배포에 붙이는 작업이 아니라, Document 업로드 유스케이스 안에 보안 검사 port와 실패 처리 정책을 고정하고 테스트 가능한 구조를 만드는 것이다.

## 기준 문서

- `docs/domain/document-workspace.md`
- `docs/specs/document-api-design.md`
- `docs/specs/document-api-implementation-plan.md`
- `docs/development/backend-local-run.md`

## 외부 도구 후보

운영 후보는 ClamAV의 `clamd` 기반 검사다.

ClamAV 공식 문서 기준으로 `clamd`는 libclamav를 사용하는 멀티스레드 데몬이며, Unix socket 또는 TCP socket으로 명령을 받는다. `clamdscan --stream`은 파일 경로를 데몬이 직접 열게 하지 않고 파일 내용을 데몬으로 전송할 수 있다.

주의점은 TCP socket이다. ClamAV 문서는 `clamd` TCP socket이 트래픽을 보호하거나 인증하지 않는다고 설명하므로, 외부 인터넷에 노출하지 않고 같은 host 또는 사설 네트워크 내부에서만 접근해야 한다.

1차 구현은 ClamAV adapter를 포함하지 않는다. 대신 ClamAV 또는 다른 검사 도구를 붙일 수 있는 `DocumentSecurityScanner` port를 먼저 만든다.

## 범위

포함한다.

- Document 업로드 직후 보안 검사 시점 정의
- 보안 검사 port와 no-op adapter 정의
- 테스트용 fake scanner 정의
- 감염 의심 결과의 DB 상태와 응답 정책 정의
- 검사 실패와 검사 서비스 장애의 처리 정책 정의

포함하지 않는다.

- ClamAV daemon 배포
- ClamAV adapter 구현
- ICAP 연동
- 파일 격리 저장소
- 검사 서명 업데이트 운영
- 대용량 스트림 검사

## 핵심 정책

감염 의심 파일은 원본 파일을 저장하지 않는다.

감염 의심 파일도 사용자가 업로드를 시도한 업무 이벤트이므로, 추적을 위해 Document DB 기록은 남긴다. 이때 문서 상태는 `FAILED`로 저장하고 `failureReason`에 보안 검사 실패 사유를 남긴다.

업로드 성공 응답은 기존 Document 응답 shape을 유지한다. 보안 검사 실패 시에도 업로드 기록은 생성되므로 HTTP status는 `201 Created`를 반환하고, 응답의 `status: "FAILED"`와 `failureReason`으로 실패를 표현한다.

검사 도구가 장애 상태이면 보안 판정이 없는 상태로 문서를 생성하지 않는다. 이 경우 원본 파일도 저장하지 않고 `503` 오류를 반환한다.

## 업로드 처리 순서

보안 검사는 기존 파일 정책 검증 이후, 원본 파일 저장 이전에 수행한다.

```text
1. Project 쓰기 권한과 ACTIVE 상태 확인
2. multipart file 존재 확인
3. 파일 크기, 확장자, MIME type, 텍스트성 최소 검사
4. Document ID와 storageKey 생성
5. DocumentSecurityScanner.scan 실행
6. clean이면 storage.put 실행
7. clean이면 Document를 TEXT_EXTRACTION_PENDING 상태로 저장
8. infected이면 storage.put을 실행하지 않음
9. infected이면 Document를 FAILED 상태로 저장하고 failureReason 기록
10. scanner unavailable이면 Document를 생성하지 않고 503 반환
11. Document 생성 성공 후 Project 요약값 갱신 시도
```

보안 검사 실패 문서도 Project의 문서 목록에서 확인 가능해야 한다. 사용자는 실패 사유를 보고 원본 파일을 교체해 다시 업로드한다. 보안 검사 실패 문서는 원본 파일이 없으므로 retry 대상이 아니다. retry 요청은 기존 원본 파일 부재 정책에 따라 409를 반환한다.

## Application port

`DocumentSecurityScanner` port를 `document-workspace/application`에 둔다.

```ts
export const DOCUMENT_SECURITY_SCANNER = Symbol("DOCUMENT_SECURITY_SCANNER");

export type DocumentSecurityScanInput = {
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type DocumentSecurityScanResult =
  | { status: "clean" }
  | { status: "infected"; reason: string; signature?: string };

export interface DocumentSecurityScanner {
  scan(input: DocumentSecurityScanInput): Promise<DocumentSecurityScanResult>;
}
```

검사 도구 장애는 `DocumentSecurityScanUnavailableError`로 표현한다. 감염 의심은 예외가 아니라 정상 판정 결과로 다룬다.

## Domain 변경

Document aggregate에는 실패 상태로 생성하는 factory를 추가한다.

```ts
Document.createFailed(input)
```

`createFailed`는 다음 상태를 만든다.

- `status`: `FAILED`
- `failureReason`: 정규화된 보안 검사 실패 사유
- `storageProvider`: 기존 upload와 동일하게 `local`
- `storageKey`: 생성한 논리적 key를 저장하지만 실제 파일은 존재하지 않을 수 있음

`storageProvider`와 `storageKey`는 추적용 메타데이터다. 보안 실패 문서의 파일 존재 여부는 보장하지 않는다.

## HTTP 응답 정책

보안 검사 실패 응답은 기존 Document presenter를 그대로 사용한다.

```json
{
  "id": "018f...",
  "projectId": "8d5f...",
  "originalName": "제안서.pdf",
  "extension": "pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "status": "FAILED",
  "failureReason": "파일 보안 검사 실패: Eicar-Test-Signature",
  "createdAt": "2026-07-02T03:20:00Z",
  "updatedAt": "2026-07-02T03:20:00Z"
}
```

응답에는 기존 정책과 동일하게 `storageProvider`, `storageKey`, `storagePath`, `storedName`, `ownerId`를 노출하지 않는다.

검사 서비스 장애는 `503`으로 반환한다.

```json
{
  "status": 503,
  "code": "DOCUMENT_SECURITY_SCAN_UNAVAILABLE",
  "message": "파일 보안 검사를 완료할 수 없습니다."
}
```

## 기본 adapter

개발 환경과 테스트가 외부 백신 엔진에 의존하지 않도록 기본 구현은 `NoopDocumentSecurityScanner`로 둔다.

`NoopDocumentSecurityScanner`는 항상 `{ status: "clean" }`을 반환한다. 실제 보안 차단 흐름은 unit/e2e 테스트에서 fake scanner로 검증한다.

운영용 adapter는 후속 이슈에서 ClamAV `clamd` 또는 ICAP 기반으로 구현한다.

## 테스트 전략

단위 테스트는 다음을 검증한다.

- scanner가 clean이면 기존 업로드 성공 흐름과 동일하게 `TEXT_EXTRACTION_PENDING` 문서를 만든다.
- scanner가 infected이면 storage에 파일을 저장하지 않는다.
- scanner가 infected이면 `FAILED` 문서를 저장하고 `failureReason`을 남긴다.
- scanner가 unavailable이면 Document를 생성하지 않고 storage에도 저장하지 않는다.

e2e 테스트는 다음을 검증한다.

- 감염 의심 파일 업로드 응답은 `201`이며 `status: "FAILED"`를 반환한다.
- 감염 의심 파일 응답에 storage 내부 값과 ownerId가 노출되지 않는다.
- 검사 서비스 장애는 `503` 오류 응답으로 반환된다.

integration smoke는 실제 scanner를 사용하지 않는다. 실제 PostgreSQL에서는 fake scanner를 쓰지 않고 기본 no-op scanner로 기존 업로드 흐름이 유지되는지 확인한다.

## 후속 범위

- ClamAV `clamd` adapter 구현
- ClamAV daemon docker compose 예시
- 스캔 timeout, retry, circuit breaker 정책
- 감염 의심 파일 격리 저장소
- 보안 이벤트 감사 로그
- 대용량 파일 stream scan

## 완료 기준

- 보안 검사 port와 기본 adapter 책임이 명확하다.
- 보안 검사 실패 파일은 `TEXT_EXTRACTION_PENDING`으로 저장되지 않는다.
- 보안 검사 실패 사유가 Document `failureReason`에 남는다.
- 실제 검사 도구가 없는 개발 환경에서도 테스트 가능한 구조다.
- ClamAV 운영 연동은 후속 adapter 범위로 분리되어 있다.
