import { OrphanDocumentCleanupScheduler } from "../src/document-workspace/infrastructure/orphan-document-cleanup-scheduler";

describe("OrphanDocumentCleanupScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("비활성화 상태에서는 interval이 지나도 cleanup use case를 실행하지 않는다", async () => {
    const cleanupUseCase = createCleanupUseCase();
    const scheduler = new OrphanDocumentCleanupScheduler(cleanupUseCase, createLogger(), {
      enabled: false,
      intervalMs: 1000
    });

    await scheduler.onModuleInit();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(cleanupUseCase.execute).not.toHaveBeenCalled();
  });

  it("활성화 상태에서는 interval마다 cleanup use case를 실행한다", async () => {
    const cleanupUseCase = createCleanupUseCase();
    const scheduler = new OrphanDocumentCleanupScheduler(cleanupUseCase, createLogger(), {
      enabled: true,
      intervalMs: 1000
    });

    await scheduler.onModuleInit();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(cleanupUseCase.execute).toHaveBeenCalledTimes(1);

    await scheduler.onModuleDestroy();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(cleanupUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("cleanup 실행 중 오류가 나면 warn 로그를 남기고 다음 interval에서 재시도한다", async () => {
    const cleanupUseCase = createCleanupUseCase();
    cleanupUseCase.execute.mockRejectedValueOnce(new Error("cleanup failed"));
    const logger = createLogger();
    const scheduler = new OrphanDocumentCleanupScheduler(cleanupUseCase, logger, {
      enabled: true,
      intervalMs: 1000
    });

    await scheduler.onModuleInit();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(cleanupUseCase.execute).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith("고아 파일 자동 정리 실행 실패", {
      errorMessage: "cleanup failed"
    });
  });
});

function createCleanupUseCase() {
  return {
    execute: jest.fn().mockResolvedValue({ scannedCount: 0, cleanedCount: 0, failedCount: 0 })
  };
}

function createLogger() {
  return {
    warn: jest.fn()
  };
}
