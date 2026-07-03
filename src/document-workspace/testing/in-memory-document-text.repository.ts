import {
  DocumentTextRepository,
  DocumentTextSnapshot,
  SaveDocumentTextInput
} from "../application/document-text.repository";
import { Document } from "../domain/document";
import { DocumentRepository } from "../application/document.repository";

export class InMemoryDocumentTextRepository implements DocumentTextRepository {
  private readonly texts = new Map<string, DocumentTextSnapshot>();

  constructor(private readonly documentRepository?: DocumentRepository) {}

  async upsert(input: SaveDocumentTextInput): Promise<void> {
    const existing = this.texts.get(input.documentId);

    this.texts.set(input.documentId, {
      id: existing?.id ?? input.id,
      documentId: input.documentId,
      projectId: input.projectId,
      ownerId: input.ownerId,
      content: input.content,
      contentHash: input.contentHash,
      tokenCount: input.tokenCount,
      extractedAt: input.extractedAt,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    });
  }

  async saveExtractionResult(document: Document, input: SaveDocumentTextInput): Promise<void> {
    await this.upsert(input);
    await this.documentRepository?.save(document);
  }

  async findByDocumentId(documentId: string): Promise<DocumentTextSnapshot | null> {
    return this.texts.get(documentId) ?? null;
  }
}
