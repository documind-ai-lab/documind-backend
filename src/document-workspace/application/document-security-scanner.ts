export const DOCUMENT_SECURITY_SCANNER = Symbol("DOCUMENT_SECURITY_SCANNER");

export type DocumentSecurityScanInput = {
  documentId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type DocumentSecurityScanResult =
  | {
      status: "clean";
    }
  | {
      status: "infected";
      reason: string;
      signature?: string;
    };

export interface DocumentSecurityScanner {
  scan(input: DocumentSecurityScanInput): Promise<DocumentSecurityScanResult>;
}
