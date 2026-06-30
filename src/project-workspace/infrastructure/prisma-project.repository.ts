import { Injectable } from "@nestjs/common";
import { Prisma, Project as PrismaProject } from "@prisma/client";
import { createPageResponse, PageResponse } from "../../shared/application/page-response";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import { ProjectRepository, ProjectListQuery } from "../application/project.repository";
import { Project, ProjectSnapshot } from "../domain/project";
import { ProjectStatus } from "../domain/project-status";
import { ProjectType } from "../domain/project-type";

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(project: Project): Promise<void> {
    const snapshot = project.snapshot();

    await this.prisma.project.upsert({
      where: { id: snapshot.id },
      create: toPrismaCreate(snapshot),
      update: toPrismaUpdate(snapshot)
    });
  }

  async findById(projectId: string): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { id: projectId } });
    return record === null ? null : Project.rehydrate(fromPrisma(record));
  }

  async list(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>> {
    const where: Prisma.ProjectWhereInput =
      query.status === "ALL" ? {} : { status: query.status };
    const [records, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.size,
        take: query.size
      }),
      this.prisma.project.count({ where })
    ]);

    return createPageResponse({
      items: records.map(fromPrisma),
      page: query.page,
      size: query.size,
      total
    });
  }
}

function toPrismaCreate(snapshot: ProjectSnapshot): Prisma.ProjectCreateInput {
  return {
    id: snapshot.id,
    ownerId: snapshot.ownerId,
    name: snapshot.name,
    description: snapshot.description,
    type: snapshot.type,
    status: snapshot.status,
    documentCount: snapshot.documentCount,
    riskCandidateCount: snapshot.riskCandidateCount,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    lastActivityAt: snapshot.lastActivityAt
  };
}

function toPrismaUpdate(snapshot: ProjectSnapshot): Prisma.ProjectUpdateInput {
  return {
    ownerId: snapshot.ownerId,
    name: snapshot.name,
    description: snapshot.description,
    type: snapshot.type,
    status: snapshot.status,
    documentCount: snapshot.documentCount,
    riskCandidateCount: snapshot.riskCandidateCount,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    lastActivityAt: snapshot.lastActivityAt
  };
}

function fromPrisma(record: PrismaProject): ProjectSnapshot {
  return {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    description: record.description,
    type: toProjectType(record.type),
    status: toProjectStatus(record.status),
    documentCount: record.documentCount,
    riskCandidateCount: record.riskCandidateCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastActivityAt: record.lastActivityAt
  };
}

function toProjectType(type: PrismaProject["type"]): ProjectType {
  return type as ProjectType;
}

function toProjectStatus(status: PrismaProject["status"]): ProjectStatus {
  return status as ProjectStatus;
}
