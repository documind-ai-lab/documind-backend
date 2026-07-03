import { Document } from "../src/document-workspace/domain/document";
import { DocumentStateConflictError } from "../src/document-workspace/domain/document.errors";
import { DocumentStatus } from "../src/document-workspace/domain/document-status";

describe("Document domain", () => {
  const id = "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99";
  const projectId = "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91";
  const ownerId = "7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e";
  const now = new Date("2026-07-01T01:00:00.000Z");

  it("문서 생성 시 파일 메타데이터를 저장하고 텍스트 추출 대기 상태로 시작한다", () => {
    const document = Document.create({
      id,
      projectId,
      ownerId,
      originalName: "  A사 제안서.pdf  ",
      storageProvider: "local",
      storageKey: "projects/8d5f/documents/018f/018f.pdf",
      mimeType: "application/pdf",
      extension: "PDF",
      sizeBytes: 1048576,
      now
    });

    expect(document.snapshot()).toEqual({
      id,
      projectId,
      ownerId,
      originalName: "A사 제안서.pdf",
      storageProvider: "local",
      storageKey: "projects/8d5f/documents/018f/018f.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 1048576,
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      createdAt: now,
      updatedAt: now
    });
  });

  it("보안 검사 실패 문서는 실패 상태와 실패 사유를 저장한다", () => {
    const document = Document.createFailed({
      id,
      projectId,
      ownerId,
      originalName: "  A사 제안서.pdf  ",
      storageProvider: "local",
      storageKey: "projects/8d5f/documents/018f/018f.pdf",
      mimeType: "application/pdf",
      extension: "PDF",
      sizeBytes: 1048576,
      failureReason: "  악성 코드 의심 파일입니다.  ",
      now
    });

    expect(document.snapshot()).toEqual({
      id,
      projectId,
      ownerId,
      originalName: "A사 제안서.pdf",
      storageProvider: "local",
      storageKey: "projects/8d5f/documents/018f/018f.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 1048576,
      status: DocumentStatus.FAILED,
      failureReason: "악성 코드 의심 파일입니다.",
      createdAt: now,
      updatedAt: now
    });
  });

  it("실패한 문서는 재시도 대기 상태로 되돌리고 실패 사유를 비운다", () => {
    const document = failedDocument();
    const retriedAt = new Date("2026-07-01T02:00:00.000Z");

    document.markRetryPending(retriedAt);

    expect(document.snapshot()).toMatchObject({
      status: DocumentStatus.TEXT_EXTRACTION_PENDING,
      failureReason: null,
      updatedAt: retriedAt
    });
  });

  it("실패 상태가 아닌 문서를 재시도하면 상태 충돌 오류를 던진다", () => {
    const document = pendingDocument();

    expect(() => document.markRetryPending(new Date("2026-07-01T02:00:00.000Z"))).toThrow(
      DocumentStateConflictError
    );
  });

  it("텍스트 추출 대기 문서는 추출 중 상태로 전환한다", () => {
    const document = pendingDocument();
    const startedAt = new Date("2026-07-01T02:00:00.000Z");

    document.markTextExtracting(startedAt);

    expect(document.snapshot()).toMatchObject({
      status: DocumentStatus.TEXT_EXTRACTING,
      failureReason: null,
      updatedAt: startedAt
    });
  });

  it("텍스트 추출 중 문서는 준비 상태로 전환하고 실패 사유를 비운다", () => {
    const document = extractingDocument();
    const readyAt = new Date("2026-07-01T02:30:00.000Z");

    document.markTextExtractionReady(readyAt);

    expect(document.snapshot()).toMatchObject({
      status: DocumentStatus.READY,
      failureReason: null,
      updatedAt: readyAt
    });
  });

  it("텍스트 추출 대기 또는 추출 중 문서는 추출 실패 상태로 전환한다", () => {
    const pending = pendingDocument();
    const extracting = extractingDocument();
    const failedAt = new Date("2026-07-01T03:00:00.000Z");

    pending.markTextExtractionFailed("빈 텍스트입니다.", failedAt);
    extracting.markTextExtractionFailed("파서 오류", failedAt);

    expect(pending.snapshot()).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "빈 텍스트입니다.",
      updatedAt: failedAt
    });
    expect(extracting.snapshot()).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "파서 오류",
      updatedAt: failedAt
    });
  });

  it("허용되지 않는 텍스트 추출 상태 전환은 상태 충돌 오류를 던진다", () => {
    const failed = failedDocument();
    const ready = readyDocument();

    expect(() => failed.markTextExtracting(new Date("2026-07-01T02:00:00.000Z"))).toThrow(
      DocumentStateConflictError
    );
    expect(() => ready.markTextExtractionReady(new Date("2026-07-01T02:00:00.000Z"))).toThrow(
      DocumentStateConflictError
    );
    expect(() => ready.markTextExtractionFailed("재처리 실패", new Date("2026-07-01T02:00:00.000Z"))).toThrow(
      DocumentStateConflictError
    );
  });

  it("문서를 실패 상태로 표시하면 실패 사유와 updatedAt을 갱신한다", () => {
    const document = pendingDocument();
    const failedAt = new Date("2026-07-01T02:00:00.000Z");

    document.markFailed("원본 파일을 찾을 수 없습니다.", failedAt);

    expect(document.snapshot()).toMatchObject({
      status: DocumentStatus.FAILED,
      failureReason: "원본 파일을 찾을 수 없습니다.",
      updatedAt: failedAt
    });
  });

  function pendingDocument(): Document {
    return Document.create({
      id,
      projectId,
      ownerId,
      originalName: "A사 제안서.pdf",
      storageProvider: "local",
      storageKey: "projects/8d5f/documents/018f/018f.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 1048576,
      now
    });
  }

  function failedDocument(): Document {
    const document = pendingDocument();
    document.markFailed("텍스트 추출 실패", new Date("2026-07-01T01:30:00.000Z"));
    return document;
  }

  function extractingDocument(): Document {
    const document = pendingDocument();
    document.markTextExtracting(new Date("2026-07-01T01:30:00.000Z"));
    return document;
  }

  function readyDocument(): Document {
    const document = extractingDocument();
    document.markTextExtractionReady(new Date("2026-07-01T01:45:00.000Z"));
    return document;
  }
});
