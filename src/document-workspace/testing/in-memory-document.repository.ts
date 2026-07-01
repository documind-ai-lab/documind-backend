import { createPageResponse, PageResponse } from "../../shared/application/page-response";
import { Document, DocumentSnapshot } from "../domain/document";
import { DocumentListQuery, DocumentRepository } from "../application/document.repository";

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, DocumentSnapshot>();
  failNextCreate = false;

  async create(document: Document): Promise<void> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("create failed");
    }

    const snapshot = document.snapshot();
    this.documents.set(snapshot.id, snapshot);
  }

  async findByProjectAndId(projectId: string, documentId: string): Promise<Document | null> {
    const snapshot = this.documents.get(documentId);

    if (snapshot === undefined || snapshot.projectId !== projectId) {
      return null;
    }

    return Document.rehydrate(snapshot);
  }

  async listByProject(query: DocumentListQuery): Promise<PageResponse<DocumentSnapshot>> {
    const filtered = Array.from(this.documents.values())
      .filter((document) => document.projectId === query.projectId)
      .sort(compareDocumentListOrder);
    const offset = (query.page - 1) * query.size;
    const items = filtered.slice(offset, offset + query.size);

    return createPageResponse({ items, page: query.page, size: query.size, total: filtered.length });
  }

  async save(document: Document): Promise<void> {
    const snapshot = document.snapshot();
    this.documents.set(snapshot.id, snapshot);
  }
}

function compareDocumentListOrder(left: DocumentSnapshot, right: DocumentSnapshot): number {
  const createdAtDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return right.id.localeCompare(left.id);
}
