import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { OrphanDocumentCleanupRecord, OrphanDocumentStorage } from "../application/orphan-document-storage";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";

@Injectable()
export class PrismaOrphanDocumentStorage implements OrphanDocumentStorage {
  constructor(private readonly prisma: PrismaService) {}

  async record(storageKey: string, reason: string): Promise<void> {
    const now = new Date();

    await this.prisma.orphanDocumentFile.upsert({
      where: { storageKey },
      create: {
        id: randomUUID(),
        storageProvider: "local",
        storageKey,
        reason,
        status: "PENDING",
        attemptCount: 0,
        lastError: null,
        nextRetryAt: now,
        cleanedAt: null,
        createdAt: now,
        updatedAt: now
      },
      update: {
        reason,
        status: "PENDING",
        attemptCount: 0,
        lastError: null,
        nextRetryAt: now,
        cleanedAt: null,
        updatedAt: now
      }
    });
  }

  async listDueCleanup(limit: number, now: Date): Promise<OrphanDocumentCleanupRecord[]> {
    return this.prisma.orphanDocumentFile.findMany({
      where: {
        status: "PENDING",
        nextRetryAt: { lte: now }
      },
      orderBy: [{ createdAt: "asc" }, { storageKey: "asc" }],
      take: limit,
      select: {
        storageKey: true,
        reason: true,
        attemptCount: true
      }
    });
  }

  async resolve(storageKey: string, resolvedAt: Date): Promise<void> {
    await this.prisma.orphanDocumentFile.update({
      where: { storageKey },
      data: {
        status: "CLEANED",
        cleanedAt: resolvedAt,
        updatedAt: resolvedAt
      }
    });
  }

  async markFailed(
    storageKey: string,
    errorMessage: string,
    nextRetryAt: Date,
    failedAt: Date
  ): Promise<void> {
    await this.prisma.orphanDocumentFile.update({
      where: { storageKey },
      data: {
        status: "PENDING",
        attemptCount: { increment: 1 },
        lastError: truncateLastError(errorMessage),
        nextRetryAt,
        updatedAt: failedAt
      }
    });
  }
}

function truncateLastError(errorMessage: string): string {
  return errorMessage.slice(0, 1000);
}
