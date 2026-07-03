import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service";
import {
  DocumentTextRepository,
  DocumentTextSnapshot,
  SaveDocumentTextInput
} from "../application/document-text.repository";
import { Document } from "../domain/document";
import { DocumentStatus } from "../domain/document-status";

type PrismaDocumentTextRecord = DocumentTextSnapshot;

type PrismaDocumentTextDelegate = {
  upsert(args: {
    where: { documentId: string };
    create: PrismaDocumentTextRecord;
    update: Omit<PrismaDocumentTextRecord, "id" | "documentId" | "createdAt">;
  }): Promise<unknown>;
  findUnique(args: { where: { documentId: string } }): Promise<PrismaDocumentTextRecord | null>;
};

type PrismaDocumentTextClient = {
  documentText: PrismaDocumentTextDelegate;
  document: {
    update(args: {
      where: { id: string };
      data: {
        status: DocumentStatus;
        failureReason: string | null;
        updatedAt: Date;
      };
    }): unknown;
  };
  $transaction(operations: unknown[]): Promise<unknown>;
};

@Injectable()
export class PrismaDocumentTextRepository implements DocumentTextRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: SaveDocumentTextInput): Promise<void> {
    await this.delegate.upsert({
      where: { documentId: input.documentId },
      create: {
        id: input.id,
        documentId: input.documentId,
        projectId: input.projectId,
        ownerId: input.ownerId,
        content: input.content,
        contentHash: input.contentHash,
        tokenCount: input.tokenCount,
        extractedAt: input.extractedAt,
        createdAt: input.now,
        updatedAt: input.now
      },
      update: {
        projectId: input.projectId,
        ownerId: input.ownerId,
        content: input.content,
        contentHash: input.contentHash,
        tokenCount: input.tokenCount,
        extractedAt: input.extractedAt,
        updatedAt: input.now
      }
    });
  }

  async saveExtractionResult(document: Document, input: SaveDocumentTextInput): Promise<void> {
    const snapshot = document.snapshot();
    await this.prismaClient.$transaction([
      this.delegate.upsert({
        where: { documentId: input.documentId },
        create: {
          id: input.id,
          documentId: input.documentId,
          projectId: input.projectId,
          ownerId: input.ownerId,
          content: input.content,
          contentHash: input.contentHash,
          tokenCount: input.tokenCount,
          extractedAt: input.extractedAt,
          createdAt: input.now,
          updatedAt: input.now
        },
        update: {
          projectId: input.projectId,
          ownerId: input.ownerId,
          content: input.content,
          contentHash: input.contentHash,
          tokenCount: input.tokenCount,
          extractedAt: input.extractedAt,
          updatedAt: input.now
        }
      }),
      this.prismaClient.document.update({
        where: { id: snapshot.id },
        data: {
          status: snapshot.status,
          failureReason: snapshot.failureReason,
          updatedAt: snapshot.updatedAt
        }
      })
    ]);
  }

  async findByDocumentId(documentId: string): Promise<DocumentTextSnapshot | null> {
    const record = await this.delegate.findUnique({
      where: { documentId }
    });

    return record === null ? null : { ...record };
  }

  private get delegate(): PrismaDocumentTextDelegate {
    return this.prismaClient.documentText;
  }

  private get prismaClient(): PrismaDocumentTextClient {
    return this.prisma as unknown as PrismaDocumentTextClient;
  }
}
