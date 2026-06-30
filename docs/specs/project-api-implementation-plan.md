# Project API 1차 구현 Implementation Plan

> 이 문서는 Project API 1차 구현을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.

**Goal:** NestJS와 Prisma 기반으로 Project Workspace의 프로젝트 생성, 목록, 상세, 수정, 보관, 복원 API를 구현한다.

**Architecture:** 모듈러 모놀리스 안에 `project-workspace` 모듈을 두고, 도메인 모델은 NestJS와 Prisma에 의존하지 않는다. Controller는 HTTP 요청/응답과 검증을 담당하고, Use Case는 Repository port, Clock, IdGenerator, OwnerProvider에만 의존한다. Prisma는 PostgreSQL adapter로만 사용한다.

**Tech Stack:** Node.js 20.11 이상, TypeScript 6, NestJS 11, Prisma 6.19, PostgreSQL, Jest 29, Supertest

---

## 기준 문서

- `docs/domain/project-workspace.md`
- `docs/specs/project-api-design.md`

## 구현 API

```http
POST /projects
GET /projects
GET /projects/:projectId
PATCH /projects/:projectId
POST /projects/:projectId/archive
POST /projects/:projectId/restore
```

`DELETE /projects/:projectId`는 만들지 않는다. 프로젝트는 삭제가 아니라 보관과 복원으로 관리한다.

## 파일 구조

```text
.env.example
.gitignore
README.md
package.json
package-lock.json
tsconfig.json
tsconfig.build.json
nest-cli.json
eslint.config.mjs
jest.config.ts
prisma/schema.prisma
src/main.ts
src/app.module.ts
src/shared/application/clock.ts
src/shared/application/id-generator.ts
src/shared/application/owner-provider.ts
src/shared/application/page-response.ts
src/shared/domain/domain-error.ts
src/shared/interface/http-exception.filter.ts
src/shared/infrastructure/env.ts
src/shared/infrastructure/prisma/prisma.module.ts
src/shared/infrastructure/prisma/prisma.service.ts
src/project-workspace/project-workspace.module.ts
src/project-workspace/domain/project-type.ts
src/project-workspace/domain/project-status.ts
src/project-workspace/domain/project.errors.ts
src/project-workspace/domain/project.ts
src/project-workspace/application/project.repository.ts
src/project-workspace/application/project.use-cases.ts
src/project-workspace/infrastructure/prisma-project.repository.ts
src/project-workspace/interface/project.dto.ts
src/project-workspace/interface/project.presenter.ts
src/project-workspace/interface/project.controller.ts
src/project-workspace/testing/in-memory-project.repository.ts
test/project-domain.spec.ts
test/project-use-cases.spec.ts
test/project-api.e2e-spec.ts
test/project-api.integration-spec.ts
docs/development/backend-local-run.md
```

## Task 1: NestJS 기본 골격 구성

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `nest-cli.json`
- Create: `eslint.config.mjs`
- Create: `jest.config.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/main.ts`
- Create: `src/app.module.ts`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "documind-backend",
  "version": "0.1.0",
  "private": true,
  "description": "DocuMind backend API",
  "license": "UNLICENSED",
  "engines": {
    "node": ">=20.11.0",
    "npm": ">=10.0.0"
  },
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "jest --runInBand",
    "test:e2e": "jest --config jest.config.ts --runInBand test/project-api.e2e-spec.ts",
    "test:integration": "jest --config jest.config.ts --runInBand test/project-api.integration-spec.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev --schema prisma/schema.prisma"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.27",
    "@nestjs/core": "^11.1.27",
    "@nestjs/platform-express": "^11.1.27",
    "@prisma/client": "^6.19.3",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "uuid": "^14.0.1"
  },
  "devDependencies": {
    "@eslint/js": "^10.6.0",
    "@nestjs/cli": "^11.0.23",
    "@nestjs/testing": "^11.1.27",
    "@types/express": "^5.0.6",
    "@types/jest": "^29.5.14",
    "@types/node": "^26.0.1",
    "@types/supertest": "^6.0.3",
    "@types/uuid": "^11.0.0",
    "eslint": "^10.6.0",
    "globals": "^17.7.0",
    "jest": "^29.7.0",
    "prisma": "^6.19.3",
    "supertest": "^7.2.2",
    "ts-jest": "^29.4.11",
    "ts-loader": "^9.6.2",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.62.1"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`

Expected: `package-lock.json` 생성, install exit code 0.

- [ ] **Step 3: TypeScript와 Jest 설정 작성**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

`nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

`jest.config.ts`:

```ts
import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.e2e-spec\\.ts$", "\\.integration-spec\\.ts$"],
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node"
};

