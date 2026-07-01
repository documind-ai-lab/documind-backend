export const APPLICATION_LOGGER = Symbol("APPLICATION_LOGGER");

export interface ApplicationLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
}
