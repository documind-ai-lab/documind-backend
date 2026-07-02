import { resolve } from "path";

export type DocumentStorageProvider = "local" | "s3";

export type DocumentStorageS3Env = {
  bucket: string;
  region: string;
  endpoint: string | null;
  forcePathStyle: boolean;
};

export type AppEnv = {
  databaseUrl: string;
  demoOwnerId: string;
  documentMaxFileBytes: number;
  orphanDocumentCleanupBatchSize: number;
  orphanDocumentCleanupEnabled: boolean;
  orphanDocumentCleanupIntervalMs: number;
  orphanDocumentCleanupRetryDelayMs: number;
  documentStorageBasePath: string | null;
  documentStorageProvider: DocumentStorageProvider;
  documentStorageS3: DocumentStorageS3Env | null;
  nodeEnv: string;
  port: number;
};

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const demoOwnerId = requireEnv(env, "DOCUMIND_DEMO_OWNER_ID");
  const documentStorageProvider = parseDocumentStorageProvider(
    env.DOCUMENT_STORAGE_PROVIDER ?? "local"
  );
  const documentStorageBasePath =
    documentStorageProvider === "local"
      ? resolve(requireEnv(env, "DOCUMENT_STORAGE_BASE_PATH"))
      : null;
  const documentStorageS3 =
    documentStorageProvider === "s3" ? parseDocumentStorageS3(env) : null;
  const documentMaxFileBytes = Number(requireEnv(env, "DOCUMENT_MAX_FILE_BYTES"));
  const orphanDocumentCleanupEnabled = parseBoolean(
    env.ORPHAN_DOCUMENT_CLEANUP_ENABLED ?? "false",
    "ORPHAN_DOCUMENT_CLEANUP_ENABLED"
  );
  const orphanDocumentCleanupIntervalMs = parsePositiveInteger(
    env.ORPHAN_DOCUMENT_CLEANUP_INTERVAL_MS ?? "600000",
    "ORPHAN_DOCUMENT_CLEANUP_INTERVAL_MS"
  );
  const orphanDocumentCleanupBatchSize = parsePositiveInteger(
    env.ORPHAN_DOCUMENT_CLEANUP_BATCH_SIZE ?? "50",
    "ORPHAN_DOCUMENT_CLEANUP_BATCH_SIZE"
  );
  const orphanDocumentCleanupRetryDelayMs = parsePositiveInteger(
    env.ORPHAN_DOCUMENT_CLEANUP_RETRY_DELAY_MS ?? "600000",
    "ORPHAN_DOCUMENT_CLEANUP_RETRY_DELAY_MS"
  );
  const port = Number(env.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT는 1 이상 65535 이하의 정수여야 합니다.");
  }

  if (!isUuid(demoOwnerId)) {
    throw new Error("DOCUMIND_DEMO_OWNER_ID는 UUID 형식이어야 합니다.");
  }

  if (!Number.isInteger(documentMaxFileBytes) || documentMaxFileBytes < 1) {
    throw new Error("DOCUMENT_MAX_FILE_BYTES는 1 이상의 정수여야 합니다.");
  }

  return {
    databaseUrl,
    demoOwnerId,
    documentMaxFileBytes,
    orphanDocumentCleanupBatchSize,
    orphanDocumentCleanupEnabled,
    orphanDocumentCleanupIntervalMs,
    orphanDocumentCleanupRetryDelayMs,
    documentStorageBasePath,
    documentStorageProvider,
    documentStorageS3,
    nodeEnv: env.NODE_ENV ?? "development",
    port
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} 환경 변수가 필요합니다.`);
  }

  return value;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${key}는 true 또는 false여야 합니다.`);
}

function parseDocumentStorageProvider(value: string): DocumentStorageProvider {
  if (value === "local" || value === "s3") {
    return value;
  }

  throw new Error("DOCUMENT_STORAGE_PROVIDER는 local 또는 s3여야 합니다.");
}

function parseDocumentStorageS3(env: NodeJS.ProcessEnv): DocumentStorageS3Env {
  const endpoint = env.DOCUMENT_STORAGE_S3_ENDPOINT?.trim() ?? "";

  return {
    bucket: requireEnv(env, "DOCUMENT_STORAGE_S3_BUCKET"),
    region: requireEnv(env, "DOCUMENT_STORAGE_S3_REGION"),
    endpoint: endpoint === "" ? null : endpoint,
    forcePathStyle: parseBoolean(
      env.DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE ?? "false",
      "DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE"
    )
  };
}

function parsePositiveInteger(value: string, key: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key}는 1 이상의 정수여야 합니다.`);
  }

  return parsed;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
