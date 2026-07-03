export const DOCUMENT_STORAGE = Symbol("DOCUMENT_STORAGE");

export interface DocumentStorage {
  put(storageKey: string, content: Buffer): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  remove(storageKey: string): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
}
