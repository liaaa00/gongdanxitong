import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, In } from 'typeorm';
import { BusinessScope, Customer, CustomerPortalAccount, CustomerPortalRule, OperationLog, WorkOrderCompletionEmail } from 'src/entities';
import { PortalNotificationContext } from 'src/entities/work-order-completion-email.entity';
import { PortalNotificationSettingsService } from './portal-notification-settings.service';
import { PortalNotificationEligibilityService } from './portal-notification-eligibility.service';
import { chinaDate, PortalNotificationConfig, reminderDates, renderNotification, salaryPeriod, shiftMonth, validateDate } from './portal-notification.config';

@Injectable()
export class PortalNotificationsService {
  private readonly logger = new Logger(PortalNotificationsService.name);
  constructor(private readonly dataSource: DataSource, private readonly settingsService: PortalNotificationSettingsService, private readonly eligibility: PortalNotificationEligibilityService) {}

  async enqueueAccountActivation(manager: EntityManager, account: Pick<CustomerPortalAccount, 'id' | 'customerId' | 'sessionVersion' | 'loginEmail' | 'contactName' | 'businessPermissions' | 'isActive'>, customer: Customer): Promise<void> {
    const { settings } = await this.settingsService.get(manager);
    if (!account.isActive || !customer.isActive || customer.businessScope !== BusinessScope.BEILUN || !settings.enabled || !settings.accountNoticeEnabled) return;
    await this.enqueue(manager, settings, customer, { kind: 'account_opened', accountId: account.id, accountVersion: account.sessionVersion, loginEmail: account.loginEmail, scheduledDate: chinaDate() }, [account.loginEmail], {
      contact_name: account.contactName, login_email: account.loginEmail,
      permissions: [account.businessPermissions.some((value) => ['employee_changes', 'onboarding', 'resignation'].includes(value)) ? '增减员' : '', account.businessPermissions.includes('salary') ? '薪资' : ''].filter(Boolean).join('、'),
    }, `portal:account:${account.id}:${account.sessionVersion}`);
  }

  @Cron('0 */5 * * * *')
  async scheduled(): Promise<void> {
    try { await this.runDue(new Date()); } catch (error) { this.logger.error('门户自动通知生成失败，将在下次调度重试', error instanceof Error ? error.stack : String(error)); }
  }

