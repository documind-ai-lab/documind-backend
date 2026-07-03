import { loadEnv } from "../src/shared/infrastructure/env";

describe("loadEnv", () => {
  it("DOCUMENT_STORAGE_PROVIDER 기본값은 local이며 local base path를 절대 경로로 변환한다", () => {
    const env = loadEnv(baseEnv());

    expect(env.documentStorageProvider).toBe("local");
    const basePath = env.documentStorageBasePath;
    expect(basePath).not.toBeNull();
    expect(basePath!.endsWith("/.storage/documents")).toBe(true);
    expect(env.documentStorageS3).toBeNull();
  });

  it("DOCUMENT_STORAGE_PROVIDER가 s3이면 bucket, region, endpoint, forcePathStyle을 파싱한다", () => {
    const env = loadEnv({
      ...baseEnv(),
      DOCUMENT_STORAGE_PROVIDER: "s3",
      DOCUMENT_STORAGE_S3_BUCKET: "documind-documents",
      DOCUMENT_STORAGE_S3_REGION: "ap-northeast-2",
      DOCUMENT_STORAGE_S3_ENDPOINT: "http://localhost:9000",
      DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE: "true"
    });

    expect(env.documentStorageProvider).toBe("s3");
    expect(env.documentStorageBasePath).toBeNull();
    expect(env.documentStorageS3).toEqual({
      bucket: "documind-documents",
      region: "ap-northeast-2",
      endpoint: "http://localhost:9000",
      forcePathStyle: true
    });
  });

  it("s3 provider는 bucket과 region을 요구한다", () => {
    expect(() =>
      loadEnv({
        ...baseEnv(),
        DOCUMENT_STORAGE_PROVIDER: "s3",
        DOCUMENT_STORAGE_S3_BUCKET: "",
        DOCUMENT_STORAGE_S3_REGION: "ap-northeast-2"
      })
    ).toThrow("DOCUMENT_STORAGE_S3_BUCKET 환경 변수가 필요합니다.");

    expect(() =>
      loadEnv({
        ...baseEnv(),
        DOCUMENT_STORAGE_PROVIDER: "s3",
        DOCUMENT_STORAGE_S3_BUCKET: "documind-documents",
        DOCUMENT_STORAGE_S3_REGION: ""
      })
    ).toThrow("DOCUMENT_STORAGE_S3_REGION 환경 변수가 필요합니다.");
  });

  it("DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE은 true 또는 false만 허용한다", () => {
    expect(() =>
      loadEnv({
        ...baseEnv(),
        DOCUMENT_STORAGE_PROVIDER: "s3",
        DOCUMENT_STORAGE_S3_BUCKET: "documind-documents",
        DOCUMENT_STORAGE_S3_REGION: "ap-northeast-2",
        DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE: "yes"
      })
    ).toThrow("DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE는 true 또는 false여야 합니다.");
  });
});

function baseEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://documind_backend_app:password@localhost:5432/documind",
    DOCUMIND_DEMO_OWNER_ID: "7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e",
    DOCUMENT_STORAGE_BASE_PATH: "./.storage/documents",
    DOCUMENT_MAX_FILE_BYTES: "52428800",
    NODE_ENV: "test",
    PORT: "3000"
  };
}
