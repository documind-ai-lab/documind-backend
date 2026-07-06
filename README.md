# DocuMind Backend

DocuMind Backend는 프로젝트별로 문서 분석 맥락을 관리하는 DocuMind 서비스의 NestJS API 서버다.

## 구현 범위

현재 백엔드는 프로젝트, 문서, 채팅 워크스페이스의 1차 API를 포함한다.

- 프로젝트 생성
- 프로젝트 목록 조회
- 프로젝트 상세 조회
- 프로젝트 기본 정보 수정
- 프로젝트 보관
- 프로젝트 복원
- 문서 업로드
- 문서 텍스트 추출
- 문서 목록/상세/상태 조회
- 프로젝트별 채팅 메시지 생성/조회
- AI service adapter 기반 채팅 답변 생성

인증, RAG 검색 고도화, streaming 응답은 별도 범위로 다룬다.

## 기술 스택

- Node.js 20.19 이상
- NestJS 11
- TypeScript 6
- Prisma 6.19
- PostgreSQL
- Jest, Supertest

## 로컬 실행

로컬 실행과 DB migration 방법은 [백엔드 로컬 실행](docs/development/backend-local-run.md)을 따른다.

AI 답변 생성은 기본값으로 mock generator를 사용한다.

```bash
CHAT_ANSWER_GENERATOR_PROVIDER=mock
```

로컬 AI service를 연결하려면 `documind-ai` 서버를 먼저 실행한 뒤 다음 환경변수를 사용한다.

```bash
CHAT_ANSWER_GENERATOR_PROVIDER=ai-service
AI_SERVICE_BASE_URL=http://localhost:8001
AI_SERVICE_TIMEOUT_MS=30000
```

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:integration
```

## 보안 원칙

실제 DB 비밀번호와 운영 환경 변수는 `.env`에만 둔다. 저장소에는 `.env.example`과 문서용 예시 값만 커밋한다.
