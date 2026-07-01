export const PROJECT_DOCUMENT_SUMMARY_UPDATER = Symbol("PROJECT_DOCUMENT_SUMMARY_UPDATER");

export interface ProjectDocumentSummaryUpdater {
  recordDocumentCreated(projectId: string, ownerId: string, occurredAt: Date): Promise<void>;
}
