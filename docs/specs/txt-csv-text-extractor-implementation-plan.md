# TXT CSV Text Extractor Implementation Plan

> 이 문서는 TXT/CSV 텍스트 추출 작업을 작업 단위로 진행하기 위한 실행 계획입니다. 각 단계는 체크박스(`- [ ]`) 기준으로 추적합니다.

**Goal:** TXT/CSV 원본 파일을 읽어 `DocumentText`로 저장하고 Document를 `READY`로 전환하는 첫 텍스트 추출 adapter를 구현한다.

**Architecture:** `DocumentStorage` port에 읽기 계약을 추가하고, TXT/CSV 전용 `DocumentTextExtractor` adapter를 만든다. 내부 `ProcessPlainTextExtractionUseCase`는 지원 확장자만 처리하며, PDF/Office처럼 아직 parser가 없는 문서는 상태를 바꾸지 않고 `skipped`로 반환한다.

**Tech Stack:** NestJS, TypeScript, Prisma, AWS SDK for JavaScript v3, Jest

---

## 파일 구조

- Modify: `src/document-workspace/application/document-storage.ts`
  - `read(storageKey: string): Promise<Buffer>` 계약 추가
- Modify: `src/document-workspace/infrastructure/local-document-storage.ts`
  - 기존 `read` 구현을 port 계약으로 공식화
- Modify: `src/document-workspace/infrastructure/s3-document-storage.ts`
  - `GetObjectCommand` 기반 `read` 구현
- Modify: `src/document-workspace/testing/fake-document-storage.ts`
  - 테스트용 `read` 구현 추가
- Modify: `test/local-document-storage.spec.ts`
  - local storage read 테스트 추가
- Modify: `test/s3-document-storage.spec.ts`
  - S3 read command와 body 변환 테스트 추가
- Create: `src/document-workspace/application/document-text-extractor.ts`
  - extractor port와 오류 타입 정의
- Create: `src/document-workspace/infrastructure/plain-text-document-text-extractor.ts`
  - TXT/CSV UTF-8 extractor 구현
- Create: `test/plain-text-document-text-extractor.spec.ts`
  - TXT, CSV, BOM, null byte, invalid UTF-8, unsupported extension 테스트
- Modify: `src/document-workspace/application/document.use-cases.ts`
  - `ProcessPlainTextExtractionUseCase`와 result type 추가
- Modify: `src/document-workspace/document-workspace.module.ts`
  - extractor provider와 process use case provider 등록
- Modify: `test/document-use-cases.spec.ts`
  - plain text extraction 처리 성공, skipped, storage read 실패, 빈 텍스트 실패 테스트 추가
- Modify: `test/document-api.e2e-spec.ts`
  - 새 provider가 e2e module compile을 깨지 않도록 테스트 double override 추가

## Task 1: DocumentStorage read 계약

**Files:**
- Modify: `src/document-workspace/application/document-storage.ts`
- Modify: `src/document-workspace/infrastructure/local-document-storage.ts`
- Modify: `src/document-workspace/infrastructure/s3-document-storage.ts`
- Modify: `src/document-workspace/testing/fake-document-storage.ts`
- Modify: `test/local-document-storage.spec.ts`
- Modify: `test/s3-document-storage.spec.ts`

- [x] **Step 1: local storage read 실패 테스트 작성**

`test/local-document-storage.spec.ts`의 첫 테스트에 저장 후 `storage.read(storageKey)` 검증을 추가한다.

```ts
await expect(storage.read(storageKey)).resolves.toEqual(Buffer.from("%PDF-1.7"));
```

- [x] **Step 2: S3 read 실패 테스트 작성**

