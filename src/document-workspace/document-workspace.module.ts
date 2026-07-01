import { Module } from "@nestjs/common";
import { CLOCK, Clock, SystemClock } from "../shared/application/clock";
import { ID_GENERATOR, IdGenerator, UuidV7Generator } from "../shared/application/id-generator";
import { loadEnv } from "../shared/infrastructure/env";
import { DOCUMENT_STORAGE, DocumentStorage } from "./application/document-storage";
import { DocumentFilePolicy } from "./application/document-file-policy";
import { ORPHAN_DOCUMENT_STORAGE, OrphanDocumentStorage } from "./application/orphan-document-storage";
import {
  PROJECT_DOCUMENT_SUMMARY_UPDATER,
  ProjectDocumentSummaryUpdater
} from "./application/project-document-summary-updater";
import { DOCUMENT_REPOSITORY, DocumentRepository } from "./application/document.repository";
import { PROJECT_ACCESS_CHECKER, ProjectAccessChecker } from "./application/project-access-checker";
import {
  GetDocumentUseCase,
  ListDocumentsUseCase,
  RetryDocumentUseCase,
  UploadDocumentUseCase
} from "./application/document.use-cases";
import { DocumentController } from "./interface/document.controller";
import { LocalDocumentStorage } from "./infrastructure/local-document-storage";
import { NoopOrphanDocumentStorage } from "./infrastructure/noop-orphan-document-storage";
import { PrismaDocumentRepository } from "./infrastructure/prisma-document.repository";
import { PrismaProjectAccessChecker } from "./infrastructure/prisma-project-access-checker";
import { PrismaProjectDocumentSummaryUpdater } from "../project-workspace/infrastructure/prisma-project-document-summary-updater";

@Module({
  controllers: [DocumentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    {
      provide: DOCUMENT_STORAGE,
      useFactory: () => new LocalDocumentStorage(loadEnv().documentStorageBasePath)
    },
    { provide: ORPHAN_DOCUMENT_STORAGE, useClass: NoopOrphanDocumentStorage },
    { provide: PROJECT_ACCESS_CHECKER, useClass: PrismaProjectAccessChecker },
    {
      provide: PROJECT_DOCUMENT_SUMMARY_UPDATER,
      useClass: PrismaProjectDocumentSummaryUpdater
    },
    {
      provide: DocumentFilePolicy,
      useFactory: () => new DocumentFilePolicy({ maxFileBytes: loadEnv().documentMaxFileBytes })
    },
    {
      provide: UploadDocumentUseCase,
      useFactory: (
        repository: DocumentRepository,
        storage: DocumentStorage,
        orphanStorage: OrphanDocumentStorage,
        accessChecker: ProjectAccessChecker,
        summaryUpdater: ProjectDocumentSummaryUpdater,
        filePolicy: DocumentFilePolicy,
        clock: Clock,
        idGenerator: IdGenerator
      ) =>
        new UploadDocumentUseCase(
          repository,
          storage,
          orphanStorage,
          accessChecker,
          summaryUpdater,
          filePolicy,
          clock,
          idGenerator
        ),
      inject: [
        DOCUMENT_REPOSITORY,
        DOCUMENT_STORAGE,
        ORPHAN_DOCUMENT_STORAGE,
        PROJECT_ACCESS_CHECKER,
        PROJECT_DOCUMENT_SUMMARY_UPDATER,
        DocumentFilePolicy,
        CLOCK,
        ID_GENERATOR
      ]
    },
    {
      provide: ListDocumentsUseCase,
      useFactory: (repository: DocumentRepository, accessChecker: ProjectAccessChecker) =>
        new ListDocumentsUseCase(repository, accessChecker),
      inject: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER]
    },
    {
      provide: GetDocumentUseCase,
      useFactory: (repository: DocumentRepository, accessChecker: ProjectAccessChecker) =>
        new GetDocumentUseCase(repository, accessChecker),
      inject: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER]
    },
    {
      provide: RetryDocumentUseCase,
      useFactory: (
        repository: DocumentRepository,
        storage: DocumentStorage,
        accessChecker: ProjectAccessChecker,
        clock: Clock
      ) => new RetryDocumentUseCase(repository, storage, accessChecker, clock),
      inject: [DOCUMENT_REPOSITORY, DOCUMENT_STORAGE, PROJECT_ACCESS_CHECKER, CLOCK]
    }
  ],
  exports: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER, PROJECT_DOCUMENT_SUMMARY_UPDATER]
})
export class DocumentWorkspaceModule {}
