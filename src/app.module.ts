import { Module } from "@nestjs/common";
import { ChatWorkspaceModule } from "./chat-workspace/chat-workspace.module";
import { DocumentWorkspaceModule } from "./document-workspace/document-workspace.module";
import { ProjectWorkspaceModule } from "./project-workspace/project-workspace.module";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module";

@Module({ imports: [PrismaModule, ProjectWorkspaceModule, DocumentWorkspaceModule, ChatWorkspaceModule] })
export class AppModule {}