export default config;
```

- [ ] **Step 4: ESLint 설정 작성**

`eslint.config.mjs`:

Node.js 20.11 이상을 package `engines`로 고정하므로 `import.meta.dirname`을 사용할 수 있다. Node.js 하위 버전을 지원해야 하면 `fileURLToPath(import.meta.url)` 기반으로 교체한다.

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
);
```

- [ ] **Step 5: env와 gitignore 작성**

`.env.example`:

```env
DATABASE_URL="postgresql://documind_backend_app:example_app_password@localhost:5432/documind?schema=documind_backend"
MIGRATION_DATABASE_URL="postgresql://documind_backend_migrator:example_migrator_password@localhost:5432/documind?schema=documind_backend"
DOCUMIND_DEMO_OWNER_ID="7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e"
NODE_ENV="development"
PORT="3000"
```

`.gitignore`에 다음 항목을 포함한다.

```gitignore
node_modules
dist
coverage
.env
.env.*
!.env.example
.DS_Store
```

- [ ] **Step 6: 최소 앱 작성**

`src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";

@Module({})
export class AppModule {}
```

`src/main.ts`:

```ts
import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
    })
  );
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
```

- [ ] **Step 7: 검증과 커밋**

Run:

```bash
npm run typecheck
npm run lint
```

Commit:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json eslint.config.mjs jest.config.ts .env.example .gitignore src/main.ts src/app.module.ts
git commit -m "chore: NestJS 백엔드 기본 골격 구성" -m "Project API 구현을 시작하기 위해 NestJS, TypeScript, Jest, ESLint 실행 기반을 먼저 고정합니다.

Constraint: Project API 1차 구현은 NestJS와 Prisma 기반으로 진행한다.
Confidence: high
Scope-risk: narrow
Directive: 실제 DB 비밀번호는 저장소에 커밋하지 않는다.
Tested: npm run typecheck
Tested: npm run lint
Not-tested: 도메인 테스트는 아직 작성 전이라 실행하지 않음"
```

## Task 2: Prisma schema와 DB 연결 구성

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/shared/infrastructure/env.ts`
- Create: `src/shared/infrastructure/prisma/prisma.module.ts`
- Create: `src/shared/infrastructure/prisma/prisma.service.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Prisma schema 작성**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["documind_backend"]
}

enum ProjectType {
  ESTIMATE_REVIEW
  PROPOSAL_REVIEW
  CONTRACT_REVIEW
  MEETING_SUMMARY
  GENERAL_ANALYSIS

  @@schema("documind_backend")
}

enum ProjectStatus {
  ACTIVE
  ARCHIVED

  @@schema("documind_backend")
}

model Project {
  id                 String        @id @db.Uuid
  ownerId            String        @map("owner_id") @db.Uuid
  name               String        @db.VarChar(100)
  description        String?       @db.VarChar(1000)
  type               ProjectType
  status             ProjectStatus @default(ACTIVE)
  documentCount      Int           @default(0) @map("document_count")
  riskCandidateCount Int           @default(0) @map("risk_candidate_count")
  createdAt          DateTime      @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime      @map("updated_at") @db.Timestamptz(6)
  lastActivityAt     DateTime      @map("last_activity_at") @db.Timestamptz(6)

  @@index([status, lastActivityAt, id], map: "idx_projects_status_last_activity_id")
  @@map("projects")
  @@schema("documind_backend")
}
```

- [ ] **Step 2: 환경 변수와 PrismaService 작성**

`src/shared/infrastructure/env.ts`:

