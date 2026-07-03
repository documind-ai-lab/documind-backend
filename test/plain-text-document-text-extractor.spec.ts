import {
  DocumentTextExtractionError,
  UnsupportedDocumentTextExtractionError
} from "../src/document-workspace/application/document-text-extractor";
import { PlainTextDocumentTextExtractor } from "../src/document-workspace/infrastructure/plain-text-document-text-extractor";

describe("PlainTextDocumentTextExtractor", () => {
  const extractor = new PlainTextDocumentTextExtractor();

  it("TXT Buffer를 UTF-8 텍스트로 추출한다", () => {
    const result = extractor.extract({
      extension: "txt",
      content: Buffer.from("회의록\n결정사항")
    });

    expect(result).toEqual({ content: "회의록\n결정사항", tokenCount: null });
  });

  it("CSV Buffer를 원본 텍스트로 추출한다", () => {
    const result = extractor.extract({
      extension: "csv",
      content: Buffer.from("품목,금액\nA,1000")
    });

    expect(result.content).toBe("품목,금액\nA,1000");
  });

  it("UTF-8 BOM을 제거한다", () => {
    const result = extractor.extract({
      extension: "txt",
      content: Buffer.from([0xef, 0xbb, 0xbf, 0xed, 0x9a, 0x8c])
    });

    expect(result.content).toBe("회");
  });

  it("null byte가 있으면 추출 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "txt",
        content: Buffer.from([0x41, 0x00, 0x42])
      })
    ).toThrow(DocumentTextExtractionError);
  });

  it("잘못된 UTF-8이면 추출 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "txt",
        content: Buffer.from([0xff, 0xfe, 0xfd])
      })
    ).toThrow(DocumentTextExtractionError);
  });

  it("TXT/CSV가 아닌 확장자는 unsupported 오류를 던진다", () => {
    expect(() =>
      extractor.extract({
        extension: "pdf",
        content: Buffer.from("%PDF-1.7")
      })
    ).toThrow(UnsupportedDocumentTextExtractionError);
  });
});
