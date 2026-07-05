export const CHAT_PROJECT_ACTIVITY_UPDATER = Symbol("CHAT_PROJECT_ACTIVITY_UPDATER");

export interface ChatProjectActivityUpdater {
  recordChatActivity(projectId: string, ownerId: string, occurredAt: Date): Promise<void>;
}
