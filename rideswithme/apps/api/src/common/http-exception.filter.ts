import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type ApiErrorBody, ErrorCode } from '@rideswithme/shared-types';
import { AppException } from './app-exception';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.VALIDATION_FAILED,
  415: ErrorCode.VALIDATION_FAILED,
  422: ErrorCode.VALIDATION_FAILED,
  429: ErrorCode.RATE_LIMITED,
};

/** Turns every error into the standard `{ error: { code, message }, requestId }` body. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = typeof req.id === 'string' ? req.id : undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'] = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong',
    };

    if (exception instanceof AppException) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message };
      if (exception.details !== undefined) body.details = exception.details;
      if (exception.retryAfterSeconds !== undefined) {
        body.retryAfterSeconds = exception.retryAfterSeconds;
        res.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = {
        code:
          STATUS_TO_CODE[status] ??
          (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED),
        message: status === 400 ? 'Malformed request' : exception.message,
      };
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }
    const payload: ApiErrorBody = { error: body };
    if (requestId) payload.requestId = requestId;
    res.status(status).json(payload);
  }
}