```ts
export type AppEnv = { databaseUrl: string; demoOwnerId: string; nodeEnv: string; port: number };

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const demoOwnerId = requireEnv(env, "DOCUMIND_DEMO_OWNER_ID");
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT는 1 이상 65535 이하의 정수여야 합니다.");
  }
  return { databaseUrl, demoOwnerId, nodeEnv: env.NODE_ENV ?? "development", port };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} 환경 변수가 필요합니다.`);
  }
  return value;
}
```

`src/shared/infrastructure/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`src/shared/infrastructure/prisma/prisma.module.ts`:

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 3: AppModule 연결**

```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module";

@Module({ imports: [PrismaModule] })
export class AppModule {}
```

- [ ] **Step 4: Prisma 검증과 migration**

Run:

```bash
npm run prisma:generate
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run prisma:migrate:dev -- --name create_project_workspace
npm run typecheck
```

Expected: Prisma Client 생성, migration SQL 생성, typecheck exit code 0.

- [ ] **Step 5: 커밋**

```bash
git add prisma src/shared/infrastructure src/app.module.ts
git commit -m "chore: Project 저장소 스키마와 Prisma 연결 구성" -m "Project API가 PostgreSQL의 documind_backend schema를 사용할 수 있도록 Prisma schema와 연결 기반을 구성합니다.

Constraint: 실제 접속 정보는 .env에만 보관한다.
Rejected: User 테이블 FK 추가 | 인증 컨텍스트가 아직 없고 ownerId는 외부 식별자 값으로 보관하기로 결정됨
Confidence: high
Scope-risk: moderate
Directive: Project 외 Aggregate가 추가될 때도 Project ownerId를 인증 테이블과 즉시 결합하지 않는다.
Tested: npm run prisma:generate
Tested: npm run typecheck
Not-tested: 원격 DB migration은 로컬 .env 설정 후 실행 필요"
```

## Task 3: 공통 port, 오류, 페이징 구현

**Files:**
- Create: `src/shared/application/clock.ts`
- Create: `src/shared/application/id-generator.ts`
- Create: `src/shared/application/owner-provider.ts`
- Create: `src/shared/application/page-response.ts`
- Create: `src/shared/domain/domain-error.ts`
- Create: `src/shared/interface/http-exception.filter.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Clock, IdGenerator, OwnerProvider 작성**

```ts
// src/shared/application/clock.ts
export const CLOCK = Symbol("CLOCK");
export interface Clock { now(): Date }
export class SystemClock implements Clock { now(): Date { return new Date(); } }
```

```ts
// src/shared/application/id-generator.ts
import { v7 as uuidv7 } from "uuid";
export const ID_GENERATOR = Symbol("ID_GENERATOR");
export interface IdGenerator { nextId(): string }
export class UuidV7Generator implements IdGenerator { nextId(): string { return uuidv7(); } }
```

```ts
// src/shared/application/owner-provider.ts
export const OWNER_PROVIDER = Symbol("OWNER_PROVIDER");
export interface OwnerProvider { currentOwnerId(): string }
export class DemoOwnerProvider implements OwnerProvider {
  constructor(private readonly ownerId: string) {}
  currentOwnerId(): string { return this.ownerId; }
}
```

- [ ] **Step 2: PageResponse 작성**

```ts
export type PageResponse<T> = { items: T[]; page: number; size: number; total: number; hasNext: boolean };

export function createPageResponse<T>(params: { items: T[]; page: number; size: number; total: number }): PageResponse<T> {
  return { ...params, hasNext: params.page * params.size < params.total };
}
```

- [ ] **Step 3: DomainError와 HTTP filter 작성**

```ts
// src/shared/domain/domain-error.ts
export type DomainErrorCode = "PROJECT_NOT_FOUND" | "PROJECT_STATE_CONFLICT" | "VALIDATION_ERROR";

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string, readonly status: number) {
    super(message);
  }
}
```

`src/shared/interface/http-exception.filter.ts`는 `DomainError`, `HttpException`, 알 수 없는 오류를 공통 오류 응답으로 변환한다. `422`는 `code: "VALIDATION_ERROR"`, `message: "요청 값이 올바르지 않습니다."`, `errors: [{ field, message }]` 형태를 반환한다.

- [ ] **Step 4: main.ts에 filter 등록**

`main.ts`에서 `loadEnv()`로 port를 읽고 `HttpExceptionFilter`를 전역 등록한다.

- [ ] **Step 5: 검증과 커밋**

Run:

```bash
npm run typecheck
npm run lint
```

Commit:

```bash
git add src/shared src/main.ts
git commit -m "feat: 공통 오류와 provider 기반 구성" -m "Project use case가 시간, ID, ownerId, 오류 응답을 일관된 경계로 사용할 수 있도록 공통 기반을 추가합니다.

