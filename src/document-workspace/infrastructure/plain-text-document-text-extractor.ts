import { TextDecoder } from "util";
import {
  DocumentTextExtractionError,
  DocumentTextExtractor,
  ExtractDocumentTextInput,
  ExtractDocumentTextResult,
  UnsupportedDocumentTextExtractionError
} from "../application/document-text-extractor";

const SUPPORTED_EXTENSIONS = new Set(["txt", "csv"]);

export class PlainTextDocumentTextExtractor implements DocumentTextExtractor {
  supports(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.has(normalizeExtension(extension));
  }

  extract(input: ExtractDocumentTextInput): ExtractDocumentTextResult {
    const extension = normalizeExtension(input.extension);

    if (!this.supports(extension)) {
      throw new UnsupportedDocumentTextExtractionError(extension);
    }

    if (input.content.includes(0)) {
      throw new DocumentTextExtractionError("텍스트 파일에 허용되지 않는 바이트가 포함되어 있습니다.");
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return {
        content: stripUtf8Bom(decoder.decode(input.content)),
        tokenCount: null
      };
    } catch {
      throw new DocumentTextExtractionError("텍스트 파일을 UTF-8로 해석할 수 없습니다.");
    }
  }
}

function normalizeExtension(extension: string): string {
  return extension.trim().toLowerCase();
}

function stripUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
