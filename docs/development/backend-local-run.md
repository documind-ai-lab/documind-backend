# 백엔드 로컬 실행

## 환경 변수

`.env.example`을 참고해 `.env`를 만든다.

실제 DB 접속 주소와 비밀번호는 `.env`에만 저장하고 저장소에는 커밋하지 않는다. 로컬 실행 문서는 독립 개발 환경을 기준으로 `localhost:5432`를 사용한다.

```env
DATABASE_URL="postgresql://documind_backend_app:<app_password>@localhost:5432/documind?schema=documind_backend"
MIGRATION_DATABASE_URL="postgresql://documind_backend_migrator:<migrator_password>@localhost:5432/documind?schema=documind_backend"
DOCUMIND_DEMO_OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
DOCUMENT_STORAGE_PROVIDER="local"
DOCUMENT_STORAGE_BASE_PATH="./.storage/documents"
DOCUMENT_MAX_FILE_BYTES="52428800"
CHAT_ANSWER_GENERATOR_PROVIDER="mock"
AI_SERVICE_BASE_URL="http://localhost:8001"
AI_SERVICE_TIMEOUT_MS="30000"
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

Document API의 기본 저장소는 `DOCUMENT_STORAGE_PROVIDER="local"`이다. local provider를 사용할 때는 `DOCUMENT_STORAGE_BASE_PATH`가 필요하다. 개발 환경에서는 상대 경로 예시를 사용할 수 있지만, 애플리케이션은 시작 시 현재 실행 위치 기준 절대 경로로 변환한다. 운영 또는 공유 서버에서는 `/var/lib/documind/documents`처럼 배포 디렉터리와 분리된 영속 볼륨 경로를 사용한다.

S3 호환 오브젝트 스토리지를 사용할 때는 다음 환경 변수를 추가한다.

```env
DOCUMENT_STORAGE_PROVIDER="s3"
DOCUMENT_STORAGE_S3_BUCKET="documind-documents"
DOCUMENT_STORAGE_S3_REGION="ap-northeast-2"
DOCUMENT_STORAGE_S3_ENDPOINT=""
DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE="false"
```

AWS S3를 직접 사용할 때는 `DOCUMENT_STORAGE_S3_ENDPOINT`를 빈 값으로 둔다. MinIO, Cloudflare R2처럼 endpoint가 있는 S3 호환 저장소를 사용할 때는 해당 endpoint를 넣고, MinIO처럼 path-style 접근이 필요한 환경에서는 `DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE="true"`를 사용한다.

S3 credential은 AWS SDK 기본 credential provider chain을 사용한다. 로컬 개발에서는 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` 또는 AWS profile을 사용할 수 있지만, 실제 access key와 secret key는 `.env`나 저장소 문서에 남기지 않는다.

현재 범위의 업로드 파일 보안 검사는 `DocumentSecurityScanner` port를 통해 실행된다. 로컬 기본 adapter는 `NoopDocumentSecurityScanner`이며 파일 내용을 저장하거나 외부 백신 엔진에 전달하지 않고 항상 clean 결과를 반환한다. 감염 의심 파일을 `FAILED` Document로 기록하고 원본 파일을 저장하지 않는 흐름은 테스트 fake scanner로 검증한다.

실제 ClamAV 또는 clamd adapter 연동은 후속 범위다. 운영 adapter를 붙일 때도 scanner가 unavailable이면 Document와 원본 파일을 만들지 않고 `DOCUMENT_SECURITY_SCAN_UNAVAILABLE` 503 오류를 반환하는 계약은 유지한다.

## AI 답변 생성 모드

백엔드 Chat API는 `CHAT_ANSWER_GENERATOR_PROVIDER` 값으로 답변 생성 방식을 선택한다.

기본값은 `mock`이다. 이 모드는 `documind-ai`나 Ollama를 실행하지 않아도 백엔드 채팅 API를 테스트할 수 있다.

```env
CHAT_ANSWER_GENERATOR_PROVIDER="mock"
```

`documind-ai`를 실제로 호출하려면 백엔드 `.env`를 다음처럼 설정한다.

```env
CHAT_ANSWER_GENERATOR_PROVIDER="ai-service"
AI_SERVICE_BASE_URL="http://localhost:8001"
AI_SERVICE_TIMEOUT_MS="30000"
```

이때 백엔드 실행 전에 `documind-ai` 서버가 `http://localhost:8001`에서 실행 중이어야 한다.

## Ollama 기반 로컬 AI 실행

Ollama 기반으로 실제 로컬 LLM 응답을 확인할 때는 프로세스를 다음 순서로 실행한다.

1. Ollama 서버 실행

```bash
ollama serve
```

이미 Ollama 앱이나 백그라운드 서비스가 실행 중이면 이 단계는 생략할 수 있다.

2. 사용할 모델 준비

```bash
ollama pull llama3.2
```

다른 모델을 사용할 때는 `documind-ai`의 `DOCUMIND_AI_OLLAMA_MODEL` 값도 같은 모델명으로 맞춘다.

3. `documind-ai` 실행

```bash
cd /Users/rowing/Develop/organization/documind-ai-lab/documind-ai

export DOCUMIND_AI_CHAT_PROVIDER="ollama"
export DOCUMIND_AI_OLLAMA_BASE_URL="http://localhost:11434"
export DOCUMIND_AI_OLLAMA_MODEL="llama3.2"
export DOCUMIND_AI_OLLAMA_TIMEOUT_SECONDS="60"

PYTHONPATH=src python3 -m documind_ai.main
```

4. `documind-backend` 실행

```bash
cd /Users/rowing/Develop/organization/documind-ai-lab/documind-backend

export CHAT_ANSWER_GENERATOR_PROVIDER="ai-service"
export AI_SERVICE_BASE_URL="http://localhost:8001"
export AI_SERVICE_TIMEOUT_MS="30000"

npm run start:dev
```

5. `documind-ai` 직접 smoke

```bash
curl -s -X POST http://localhost:8001/chat/answers \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-1",
    "ownerId": "owner-1",
    "question": "견적서의 주요 리스크를 알려줘",
    "contexts": [
      {
        "documentId": "document-1",
        "title": "견적서.txt",
        "content": "총액은 1000만원이며 납기는 별도 협의입니다."
      }
    ],
    "history": []
  }'
```

6. 백엔드 Chat API smoke

```bash
OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
PROJECT_ID="<projectId>"

curl -s -X POST "http://localhost:3000/projects/$PROJECT_ID/chat/messages" \
  -H "Content-Type: application/json" \
  -H "X-Owner-Id: $OWNER_ID" \
  -d '{"content":"업로드된 문서 기준으로 주요 리스크를 알려줘"}'
```

기대 결과는 다음과 같다.

- `documind-ai` 직접 smoke 응답에는 `content`와 `sources`가 있다.
- 백엔드 Chat API 응답에는 `userMessage`와 `assistantMessage`가 있다.
- Ollama 연결 실패, timeout, 잘못된 응답은 백엔드에서 `CHAT_ANSWER_GENERATION_FAILED` 흐름으로 처리된다.

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
