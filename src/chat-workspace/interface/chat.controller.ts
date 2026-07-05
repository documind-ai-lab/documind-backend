import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query
} from "@nestjs/common";
import { IncomingHttpHeaders } from "http";
import { CreateChatMessageUseCase, ListChatMessagesUseCase } from "../application/chat.use-cases";
import {
  CreateChatMessageBodyDto,
  ListChatMessagesQueryDto,
  parseOwnerIdHeader
} from "./chat.dto";
import { presentChatMessagePage, presentCreateChatMessageResult } from "./chat.presenter";

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

@Controller("projects/:projectId/chat/messages")
export class ChatController {
  constructor(
    private readonly createChatMessageUseCase: CreateChatMessageUseCase,
    private readonly listChatMessagesUseCase: ListChatMessagesUseCase
  ) {}

  @Post()
  async create(
    @Param("projectId", uuidPipe) projectId: string,
    @Headers() headers: IncomingHttpHeaders,
    @Body() body: CreateChatMessageBodyDto
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);
    const result = await this.createChatMessageUseCase.execute({
      projectId,
      ownerId,
      content: body.content
    });

    return presentCreateChatMessageResult(result);
  }

  @Get()
  async list(
    @Param("projectId", uuidPipe) projectId: string,
    @Headers() headers: IncomingHttpHeaders,
    @Query() query: ListChatMessagesQueryDto
  ) {
    const { ownerId } = parseOwnerIdHeader(headers);
    const page = await this.listChatMessagesUseCase.execute({
      projectId,
      ownerId,
      page: query.page,
      size: query.size
    });

    return presentChatMessagePage(page);
  }
}
