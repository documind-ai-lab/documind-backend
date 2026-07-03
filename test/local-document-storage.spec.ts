import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, isAbsolute } from "path";
import { LocalDocumentStorage } from "../src/document-workspace/infrastructure/local-document-storage";
import { loadEnv } from "../src/shared/infrastructure/env";

describe("LocalDocumentStorage", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "documind-storage-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("base path 하위에 파일을 저장하고 존재 여부와 삭제를 처리한다", async () => {
    const storage = new LocalDocumentStorage(basePath);
    await storage.onModuleInit();

    const storageKey = "projects/project-1/documents/document-1/document-1.pdf";
    await storage.put(storageKey, Buffer.from("%PDF-1.7"));

    await expect(readFile(join(basePath, storageKey), "utf8")).resolves.toBe("%PDF-1.7");
    await expect(storage.exists(storageKey)).resolves.toBe(true);

    await storage.remove(storageKey);

    await expect(storage.exists(storageKey)).resolves.toBe(false);
  });

  it("base path 밖으로 벗어나는 storageKey는 거부한다", async () => {
    const storage = new LocalDocumentStorage(basePath);
    await storage.onModuleInit();

    await expect(storage.put("../escape.txt", Buffer.from("escape"))).rejects.toMatchObject({
      status: 400
    });
    await expect(storage.exists("/tmp/escape.txt")).rejects.toMatchObject({ status: 400 });
  });
});

describe("document storage env", () => {
  it("상대 DOCUMENT_STORAGE_BASE_PATH를 현재 실행 위치 기준 절대 경로로 변환한다", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/documind",
      DOCUMIND_DEMO_OWNER_ID: "11111111-1111-4111-8111-111111111111",
      DOCUMENT_STORAGE_BASE_PATH: "./.storage/documents",
      DOCUMENT_MAX_FILE_BYTES: "52428800",
      PORT: "3000"
    });

    expect(env.documentStorageBasePath).not.toBeNull();
    if (env.documentStorageBasePath === null) {
      throw new Error("local provider는 documentStorageBasePath를 반환해야 합니다.");
    }
    expect(isAbsolute(env.documentStorageBasePath)).toBe(true);
    expect(env.documentStorageBasePath.endsWith(".storage/documents")).toBe(true);
  });
});
