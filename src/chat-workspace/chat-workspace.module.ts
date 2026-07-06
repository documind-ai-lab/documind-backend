import { Module } from "@nestjs/common";
import {
  APPLICATION_LOGGER,
  ApplicationLogger
} from "../shared/application/application-logger";
import { CLOCK, Clock, SystemClock } from "../shared/application/clock";
import { ID_GENERATOR, IdGenerator, UuidV7Generator } from "../shared/application/id-generator";
import { NestApplicationLogger } from "../shared/infrastructure/nest-application-logger";
import { CHAT_ANSWER_GENERATOR, ChatAnswerGenerator } from "./application/chat-answer-generator";
import { CHAT_CONTEXT_READER, ChatContextReader } from "./application/chat-context-reader";
import {
  CHAT_PROJECT_ACCESS_CHECKER,
  ChatProjectAccessChecker
} from "./application/chat-project-access-checker";
import {
  CHAT_PROJECT_ACTIVITY_UPDATER,
  ChatProjectActivityUpdater
} from "./application/chat-project-activity-updater";
import { CHAT_REPOSITORY, ChatRepository } from "./application/chat.repository";
import { CreateChatMessageUseCase, ListChatMessagesUseCase } from "./application/chat.use-cases";
import { ChatController } from "./interface/chat.controller";
import { AiServiceChatAnswerGenerator } from "./infrastructure/ai-service-chat-answer-generator";
import { MockChatAnswerGenerator } from "./infrastructure/mock-chat-answer-generator";
import { PrismaChatContextReader } from "./infrastructure/prisma-chat-context-reader";
import { PrismaChatProjectAccessChecker } from "./infrastructure/prisma-chat-project-access-checker";
import { PrismaChatProjectActivityUpdater } from "./infrastructure/prisma-chat-project-activity-updater";
import { PrismaChatRepository } from "./infrastructure/prisma-chat.repository";
import { loadEnv } from "../shared/infrastructure/env";

@Module({
  controllers: [ChatController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    { provide: APPLICATION_LOGGER, useClass: NestApplicationLogger },
    { provide: CHAT_REPOSITORY, useClass: PrismaChatRepository },
    {
      provide: CHAT_ANSWER_GENERATOR,
      useFactory: () => {
        const env = loadEnv();

        if (env.chatAnswerGeneratorProvider === "mock") {
          return new MockChatAnswerGenerator();
        }

        return new AiServiceChatAnswerGenerator({
          baseUrl: env.aiServiceBaseUrl,
          timeoutMs: env.aiServiceTimeoutMs
        });
      }
    },
    { provide: CHAT_CONTEXT_READER, useClass: PrismaChatContextReader },
    { provide: CHAT_PROJECT_ACCESS_CHECKER, useClass: PrismaChatProjectAccessChecker },
    { provide: CHAT_PROJECT_ACTIVITY_UPDATER, useClass: PrismaChatProjectActivityUpdater },
    {
      provide: CreateChatMessageUseCase,
      useFactory: (
        repository: ChatRepository,
        answerGenerator: ChatAnswerGenerator,
        contextReader: ChatContextReader,
        accessChecker: ChatProjectAccessChecker,
        activityUpdater: ChatProjectActivityUpdater,
        clock: Clock,
        idGenerator: IdGenerator,
        logger: ApplicationLogger
      ) =>
        new CreateChatMessageUseCase(
          repository,
          answerGenerator,
          contextReader,
          accessChecker,
          activityUpdater,
          clock,
          idGenerator,
          logger
        ),
      inject: [
        CHAT_REPOSITORY,
        CHAT_ANSWER_GENERATOR,
        CHAT_CONTEXT_READER,
        CHAT_PROJECT_ACCESS_CHECKER,
        CHAT_PROJECT_ACTIVITY_UPDATER,
        CLOCK,
        ID_GENERATOR,
        APPLICATION_LOGGER
      ]
    },
    {
      provide: ListChatMessagesUseCase,
      useFactory: (repository: ChatRepository, accessChecker: ChatProjectAccessChecker) =>
        new ListChatMessagesUseCase(repository, accessChecker),
      inject: [CHAT_REPOSITORY, CHAT_PROJECT_ACCESS_CHECKER]
    }
  ],
  exports: [CHAT_REPOSITORY, CHAT_ANSWER_GENERATOR, CHAT_CONTEXT_READER]
})
export class ChatWorkspaceModule {}