`test/s3-document-storage.spec.ts`에 `GetObjectCommand` import와 read 테스트를 추가한다.

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
```

테스트:

```ts
it("read는 GetObjectCommand로 object body를 Buffer로 반환한다", async () => {
  const client = createS3Client();
  client.send.mockResolvedValueOnce({
    Body: {
      transformToByteArray: async () => new Uint8Array(Buffer.from("회의록"))
    }
  });
  const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

  await expect(storage.read("projects/p1/documents/d1/d1.txt")).resolves.toEqual(
    Buffer.from("회의록")
  );

  expect(client.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  expect(getCommandInput(client)).toEqual({
    Bucket: "documind-documents",
    Key: "projects/p1/documents/d1/d1.txt"
  });
});
```

- [x] **Step 3: read 테스트 RED 확인**

Run: `npm test -- local-document-storage.spec.ts s3-document-storage.spec.ts`

Expected: FAIL because `DocumentStorage` interface and S3 adapter do not expose `read`.

- [x] **Step 4: DocumentStorage port에 read 추가**

`src/document-workspace/application/document-storage.ts`를 다음처럼 수정한다.

```ts
export const DOCUMENT_STORAGE = Symbol("DOCUMENT_STORAGE");

export interface DocumentStorage {
  put(storageKey: string, content: Buffer): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  remove(storageKey: string): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
}
```

- [x] **Step 5: S3DocumentStorage read 구현**

`src/document-workspace/infrastructure/s3-document-storage.ts`에 `GetObjectCommand`를 추가하고 `read`를 구현한다.

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
```

```ts
async read(storageKey: string): Promise<Buffer> {
  const result = await this.client.send(
    new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: storageKey
    })
  );
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;

  if (body?.transformToByteArray === undefined) {
    throw new Error("S3 object body를 읽을 수 없습니다.");
  }

  return Buffer.from(await body.transformToByteArray());
}
```

- [x] **Step 6: FakeDocumentStorage read 구현**

`src/document-workspace/testing/fake-document-storage.ts`에 다음 메서드를 추가한다.

```ts
async read(storageKey: string): Promise<Buffer> {
  const content = this.files.get(storageKey);

  if (content === undefined) {
    throw new Error("file not found");
  }

  return Buffer.from(content);
}
```

- [x] **Step 7: storage read 테스트 GREEN 확인**

Run: `npm test -- local-document-storage.spec.ts s3-document-storage.spec.ts`

Expected: PASS.

## Task 2: TXT/CSV extractor port와 adapter

**Files:**
- Create: `src/document-workspace/application/document-text-extractor.ts`
- Create: `src/document-workspace/infrastructure/plain-text-document-text-extractor.ts`
- Create: `test/plain-text-document-text-extractor.spec.ts`

- [x] **Step 1: extractor 실패 테스트 작성**

`test/plain-text-document-text-extractor.spec.ts`를 생성한다.

```ts
import {
  DocumentTextExtractionError,
  UnsupportedDocumentTextExtractionError
} from "../src/document-workspace/application/document-text-extractor";
import { PlainTextDocumentTextExtractor } from "../src/document-workspace/infrastructure/plain-text-document-text-extractor";

describe("PlainTextDocumentTextExtractor", () => {
  const extractor = new PlainTextDocumentTextExtractor();

  it("TXT Buffer를 UTF-8 텍스트로 추출한다", () => {
    const result = extractor.extract({
      extension: "txt",
      content: Buffer.from("회의록\n결정사항")
    });

    expect(result).toEqual({ content: "회의록\n결정사항", tokenCount: null });
  });

  it("CSV Buffer를 원본 텍스트로 추출한다", () => {
    const result = extractor.extract({
      extension: "csv",
      content: Buffer.from("품목,금액\nA,1000")
    });

    expect(result.content).toBe("품목,금액\nA,1000");
  });

  it("UTF-8 BOM을 제거한다", () => {
    const result = extractor.extract({
      extension: "txt",
      content: Buffer.from([0xef, 0xbb, 0xbf, 0xed, 0x9a, 0x8c])
    });

    expect(result.content).toBe("회");
  });

  it("null byte가 있으면 추출 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "txt",
        content: Buffer.from([0x41, 0x00, 0x42])
      })
    ).toThrow(DocumentTextExtractionError);
  });

  it("잘못된 UTF-8이면 추출 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "txt",
        content: Buffer.from([0xff, 0xfe, 0xfd])
      })
    ).toThrow(DocumentTextExtractionError);
  });

  it("TXT/CSV가 아닌 확장자는 unsupported 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "pdf",
        content: Buffer.from("%PDF-1.7")
      })
    ).toThrow(UnsupportedDocumentTextExtractionError);
  });
});
```

- [x] **Step 2: extractor 테스트 RED 확인**

Run: `npm test -- plain-text-document-text-extractor.spec.ts`

Expected: FAIL because extractor files do not exist.

- [x] **Step 3: extractor port 추가**

`src/document-workspace/application/document-text-extractor.ts`를 생성한다.

```ts
export const DOCUMENT_TEXT_EXTRACTOR = Symbol("DOCUMENT_TEXT_EXTRACTOR");

export type ExtractDocumentTextInput = {
  extension: string;
  content: Buffer;
};

export type ExtractDocumentTextResult = {
  content: string;
  tokenCount: number | null;
};

export interface DocumentTextExtractor {
  supports(extension: string): boolean;
  extract(input: ExtractDocumentTextInput): ExtractDocumentTextResult;
}

export class UnsupportedDocumentTextExtractionError extends Error {
  constructor(extension: string) {
    super(`지원하지 않는 텍스트 추출 형식입니다: ${extension}`);
  }
}

export class DocumentTextExtractionError extends Error {
  constructor(message: string) {
    super(message);
  }
}
```

- [x] **Step 4: PlainTextDocumentTextExtractor 구현**

`src/document-workspace/infrastructure/plain-text-document-text-extractor.ts`를 생성한다.

```ts
import { TextDecoder } from "util";
import {
  DocumentTextExtractionError,
  DocumentTextExtractor,
  ExtractDocumentTextInput,
  ExtractDocumentTextResult,
  UnsupportedDocumentTextExtractionError
} from "../application/document-text-extractor";

const SUPPORTED_EXTENSIONS = new Set(["txt", "csv"]);

export class PlainTextDocumentTextExtractor implements DocumentTextExtractor {
  supports(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.has(normalizeExtension(extension));
  }

  extract(input: ExtractDocumentTextInput): ExtractDocumentTextResult {
    const extension = normalizeExtension(input.extension);

    if (!this.supports(extension)) {
      throw new UnsupportedDocumentTextExtractionError(extension);
    }

    if (input.content.includes(0)) {
      throw new DocumentTextExtractionError("텍스트 파일에 허용되지 않는 바이트가 포함되어 있습니다.");
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return {
        content: stripUtf8Bom(decoder.decode(input.content)),
        tokenCount: null
      };
    } catch {
      throw new DocumentTextExtractionError("텍스트 파일을 UTF-8로 해석할 수 없습니다.");
    }
  }
}

function normalizeExtension(extension: string): string {
  return extension.trim().toLowerCase();
}

function stripUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
```

- [x] **Step 5: extractor 테스트 GREEN 확인**

Run: `npm test -- plain-text-document-text-extractor.spec.ts`

Expected: PASS.

## Task 3: Plain text 처리 use case

**Files:**
- Modify: `src/document-workspace/application/document.use-cases.ts`
- Modify: `test/document-use-cases.spec.ts`

- [x] **Step 1: 처리 use case 실패 테스트 작성**

`test/document-use-cases.spec.ts` import에 extractor와 use case를 추가한다.

```ts
import { PlainTextDocumentTextExtractor } from "../src/document-workspace/infrastructure/plain-text-document-text-extractor";
```

`Document use cases` describe 안에 다음 테스트를 추가한다.

```ts
it("plain text 추출은 TXT 문서를 READY로 전환하고 DocumentText를 저장한다", async () => {
  const txt = await uploadUseCase.execute({ projectId, ownerId, file: textFile("회의록.txt", "회의 내용") });
  const processUseCase = createProcessPlainTextExtractionUseCase();

  const result = await processUseCase.execute({ projectId, ownerId, documentId: txt.id });
  const savedText = await documentTextRepository.findByDocumentId(txt.id);

  expect(result.type).toBe("completed");
  expect(result.document.status).toBe(DocumentStatus.READY);
  expect(savedText?.content).toBe("회의 내용");
});

it("plain text 추출은 CSV 문서를 READY로 전환하고 원본 CSV 텍스트를 저장한다", async () => {
  const csv = await uploadUseCase.execute({ projectId, ownerId, file: textFile("견적.csv", "품목,금액\nA,1000") });
  const processUseCase = createProcessPlainTextExtractionUseCase();

  const result = await processUseCase.execute({ projectId, ownerId, documentId: csv.id });
  const savedText = await documentTextRepository.findByDocumentId(csv.id);

  expect(result.type).toBe("completed");
  expect(savedText?.content).toBe("품목,금액\nA,1000");
});

it("plain text 추출은 지원하지 않는 확장자를 skipped로 반환하고 상태를 바꾸지 않는다", async () => {
  const pdf = await uploadUseCase.execute({ projectId, ownerId, file: pdfFile() });
  const processUseCase = createProcessPlainTextExtractionUseCase();

  const result = await processUseCase.execute({ projectId, ownerId, documentId: pdf.id });
  const saved = await repository.findByProjectAndId(projectId, pdf.id);

  expect(result).toEqual({
    type: "skipped",
    document: saved!.snapshot(),
    reason: "지원하지 않는 텍스트 추출 형식입니다."
  });
  expect(saved!.snapshot().status).toBe(DocumentStatus.TEXT_EXTRACTION_PENDING);
});

it("plain text 추출 중 원본 파일을 읽을 수 없으면 FAILED로 저장한다", async () => {
  const txt = await uploadUseCase.execute({ projectId, ownerId, file: textFile("회의록.txt", "회의 내용") });
  await storage.remove(txt.storageKey);
  const processUseCase = createProcessPlainTextExtractionUseCase();

  const result = await processUseCase.execute({ projectId, ownerId, documentId: txt.id });

  expect(result.type).toBe("failed");
  expect(result.document).toMatchObject({
    status: DocumentStatus.FAILED,
    failureReason: "원본 파일을 읽을 수 없습니다."
  });
});

it("plain text 추출 결과가 비어 있으면 FAILED로 저장한다", async () => {
  const txt = await uploadUseCase.execute({ projectId, ownerId, file: textFile("빈파일.txt", "   ") });
  const processUseCase = createProcessPlainTextExtractionUseCase();

  const result = await processUseCase.execute({ projectId, ownerId, documentId: txt.id });

  expect(result.type).toBe("failed");
  expect(result.document).toMatchObject({
    status: DocumentStatus.FAILED,
    failureReason: "추출 텍스트가 비어 있습니다."
  });
});
```

테스트 helper를 추가한다.

```ts
function textFile(originalName: string, content: string) {
  return {
    originalName,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(content),
    buffer: Buffer.from(content)
  };
}

function createProcessPlainTextExtractionUseCase(): ProcessPlainTextExtractionUseCase {
  return new ProcessPlainTextExtractionUseCase(
    new GetDocumentUseCase(repository, accessChecker),
    new StartTextExtractionUseCase(repository, accessChecker, new FixedClock(now)),
    new CompleteTextExtractionUseCase(
      repository,
      documentTextRepository,
      accessChecker,
      new FixedClock(now),
      idGenerator
    ),
    new FailTextExtractionUseCase(repository, accessChecker, new FixedClock(now)),
    storage,
    new PlainTextDocumentTextExtractor()
  );
}
```

- [x] **Step 2: 처리 use case 테스트 RED 확인**

Run: `npm test -- document-use-cases.spec.ts -t "plain text 추출"`

Expected: FAIL because `ProcessPlainTextExtractionUseCase` does not exist.

- [x] **Step 3: ProcessPlainTextExtractionUseCase 구현**

`src/document-workspace/application/document.use-cases.ts`에 import를 추가한다.

```ts
import {
  DocumentTextExtractionError,
  DocumentTextExtractor
} from "./document-text-extractor";
```

result type을 추가한다.

```ts
export type ProcessPlainTextExtractionCommand = GetDocumentCommand;

export type ProcessPlainTextExtractionResult =
  | { type: "completed"; document: DocumentSnapshot }
  | { type: "failed"; document: DocumentSnapshot; reason: string }
  | { type: "skipped"; document: DocumentSnapshot; reason: string };
```

use case를 추가한다.

```ts
export class ProcessPlainTextExtractionUseCase {
  constructor(
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly startUseCase: StartTextExtractionUseCase,
    private readonly completeUseCase: CompleteTextExtractionUseCase,
    private readonly failUseCase: FailTextExtractionUseCase,
    private readonly storage: DocumentStorage,
    private readonly extractor: DocumentTextExtractor
  ) {}

  async execute(command: ProcessPlainTextExtractionCommand): Promise<ProcessPlainTextExtractionResult> {
    const document = await this.getDocumentUseCase.execute(command);

    if (!this.extractor.supports(document.extension)) {
      return {
        type: "skipped",
        document,
        reason: "지원하지 않는 텍스트 추출 형식입니다."
      };
    }

    const extracting = await this.startUseCase.execute(command);

    try {
      const content = await this.storage.read(extracting.storageKey);
      const extracted = this.extractor.extract({
        extension: extracting.extension,
        content
      });
      const completed = await this.completeUseCase.execute({
        ...command,
        content: extracted.content,
        tokenCount: extracted.tokenCount ?? undefined
      });
      return { type: "completed", document: completed };
    } catch (error) {
      const reason = toPlainTextExtractionFailureReason(error);
      const failed = await this.failUseCase.execute({ ...command, reason });
      return { type: "failed", document: failed, reason };
    }
  }
}
```

helper를 추가한다.

```ts
function toPlainTextExtractionFailureReason(error: unknown): string {
  if (error instanceof DocumentTextValidationError) {
    return error.message;
  }

  if (error instanceof DocumentTextExtractionError) {
    return error.message;
  }

  return "원본 파일을 읽을 수 없습니다.";
}
```

- [x] **Step 4: 처리 use case 테스트 GREEN 확인**

Run: `npm test -- document-use-cases.spec.ts -t "plain text 추출"`

Expected: PASS.

## Task 4: Nest provider wiring과 e2e module 보강

**Files:**
- Modify: `src/document-workspace/document-workspace.module.ts`
- Modify: `test/document-api.e2e-spec.ts`

- [x] **Step 1: provider wiring 추가**

`src/document-workspace/document-workspace.module.ts`에 extractor import를 추가한다.

```ts
import { DOCUMENT_TEXT_EXTRACTOR, DocumentTextExtractor } from "./application/document-text-extractor";
import { PlainTextDocumentTextExtractor } from "./infrastructure/plain-text-document-text-extractor";
```

use case import에 `ProcessPlainTextExtractionUseCase`를 추가한다.

```ts
ProcessPlainTextExtractionUseCase,
```

providers에 extractor와 process use case를 등록한다.

```ts
{ provide: DOCUMENT_TEXT_EXTRACTOR, useClass: PlainTextDocumentTextExtractor },
{
  provide: ProcessPlainTextExtractionUseCase,
  useFactory: (
    getDocumentUseCase: GetDocumentUseCase,
    startUseCase: StartTextExtractionUseCase,
    completeUseCase: CompleteTextExtractionUseCase,
    failUseCase: FailTextExtractionUseCase,
    storage: DocumentStorage,
    extractor: DocumentTextExtractor
  ) =>
    new ProcessPlainTextExtractionUseCase(
      getDocumentUseCase,
      startUseCase,
      completeUseCase,
      failUseCase,
      storage,
      extractor
    ),
  inject: [
    GetDocumentUseCase,
    StartTextExtractionUseCase,
    CompleteTextExtractionUseCase,
    FailTextExtractionUseCase,
    DOCUMENT_STORAGE,
    DOCUMENT_TEXT_EXTRACTOR
  ]
}
```

- [x] **Step 2: e2e module override 추가**

`test/document-api.e2e-spec.ts`에 import를 추가한다.

```ts
import { DOCUMENT_TEXT_EXTRACTOR } from "../src/document-workspace/application/document-text-extractor";
import { PlainTextDocumentTextExtractor } from "../src/document-workspace/infrastructure/plain-text-document-text-extractor";
```

testing module builder에 override를 추가한다.

```ts
.overrideProvider(DOCUMENT_TEXT_EXTRACTOR)
.useValue(new PlainTextDocumentTextExtractor())
```

- [x] **Step 3: e2e module compile 확인**

Run: `npm run test:e2e`

Expected: PASS.

## Task 5: 최종 검증과 문서 체크

**Files:**
- All changed files

- [x] **Step 1: forbidden-term scan**

Run: `rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|docs/superpower[s]" docs/specs/txt-csv-text-extractor-design.md docs/specs/txt-csv-text-extractor-implementation-plan.md src test`

Expected: no matches.

- [x] **Step 2: typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 3: lint**

Run: `npm run lint`

Expected: PASS.

- [x] **Step 4: unit tests**

Run: `npm test`

Expected: PASS.

- [x] **Step 5: e2e tests**

Run: `npm run test:e2e`

Expected: PASS.

- [x] **Step 6: build**

Run: `npm run build`

Expected: PASS.

- [x] **Step 7: diff check**

Run: `git diff --check`

Expected: PASS.

## 완료 기준

- `DocumentStorage.read`가 port, local, S3, fake 구현에 반영된다.
- TXT/CSV extractor가 UTF-8 텍스트 추출과 오류 처리를 검증한다.
- plain text 처리 use case가 completed, skipped, failed 흐름을 검증한다.
- 공개 HTTP API 변경 없이 기존 e2e가 통과한다.
- PR 생성 후 리뷰 결과를 확인하고 병합 차단 항목이 없으면 develop 병합을 진행한다.
