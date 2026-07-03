export const DOCUMENT_TEXT_EXTRACTOR = Symbol("DOCUMENT_TEXT_EXTRACTOR");

export type ExtractDocumentTextInput = {
  extension: string;
  content: Buffer;
};

export type ExtractDocumentTextResult = {
  content: string;
  tokenCount: number | null;
};

export interface DocumentTextExtractor {
  supports(extension: string): boolean;
  extract(input: ExtractDocumentTextInput): ExtractDocumentTextResult;
}

export class UnsupportedDocumentTextExtractionError extends Error {
  constructor(extension: string) {
    super(`지원하지 않는 텍스트 추출 형식입니다: ${extension}`);
  }
}

export class DocumentTextExtractionError extends Error {
  constructor(message: string) {
    super(message);
  }
}
