import { DocumentFilePolicy } from "../src/document-workspace/application/document-file-policy";
import { DocumentFileValidationError } from "../src/document-workspace/domain/document.errors";

describe("Document file policy", () => {
  const policy = new DocumentFilePolicy({ maxFileBytes: 50 * 1024 * 1024 });

  it("허용된 PDF 파일의 확장자와 MIME type을 검증하고 확장자를 정규화한다", () => {
    const result = policy.validate({
      originalName: "  A사 제안서.PDF  ",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      buffer: Buffer.from("%PDF-1.7")
    });

    expect(result).toEqual({
      originalName: "A사 제안서.PDF",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extension: "pdf",
      buffer: Buffer.from("%PDF-1.7")
    });
  });

  it("파일명이 비어 있거나 확장자가 없으면 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "제안서",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("허용되지 않은 확장자와 MIME type은 415 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "악성파일.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        buffer: Buffer.from("binary")
      })
    ).toThrow(DocumentFileValidationError);

    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("비어 있거나 최대 크기를 초과한 파일은 검증 오류를 던진다", () => {
    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
        buffer: Buffer.alloc(0)
      })
    ).toThrow(DocumentFileValidationError);

    expect(() =>
      policy.validate({
        originalName: "제안서.pdf",
        mimeType: "application/pdf",
        sizeBytes: 50 * 1024 * 1024 + 1,
        buffer: Buffer.from("%PDF-1.7")
      })
    ).toThrow(DocumentFileValidationError);
  });

  it("CSV와 TXT는 octet-stream을 허용하되 null byte가 있으면 거부한다", () => {
    expect(
      policy.validate({
        originalName: "회의록.txt",
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        buffer: Buffer.from("안녕하세요")
      }).extension
    ).toBe("txt");

    expect(() =>
      policy.validate({
        originalName: "회의록.txt",
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        buffer: Buffer.from([0x41, 0x00, 0x42])
      })
    ).toThrow(DocumentFileValidationError);
  });
});
