import { Module } from "@nestjs/common";
import { ProjectWorkspaceModule } from "./project-workspace/project-workspace.module";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module";

@Module({ imports: [PrismaModule, ProjectWorkspaceModule] })
export class AppModule {}
