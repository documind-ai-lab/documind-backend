import { Injectable } from "@nestjs/common";
import { Document as PrismaDocument, Prisma } from "@prisma/client";
import { createPageResponse, PageResponse } from "../../shared/application/page-response";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import {
  DocumentListQuery,
  DocumentRepository
} from "../application/document.repository";
import { Document, DocumentSnapshot } from "../domain/document";
import { DocumentStatus } from "../domain/document-status";

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(document: Document): Promise<void> {
    await this.prisma.document.create({ data: toPrismaCreate(document.snapshot()) });
  }

  async findByProjectAndId(projectId: string, documentId: string): Promise<Document | null> {
    const record = await this.prisma.document.findFirst({
      where: { id: documentId, projectId }
    });

    return record === null ? null : Document.rehydrate(fromPrisma(record));
  }

  async listByProject(query: DocumentListQuery): Promise<PageResponse<DocumentSnapshot>> {
    const where: Prisma.DocumentWhereInput = { projectId: query.projectId };
    const [records, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.size,
        take: query.size
      }),
      this.prisma.document.count({ where })
    ]);

    return createPageResponse({
      items: records.map(fromPrisma),
      page: query.page,
      size: query.size,
      total
    });
  }

  async save(document: Document): Promise<void> {
    const snapshot = document.snapshot();
    await this.prisma.document.update({
      where: { id: snapshot.id },
      data: toPrismaUpdate(snapshot)
    });
  }
}

function toPrismaCreate(snapshot: DocumentSnapshot): Prisma.DocumentUncheckedCreateInput {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    ownerId: snapshot.ownerId,
    originalName: snapshot.originalName,
    storageProvider: snapshot.storageProvider,
    storageKey: snapshot.storageKey,
    mimeType: snapshot.mimeType,
    extension: snapshot.extension,
    sizeBytes: snapshot.sizeBytes,
    status: snapshot.status,
    failureReason: snapshot.failureReason,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  };
}

function toPrismaUpdate(snapshot: DocumentSnapshot): Prisma.DocumentUncheckedUpdateInput {
  return {
    projectId: snapshot.projectId,
    ownerId: snapshot.ownerId,
    originalName: snapshot.originalName,
    storageProvider: snapshot.storageProvider,
    storageKey: snapshot.storageKey,
    mimeType: snapshot.mimeType,
    extension: snapshot.extension,
    sizeBytes: snapshot.sizeBytes,
    status: snapshot.status,
    failureReason: snapshot.failureReason,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  };
}

function fromPrisma(record: PrismaDocument): DocumentSnapshot {
  return {
    id: record.id,
    projectId: record.projectId,
    ownerId: record.ownerId,
    originalName: record.originalName,
    storageProvider: record.storageProvider,
    storageKey: record.storageKey,
    mimeType: record.mimeType,
    extension: record.extension,
    sizeBytes: record.sizeBytes,
    status: record.status as DocumentStatus,
    failureReason: record.failureReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
