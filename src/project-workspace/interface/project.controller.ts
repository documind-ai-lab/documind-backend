import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req
} from "@nestjs/common";
import { Request } from "express";
import {
  ArchiveProjectUseCase,
  CreateProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  RestoreProjectUseCase,
  UpdateProjectCommand,
  UpdateProjectUseCase
} from "../application/project.use-cases";
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto
} from "./project.dto";
import { presentProjectDetail, presentProjectPage } from "./project.presenter";

const projectIdPipe = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

@Controller("projects")
export class ProjectController {
  constructor(
    private readonly createProjectUseCase: CreateProjectUseCase,
    private readonly listProjectsUseCase: ListProjectsUseCase,
    private readonly getProjectUseCase: GetProjectUseCase,
    private readonly updateProjectUseCase: UpdateProjectUseCase,
    private readonly archiveProjectUseCase: ArchiveProjectUseCase,
    private readonly restoreProjectUseCase: RestoreProjectUseCase
  ) {}

  @Post()
  async create(@Body() body: CreateProjectDto) {
    const project = await this.createProjectUseCase.execute(body);
    return presentProjectDetail(project);
  }

  @Get()
  async list(@Query() query: ListProjectsQueryDto) {
    const page = await this.listProjectsUseCase.execute({
      page: query.page,
      size: query.size,
      status: query.status
    });
    return presentProjectPage(page);
  }

  @Get(":projectId")
  async get(@Param("projectId", projectIdPipe) projectId: string) {
    const project = await this.getProjectUseCase.execute(projectId);
    return presentProjectDetail(project);
  }

  @Patch(":projectId")
  async update(
    @Param("projectId", projectIdPipe) projectId: string,
    @Body() body: UpdateProjectDto,
    @Req() request: Request
  ) {
    const project = await this.updateProjectUseCase.execute(
      projectId,
      toProjectUpdateCommand(body, request.body)
    );
    return presentProjectDetail(project);
  }

  @Post(":projectId/archive")
  async archive(@Param("projectId", projectIdPipe) projectId: string) {
    const project = await this.archiveProjectUseCase.execute(projectId);
    return presentProjectDetail(project);
  }

  @Post(":projectId/restore")
  async restore(@Param("projectId", projectIdPipe) projectId: string) {
    const project = await this.restoreProjectUseCase.execute(projectId);
    return presentProjectDetail(project);
  }
}

function toProjectUpdateCommand(
  body: UpdateProjectDto,
  rawBody: Record<string, unknown>
): UpdateProjectCommand {
  const command: UpdateProjectCommand = {};

  if (Object.prototype.hasOwnProperty.call(rawBody, "name")) {
    command.name = body.name;
  }

  if (Object.prototype.hasOwnProperty.call(rawBody, "description")) {
    command.description = body.description ?? null;
  }

  return command;
}
