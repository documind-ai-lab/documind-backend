import { Injectable } from "@nestjs/common";
import { OrphanDocumentStorage } from "../application/orphan-document-storage";

@Injectable()
export class NoopOrphanDocumentStorage implements OrphanDocumentStorage {
  async record(): Promise<void> {}
  async resolve(): Promise<void> {}
}
