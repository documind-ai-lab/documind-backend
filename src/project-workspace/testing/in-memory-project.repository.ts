import { createPageResponse, PageResponse } from "../../shared/application/page-response";
import { Project, ProjectSnapshot } from "../domain/project";
import { ProjectListQuery, ProjectRepository } from "../application/project.repository";

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSnapshot>();

  async save(project: Project): Promise<void> {
    const snapshot = project.snapshot();
    this.projects.set(snapshot.id, snapshot);
  }

  async findById(projectId: string): Promise<Project | null> {
    const snapshot = this.projects.get(projectId);
    return snapshot === undefined ? null : Project.rehydrate(snapshot);
  }

  async list(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>> {
    const filtered = Array.from(this.projects.values())
      .filter((project) => query.status === "ALL" || project.status === query.status)
      .sort(compareProjectListOrder);
    const offset = (query.page - 1) * query.size;
    const items = filtered.slice(offset, offset + query.size);

    return createPageResponse({ items, page: query.page, size: query.size, total: filtered.length });
  }
}

function compareProjectListOrder(left: ProjectSnapshot, right: ProjectSnapshot): number {
  const activityDiff = right.lastActivityAt.getTime() - left.lastActivityAt.getTime();

  if (activityDiff !== 0) {
    return activityDiff;
  }

  return right.id.localeCompare(left.id);
}
