import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

interface RequestWithRoute extends Request {
  route: {
    path?: string;
  };
}

function getErrorStatus(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'getStatus' in error &&
    typeof error.getStatus === 'function'
  ) {
    return error.getStatus() as number;
  }

  return 500;
}

function getRouteLabel(request: RequestWithRoute): string {
  const routePath = request.route?.path;
  return typeof routePath === 'string' && routePath.length > 0
    ? routePath
    : 'unmatched';
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithRoute>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    let recorded = false;

    const record = (statusCode: number): void => {
      if (recorded) {
        return;
      }
      recorded = true;
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metricsService.recordHttpRequest({
        method: request.method.toUpperCase(),
        route: getRouteLabel(request),
        statusCode,
        durationSeconds,
      });
    };

    return next.handle().pipe(
      tap({
        complete: () => record(response.statusCode),
        error: (error: unknown) => record(getErrorStatus(error)),
      }),
    );
  }
}
