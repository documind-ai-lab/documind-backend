import { Document } from "../src/document-workspace/domain/document";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";
import { PrismaDocumentTextRepository } from "../src/document-workspace/infrastructure/prisma-document-text.repository";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service";

describe("PrismaDocumentTextRepository", () => {
  const now = new Date("2026-07-03T01:00:00.000Z");
  const extractedAt = new Date("2026-07-03T00:59:00.000Z");

  it("upsert는 documentId 기준으로 추출 텍스트를 신규 저장하거나 갱신한다", async () => {
    const delegate = createDelegate();
    const repository = new PrismaDocumentTextRepository(createPrisma(delegate));

    await repository.upsert({
      id: "018ff4f0-0000-7000-8000-000000000201",
      documentId: "018ff4f0-0000-7000-8000-000000000101",
      projectId: "018ff4f0-0000-7000-8000-000000000001",
      ownerId: "018ff4f0-0000-7000-8000-000000000002",
      content: "추출 텍스트",
      contentHash: "hash-1",
      tokenCount: 42,
      extractedAt,
      now
    });

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: { documentId: "018ff4f0-0000-7000-8000-000000000101" },
      create: {
        id: "018ff4f0-0000-7000-8000-000000000201",
        documentId: "018ff4f0-0000-7000-8000-000000000101",
        projectId: "018ff4f0-0000-7000-8000-000000000001",
        ownerId: "018ff4f0-0000-7000-8000-000000000002",
        content: "추출 텍스트",
        contentHash: "hash-1",
        tokenCount: 42,
        extractedAt,
        createdAt: now,
        updatedAt: now
      },
      update: {
        projectId: "018ff4f0-0000-7000-8000-000000000001",
        ownerId: "018ff4f0-0000-7000-8000-000000000002",
        content: "추출 텍스트",
        contentHash: "hash-1",
        tokenCount: 42,
        extractedAt,
        updatedAt: now
      }
    });
  });

  it("findByDocumentId는 저장된 텍스트 snapshot을 반환한다", async () => {
    const delegate = createDelegate();
    delegate.findUnique.mockResolvedValue({
      id: "018ff4f0-0000-7000-8000-000000000201",
      documentId: "018ff4f0-0000-7000-8000-000000000101",
      projectId: "018ff4f0-0000-7000-8000-000000000001",
      ownerId: "018ff4f0-0000-7000-8000-000000000002",
      content: "추출 텍스트",
      contentHash: "hash-1",
      tokenCount: null,
      extractedAt,
      createdAt: now,
      updatedAt: now
    });
    const repository = new PrismaDocumentTextRepository(createPrisma(delegate));

    const result = await repository.findByDocumentId("018ff4f0-0000-7000-8000-000000000101");

    expect(result).toEqual({
      id: "018ff4f0-0000-7000-8000-000000000201",
      documentId: "018ff4f0-0000-7000-8000-000000000101",
      projectId: "018ff4f0-0000-7000-8000-000000000001",
      ownerId: "018ff4f0-0000-7000-8000-000000000002",
      content: "추출 텍스트",
      contentHash: "hash-1",
      tokenCount: null,
      extractedAt,
      createdAt: now,
      updatedAt: now
    });
    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: { documentId: "018ff4f0-0000-7000-8000-000000000101" }
    });
  });

  it("saveExtractionResult는 텍스트 저장과 Document READY 전환을 하나의 transaction으로 처리한다", async () => {
    const documentTextDelegate = createDelegate();
    const documentDelegate = {
      update: jest.fn().mockReturnValue("document-update-operation")
    };
    documentTextDelegate.upsert.mockReturnValue("document-text-upsert-operation");
    const transaction = jest.fn();
    const repository = new PrismaDocumentTextRepository(
      createPrisma(documentTextDelegate, documentDelegate, transaction)
    );
    const document = Document.rehydrate({
      id: "018ff4f0-0000-7000-8000-000000000101",
      projectId: "018ff4f0-0000-7000-8000-000000000001",
      ownerId: "018ff4f0-0000-7000-8000-000000000002",
      originalName: "제안서.pdf",
      storageProvider: "local",
      storageKey: "projects/p1/documents/d1/d1.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 8,
      status: DocumentStatus.TEXT_EXTRACTING,
      failureReason: null,
      createdAt: now,
      updatedAt: now
    });
    const readyAt = new Date("2026-07-03T01:10:00.000Z");
    document.markTextExtractionReady(readyAt);

    await repository.saveExtractionResult(document, {
      id: "018ff4f0-0000-7000-8000-000000000201",
      documentId: "018ff4f0-0000-7000-8000-000000000101",
      projectId: "018ff4f0-0000-7000-8000-000000000001",
      ownerId: "018ff4f0-0000-7000-8000-000000000002",
      content: "추출 텍스트",
      contentHash: "hash-1",
      tokenCount: null,
      extractedAt: readyAt,
      now: readyAt
    });

    expect(documentTextDelegate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId: "018ff4f0-0000-7000-8000-000000000101" }
    }));
    expect(documentDelegate.update).toHaveBeenCalledWith({
      where: { id: "018ff4f0-0000-7000-8000-000000000101" },
      data: {
        status: DocumentStatus.READY,
        failureReason: null,
        updatedAt: readyAt
      }
    });
    expect(transaction).toHaveBeenCalledWith([
      "document-text-upsert-operation",
      "document-update-operation"
    ]);
  });
});

function createDelegate() {
  return {
    upsert: jest.fn(),
    findUnique: jest.fn()
  };
}

function createPrisma(
  documentTextDelegate: ReturnType<typeof createDelegate>,
  documentDelegate: { update: jest.Mock } = { update: jest.fn() },
  transaction: jest.Mock = jest.fn()
): PrismaService {
  return {
    documentText: documentTextDelegate,
    document: documentDelegate,
    $transaction: transaction
  } as unknown as PrismaService;
}