Constraint: 1차 MVP는 인증 없이 demo owner provider를 사용한다.
Rejected: ownerId를 도메인 엔티티에 하드코딩 | 운영 전환 시 제거가 어려워짐
Confidence: high
Scope-risk: narrow
Directive: 인증 컨텍스트 도입 전까지 owner provider 교체만으로 Project use case를 유지한다.
Tested: npm run typecheck
Tested: npm run lint
Not-tested: HTTP 오류 shape는 controller 구현 후 e2e에서 검증"
```

## Task 4: Project 도메인 모델 TDD 구현

**Files:**
- Create: `test/project-domain.spec.ts`
- Create: `src/project-workspace/domain/project-type.ts`
- Create: `src/project-workspace/domain/project-status.ts`
- Create: `src/project-workspace/domain/project.errors.ts`
- Create: `src/project-workspace/domain/project.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/project-domain.spec.ts`는 다음 동작을 검증한다.

```ts
expect(Project.create({ name: "  A사 제안 검토  ", description: "   ", type: ProjectType.PROPOSAL_REVIEW, id, ownerId, now }).snapshot()).toMatchObject({
  name: "A사 제안 검토",
  description: null,
  status: ProjectStatus.ACTIVE,
  documentCount: 0,
  riskCandidateCount: 0,
  createdAt: now,
  updatedAt: now,
  lastActivityAt: now
});
```

또한 `archive`, `restore`, 잘못된 상태 전환, `update({ description: null })`, `lastActivityAt` 유지 테스트를 포함한다.

Run: `npm test -- test/project-domain.spec.ts`

Expected: domain 파일이 없어서 FAIL.

- [ ] **Step 2: enum과 오류 작성**

```ts
// project-type.ts
export enum ProjectType {
  ESTIMATE_REVIEW = "ESTIMATE_REVIEW",
  PROPOSAL_REVIEW = "PROPOSAL_REVIEW",
  CONTRACT_REVIEW = "CONTRACT_REVIEW",
  MEETING_SUMMARY = "MEETING_SUMMARY",
  GENERAL_ANALYSIS = "GENERAL_ANALYSIS"
}
```

```ts
// project-status.ts
export enum ProjectStatus { ACTIVE = "ACTIVE", ARCHIVED = "ARCHIVED" }
```

```ts
// project.errors.ts
import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../shared/domain/domain-error";

export class ProjectNotFoundError extends DomainError {
  constructor(projectId: string) { super("PROJECT_NOT_FOUND", `프로젝트를 찾을 수 없습니다: ${projectId}`, HttpStatus.NOT_FOUND); }
}

export class ProjectStateConflictError extends DomainError {
  constructor(message: string) { super("PROJECT_STATE_CONFLICT", message, HttpStatus.CONFLICT); }
}
```

- [ ] **Step 3: Project aggregate 작성**

`Project`는 `create`, `rehydrate`, `update`, `archive`, `restore`, `snapshot`을 제공한다. `create`는 `name` trim, `description` null 정규화, count 0, status ACTIVE, 세 시간 값을 `now`로 초기화한다. `archive`와 `restore`는 `updatedAt`만 변경하고 `lastActivityAt`은 변경하지 않는다.

- [ ] **Step 4: 검증과 커밋**

Run:

```bash
npm test -- test/project-domain.spec.ts
```

Expected: `PASS test/project-domain.spec.ts`.

Commit:

```bash
git add src/project-workspace/domain test/project-domain.spec.ts
git commit -m "feat: Project 도메인 모델 구현" -m "Project Workspace의 핵심 상태와 상태 전환 규칙을 NestJS 외부 의존성 없이 도메인 모델로 고정합니다.

