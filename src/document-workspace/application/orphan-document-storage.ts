export const ORPHAN_DOCUMENT_STORAGE = Symbol("ORPHAN_DOCUMENT_STORAGE");

export interface OrphanDocumentStorage {
  record(storageKey: string, reason: string): Promise<void>;
  resolve(storageKey: string): Promise<void>;
}
