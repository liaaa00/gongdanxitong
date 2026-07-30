import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { AUDIT_KEY, AuditMetadata } from 'src/common/decorators/audit.decorator';
import { OperationLog } from 'src/entities';
import { RequestWithTraceId } from 'src/common/middleware/trace-id.middleware';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithTraceId & Request & { user?: JwtUserPayload }>();
    const beforeData = this.truncatePayload({
      params: request.params,
      query: request.query,
      body: request.body,
    });

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.writeAuditLog(metadata, request, beforeData, result).catch((error: unknown) => {
            this.logger.error('audit log write failed', error instanceof Error ? error.stack : String(error));
          });
        },
      }),
    );
  }

  private async writeAuditLog(
    metadata: AuditMetadata,
    request: RequestWithTraceId & Request & { user?: JwtUserPayload },
    beforeData: Record<string, unknown>,
    result: unknown,
  ): Promise<void> {
    const operationLogRepository = this.dataSource.getRepository(OperationLog);
    const log = operationLogRepository.create({
      entityType: metadata.entityType,
      entityId: this.resolveEntityId(request.params),
      userId: request.user?.sub ?? null,
      actionType: metadata.actionType,
      beforeData,
      afterData: this.truncatePayload(result),
      ipAddress: request.ip ?? null,
    });

    await operationLogRepository.save(log);
  }

  private resolveEntityId(params: Record<string, string | undefined>): string {
    return params.id ?? params.userRoleId ?? '00000000-0000-0000-0000-000000000000';
  }

  private truncatePayload(payload: unknown): Record<string, unknown> {
    const serialized = JSON.stringify(payload ?? null);
    const limited = serialized.length > 32000 ? `${serialized.slice(0, 32000)}...[truncated]` : serialized;

    return {
      content: limited,
      truncated: serialized.length > 32000,
    };
  }
}
