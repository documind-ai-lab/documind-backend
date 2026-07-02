import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ApplicationLogger } from "../../shared/application/application-logger";
import { CleanupOrphanDocumentsUseCase } from "../application/document.use-cases";

export type OrphanDocumentCleanupSchedulerOptions = {
  enabled: boolean;
  intervalMs: number;
};

@Injectable()
export class OrphanDocumentCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly cleanupUseCase: Pick<CleanupOrphanDocumentsUseCase, "execute">,
    private readonly logger: ApplicationLogger,
    private readonly options: OrphanDocumentCleanupSchedulerOptions
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.executeCleanup();
    }, this.options.intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async executeCleanup(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.cleanupUseCase.execute();
    } catch (error) {
      this.logger.warn("고아 파일 자동 정리 실행 실패", {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.running = false;
    }
  }
}
