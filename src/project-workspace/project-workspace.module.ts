import { Module } from "@nestjs/common";
import { CLOCK, Clock, SystemClock } from "../shared/application/clock";
import { ID_GENERATOR, IdGenerator, UuidV7Generator } from "../shared/application/id-generator";
import {
  DemoOwnerProvider,
  OWNER_PROVIDER,
  OwnerProvider
} from "../shared/application/owner-provider";
import { loadEnv } from "../shared/infrastructure/env";
import { PROJECT_REPOSITORY, ProjectRepository } from "./application/project.repository";
import {
  ArchiveProjectUseCase,
  CreateProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  RestoreProjectUseCase,
  UpdateProjectUseCase
} from "./application/project.use-cases";
import { PrismaProjectRepository } from "./infrastructure/prisma-project.repository";
import { ProjectController } from "./interface/project.controller";

@Module({
  controllers: [ProjectController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    {
      provide: OWNER_PROVIDER,
      useFactory: () => new DemoOwnerProvider(loadEnv().demoOwnerId)
    },
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
    {
      provide: CreateProjectUseCase,
      useFactory: (
        repository: ProjectRepository,
        clock: Clock,
        idGenerator: IdGenerator,
        ownerProvider: OwnerProvider
      ) =>
        new CreateProjectUseCase(repository, clock, idGenerator, ownerProvider),
      inject: [PROJECT_REPOSITORY, CLOCK, ID_GENERATOR, OWNER_PROVIDER]
    },
    {
      provide: ListProjectsUseCase,
      useFactory: (repository: ProjectRepository) => new ListProjectsUseCase(repository),
      inject: [PROJECT_REPOSITORY]
    },
    {
      provide: GetProjectUseCase,
      useFactory: (repository: ProjectRepository) => new GetProjectUseCase(repository),
      inject: [PROJECT_REPOSITORY]
    },
    {
      provide: UpdateProjectUseCase,
      useFactory: (repository: ProjectRepository, clock: Clock) =>
        new UpdateProjectUseCase(repository, clock),
      inject: [PROJECT_REPOSITORY, CLOCK]
    },
    {
      provide: ArchiveProjectUseCase,
      useFactory: (repository: ProjectRepository, clock: Clock) =>
        new ArchiveProjectUseCase(repository, clock),
      inject: [PROJECT_REPOSITORY, CLOCK]
    },
    {
      provide: RestoreProjectUseCase,
      useFactory: (repository: ProjectRepository, clock: Clock) =>
        new RestoreProjectUseCase(repository, clock),
      inject: [PROJECT_REPOSITORY, CLOCK]
    }
  ]
})
export class ProjectWorkspaceModule {}
