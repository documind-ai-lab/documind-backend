import { Logger } from "@nestjs/common";
import { ApplicationLogger } from "../application/application-logger";

export class NestApplicationLogger implements ApplicationLogger {
  private readonly logger = new Logger("DocuMind");

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (metadata === undefined) {
      this.logger.warn(message);
      return;
    }

    this.logger.warn(`${message} ${JSON.stringify(metadata)}`);
  }
}
