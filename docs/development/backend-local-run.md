# 백엔드 로컬 실행

## 환경 변수

`.env.example`을 참고해 `.env`를 만든다.

실제 DB 접속 주소와 비밀번호는 `.env`에만 저장하고 저장소에는 커밋하지 않는다. 로컬 실행 문서는 독립 개발 환경을 기준으로 `localhost:5432`를 사용한다.

```env
DATABASE_URL="postgresql://documind_backend_app:<app_password>@localhost:5432/documind?schema=documind_backend"
MIGRATION_DATABASE_URL="postgresql://documind_backend_migrator:<migrator_password>@localhost:5432/documind?schema=documind_backend"
DOCUMIND_DEMO_OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
NODE_ENV="development"
PORT="3000"
```

## 최초 준비

```bash
npm install
npm run prisma:generate
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run prisma:migrate:dev -- --name create_project_workspace
```

`prisma:migrate:dev`는 schema 변경 권한이 있는 migration 계정으로 실행한다. 일반 API 서버 실행은 runtime 계정인 `DATABASE_URL`을 사용한다.

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

기대 결과는 다음과 같다.

- 생성 응답의 `documentCount`, `riskCandidateCount`는 `0`
- 목록 응답은 `PageResponse` 구조
- 보관 응답의 `status`는 `ARCHIVED`
- 복원 응답의 `status`는 `ACTIVE`

## 검증 명령

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:integration
```

`npm run test:e2e`는 supertest가 임시 HTTP listener를 사용한다. 제한된 샌드박스 환경에서는 권한 제한으로 실패할 수 있으므로, 필요하면 일반 터미널에서 실행한다.

`npm run test:integration`의 실제 PostgreSQL smoke는 `RUN_DB_INTEGRATION=true`와 실제 `.env` 설정이 준비된 뒤 확장한다.
