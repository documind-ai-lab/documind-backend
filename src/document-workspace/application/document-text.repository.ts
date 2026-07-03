import { Document } from "../domain/document";

export const DOCUMENT_TEXT_REPOSITORY = Symbol("DOCUMENT_TEXT_REPOSITORY");

export type DocumentTextSnapshot = {
  id: string;
  documentId: string;
  projectId: string;
  ownerId: string;
  content: string;
  contentHash: string;
  tokenCount: number | null;
  extractedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveDocumentTextInput = {
  id: string;
  documentId: string;
  projectId: string;
  ownerId: string;
  content: string;
  contentHash: string;
  tokenCount: number | null;
  extractedAt: Date;
  now: Date;
};

export interface DocumentTextRepository {
  upsert(input: SaveDocumentTextInput): Promise<void>;
  saveExtractionResult(document: Document, input: SaveDocumentTextInput): Promise<void>;
  findByDocumentId(documentId: string): Promise<DocumentTextSnapshot | null>;
}
