# 백엔드 로컬 실행

## 환경 변수

`.env.example`을 참고해 `.env`를 만든다.

실제 DB 접속 주소와 비밀번호는 `.env`에만 저장하고 저장소에는 커밋하지 않는다. 로컬 실행 문서는 독립 개발 환경을 기준으로 `localhost:5432`를 사용한다.

```env
DATABASE_URL="postgresql://documind_backend_app:<app_password>@localhost:5432/documind?schema=documind_backend"
MIGRATION_DATABASE_URL="postgresql://documind_backend_migrator:<migrator_password>@localhost:5432/documind?schema=documind_backend"
DOCUMIND_DEMO_OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
DOCUMENT_STORAGE_BASE_PATH="./.storage/documents"
DOCUMENT_MAX_FILE_BYTES="52428800"
NODE_ENV="development"
PORT="3000"
RUN_DB_INTEGRATION="false"
```

## 최초 준비

```bash
npm install
npm run prisma:generate
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run prisma:migrate:dev -- --name create_project_workspace
```

`prisma:migrate:dev`는 schema 변경 권한이 있는 migration 계정으로 실행한다. 일반 API 서버 실행은 runtime 계정인 `DATABASE_URL`을 사용한다.

Document API를 사용하려면 `DOCUMENT_STORAGE_BASE_PATH`가 필요하다. 개발 환경에서는 상대 경로 예시를 사용할 수 있지만, 애플리케이션은 시작 시 현재 실행 위치 기준 절대 경로로 변환한다. 운영 또는 공유 서버에서는 `/var/lib/documind/documents`처럼 배포 디렉터리와 분리된 영속 볼륨 경로를 사용한다.

1차 MVP의 업로드 파일 보안 검사는 `DocumentSecurityScanner` port를 통해 실행된다. 로컬 기본 adapter는 `NoopDocumentSecurityScanner`이며 파일 내용을 저장하거나 외부 백신 엔진에 전달하지 않고 항상 clean 결과를 반환한다. 감염 의심 파일을 `FAILED` Document로 기록하고 원본 파일을 저장하지 않는 흐름은 테스트 fake scanner로 검증한다.

실제 ClamAV 또는 clamd adapter 연동은 후속 범위다. 운영 adapter를 붙일 때도 scanner가 unavailable이면 Document와 원본 파일을 만들지 않고 `DOCUMENT_SECURITY_SCAN_UNAVAILABLE` 503 오류를 반환하는 계약은 유지한다.

계정 권한 기준은 다음과 같다.

- `documind_backend_migrator`: schema 생성/변경, table/index/enum 생성 등 DDL 권한
- `documind_backend_app`: API 서버 실행에 필요한 select/insert/update 권한
- 운영 또는 공유 DB 주소는 개인 `.env`에만 기록하고 문서 예시에는 남기지 않는다.

## 실행

```bash
npm run start:dev
```

## Smoke

다른 터미널에서 실행한다.

```bash
curl -s -X POST http://localhost:3000/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"A사 제안 검토","description":"2026년 상반기","type":"PROPOSAL_REVIEW"}'

curl -s http://localhost:3000/projects

curl -s -X POST http://localhost:3000/projects/<projectId>/archive

curl -s -X POST http://localhost:3000/projects/<projectId>/restore
```

문서 업로드 smoke는 다음처럼 실행한다.

```bash
OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
PROJECT_ID="<projectId>"

curl -s -X POST "http://localhost:3000/projects/$PROJECT_ID/documents" \
  -H "X-Owner-Id: $OWNER_ID" \
  -F "file=@./sample.pdf;type=application/pdf"

curl -s "http://localhost:3000/projects/$PROJECT_ID/documents" \
  -H "X-Owner-Id: $OWNER_ID"

curl -s "http://localhost:3000/projects/$PROJECT_ID/documents/<documentId>" \
  -H "X-Owner-Id: $OWNER_ID"

curl -s -X POST "http://localhost:3000/projects/$PROJECT_ID/documents/<documentId>/retry" \
  -H "X-Owner-Id: $OWNER_ID"
```

기대 결과는 다음과 같다.

- 생성 응답의 `documentCount`, `riskCandidateCount`는 `0`
- 목록 응답은 `PageResponse` 구조
- 보관 응답의 `status`는 `ARCHIVED`
- 복원 응답의 `status`는 `ACTIVE`
- 문서 업로드 응답에는 `storageProvider`, `storageKey`, `storagePath`, `storedName`, `ownerId`가 노출되지 않는다.
- 문서 목록과 상세 응답의 `status`는 업로드 직후 `TEXT_EXTRACTION_PENDING`이다.

업로드 파일은 다음 형식의 storage key로 저장된다.

```text
projects/{projectId}/documents/{documentId}/{documentId}.{extension}
```

로컬 파일 저장 여부는 다음처럼 확인할 수 있다.

```bash
find ./.storage/documents/projects/<projectId>/documents/<documentId> -type f
```

## 검증 명령

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:integration
```

`npm run test:e2e`는 supertest가 임시 HTTP listener를 사용한다. 제한된 샌드박스 환경에서는 권한 제한으로 실패할 수 있으므로, 필요하면 일반 터미널에서 실행한다.

`npm run test:integration`은 기본값에서 실제 DB 테스트를 실행하지 않고 skip한다. 실제 PostgreSQL round-trip을 확인할 때는 migration이 적용된 DB와 실제 `.env` 설정을 준비한 뒤 다음처럼 실행한다.

```bash
RUN_DB_INTEGRATION=true npm run test:integration
```

실제 DB 통합 테스트는 `DATABASE_URL`로 접속하며, 테스트 전후로 통합 테스트 전용 ownerId `11111111-1111-4111-8111-111111111111`에 해당하는 Project 데이터만 정리한다. migration 적용은 schema 변경 권한이 있는 `MIGRATION_DATABASE_URL`로 먼저 실행한다.

Document API 통합 테스트는 별도 ownerId `22222222-2222-4222-8222-222222222222`를 사용한다. 테스트는 임시 storage directory를 만들고, 테스트 종료 후 해당 ownerId의 Document와 Project 데이터 및 임시 파일을 정리한다.

실제 DB에서 Document API round-trip까지 확인하려면 migration 적용 후 다음을 실행한다.

```bash
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run prisma:migrate:dev
RUN_DB_INTEGRATION=true npm run test:integration
```
