import { PageResponse } from "../../shared/application/page-response";
import { Project, ProjectSnapshot } from "../domain/project";
import { ProjectStatus } from "../domain/project-status";

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");

export type ProjectListStatusFilter = ProjectStatus | "ALL";

export type ProjectListQuery = {
  page: number;
  size: number;
  status: ProjectListStatusFilter;
};

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(projectId: string): Promise<Project | null>;
  list(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>>;
}
