export type AppEnv = {
  databaseUrl: string;
  demoOwnerId: string;
  nodeEnv: string;
  port: number;
};

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
