# 오브젝트 스토리지 어댑터 설계

## 배경

Document API 1차 구현은 `DocumentStorage` port 뒤에 로컬 파일 시스템 adapter를 둔다. 운영 배포에서는 API 서버가 여러 대가 되거나 컨테이너가 재생성될 수 있으므로 로컬 디스크만으로는 업로드 파일 보존과 공유가 어렵다.

이번 범위는 기존 `DocumentStorage` port를 유지하면서 S3 호환 오브젝트 스토리지 adapter를 선택할 수 있게 만드는 것이다.

## 목표

- `DOCUMENT_STORAGE_PROVIDER` 환경 변수로 `local` 또는 `s3`를 선택한다.
- 기존 업로드, retry, 고아 파일 정리 흐름의 `put`, `exists`, `remove` 계약을 유지한다.
- S3 호환 저장소는 AWS S3, MinIO, Cloudflare R2 같은 endpoint 기반 저장소까지 열어둔다.
- 업로드된 `Document.storageProvider`에는 실제 provider 값을 저장한다.
- storage 내부 값은 기존 정책대로 API 응답에 노출하지 않는다.

## 비목표

- 원본 파일 다운로드 API
- presigned URL 발급
- multipart upload
- bucket 생성 자동화
- S3 통합 테스트용 컨테이너 구성
- 저장소 간 파일 마이그레이션

## Provider 선택

1차 provider 값은 다음 두 개만 허용한다.

| 값 | 의미 |
| --- | --- |
| `local` | 현재 로컬 파일 시스템 adapter |
| `s3` | AWS SDK v3 기반 S3 호환 adapter |

`storageProvider` DB 필드는 이미 짧은 문자열로 존재하므로 migration은 필요하지 않다.

## 환경 변수

공통:

```env
DOCUMENT_STORAGE_PROVIDER="local"
```

S3 사용 시:

```env
DOCUMENT_STORAGE_PROVIDER="s3"
DOCUMENT_STORAGE_S3_BUCKET="documind-documents"
DOCUMENT_STORAGE_S3_REGION="ap-northeast-2"
DOCUMENT_STORAGE_S3_ENDPOINT=""
DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE="false"
```

credential은 AWS SDK 기본 credential provider chain을 사용한다. 로컬 개발에서는 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` 또는 AWS config/profile을 사용할 수 있다. 코드와 문서 예시에는 실제 access key를 남기지 않는다.

## Adapter 계약

`S3DocumentStorage`는 `DocumentStorage`를 구현한다.

- `put(storageKey, content)`
  - `PutObjectCommand`로 `Bucket`, `Key`, `Body`를 전달한다.
- `exists(storageKey)`
  - `HeadObjectCommand`를 사용한다.
  - S3가 `NotFound`, `NoSuchKey`, `$metadata.httpStatusCode === 404`를 반환하면 `false`로 본다.
  - 그 외 오류는 그대로 전파한다.
- `remove(storageKey)`
  - `DeleteObjectCommand`를 사용한다.
  - S3 delete는 멱등 동작으로 보고 존재하지 않는 key도 성공 처리한다.

## Module 선택 흐름

`DocumentWorkspaceModule`의 `DOCUMENT_STORAGE` provider factory에서 `loadEnv()` 결과를 읽는다.

- `documentStorageProvider === "local"`이면 `LocalDocumentStorage`
- `documentStorageProvider === "s3"`이면 `S3DocumentStorage`
- 그 외 값은 env parser에서 거부한다.

`UploadDocumentUseCase`는 `storageProvider` 값을 생성자 인자로 받아 Document 생성 시 저장한다. 기존에는 `"local"` 상수로 고정되어 있었다.

## 테스트 전략

- env unit test
  - 기본 provider는 `local`
  - `s3` provider는 bucket과 region을 요구
  - boolean env는 `true` 또는 `false`만 허용
- S3 adapter unit test
  - `put`이 `PutObjectCommand`를 보낸다.
  - `exists`가 200 계열 응답에서 `true`를 반환한다.
  - `exists`가 404 계열 오류에서 `false`를 반환한다.
  - `remove`가 `DeleteObjectCommand`를 보낸다.
- use case unit test
  - provider 값이 `s3`이면 Document snapshot의 `storageProvider`가 `s3`로 저장된다.
- e2e test
  - fake storage를 override하는 기존 테스트는 유지한다.
  - 응답에 `storageProvider`가 노출되지 않는 기존 계약을 유지한다.

## 운영 메모

S3 adapter를 활성화하기 전에 bucket 생성, 권한 정책, credential 주입 방식은 배포 환경에서 별도로 준비한다. 이 PR은 application adapter와 선택 구조만 제공한다.
