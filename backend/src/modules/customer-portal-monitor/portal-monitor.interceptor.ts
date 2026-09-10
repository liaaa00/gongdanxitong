import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { defer, lastValueFrom, Observable } from 'rxjs';
import { CustomerPortalAccountsService, PortalBusinessType } from '../customer-portal-accounts/customer-portal-accounts.service';
import { CustomerPortalMonitorService } from './customer-portal-monitor.service';
import { validMonitorToken } from './portal-monitor-auth';
import { portalMonitorContext } from './portal-monitor-context';

@Injectable()
export class PortalMonitorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PortalMonitorInterceptor.name);
  constructor(private readonly monitor: CustomerPortalMonitorService, private readonly accounts: CustomerPortalAccountsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const traceId = request.headers['x-portal-trace-id'];
    const path = String(request.path ?? request.url ?? '').split('?')[0];
    const match = /(?:^|\/)customer-portal\/(submit|import\/confirm|progress)$/.exec(path);
    if (request.method !== 'POST' || !match || !isUUID(String(traceId)) || !validMonitorToken(request.headers['x-connector-token'])) return next.handle();
    const businessType = ['onboarding', 'resignation', 'salary'].includes(request.body?.businessType) ? request.body.businessType as PortalBusinessType : undefined;
    const action = match[1] === 'progress' ? 'portal.progress' : match[1] === 'submit'
      ? businessType === 'salary' ? 'salary.submit' : `${businessType}.create_draft`
      : `${businessType}.import_confirm`;
    await this.monitor.backendStart(traceId, action, businessType, request.body?.requestId);
    return defer(async () => {
      try {
        const session = await this.accounts.session(request.body?.linkToken, businessType);
        await this.monitor.backendIdentity(traceId, session.customer.id, session.account.id);
        const result = await portalMonitorContext.run({ traceId, customerId: session.customer.id, accountId: session.account.id }, () => lastValueFrom(next.handle()));
        try { await this.monitor.backendResult(traceId, session.customer.id, result, action); }
        catch { this.logger.error('门户监控回执保存失败，已提交业务以数据库记录为准'); }
        return result;
      } catch (error) {
        try { await this.monitor.backendFailure(traceId); }
        catch { this.logger.error('门户监控失败回执保存失败'); }
        throw error;
      }
    });
  }
}
