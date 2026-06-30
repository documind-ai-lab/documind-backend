describe("Project API PostgreSQL integration", () => {
  const shouldRun = process.env.RUN_DB_INTEGRATION === "true";

  (shouldRun ? it : it.skip)("원격 PostgreSQL 연동 smoke는 실제 .env 설정 후 실행한다", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });
});
