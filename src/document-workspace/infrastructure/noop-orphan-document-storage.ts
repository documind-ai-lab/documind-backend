import { Injectable } from "@nestjs/common";
import {
  OrphanDocumentCleanupRecord,
  OrphanDocumentStorage
} from "../application/orphan-document-storage";

@Injectable()
export class NoopOrphanDocumentStorage implements OrphanDocumentStorage {
  async record(): Promise<void> {}
  async listDueCleanup(): Promise<OrphanDocumentCleanupRecord[]> {
    return [];
  }
  async resolve(): Promise<void> {}
  async markFailed(): Promise<void> {}
}
