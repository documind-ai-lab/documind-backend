# Project API 1차 구현 설계

## 목적

Project API 1차 구현은 `docs/domain/project-workspace.md`에서 확정한 Project Workspace 도메인 규칙을 실제 NestJS 백엔드 API로 옮기는 작업이다. 이번 범위는 프로젝트 업무공간의 생성, 조회, 수정, 보관, 복원까지이며 문서 업로드, AI 채팅, RAG, 인증은 포함하지 않는다.

## 기술 선택

백엔드는 NestJS 11과 Prisma 6.19 계열을 사용한다. NestJS는 API 서버 구조화와 테스트 구성이 좋고, TypeScript 기반 클라이언트와 타입 관점을 맞추기 쉽다. Prisma는 PostgreSQL schema 기반 모델링, migration, 타입 안전한 저장소 구현에 적합하다. Prisma 7은 generator와 adapter 구성이 달라지는 변경이 있어 1차 MVP에서는 도입하지 않는다.

데이터베이스는 PostgreSQL을 사용한다. 로컬 개발 문서의 기본 연결 기준은 다음과 같다. 운영 또는 공유 DB 주소는 개인 `.env`에만 둔다.

- host: `localhost`
- port: `5432`
- database: `documind`
- schema: `documind_backend`
- runtime user: `documind_backend_app`
- migration user: `documind_backend_migrator`

실제 비밀번호는 `.env`에만 둔다. 저장소에는 `.env.example`만 커밋한다.

## 아키텍처

1차 구현은 모듈러 모놀리스 안에 `Project Workspace` 모듈을 둔다. 구조는 DDD 경계를 가볍게 반영한다.

```text
src/
  project-workspace/
    domain/
    application/
    infrastructure/
    interface/
  shared/
    application/
    interface/
    infrastructure/
prisma/
```

각 계층의 책임은 다음과 같다.

- `domain`: Project 엔티티, Project Type, Project Status, 상태 전환 규칙
- `application`: 생성, 목록 조회, 상세 조회, 수정, 보관, 복원 유스케이스
- `infrastructure`: Prisma model, Prisma repository, UUID/time provider 구현
- `interface`: NestJS controller, request DTO, response presenter
- `shared`: 공통 에러, 공통 페이징 응답, 환경 설정, Prisma client

도메인 모델은 NestJS나 Prisma에 의존하지 않는다. 유스케이스는 repository port와 time/id provider port를 통해 외부 구현에 의존한다.

## 데이터 모델

Prisma 모델은 multi-schema 설정을 사용해 `documind_backend` schema에 `Project` 테이블을 만든다. 논리 필드는 도메인 문서를 따른다.

- `id`: UUID v7 문자열 또는 PostgreSQL uuid 타입
- `ownerId`: UUID 문자열 또는 PostgreSQL uuid 타입
- `name`: 1~100자
- `description`: nullable, 최대 1000자
- `type`: enum
- `status`: enum
- `documentCount`: 기본값 0
- `riskCandidateCount`: 기본값 0
- `createdAt`: UTC 기준
- `updatedAt`: UTC 기준
- `lastActivityAt`: UTC 기준

1차 MVP에서는 User/Auth 컨텍스트가 없으므로 `ownerId`는 외부 식별자 값으로 저장하고 사용자 테이블 FK를 강제하지 않는다.

목록 조회 성능을 위해 `(status, lastActivityAt, id)` 기준 복합 인덱스를 둔다.

## API 계약

구현 API는 다음과 같다.

```http
POST /projects
GET /projects
GET /projects/:projectId
PATCH /projects/:projectId
POST /projects/:projectId/archive
POST /projects/:projectId/restore
```

`DELETE /projects/:projectId`는 만들지 않는다.

목록 조회는 `page`, `size`, `status`를 받는다. `status` 기본값은 `ACTIVE`다. `status=ALL`은 API 조회 필터이며 도메인 enum으로 저장하지 않는다. `ALL`이면 `ACTIVE`와 `ARCHIVED`를 모두 조회한다.

페이징은 offset 기반으로 시작한다.

- `page` 기본값: 1
- `size` 기본값: 20
- `size` 최대값: 50
- 범위 위반: 422 검증 오류

