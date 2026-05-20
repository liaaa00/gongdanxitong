import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { RequestWithTraceId } from 'src/common/middleware/trace-id.middleware';

interface ErrorResponseBody {
  code: number;
  data: null;
  message: string;
  details?: Record<string, unknown>;
  traceId: string;
}

interface NormalizedError {
  code?: number;
  message: string;
  details?: Record<string, unknown>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithTraceId & Request>();

    const typeOrmStatus = this.getTypeOrmStatus(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeOrmStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const normalized =
      exception instanceof HttpException
        ? this.normalizeResponse(exception.getResponse())
        : typeOrmStatus
          ? { message: typeOrmStatus === HttpStatus.NOT_FOUND ? '资源不存在' : '请求参数错误' }
          : { code: 1000, message: 'Internal server error' };

    const body: ErrorResponseBody = {
      code: normalized.code ?? status,
      data: null,
      message: normalized.message,
      traceId: request.traceId ?? 'req_unknown',
    };

    if (normalized.details) {
      body.details = normalized.details;
    }

    response.status(status).json(body);
  }

  private getTypeOrmStatus(exception: unknown): HttpStatus | undefined {
    if (!(exception instanceof QueryFailedError)) {
      return undefined;
    }
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    if (code === '22P02') {
      return HttpStatus.NOT_FOUND;
    }
    if (code?.startsWith('23')) {
      return HttpStatus.BAD_REQUEST;
    }
    return undefined;
  }

  private normalizeResponse(response: string | object): NormalizedError {
    if (typeof response === 'string') {
      return { message: response };
    }

    if (typeof response === 'object' && response !== null) {
      const record = response as Record<string, unknown>;
      const messageValue = record.message;
      const message = Array.isArray(messageValue)
        ? messageValue.join('; ')
        : typeof messageValue === 'string'
          ? messageValue
          : 'Request failed';

      const details =
        typeof record.details === 'object' && record.details !== null
          ? (record.details as Record<string, unknown>)
          : undefined;

      const rawCode = record.code;
      const code = typeof rawCode === 'number' ? rawCode : undefined;

      return { code, message, details };
    }

    return { message: 'Request failed' };
  }
}
