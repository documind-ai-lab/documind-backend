export const PROJECT_ACCESS_CHECKER = Symbol("PROJECT_ACCESS_CHECKER");

export type ProjectAccessResult = {
  projectId: string;
  ownerId: string;
  status: "ACTIVE" | "ARCHIVED";
};

export interface ProjectAccessChecker {
  ensureReadableProject(projectId: string, ownerId: string): Promise<ProjectAccessResult | void>;
  ensureWritableProject(projectId: string, ownerId: string): Promise<ProjectAccessResult | void>;
}
