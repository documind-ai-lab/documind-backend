# DocuMind Backend

DocuMind Backend는 프로젝트별로 문서 분석 맥락을 관리하는 DocuMind 서비스의 NestJS API 서버다.

## 1차 구현 범위

이번 범위는 Project Workspace의 기본 API다.

- 프로젝트 생성
- 프로젝트 목록 조회
- 프로젝트 상세 조회
- 프로젝트 기본 정보 수정
- 프로젝트 보관
- 프로젝트 복원

문서 업로드, AI 채팅, RAG, 인증은 이번 범위에 포함하지 않는다.

## 기술 스택

- Node.js 20.19 이상
- NestJS 11
- TypeScript 6
- Prisma 6.19
- PostgreSQL
- Jest, Supertest

## 로컬 실행

로컬 실행과 DB migration 방법은 [백엔드 로컬 실행](docs/development/backend-local-run.md)을 따른다.

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:integration
```

## 보안 원칙

실제 DB 비밀번호와 운영 환경 변수는 `.env`에만 둔다. 저장소에는 `.env.example`과 문서용 placeholder만 커밋한다.
