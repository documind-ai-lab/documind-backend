import { Injectable } from "@nestjs/common";
import {
  OrphanDocumentCleanupRecord,
  OrphanDocumentStorage
} from "../application/orphan-document-storage";

@Injectable()
export class NoopOrphanDocumentStorage implements OrphanDocumentStorage {
  async record(_storageKey: string, _reason: string): Promise<void> {}
  async listDueCleanup(_limit: number, _now: Date): Promise<OrphanDocumentCleanupRecord[]> {
    return [];
  }
  async resolve(_storageKey: string, _resolvedAt: Date): Promise<void> {}
  async markFailed(
    _storageKey: string,
    _errorMessage: string,
    _nextRetryAt: Date,
    _failedAt: Date
  ): Promise<void> {}
}
