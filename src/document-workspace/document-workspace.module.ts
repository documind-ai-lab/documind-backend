import { Module } from "@nestjs/common";
import { PROJECT_DOCUMENT_SUMMARY_UPDATER } from "./application/project-document-summary-updater";
import { DOCUMENT_REPOSITORY } from "./application/document.repository";
import { PROJECT_ACCESS_CHECKER } from "./application/project-access-checker";
import { PrismaDocumentRepository } from "./infrastructure/prisma-document.repository";
import { PrismaProjectAccessChecker } from "./infrastructure/prisma-project-access-checker";
import { PrismaProjectDocumentSummaryUpdater } from "../project-workspace/infrastructure/prisma-project-document-summary-updater";

@Module({
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: PROJECT_ACCESS_CHECKER, useClass: PrismaProjectAccessChecker },
    {
      provide: PROJECT_DOCUMENT_SUMMARY_UPDATER,
      useClass: PrismaProjectDocumentSummaryUpdater
    }
  ],
  exports: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER, PROJECT_DOCUMENT_SUMMARY_UPDATER]
})
export class DocumentWorkspaceModule {}