Constraint: 프로젝트는 삭제하지 않고 보관과 복원으로 관리한다.
Rejected: 상태 변경을 일반 PATCH로 처리 | 도메인 액션 의미가 흐려지고 충돌 처리가 어려워짐
Confidence: high
Scope-risk: narrow
Directive: 문서, 대화, 리스크 후보는 Project 하위 데이터지만 별도 Aggregate 후보로 유지한다.
Tested: npm test -- test/project-domain.spec.ts
Not-tested: Prisma 저장소 연동은 다음 Task에서 검증"
```

## Task 5: Repository port와 use case 구현

**Files:**
- Create: `src/project-workspace/application/project.repository.ts`
- Create: `src/project-workspace/application/project.use-cases.ts`
- Create: `src/project-workspace/testing/in-memory-project.repository.ts`
- Create: `test/project-use-cases.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/project-use-cases.spec.ts`는 `CreateProjectUseCase`, `ListProjectsUseCase`, `GetProjectUseCase`, `UpdateProjectUseCase`, `ArchiveProjectUseCase`, `RestoreProjectUseCase`를 인메모리 저장소로 검증한다. 목록 테스트는 기본 `ACTIVE`, `status=ALL`, `lastActivityAt DESC, id DESC`, `page/size/hasNext`를 포함한다.

Run: `npm test -- test/project-use-cases.spec.ts`

Expected: application 파일이 없어서 FAIL.

- [ ] **Step 2: Repository port 작성**

```ts
export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
export type ProjectListStatusFilter = ProjectStatus | "ALL";
export type ProjectListQuery = { page: number; size: number; status: ProjectListStatusFilter };
export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(projectId: string): Promise<Project | null>;
  list(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>>;
}
```

- [ ] **Step 3: Use Case 작성**

각 use case는 다음 책임만 가진다.

```text
CreateProjectUseCase: id, ownerId, now를 주입받아 Project.create 후 save
ListProjectsUseCase: repository.list 위임
GetProjectUseCase: findById 없으면 ProjectNotFoundError
UpdateProjectUseCase: Project.update 후 save
ArchiveProjectUseCase: Project.archive 후 save
RestoreProjectUseCase: Project.restore 후 save
```

- [ ] **Step 4: InMemoryProjectRepository 작성**

인메모리 저장소는 `Map<string, ProjectSnapshot>`을 사용한다. `save`는 snapshot 저장, `findById`는 `Project.rehydrate`, `list`는 status 필터, `lastActivityAt DESC`, `id DESC`, offset paging을 적용한다.

- [ ] **Step 5: 검증과 커밋**

Run:

```bash
npm test -- test/project-use-cases.spec.ts
```

Expected: `PASS test/project-use-cases.spec.ts`.

Commit:

```bash
git add src/project-workspace/application src/project-workspace/testing test/project-use-cases.spec.ts
git commit -m "feat: Project 유스케이스 구현" -m "Project API 동작을 controller 밖의 application 계층에서 검증 가능하도록 생성, 조회, 수정, 보관, 복원 유스케이스를 구현합니다.

Constraint: 핵심 규칙은 빠른 반복을 위해 인메모리 저장소 테스트로 먼저 검증한다.
Rejected: controller에서 Prisma를 직접 호출 | 도메인 규칙과 HTTP 처리가 결합됨
Confidence: high
Scope-risk: moderate
Directive: API가 늘어나도 유스케이스는 repository port를 통해 저장소와 통신한다.
Tested: npm test -- test/project-use-cases.spec.ts
Not-tested: 실제 PostgreSQL 정렬과 필터는 Prisma adapter에서 검증"
```

## Task 6: Prisma repository adapter 구현

**Files:**
- Create: `src/project-workspace/infrastructure/prisma-project.repository.ts`

- [ ] **Step 1: PrismaProjectRepository 작성**

`PrismaProjectRepository`는 `ProjectRepository`를 구현한다.

```ts
@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(project: Project): Promise<void> {
    const snapshot = project.snapshot();
    await this.prisma.project.upsert({
      where: { id: snapshot.id },
      create: toPrismaCreate(snapshot),
      update: toPrismaUpdate(snapshot)
    });
  }

  async findById(projectId: string): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { id: projectId } });
    return record ? Project.rehydrate(fromPrisma(record)) : null;
  }

  async list(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>> {
    const where = query.status === "ALL" ? {} : { status: query.status };
    const [records, total] = await Promise.all([
      this.prisma.project.findMany({ where, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.size, take: query.size }),
      this.prisma.project.count({ where })
    ]);
    return createPageResponse({ items: records.map(fromPrisma), page: query.page, size: query.size, total });
  }
}
```

- [ ] **Step 2: 검증과 커밋**

Run:

```bash
npm run typecheck
npm test -- test/project-domain.spec.ts test/project-use-cases.spec.ts
```

Commit:

```bash
git add src/project-workspace/infrastructure/prisma-project.repository.ts
git commit -m "feat: Project Prisma 저장소 구현" -m "Application 계층의 repository port를 PostgreSQL Prisma adapter로 연결할 수 있게 구현합니다.