  async runDue(now: Date): Promise<{ queued: number; alreadySubmitted: number }> {
    const today = chinaDate(now);
    const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }));
    return this.dataSource.transaction(async (manager) => {
      const lock = await manager.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [`portal-notifications:schedule:${today}`]);
      if (!lock[0]?.acquired) return { queued: 0, alreadySubmitted: 0 };
      const { settings, calendar } = await this.settingsService.get(manager);
      if (!settings.enabled || hour < settings.sendHour) return { queued: 0, alreadySubmitted: 0 };
      const customers = await manager.getRepository(Customer).find({ where: { isActive: true, businessScope: BusinessScope.BEILUN } });
      const stats = { queued: 0, alreadySubmitted: 0 };
      if (!customers.length) return stats;
      const rules = await manager.getRepository(CustomerPortalRule).find({ where: { customerId: In(customers.map((item) => item.id)), isActive: true } });
      const accounts = await manager.getRepository(CustomerPortalAccount).find({ where: { customerId: In(customers.map((item) => item.id)), isActive: true } });
      for (const customer of customers) {
        const rule = rules.find((item) => item.customerId === customer.id);
        const salaryAccounts = accounts.filter((item) => item.customerId === customer.id && item.businessPermissions.includes('salary'));
        if (!rule || !salaryAccounts.length) continue;
        if (settings.monthlyEnabled && today.endsWith('-01')) {
          const month = salaryPeriod(today.slice(0, 7), rule.salaryRules?.payrollMonthMode);
          for (const account of salaryAccounts) stats.queued += await this.enqueue(manager, settings, customer,
            { kind: 'salary_monthly', accountId: account.id, salaryMonth: month, scheduledDate: today }, [account.loginEmail], {}, `portal:monthly:${account.id}:${today.slice(0, 7)}`);
        }
        const billingDay = rule.salaryRules?.billingDay;
        if (!settings.reminderEnabled || rule.salaryRules?.reminderEnabled === false || !Number.isInteger(billingDay) || !billingDay || billingDay < 1 || billingDay > 28) continue;
        // Billing on the first days of a month has reminder days in the preceding month/year.
        for (const billingMonth of [today.slice(0, 7), shiftMonth(today.slice(0, 7), 1)]) {
          const billingDate = `${billingMonth}-${String(billingDay).padStart(2, '0')}`;
          const due = reminderDates(billingDate, calendar).find((day) => day.date === today);
          if (!due) continue;
          const month = salaryPeriod(billingMonth, rule.salaryRules?.payrollMonthMode);
          if (await this.eligibility.salarySubmitted(customer.id, month, manager)) { stats.alreadySubmitted += 1; continue; }
          if (due.offset === 1) {
            const recipients = await this.eligibility.staffRecipients(customer.id, manager);
            stats.queued += await this.enqueue(manager, settings, customer,
              { kind: 'salary_escalation', salaryMonth: month, billingDate, scheduledDate: today, offset: 1 }, recipients, {}, `portal:reminder:${customer.id}:${billingDate}:1:staff`);
          } else {
            for (const account of salaryAccounts) stats.queued += await this.enqueue(manager, settings, customer,
              { kind: 'salary_reminder', accountId: account.id, salaryMonth: month, billingDate, scheduledDate: today, offset: due.offset }, [account.loginEmail], {}, `portal:reminder:${account.id}:${billingDate}:${due.offset}`);
          }
        }
      }
      return stats;
    });
  }

  private async enqueue(manager: EntityManager, settings: PortalNotificationConfig, customer: Customer, context: PortalNotificationContext, recipients: string[], variables: Record<string, string>, key: string): Promise<number> {
    const content = renderNotification(settings, context.kind, {
      customer_name: customer.customerName, salary_month: context.salaryMonth ?? '', billing_date: context.billingDate ?? '', workdays_left: String(context.offset ?? ''), ...variables,
    });
    const result = await manager.getRepository(WorkOrderCompletionEmail).createQueryBuilder().insert().values({
      workOrderId: null, portalSubmissionId: null, attachmentIds: [], customerId: customer.id, completedVersion: 1,
      templateCode: `portal-${context.kind}`, templateVersion: 'v1', toRecipients: recipients, ccRecipients: [], replyTo: null,
      subject: content.subject, bodySnapshot: content.body, attachmentId: null, attachmentHash: null,
      status: recipients.length ? 'pending' : 'failed', attemptCount: 0, nextRetryAt: null,
      lastError: recipients.length ? null : '客户未配置有效业务员邮箱，升级提醒未发送', sentAt: null,
      deduplicationKey: key, notificationContext: context, claimToken: null,
    }).orIgnore().returning('id').execute();
    return Array.isArray(result.raw) ? result.raw.length : 0;
  }

  async listQueue(query: { customerId?: string; status?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    const builder = this.dataSource.getRepository(WorkOrderCompletionEmail).createQueryBuilder('mail').where('mail.notification_context IS NOT NULL');
    if (query.customerId) builder.andWhere('mail.customer_id = :customerId', { customerId: query.customerId });
    if (query.status) builder.andWhere('mail.status = :status', { status: query.status });
    const [list, total] = await builder.orderBy('mail.created_at', 'DESC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { list, total, page, pageSize };
  }

  async retry(id: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WorkOrderCompletionEmail);
      const row = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row?.notificationContext) throw new NotFoundException('自动通知不存在');
      if (row.status !== 'failed') throw new BadRequestException('仅失败通知可重试，已发送或已取消通知不能重复发送');
      const eligibility = await this.eligibility.evaluate(row, new Date(), manager);
      if (eligibility.cancelReason || eligibility.error) throw new BadRequestException(eligibility.cancelReason || eligibility.error);
      row.status = 'pending'; row.attemptCount = 0; row.nextRetryAt = null; row.lastError = null; row.claimToken = null; row.toRecipients = eligibility.recipients;
      await repo.save(row);
      const logs = manager.getRepository(OperationLog);
      await logs.save(logs.create({ entityType: 'portal_notification', entityId: id, userId, actionType: 'portal_notification_retry', beforeData: { status: 'failed' }, afterData: { status: 'pending' }, ipAddress: null }));
      return row;
    });
  }

  async calendarYear(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('年份须为2000至2100');
    const { calendar } = await this.settingsService.get();
    return { year, days: Object.entries(calendar).filter(([date]) => date.startsWith(String(year) + '-')).sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, ...value })) };
  }

  async previewSchedule(date: string, billingDay: number, payrollMonthMode: 'current' | 'previous') {
    validateDate(date);
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) throw new BadRequestException('账单日须为1至28');
    const { calendar } = await this.settingsService.get();
    const billingDate = `${date.slice(0, 7)}-${String(billingDay).padStart(2, '0')}`;
    return { billingDate, salaryMonth: salaryPeriod(date.slice(0, 7), payrollMonthMode), reminders: reminderDates(billingDate, calendar) };
  }
}
