import { DocumentFileValidationError } from "../domain/document.errors";

export type DocumentFileInput = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type ValidatedDocumentFile = DocumentFileInput & {
  extension: string;
};

export type DocumentFilePolicyOptions = {
  maxFileBytes: number;
};

export class DocumentFilePolicy {
  constructor(private readonly options: DocumentFilePolicyOptions) {}

  validate(input: DocumentFileInput): ValidatedDocumentFile {
    const originalName = input.originalName.trim();
    validateSize(input.sizeBytes, this.options.maxFileBytes);

    const extension = extractExtension(originalName);
    validateAllowedExtension(extension);
    validateMimeType(extension, input.mimeType);
    validateTextLikeContent(extension, input.mimeType, input.buffer);

    return {
      originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      buffer: input.buffer,
      extension
    };
  }
}

const allowedMimeTypesByExtension: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain", "application/octet-stream"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"]
};

function validateSize(sizeBytes: number, maxFileBytes: number): void {
  if (sizeBytes < 1) {
    throw new DocumentFileValidationError("파일 크기는 1바이트 이상이어야 합니다.", 422);
  }

  if (sizeBytes > maxFileBytes) {
    throw new DocumentFileValidationError("파일 크기가 허용 범위를 초과했습니다.", 413);
  }
}

function extractExtension(originalName: string): string {
  if (originalName === "" || !originalName.includes(".")) {
    throw new DocumentFileValidationError("파일 확장자가 필요합니다.", 415);
  }

  const extension = originalName.split(".").pop()?.trim().toLowerCase() ?? "";

  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new DocumentFileValidationError("파일 확장자가 올바르지 않습니다.", 415);
  }

  return extension;
}

function validateAllowedExtension(extension: string): void {
  if (allowedMimeTypesByExtension[extension] === undefined) {
    throw new DocumentFileValidationError("허용되지 않은 파일 확장자입니다.", 415);
  }
}

function validateMimeType(extension: string, mimeType: string): void {
  const allowedMimeTypes = allowedMimeTypesByExtension[extension] ?? [];

  if (!allowedMimeTypes.includes(mimeType)) {
    throw new DocumentFileValidationError("허용되지 않은 MIME type입니다.", 415);
  }
}

function validateTextLikeContent(extension: string, mimeType: string, buffer: Buffer): void {
  if (!["csv", "txt"].includes(extension) || mimeType !== "application/octet-stream") {
    return;
  }

  if (buffer.includes(0x00)) {
    throw new DocumentFileValidationError("텍스트 파일에 허용되지 않는 바이트가 포함되어 있습니다.", 415);
  }
}
