import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessScope, Customer, CustomerPortalAccount, CustomerPortalRule, WorkOrderCompletionEmail } from 'src/entities';
import { PortalNotificationSettingsService } from './portal-notification-settings.service';
import { chinaDate, reminderDates, salaryPeriod } from './portal-notification.config';

const BUSINESS_ROLES = ['admin', 'biz_manager', 'business_owner', 'manager', 'biz_leader', 'business_group_leader', 'biz_member', 'business_group_member', 'salesperson'];

@Injectable()
export class PortalNotificationEligibilityService {
  constructor(private readonly dataSource: DataSource, private readonly settingsService: PortalNotificationSettingsService) {}

  async salarySubmitted(customerId: string, month: string, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    const rows = await manager.query(`SELECT 1 FROM customer_portal_submissions WHERE customer_id = $1 AND business_type = 'salary' AND fields->>'month' = $2 AND status IN ('received','completed') LIMIT 1`, [customerId, month]);
    return rows.length > 0;
  }

  async staffRecipients(customerId: string, manager: EntityManager = this.dataSource.manager): Promise<string[]> {
    const rows: Array<{ email: string }> = await manager.query(`SELECT DISTINCT u.email FROM customer_assignees ca
      JOIN users u ON u.id = ca.user_id AND u.is_active = true AND u.business_scope = $2
      WHERE ca.customer_id = $1 AND ca.business_scope = $2 AND ca.is_active = true AND u.email IS NOT NULL
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.is_active = true AND r.code = ANY($3::text[]))`, [customerId, BusinessScope.BEILUN, BUSINESS_ROLES]);
    return [...new Set(rows.map((row) => String(row.email).trim().toLowerCase()).filter((value) => isEmail(value)))];
  }

  async evaluate(task: WorkOrderCompletionEmail, now = new Date(), manager: EntityManager = this.dataSource.manager): Promise<{ recipients: string[]; cancelReason?: string; error?: string }> {
    const context = task.notificationContext;
    if (!context) return { recipients: task.toRecipients };
    const cancel = (reason: string) => ({ recipients: [] as string[], cancelReason: reason });
    const { settings, calendar } = await this.settingsService.get(manager);
    if (!settings.enabled) return cancel('自动通知已停用');
    const customer = await manager.getRepository(Customer).findOne({ where: { id: task.customerId, businessScope: BusinessScope.BEILUN, isActive: true } });
    if (!customer) return cancel('客户已停用或不在门户业务范围');
    const today = chinaDate(now);
    let account: CustomerPortalAccount | null = null;
    if (context.accountId) {
      account = await manager.getRepository(CustomerPortalAccount).findOne({ where: { id: context.accountId, customerId: task.customerId, isActive: true } });
      if (!account) return cancel('门户账号已停用');
      if (context.kind !== 'account_opened' && !account.businessPermissions.includes('salary')) return cancel('账号薪资权限已收回');
    }
    if (context.kind === 'account_opened') {
      if (!settings.accountNoticeEnabled) return cancel('账号开通通知已停用');
      if (!account || account.sessionVersion !== context.accountVersion || account.loginEmail !== context.loginEmail) return cancel('账号已使用或设置已变更，旧开通通知已取消');
      return { recipients: [account.loginEmail] };
    }
    const rule = await manager.getRepository(CustomerPortalRule).findOne({ where: { customerId: task.customerId, isActive: true } });
    if (!rule) return cancel('客户办理规则已停用');
    if (context.kind === 'salary_monthly') {
      if (!settings.monthlyEnabled || today.slice(0, 7) !== context.scheduledDate.slice(0, 7)) return cancel('月度通知已停用或已过所属收集月份');
      if (context.salaryMonth !== salaryPeriod(context.scheduledDate.slice(0, 7), rule.salaryRules?.payrollMonthMode)) return cancel('客户薪资所属期配置已变化');
      return account ? { recipients: [account.loginEmail] } : cancel('没有有效薪资账号');
    }
    if (!settings.reminderEnabled || rule.salaryRules?.reminderEnabled === false) return cancel('薪资催办已停用');
    if (!context.billingDate || !context.salaryMonth || context.billingDate.slice(8) !== String(rule.salaryRules?.billingDay).padStart(2, '0') || context.salaryMonth !== salaryPeriod(context.billingDate.slice(0, 7), rule.salaryRules?.payrollMonthMode)) return cancel('账单日或薪资所属期已变化');
    if (today !== context.scheduledDate || !reminderDates(context.billingDate, calendar).some((day) => day.date === today && day.offset === context.offset)) return cancel('提醒日期已过或工作日日历已变化');
    if (await this.salarySubmitted(task.customerId, context.salaryMonth, manager)) return cancel('客户已提交该所属期薪资，无需继续提醒');
    if (context.kind === 'salary_escalation') {
      const salaryAccounts = await manager.getRepository(CustomerPortalAccount).find({ where: { customerId: task.customerId, isActive: true } });
      if (!salaryAccounts.some((item) => item.businessPermissions.includes('salary'))) return cancel('客户已无有效薪资账号');
      const recipients = await this.staffRecipients(task.customerId, manager);
      return recipients.length ? { recipients } : { recipients, error: '客户未配置有效业务员邮箱，升级提醒未发送' };
    }
    return account ? { recipients: [account.loginEmail] } : cancel('没有有效薪资账号');
  }
}