Constraint: Prisma는 infrastructure 계층에만 둔다.
Rejected: Prisma model을 도메인 모델로 직접 사용 | 도메인 규칙이 ORM 구조에 종속됨
Confidence: high
Scope-risk: moderate
Directive: 후속 aggregate도 Prisma adapter와 domain model 변환 경계를 분리한다.
Tested: npm run typecheck
Tested: npm test -- test/project-domain.spec.ts test/project-use-cases.spec.ts
Not-tested: 원격 PostgreSQL 실제 쿼리는 API smoke에서 확인"
```

## Task 7: Project HTTP interface 구현

**Files:**
- Create: `src/project-workspace/interface/project.dto.ts`
- Create: `src/project-workspace/interface/project.presenter.ts`
- Create: `src/project-workspace/interface/project.controller.ts`
- Create: `src/project-workspace/project-workspace.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: DTO 작성**

DTO는 `class-validator`와 `class-transformer`를 사용한다.

```text
CreateProjectDto: name 1~100, description optional max 1000, type ProjectType enum
ListProjectsQueryDto: page 기본 1 min 1, size 기본 20 min 1 max 50, status ACTIVE/ARCHIVED/ALL 기본 ACTIVE
ProjectIdParamDto: projectId UUID
UpdateProjectDto: name optional 1~100, description optional max 1000
```

PATCH 요청은 JSON Merge Patch 의미론을 지켜야 하므로 controller에서 원본 body의 key 존재 여부를 확인한다. `description`이 누락되면 기존 값을 유지하고, `description: null`이 명시되면 설명을 비운다.

```ts
function toProjectUpdateInput(body: UpdateProjectDto, rawBody: Record<string, unknown>) {
  const input: { name?: string; description?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(rawBody, "name")) {
    input.name = body.name;
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, "description")) {
    input.description = body.description ?? null;
  }
  return input;
}
```

- [ ] **Step 2: Presenter 작성**

Presenter는 날짜를 `toISOString()`으로 변환한다. 목록은 `createdAt`, `updatedAt`을 포함하지 않고 상세는 포함한다.

- [ ] **Step 3: Controller 작성**

```ts
@Controller("projects")
export class ProjectController {
  @Post() create(@Body() body: CreateProjectDto) {}
  @Get() list(@Query() query: ListProjectsQueryDto) {}
  @Get(":projectId") get(@Param() params: ProjectIdParamDto) {}
  @Patch(":projectId") update(@Param() params: ProjectIdParamDto, @Body() body: UpdateProjectDto) {}
  @Post(":projectId/archive") archive(@Param() params: ProjectIdParamDto) {}
  @Post(":projectId/restore") restore(@Param() params: ProjectIdParamDto) {}
}
```

각 method는 use case 실행 후 presenter를 통해 반환한다.

- [ ] **Step 4: Module provider 구성**

`ProjectWorkspaceModule`은 `CLOCK`, `ID_GENERATOR`, `OWNER_PROVIDER`, `PROJECT_REPOSITORY`, 6개 use case, `ProjectController`를 등록한다. `OWNER_PROVIDER`는 `loadEnv().demoOwnerId`를 사용한 `DemoOwnerProvider`로 시작한다.

- [ ] **Step 5: AppModule 연결, 검증, 커밋**

Run:

```bash
npm run typecheck
npm run lint
```

