import { PrismaOrphanDocumentStorage } from "../src/document-workspace/infrastructure/prisma-orphan-document-storage";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service";

describe("PrismaOrphanDocumentStorage", () => {
  const now = new Date("2026-07-02T01:00:00.000Z");

  it("record는 같은 storageKey를 재시도 가능한 PENDING 후보로 upsert한다", async () => {
    const delegate = createDelegate();
    const storage = new PrismaOrphanDocumentStorage(createPrisma(delegate));

    await storage.record("projects/p1/documents/d1/d1.pdf", "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED");

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: { storageKey: "projects/p1/documents/d1/d1.pdf" },
      create: expect.objectContaining({
        id: expect.any(String),
        storageProvider: "local",
        storageKey: "projects/p1/documents/d1/d1.pdf",
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        status: "PENDING",
        attemptCount: 0,
        lastError: null,
        cleanedAt: null,
        nextRetryAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      }),
      update: expect.objectContaining({
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        status: "PENDING",
        attemptCount: 0,
        lastError: null,
        cleanedAt: null,
        nextRetryAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    });
  });

  it("listDueCleanup은 재시도 시각이 지난 PENDING 후보만 오래된 순서로 조회한다", async () => {
    const delegate = createDelegate();
    delegate.findMany.mockResolvedValue([
      {
        storageKey: "projects/p1/documents/d1/d1.pdf",
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        attemptCount: 2
      }
    ]);
    const storage = new PrismaOrphanDocumentStorage(createPrisma(delegate));

    const records = await storage.listDueCleanup(20, now);

    expect(records).toEqual([
      {
        storageKey: "projects/p1/documents/d1/d1.pdf",
        reason: "DOCUMENT_CREATE_FAILED_CLEANUP_FAILED",
        attemptCount: 2
      }
    ]);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        nextRetryAt: { lte: now }
      },
      orderBy: [{ createdAt: "asc" }, { storageKey: "asc" }],
      take: 20,
      select: {
        storageKey: true,
        reason: true,
        attemptCount: true
      }
    });
  });

  it("resolve는 후보를 CLEANED로 마킹하고 정리 시각을 저장한다", async () => {
    const delegate = createDelegate();
    const storage = new PrismaOrphanDocumentStorage(createPrisma(delegate));

    await storage.resolve("projects/p1/documents/d1/d1.pdf", now);

    expect(delegate.update).toHaveBeenCalledWith({
      where: { storageKey: "projects/p1/documents/d1/d1.pdf" },
      data: {
        status: "CLEANED",
        cleanedAt: now,
        updatedAt: now
      }
    });
  });

  it("markFailed는 실패 사유와 다음 재시도 시각을 남기고 시도 횟수를 증가시킨다", async () => {
    const delegate = createDelegate();
    const storage = new PrismaOrphanDocumentStorage(createPrisma(delegate));
    const nextRetryAt = new Date("2026-07-02T01:10:00.000Z");

    await storage.markFailed(
      "projects/p1/documents/d1/d1.pdf",
      "remove failed",
      nextRetryAt,
      now
    );

    expect(delegate.update).toHaveBeenCalledWith({
      where: { storageKey: "projects/p1/documents/d1/d1.pdf" },
      data: {
        status: "PENDING",
        attemptCount: { increment: 1 },
        lastError: "remove failed",
        nextRetryAt,
        updatedAt: now
      }
    });
  });

  it("markFailed는 DB 컬럼 길이를 넘는 실패 사유를 1000자로 제한한다", async () => {
    const delegate = createDelegate();
    const storage = new PrismaOrphanDocumentStorage(createPrisma(delegate));
    const longErrorMessage = "x".repeat(1200);
    const nextRetryAt = new Date("2026-07-02T01:10:00.000Z");

    await storage.markFailed(
      "projects/p1/documents/d1/d1.pdf",
      longErrorMessage,
      nextRetryAt,
      now
    );

    expect(delegate.update).toHaveBeenCalledWith({
      where: { storageKey: "projects/p1/documents/d1/d1.pdf" },
      data: {
        status: "PENDING",
        attemptCount: { increment: 1 },
        lastError: "x".repeat(1000),
        nextRetryAt,
        updatedAt: now
      }
    });
  });
});

function createDelegate() {
  return {
    upsert: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  };
}

function createPrisma(delegate: ReturnType<typeof createDelegate>): PrismaService {
  return { orphanDocumentFile: delegate } as unknown as PrismaService;
}
