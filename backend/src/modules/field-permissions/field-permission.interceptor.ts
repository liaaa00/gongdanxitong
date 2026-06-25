import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { from, map, mergeMap, Observable } from 'rxjs';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import {
  FIELD_PERMISSION_SCENARIO_KEY,
  FieldPermissionContext,
  FieldPermissionScenarioResolver,
} from './field-permission.decorator';
import { FieldPermissionMap, FieldPermissionService, FieldViewItem } from './field-permission.service';

interface RequestWithUser extends Request {
  user?: JwtUserPayload;
}

@Injectable()
export class FieldPermissionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly fieldPermissionService: FieldPermissionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const resolver = this.reflector.getAllAndOverride<FieldPermissionScenarioResolver>(
      FIELD_PERMISSION_SCENARIO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resolver || !request.user || request.user.roles.includes('admin')) {
      return next.handle();
    }

    if (resolver === 'dispatched:auto' && !request.params.moduleCode) {
      return next.handle().pipe(
        mergeMap(async (payload) => {
          const moduleCode = this.extractModuleCode(payload);
          if (!moduleCode) {
            return payload;
          }
          const permissions = await this.fieldPermissionService.getPermissionsForUser(
            request.user!.sub,
            `dispatched:${moduleCode}`,
          );
          return this.applyPayload(payload, permissions, 0);
        }),
      );
    }

    const scenarioPromise = this.resolveScenario(resolver, request);

    return from(scenarioPromise).pipe(
      mergeMap(async (scenario) => ({
        permissions: await this.fieldPermissionService.getPermissionsForUser(request.user!.sub, scenario),
      })),
      mergeMap(({ permissions }) => next.handle().pipe(map((payload) => this.applyPayload(payload, permissions, 0)))),
    );
  }

  private async resolveScenario(
    resolver: FieldPermissionScenarioResolver,
    request: RequestWithUser,
  ): Promise<string> {
    try {
      if (typeof resolver === 'string') {
        if (resolver === 'dispatched:auto' && request.params.moduleCode) {
          return `dispatched:${request.params.moduleCode}`;
        }
        return resolver;
      }

      const ctx: FieldPermissionContext = {
        params: request.params,
        query: request.query,
        body: request.body,
        user: request.user,
      };
      return await Promise.resolve(resolver(ctx));
    } catch {
      return 'main';
    }
  }

  private extractModuleCode(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.moduleCode === 'string') {
      return record.moduleCode;
    }
    if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
      return this.extractModuleCode(record.data);
    }
    return null;
  }

  private applyPayload(payload: unknown, permissions: FieldPermissionMap, depth: number): unknown {
    if (payload === null || payload === undefined || depth > 4) {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.applyPayload(item, permissions, depth + 1));
    }

    if (typeof payload !== 'object') {
      return payload;
    }

    const cloned = { ...(payload as Record<string, unknown>) };

    if (this.isApiResponse(cloned)) {
      cloned.data = this.applyPayload(cloned.data, permissions, depth + 1);
      return cloned;
    }

    if (cloned.extraData && typeof cloned.extraData === 'object' && !Array.isArray(cloned.extraData)) {
      const result = this.fieldPermissionService.applyExtraData(
        cloned.extraData as Record<string, unknown>,
        permissions,
      );
      cloned.extraData = result.data;
      cloned.readonlyFields = result.readonlyFields;
      cloned._fieldPermissions = this.toPermissionRecord(permissions);
    }

    if (cloned.feedbackData && typeof cloned.feedbackData === 'object' && !Array.isArray(cloned.feedbackData)) {
      const result = this.fieldPermissionService.applyExtraData(
        cloned.feedbackData as Record<string, unknown>,
        permissions,
      );
      cloned.feedbackData = result.data;
      cloned._fieldPermissions = this.toPermissionRecord(permissions);
    }

    if (Array.isArray(cloned.fields)) {
      cloned.fields = this.fieldPermissionService.applyFieldViews(
        cloned.fields as FieldViewItem[],
        permissions,
      );
      cloned._fieldPermissions = this.toPermissionRecord(permissions);
    }

    for (const key of ['items', 'list', 'dispatchedOrders', 'children']) {
      if (Array.isArray(cloned[key])) {
        cloned[key] = (cloned[key] as unknown[]).map((item) => this.applyPayload(item, permissions, depth + 1));
      }
    }

    return cloned;
  }

  private isApiResponse(record: Record<string, unknown>): boolean {
    return (
      typeof record.code === 'number' &&
      Object.prototype.hasOwnProperty.call(record, 'data') &&
      typeof record.message === 'string'
    );
  }

  private toPermissionRecord(permissions: FieldPermissionMap): Record<string, string> {
    return Object.fromEntries(permissions.entries());
  }
}