Commit:

```bash
git add src/project-workspace/interface src/project-workspace/project-workspace.module.ts src/app.module.ts
git commit -m "feat: Project HTTP API 구현" -m "Project use case를 NestJS controller로 노출해 생성, 조회, 수정, 보관, 복원 API 계약을 제공한다.

Constraint: status=ALL은 API 조회 필터일 뿐 도메인 상태로 저장하지 않는다.
Rejected: DELETE endpoint 추가 | 제품 정책상 프로젝트는 삭제가 아니라 보관으로 관리함
Confidence: high
Scope-risk: moderate
Directive: controller는 요청 검증과 presenter만 담당하고 도메인 규칙은 use case 아래에 둔다.
Tested: npm run typecheck
Tested: npm run lint
Not-tested: HTTP e2e는 다음 Task에서 검증"
```

## Task 8: API e2e 테스트 구현

**Files:**
- Create: `test/project-api.e2e-spec.ts`
- Create: `test/project-api.integration-spec.ts`
- Modify: `src/project-workspace/project-workspace.module.ts` if provider override support is needed
- Modify: `src/shared/interface/http-exception.filter.ts` if validation field mapping fails

- [ ] **Step 1: e2e 테스트 작성**

테스트는 다음을 포함한다.

```text
POST /projects: 201 또는 200 응답, name trim, description trim, count 0
GET /projects: PageResponse shape
GET /projects?size=99: 422 VALIDATION_ERROR
GET /projects/not-a-uuid: 400 BAD_REQUEST
GET /projects/:projectId 없는 ID: 404 PROJECT_NOT_FOUND
PATCH /projects/:projectId description null: description null
POST /projects/:projectId/archive: ARCHIVED
POST /projects/:projectId/archive 다시 호출: 409 PROJECT_STATE_CONFLICT
POST /projects/:projectId/restore: ACTIVE
```

`test/project-api.e2e-spec.ts`는 HTTP 계약과 오류 응답을 빠르게 검증하기 위해 `PROJECT_REPOSITORY`를 `InMemoryProjectRepository`로 override한다. 실제 PostgreSQL 연동은 `test/project-api.integration-spec.ts`에서 별도로 검증해 Prisma query, schema, UUID 저장, DB 제약 조건을 확인한다.

- [ ] **Step 2: e2e 검증**

Run:

```bash
npm run test:e2e
npm run test:integration
npm run typecheck
npm run lint
npm test
```

Expected: 모든 command exit code 0.

- [ ] **Step 3: 커밋**

```bash
git add test/project-api.e2e-spec.ts src/project-workspace/project-workspace.module.ts src/shared/interface/http-exception.filter.ts
git commit -m "test: Project API 동작 검증" -m "Project API의 성공 흐름과 오류 응답 shape을 e2e 테스트로 고정합니다.

Constraint: API 오류 응답은 업무용 클라이언트가 필드별 메시지를 표시할 수 있어야 한다.
Rejected: NestJS 기본 오류 body 그대로 노출 | 클라이언트 처리와 문서화가 불안정해짐
Confidence: medium
Scope-risk: narrow
Directive: 새 API도 동일한 공통 오류 응답 shape을 사용한다.
Tested: npm run test:e2e
Tested: npm run test:integration
Tested: npm run typecheck
Tested: npm run lint
Tested: npm test
Not-tested: 운영 배포 환경 smoke는 다음 Task에서 검증"
```

## Task 9: 실행 문서와 원격 DB smoke

**Files:**
- Create: `docs/development/backend-local-run.md`
- Create or Modify: `README.md`

- [ ] **Step 1: 실행 문서 작성**

`docs/development/backend-local-run.md`에는 다음을 포함한다.

```md
# 백엔드 로컬 실행

## 환경 변수

`.env.example`을 참고해 `.env`를 만든다. 실제 비밀번호는 저장소에 커밋하지 않는다.

## 최초 준비

```bash
npm install
npm run prisma:generate
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run prisma:migrate:dev -- --name create_project_workspace
```

## 실행

```bash
npm run start:dev
```

## Smoke

```bash
curl -s http://localhost:3000/projects
```
```

- [ ] **Step 2: README 작성**

