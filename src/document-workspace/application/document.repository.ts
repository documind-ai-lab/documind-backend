import { PageResponse } from "../../shared/application/page-response";
import { Document, DocumentSnapshot } from "../domain/document";

export const DOCUMENT_REPOSITORY = Symbol("DOCUMENT_REPOSITORY");

export type DocumentListQuery = {
  projectId: string;
  page: number;
  size: number;
};

export interface DocumentRepository {
  create(document: Document): Promise<void>;
  findByProjectAndId(projectId: string, documentId: string): Promise<Document | null>;
  listByProject(query: DocumentListQuery): Promise<PageResponse<DocumentSnapshot>>;
  save(document: Document): Promise<void>;
}
