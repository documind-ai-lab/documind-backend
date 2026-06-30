import { PageResponse } from "../../shared/application/page-response";
import { ProjectSnapshot } from "../domain/project";
import { ProjectStatus } from "../domain/project-status";
import { ProjectType } from "../domain/project-type";

export type ProjectSummaryResponse = {
  id: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  documentCount: number;
  riskCandidateCount: number;
  lastActivityAt: string;
};

export type ProjectDetailResponse = ProjectSummaryResponse & {
  createdAt: string;
  updatedAt: string;
};

export function presentProjectSummary(project: ProjectSnapshot): ProjectSummaryResponse {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    type: project.type,
    status: project.status,
    documentCount: project.documentCount,
    riskCandidateCount: project.riskCandidateCount,
    lastActivityAt: project.lastActivityAt.toISOString()
  };
}

export function presentProjectDetail(project: ProjectSnapshot): ProjectDetailResponse {
  return {
    ...presentProjectSummary(project),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

export function presentProjectPage(
  page: PageResponse<ProjectSnapshot>
): PageResponse<ProjectSummaryResponse> {
  return {
    ...page,
    items: page.items.map(presentProjectSummary)
  };
}
