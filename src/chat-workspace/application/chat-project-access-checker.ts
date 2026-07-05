export const CHAT_PROJECT_ACCESS_CHECKER = Symbol("CHAT_PROJECT_ACCESS_CHECKER");

export type ChatProjectAccessResult = {
  projectId: string;
  ownerId: string;
  status: "ACTIVE" | "ARCHIVED";
};

export interface ChatProjectAccessChecker {
  ensureReadableProject(projectId: string, ownerId: string): Promise<ChatProjectAccessResult>;
}
