import { Module } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import {
  APPLICATION_LOGGER,
  ApplicationLogger
} from "../shared/application/application-logger";
import { CLOCK, Clock, SystemClock } from "../shared/application/clock";
import { ID_GENERATOR, IdGenerator, UuidV7Generator } from "../shared/application/id-generator";
import { loadEnv } from "../shared/infrastructure/env";
import { NestApplicationLogger } from "../shared/infrastructure/nest-application-logger";
import { DOCUMENT_STORAGE, DocumentStorage } from "./application/document-storage";
import { DOCUMENT_TEXT_REPOSITORY, DocumentTextRepository } from "./application/document-text.repository";
import { DocumentFilePolicy } from "./application/document-file-policy";
import { ORPHAN_DOCUMENT_STORAGE, OrphanDocumentStorage } from "./application/orphan-document-storage";
import {
  DOCUMENT_SECURITY_SCANNER,
  DocumentSecurityScanner
} from "./application/document-security-scanner";
import {
  PROJECT_DOCUMENT_SUMMARY_UPDATER,
  ProjectDocumentSummaryUpdater
} from "./application/project-document-summary-updater";
import { DOCUMENT_REPOSITORY, DocumentRepository } from "./application/document.repository";
import { PROJECT_ACCESS_CHECKER, ProjectAccessChecker } from "./application/project-access-checker";
import {
  CleanupOrphanDocumentsUseCase,
  CompleteTextExtractionUseCase,
  FailTextExtractionUseCase,
  GetDocumentUseCase,
  ListDocumentsUseCase,
  RetryDocumentUseCase,
  StartTextExtractionUseCase,
  UploadDocumentUseCase
} from "./application/document.use-cases";
import { DocumentController } from "./interface/document.controller";
import { LocalDocumentStorage } from "./infrastructure/local-document-storage";
import { NoopDocumentSecurityScanner } from "./infrastructure/noop-document-security-scanner";
import { OrphanDocumentCleanupScheduler } from "./infrastructure/orphan-document-cleanup-scheduler";
import { PrismaDocumentRepository } from "./infrastructure/prisma-document.repository";
import { PrismaDocumentTextRepository } from "./infrastructure/prisma-document-text.repository";
import { PrismaOrphanDocumentStorage } from "./infrastructure/prisma-orphan-document-storage";
import { PrismaProjectAccessChecker } from "./infrastructure/prisma-project-access-checker";
import { S3DocumentStorage } from "./infrastructure/s3-document-storage";
import { PrismaProjectDocumentSummaryUpdater } from "../project-workspace/infrastructure/prisma-project-document-summary-updater";

@Module({
  controllers: [DocumentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    { provide: APPLICATION_LOGGER, useClass: NestApplicationLogger },
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: DOCUMENT_TEXT_REPOSITORY, useClass: PrismaDocumentTextRepository },
    {
      provide: DOCUMENT_STORAGE,
      useFactory: () => {
        const env = loadEnv();

        if (env.documentStorageProvider === "local") {
          if (env.documentStorageBasePath === null) {
            throw new Error("DOCUMENT_STORAGE_BASE_PATH 환경 변수가 필요합니다.");
          }

          return new LocalDocumentStorage(env.documentStorageBasePath);
        }

        if (env.documentStorageS3 === null) {
          throw new Error("S3 문서 저장소 환경 변수가 필요합니다.");
        }

        return new S3DocumentStorage(
          new S3Client({
            region: env.documentStorageS3.region,
            endpoint: env.documentStorageS3.endpoint ?? undefined,
            forcePathStyle: env.documentStorageS3.forcePathStyle
          }),
          { bucket: env.documentStorageS3.bucket }
        );
      }
    },
    { provide: DOCUMENT_SECURITY_SCANNER, useClass: NoopDocumentSecurityScanner },
    { provide: ORPHAN_DOCUMENT_STORAGE, useClass: PrismaOrphanDocumentStorage },
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
        securityScanner: DocumentSecurityScanner,
        filePolicy: DocumentFilePolicy,
        clock: Clock,
        idGenerator: IdGenerator,
        logger: ApplicationLogger
      ) =>
        new UploadDocumentUseCase(
          repository,
          storage,
          orphanStorage,
          accessChecker,
          summaryUpdater,
          securityScanner,
          filePolicy,
          loadEnv().documentStorageProvider,
          clock,
          idGenerator,
          logger
        ),
      inject: [
        DOCUMENT_REPOSITORY,
        DOCUMENT_STORAGE,
        ORPHAN_DOCUMENT_STORAGE,
        PROJECT_ACCESS_CHECKER,
        PROJECT_DOCUMENT_SUMMARY_UPDATER,
        DOCUMENT_SECURITY_SCANNER,
        DocumentFilePolicy,
        CLOCK,
        ID_GENERATOR,
        APPLICATION_LOGGER
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
    },
    {
      provide: StartTextExtractionUseCase,
      useFactory: (
        repository: DocumentRepository,
        accessChecker: ProjectAccessChecker,
        clock: Clock
      ) => new StartTextExtractionUseCase(repository, accessChecker, clock),
      inject: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER, CLOCK]
    },
    {
      provide: CompleteTextExtractionUseCase,
      useFactory: (
        repository: DocumentRepository,
        documentTextRepository: DocumentTextRepository,
        accessChecker: ProjectAccessChecker,
        clock: Clock,
        idGenerator: IdGenerator
      ) =>
        new CompleteTextExtractionUseCase(
          repository,
          documentTextRepository,
          accessChecker,
          clock,
          idGenerator
        ),
      inject: [DOCUMENT_REPOSITORY, DOCUMENT_TEXT_REPOSITORY, PROJECT_ACCESS_CHECKER, CLOCK, ID_GENERATOR]
    },
    {
      provide: FailTextExtractionUseCase,
      useFactory: (
        repository: DocumentRepository,
        accessChecker: ProjectAccessChecker,
        clock: Clock
      ) => new FailTextExtractionUseCase(repository, accessChecker, clock),
      inject: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER, CLOCK]
    },
    {
      provide: CleanupOrphanDocumentsUseCase,
      useFactory: (
        storage: DocumentStorage,
        orphanStorage: OrphanDocumentStorage,
        clock: Clock,
        logger: ApplicationLogger
      ) => {
        const env = loadEnv();
        return new CleanupOrphanDocumentsUseCase(storage, orphanStorage, clock, logger, {
          batchSize: env.orphanDocumentCleanupBatchSize,
          retryDelayMs: env.orphanDocumentCleanupRetryDelayMs
        });
      },
      inject: [DOCUMENT_STORAGE, ORPHAN_DOCUMENT_STORAGE, CLOCK, APPLICATION_LOGGER]
    },
    {
      provide: OrphanDocumentCleanupScheduler,
      useFactory: (
        cleanupUseCase: CleanupOrphanDocumentsUseCase,
        logger: ApplicationLogger
      ) => {
        const env = loadEnv();
        return new OrphanDocumentCleanupScheduler(cleanupUseCase, logger, {
          enabled: env.orphanDocumentCleanupEnabled,
          intervalMs: env.orphanDocumentCleanupIntervalMs
        });
      },
      inject: [CleanupOrphanDocumentsUseCase, APPLICATION_LOGGER]
    }
  ],
  exports: [DOCUMENT_REPOSITORY, PROJECT_ACCESS_CHECKER, PROJECT_DOCUMENT_SUMMARY_UPDATER]
})
export class DocumentWorkspaceModule {}
