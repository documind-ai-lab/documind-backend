import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { Response } from "express";
import { DomainError } from "../domain/domain-error";

type ErrorDetail = {
  field?: string;
  message: string;
};

type ErrorResponse = {
  status: number;
  code: string;
  message: string;
  errors?: ErrorDetail[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const errorResponse = this.toErrorResponse(exception);

    response.status(errorResponse.status).json(errorResponse);
  }

  private toErrorResponse(exception: unknown): ErrorResponse {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "서버 오류가 발생했습니다."
    };
  }

  private fromHttpException(exception: HttpException): ErrorResponse {
    const status = exception.getStatus();

    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      return this.validationError(exception);
    }

    const responseBody = exception.getResponse();
    const message = this.extractMessage(responseBody, exception.message);

    return {
      status,
      code: this.codeForStatus(status),
      message
    };
  }

  private validationError(exception: HttpException): ErrorResponse {
    const responseBody = exception.getResponse();
    const errors = this.extractValidationErrors(responseBody);

    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "VALIDATION_ERROR",
      message: "요청 값이 올바르지 않습니다.",
      errors
    };
  }

  private extractValidationErrors(responseBody: string | object): ErrorDetail[] {
    if (typeof responseBody !== "object" || responseBody === null) {
      return [{ message: String(responseBody) }];
    }

    const messages = (responseBody as { message?: unknown }).message;

    if (!Array.isArray(messages)) {
      return [{ message: this.extractMessage(responseBody, "요청 값이 올바르지 않습니다.") }];
    }

    return messages.map((message) => this.toValidationDetail(message));
  }

  private toValidationDetail(message: unknown): ErrorDetail {
    if (typeof message !== "string") {
      return { message: "요청 값이 올바르지 않습니다." };
    }

    const field = message.includes(" ") ? message.slice(0, message.indexOf(" ")) : undefined;
    return { field, message };
  }

  private extractMessage(responseBody: string | object, fallback: string): string {
    if (typeof responseBody === "string") {
      return responseBody;
    }

    if (typeof responseBody === "object" && responseBody !== null) {
      const message = (responseBody as { message?: unknown }).message;

      if (typeof message === "string") {
        return message;
      }

      if (Array.isArray(message) && typeof message[0] === "string") {
        return message[0];
      }
    }

    return fallback;
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      default:
        return status >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR";
    }
  }
}
