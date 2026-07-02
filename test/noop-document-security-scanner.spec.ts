import { DocumentSecurityScanUnavailableError } from "../src/document-workspace/domain/document.errors";
import { NoopDocumentSecurityScanner } from "../src/document-workspace/infrastructure/noop-document-security-scanner";

describe("NoopDocumentSecurityScanner", () => {
  it("파일 내용을 저장하지 않고 항상 clean 결과를 반환한다", async () => {
    const scanner = new NoopDocumentSecurityScanner();

    await expect(
      scanner.scan({
        documentId: "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b99",
        originalName: "A사 제안서.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 1048576,
        buffer: Buffer.from("not scanned by noop")
      })
    ).resolves.toEqual({ status: "clean" });
  });

  it("보안 검사 장애 오류는 503 상태와 전용 코드를 가진다", () => {
    const error = new DocumentSecurityScanUnavailableError();

    expect(error).toMatchObject({
      code: "DOCUMENT_SECURITY_SCAN_UNAVAILABLE",
      message: "파일 보안 검사를 완료할 수 없습니다.",
      status: 503
    });
  });
});
