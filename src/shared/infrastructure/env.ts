import { resolve } from "path";

export type AppEnv = {
  databaseUrl: string;
  demoOwnerId: string;
  documentMaxFileBytes: number;
  documentStorageBasePath: string;
  nodeEnv: string;
  port: number;
};

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const demoOwnerId = requireEnv(env, "DOCUMIND_DEMO_OWNER_ID");
  const documentStorageBasePath = resolve(requireEnv(env, "DOCUMENT_STORAGE_BASE_PATH"));
  const documentMaxFileBytes = Number(requireEnv(env, "DOCUMENT_MAX_FILE_BYTES"));
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
    documentStorageBasePath,
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