`README.md`에는 저장소 목적, 1차 범위, 로컬 실행 문서 링크, 검증 명령을 적는다.

- [ ] **Step 3: 원격 DB smoke 실행**

Run:

```bash
npm run start:dev
```

다른 터미널에서 실행한다.

```bash
curl -s -X POST http://localhost:3000/projects -H 'Content-Type: application/json' -d '{"name":"A사 제안 검토","description":"2026년 상반기","type":"PROPOSAL_REVIEW"}'
curl -s http://localhost:3000/projects
curl -s -X POST http://localhost:3000/projects/<projectId>/archive
curl -s -X POST http://localhost:3000/projects/<projectId>/restore
```

Expected: 생성 응답의 `documentCount`와 `riskCandidateCount`는 0, 보관 후 `ARCHIVED`, 복원 후 `ACTIVE`.

- [ ] **Step 4: 최종 검증과 커밋**

Run:

```bash
rg -n 'T[B]D|T[O]DO|place.holder|fill[ ]in|나중[에]|적[절]|미[정]|CHANGE[_]ME' .
npm run typecheck
npm run lint
npm test
```

Commit:

```bash
git add docs/development/backend-local-run.md README.md
git commit -m "docs: Project API 로컬 실행 방법 정리" -m "Project API 구현 후 개발자가 같은 방식으로 DB 연결, migration, smoke 검증을 재현할 수 있도록 실행 문서를 추가합니다.

Constraint: 실제 접속 비밀번호는 문서와 저장소에 남기지 않는다.
Confidence: high
Scope-risk: narrow
Directive: 운영 배포 문서는 로컬 실행 문서와 분리해서 작성한다.
Tested: rg -n 'T[B]D|T[O]DO|place.holder|fill[ ]in|나중[에]|적[절]|미[정]|CHANGE[_]ME' .
Tested: npm run typecheck
Tested: npm run lint
Tested: npm test
Not-tested: 운영 배포 환경 smoke는 이번 이슈 범위가 아님"
```

## Task 10: PR 생성 전 자체 점검

**Files:**
- Modify only when verification reveals a concrete defect

- [ ] **Step 1: working tree 확인**

Run:

```bash
git status --short --branch
```

Expected: 작업 브랜치에 커밋되지 않은 파일 없음.

- [ ] **Step 2: 전체 검증**

Run:

```bash
npm run typecheck
npm run lint
npm test
rg -n "documind[0-9]{4}|dm[_]app[_]|dm[_]migrator[_]" .
```

Expected: typecheck, lint, test exit code 0. 실제 비밀번호 패턴 검색 결과 없음.

- [ ] **Step 3: PR 생성**

Run:

```bash
git push -u origin feat/22-project-api
gh pr create --base develop --head feat/22-project-api --title "feat: Project API 1차 구현" --body-file /tmp/documind-project-api-pr.md
```

PR 본문은 기존 `.github/pull_request_template.md` 구조를 사용하고 `Refs #22`, 설계 판단, 검증 결과, 남은 리스크를 기록한다.

- [ ] **Step 4: Antigravity 리뷰와 머지 전 댓글**

Run:

```bash
scripts/agy-pr-review <PR번호> --post --timeout 10m
```

머지 전 댓글은 다음 문장으로 시작한다.

```md
Antigravity 리뷰 결과를 확인했습니다.
```

추가 반영이 없으면 다음을 포함한다.

```md
반영한 항목:

- 추가 반영할 항목 없음
```

## 자체 리뷰 결과

- Spec coverage: Project 생성, 목록, 상세, 수정, 보관, 복원, status 필터, 보관 정책, demo owner, Prisma schema, 오류 응답, 테스트 전략, 실행 문서가 Task 1~10에 포함되어 있다.
- 금지어 검색: 계획서 저장 후 `rg -n 'T[B]D|T[O]DO|place.holder|fill[ ]in|나중[에]|적[절]|미[정]|CHANGE[_]ME' docs/specs/project-api-implementation-plan.md`를 실행한다.
- Type consistency: `ProjectType`, `ProjectStatus`, `ProjectSnapshot`, `ProjectRepository`, use case 이름은 모든 Task에서 동일하게 사용한다.
