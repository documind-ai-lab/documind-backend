import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
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
  ProjectIdParamDto,
  UpdateProjectDto
} from "./project.dto";
import { presentProjectDetail, presentProjectPage } from "./project.presenter";

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
  async get(@Param() params: ProjectIdParamDto) {
    const project = await this.getProjectUseCase.execute(params.projectId);
    return presentProjectDetail(project);
  }

  @Patch(":projectId")
  async update(@Param() params: ProjectIdParamDto, @Body() body: UpdateProjectDto) {
    const project = await this.updateProjectUseCase.execute(
      params.projectId,
      toProjectUpdateCommand(body)
    );
    return presentProjectDetail(project);
  }

  @Post(":projectId/archive")
  async archive(@Param() params: ProjectIdParamDto) {
    const project = await this.archiveProjectUseCase.execute(params.projectId);
    return presentProjectDetail(project);
  }

  @Post(":projectId/restore")
  async restore(@Param() params: ProjectIdParamDto) {
    const project = await this.restoreProjectUseCase.execute(params.projectId);
    return presentProjectDetail(project);
  }
}

function toProjectUpdateCommand(body: UpdateProjectDto): UpdateProjectCommand {
  const command: UpdateProjectCommand = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    command.name = body.name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    command.description = body.description ?? null;
  }

  return command;
}
