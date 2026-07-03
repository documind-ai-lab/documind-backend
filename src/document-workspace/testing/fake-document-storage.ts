import { DocumentStorage } from "../application/document-storage";

export class FakeDocumentStorage implements DocumentStorage {
  private readonly files = new Map<string, Buffer>();
  readonly removedKeys: string[] = [];
  readonly failRemoveKeys = new Set<string>();
  failRemove = false;

  async put(storageKey: string, content: Buffer): Promise<void> {
    this.files.set(storageKey, Buffer.from(content));
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    this.removedKeys.push(storageKey);

    if (this.failRemove || this.failRemoveKeys.has(storageKey)) {
      throw new Error("remove failed");
    }

    this.files.delete(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const content = this.files.get(storageKey);

    if (content === undefined) {
      throw new Error("file not found");
    }

    return Buffer.from(content);
  }
}
