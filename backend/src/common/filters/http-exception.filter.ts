import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
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
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithTraceId & Request>();

    const typeOrmError = this.getTypeOrmError(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeOrmError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const traceId = request.traceId ?? 'req_unknown';
      const where = `${request.method} ${request.url}`;
      const stack = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`[${traceId}] ${where} -> ${status}\n${stack}`);
    }

    const normalized =
      exception instanceof HttpException
        ? this.normalizeResponse(exception.getResponse())
        : typeOrmError
          ? { message: typeOrmError.message }
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

  private getTypeOrmError(exception: unknown): { status: HttpStatus; message: string } | undefined {
    if (!(exception instanceof QueryFailedError)) {
      return undefined;
    }
    const driverError = exception.driverError as { code?: string; message?: string } | undefined;
    const code = driverError?.code;
    const message = driverError?.message ?? '';
    if (code === '22P02') {
      if (message.includes('invalid input value for enum')) {
        return { status: HttpStatus.BAD_REQUEST, message: '数据库状态枚举缺失或状态值不合法，请先执行数据库迁移/初始化脚本' };
      }
      return { status: HttpStatus.NOT_FOUND, message: '资源不存在' };
    }
    if (code?.startsWith('23')) {
      return { status: HttpStatus.BAD_REQUEST, message: '请求参数错误' };
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