응답은 공통 `PageResponse<T>` 형태를 사용한다.

## 수정 의미론

`PATCH /projects/:projectId`는 JSON Merge Patch 의미론을 따른다.

- 요청 본문에 없는 필드는 기존 값을 유지한다.
- `description: null`은 설명을 비우는 요청이다.
- `name`이 제공되면 trim 후 1~100자 검증을 적용한다.
- `description`이 제공되면 trim 후 최대 1000자 검증을 적용하고, 빈 문자열이나 공백만 있으면 `null`로 정규화한다.
- `type`, `status`, `ownerId`, count, 시간 필드는 요청 본문으로 수정할 수 없다.

요청 DTO 또는 매퍼는 원본 JSON 객체의 키 존재 여부를 기준으로 필드 누락과 명시적 `null` 전달을 구분한다.

## 상태 전환

`archive`는 `ACTIVE` 상태에서만 가능하다. 성공하면 상태를 `ARCHIVED`로 바꾸고 `updatedAt`만 갱신한다.

`restore`는 `ARCHIVED` 상태에서만 가능하다. 성공하면 상태를 `ACTIVE`로 바꾸고 `updatedAt`만 갱신한다.

`lastActivityAt`은 프로젝트 생성 시 `now`로 초기화한다. 1차 MVP에서는 프로젝트 기본 정보 수정, 보관, 복원만으로 갱신하지 않는다.

## 오류 처리

공통 오류 응답은 다음 형태를 기준으로 한다.

```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "message": "요청 값이 올바르지 않습니다.",
  "errors": [
    {
      "field": "size",
      "message": "size는 1 이상 50 이하로 입력해야 합니다."
    }
  ]
}
```

주요 오류는 다음처럼 나눈다.

- 400: 잘못된 UUID 형식 등 요청 구조 오류
- 404: 프로젝트 없음
- 409: 현재 상태에서 수행할 수 없는 상태 전환
- 422: 필드 검증 실패
- 500 계열: 서버 설정 또는 내부 오류

인증은 1차 MVP 범위가 아니므로 실제 사용자 인증 실패 흐름은 구현하지 않는다. demo owner provider 또는 설정 기반 owner provider가 ownerId를 유스케이스에 전달한다.

## 환경 설정

`.env.example`에는 실제 비밀번호를 넣지 않고 변수 이름과 예시만 둔다.

```env
DATABASE_URL="postgresql://documind_backend_app:example_app_password@localhost:5432/documind?schema=documind_backend"
MIGRATION_DATABASE_URL="postgresql://documind_backend_migrator:example_migrator_password@localhost:5432/documind?schema=documind_backend"
DOCUMIND_DEMO_OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
NODE_ENV="development"
```

## 테스트 전략

테스트는 세 단계로 둔다.

1. 도메인 단위 테스트
   - Project 생성 정규화
   - archive/restore 상태 전환
   - 잘못된 상태 전환 실패

2. 유스케이스 테스트
   - 생성, 목록, 상세, 수정, 보관, 복원 성공 흐름
   - 페이지/상태 필터 규칙
   - ownerId 주입 규칙

3. API 테스트
   - 요청/응답 shape
   - 422 검증 오류
   - 404 프로젝트 없음
   - 409 상태 전환 충돌

4. PostgreSQL integration smoke
   - Prisma schema, multi-schema 설정, UUID 저장, 정렬 쿼리, count 쿼리 확인

빠른 반복을 위해 핵심 도메인과 유스케이스 테스트는 인메모리 repository로 검증한다. 실제 PostgreSQL 연동은 별도 integration smoke로 분리한다.

## 완료 기준

- NestJS 애플리케이션이 실행된다.
- Prisma schema와 migration이 작성된다.
- Project API 6개가 구현된다.
- `docs/domain/project-workspace.md`의 1차 MVP 규칙이 코드와 테스트에 반영된다.
- lint, typecheck, test가 통과한다.
- `.env`는 커밋하지 않고 `.env.example`만 커밋한다.

## 제외 범위

- 로그인/회원가입/권한 관리
- 문서 업로드와 파싱
- AI 채팅과 RAG
- 벡터 테이블과 embedding 저장
- 운영 배포 자동화
- 클라이언트 연동 화면 수정
