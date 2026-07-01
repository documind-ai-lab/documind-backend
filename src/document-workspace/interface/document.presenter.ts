import { PageResponse } from "../../shared/application/page-response";
import { DocumentSnapshot } from "../domain/document";
import { DocumentStatus } from "../domain/document-status";

export type DocumentResponse = {
  id: string;
  projectId: string;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function presentDocument(document: DocumentSnapshot): DocumentResponse {
  return {
    id: document.id,
    projectId: document.projectId,
    originalName: document.originalName,
    extension: document.extension,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    failureReason: document.failureReason,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

export function presentDocumentPage(
  page: PageResponse<DocumentSnapshot>
): PageResponse<DocumentResponse> {
  return {
    ...page,
    items: page.items.map(presentDocument)
  };
}
