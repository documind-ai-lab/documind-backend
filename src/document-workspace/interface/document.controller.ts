import {
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UnprocessableEntityException,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IncomingHttpHeaders } from "http";
import {
  GetDocumentUseCase,
  ListDocumentsUseCase,
  ProcessPlainTextExtractionUseCase,
  RetryDocumentUseCase,
  UploadDocumentUseCase
} from "../application/document.use-cases";
import { DocumentSnapshot } from "../domain/document";
import { DocumentStatus } from "../domain/document-status";
import { ListDocumentsQueryDto, parseOwnerIdHeader } from "./document.dto";
import { presentDocument, presentDocumentPage } from "./document.presenter";

type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });
const uploadInterceptor = FileInterceptor("file", {
  limits: { fileSize: Number(process.env.DOCUMENT_MAX_FILE_BYTES ?? 52428800) }
});

@Controller("projects/:projectId/documents")
export class DocumentController {
  constructor(
    private readonly uploadDocumentUseCase: UploadDocumentUseCase,
    private readonly processPlainTextExtractionUseCase: ProcessPlainTextExtractionUseCase,
    private readonly listDocumentsUseCase: ListDocumentsUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly retryDocumentUseCase: RetryDocumentUseCase
  ) {}

  @Post()
  @UseInterceptors(uploadInterceptor)
  async upload(
    @Param("projectId", uuidPipe) projectId: string,
    @Headers() headers: IncomingHttpHeaders,
    @UploadedFile() file?: UploadedDocumentFile
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);

    if (file === undefined) {
      throw new UnprocessableEntityException({ message: ["file 파일은 필수입니다."] });
    }

    const document = await this.uploadDocumentUseCase.execute({
      projectId,
      ownerId,
      file: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        buffer: file.buffer
      }
    });
    const processedDocument = await this.processUploadedPlainTextDocument(document, ownerId);

    return presentDocument(processedDocument);
  }

  @Get()
  async list(
    @Param("projectId", uuidPipe) projectId: string,
    @Headers() headers: IncomingHttpHeaders,
    @Query() query: ListDocumentsQueryDto
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);
    const page = await this.listDocumentsUseCase.execute({
      projectId,
      ownerId,
      page: query.page,
      size: query.size
    });

    return presentDocumentPage(page);
  }

  @Get(":documentId")
  async get(
    @Param("projectId", uuidPipe) projectId: string,
    @Param("documentId", uuidPipe) documentId: string,
    @Headers() headers: IncomingHttpHeaders
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);
    const document = await this.getDocumentUseCase.execute({ projectId, ownerId, documentId });
    return presentDocument(document);
  }

  @Post(":documentId/retry")
  async retry(
    @Param("projectId", uuidPipe) projectId: string,
    @Param("documentId", uuidPipe) documentId: string,
    @Headers() headers: IncomingHttpHeaders
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);
    const result = await this.retryDocumentUseCase.execute({ projectId, ownerId, documentId });

    if (result.type === "conflict") {
      throw new ConflictException(result.reason);
    }

    return presentDocument(result.document);
  }

  private async processUploadedPlainTextDocument(
    document: DocumentSnapshot,
    ownerId: string
  ): Promise<DocumentSnapshot> {
    if (document.status !== DocumentStatus.TEXT_EXTRACTION_PENDING) {
      return document;
    }

    const result = await this.processPlainTextExtractionUseCase.execute({
      projectId: document.projectId,
      ownerId,
      documentId: document.id
    });

    if (result.type === "skipped") {
      return document;
    }

    return result.document;
  }
}
