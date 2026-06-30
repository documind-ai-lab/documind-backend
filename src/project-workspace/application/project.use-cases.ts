import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { OwnerProvider } from "../../shared/application/owner-provider";
import { PageResponse } from "../../shared/application/page-response";
import { Project, ProjectSnapshot, UpdateProjectInput } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";
import { ProjectType } from "../domain/project-type";
import { ProjectListQuery, ProjectRepository } from "./project.repository";

export type CreateProjectCommand = {
  name: string;
  description?: string | null;
  type: ProjectType;
};

export type UpdateProjectCommand = Omit<UpdateProjectInput, "now">;

export class CreateProjectUseCase {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly ownerProvider: OwnerProvider
  ) {}

  async execute(command: CreateProjectCommand): Promise<ProjectSnapshot> {
    const project = Project.create({
      id: this.idGenerator.nextId(),
      ownerId: this.ownerProvider.currentOwnerId(),
      name: command.name,
      description: command.description,
      type: command.type,
      now: this.clock.now()
    });

    await this.repository.save(project);
    return project.snapshot();
  }
}

export class ListProjectsUseCase {
  constructor(private readonly repository: ProjectRepository) {}

  execute(query: ProjectListQuery): Promise<PageResponse<ProjectSnapshot>> {
    return this.repository.list(query);
  }
}

export class GetProjectUseCase {
  constructor(private readonly repository: ProjectRepository) {}

  async execute(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.findProject(projectId);
    return project.snapshot();
  }

  private async findProject(projectId: string): Promise<Project> {
    const project = await this.repository.findById(projectId);

    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return project;
  }
}

export class UpdateProjectUseCase {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly clock: Clock
  ) {}

  async execute(projectId: string, command: UpdateProjectCommand): Promise<ProjectSnapshot> {
    const project = await findProjectOrThrow(this.repository, projectId);
    project.update({ ...command, now: this.clock.now() });
    await this.repository.save(project);
    return project.snapshot();
  }
}

export class ArchiveProjectUseCase {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly clock: Clock
  ) {}

  async execute(projectId: string): Promise<ProjectSnapshot> {
    const project = await findProjectOrThrow(this.repository, projectId);
    project.archive(this.clock.now());
    await this.repository.save(project);
    return project.snapshot();
  }
}

export class RestoreProjectUseCase {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly clock: Clock
  ) {}

  async execute(projectId: string): Promise<ProjectSnapshot> {
    const project = await findProjectOrThrow(this.repository, projectId);
    project.restore(this.clock.now());
    await this.repository.save(project);
    return project.snapshot();
  }
}

async function findProjectOrThrow(
  repository: ProjectRepository,
  projectId: string
): Promise<Project> {
  const project = await repository.findById(projectId);

  if (project === null) {
    throw new ProjectNotFoundError(projectId);
  }

  return project;
}
