export const ORPHAN_DOCUMENT_STORAGE = Symbol("ORPHAN_DOCUMENT_STORAGE");

export type OrphanDocumentCleanupRecord = {
  storageKey: string;
  reason: string;
  attemptCount: number;
};

export interface OrphanDocumentStorage {
  record(storageKey: string, reason: string): Promise<void>;
  listDueCleanup(limit: number, now: Date): Promise<OrphanDocumentCleanupRecord[]>;
  resolve(storageKey: string, resolvedAt: Date): Promise<void>;
  markFailed(
    storageKey: string,
    errorMessage: string,
    nextRetryAt: Date,
    failedAt: Date
  ): Promise<void>;
}
