import { BusinessScope, Customer, CustomerPortalAccount, CustomerPortalRule, WorkOrderCompletionEmail } from 'src/entities';
import { PortalNotificationEligibilityService } from 'src/modules/portal-notifications/portal-notification-eligibility.service';
import { DEFAULT_PORTAL_NOTIFICATION_CONFIG } from 'src/modules/portal-notifications/portal-notification.config';

function setup() {
  const customer = { id: 'customer', isActive: true, businessScope: BusinessScope.BEILUN };
  const account = { id: 'account', customerId: 'customer', isActive: true, loginEmail: 'current@example.test', sessionVersion: 1, businessPermissions: ['salary'] };
  const rule = { customerId: 'customer', isActive: true, salaryRules: { billingDay: 15, reminderEnabled: true, payrollMonthMode: 'current' } };
  let submitted = false;
  const manager: any = { getRepository: (type: any) => {
    const rows = type === Customer ? [customer] : type === CustomerPortalAccount ? [account] : type === CustomerPortalRule ? [rule] : [];
    const find = ({ where }: any) => rows.filter((row) => Object.entries(where).every(([key, value]) => (row as any)[key] === value));
    return { findOne: async (query: any) => find(query)[0] ?? null, find: async (query: any) => find(query) };
  }, query: jest.fn(async (sql: string) => sql.includes('customer_portal_submissions') ? submitted ? [{}] : [] : [{ email: 'Business@Example.test' }, { email: ' business@example.test ' }, { email: 'invalid' }]) };
  const settings = { get: jest.fn(async () => ({ settings: DEFAULT_PORTAL_NOTIFICATION_CONFIG, calendar: {} })) };
  const source: any = { manager };
  const service = new PortalNotificationEligibilityService(source, settings as any);
  const task = { toRecipients: ['old@example.test'], customerId: 'customer', notificationContext: { kind: 'salary_reminder', accountId: 'account', salaryMonth: '2026-09', billingDate: '2026-09-15', scheduledDate: '2026-09-10', offset: 3 } } as WorkOrderCompletionEmail;
  return { service, manager, customer, account, rule, task, settings, submit: () => { submitted = true; } };
}

describe('PortalNotificationEligibilityService', () => {
  const now = new Date('2026-09-10T01:00:00Z');
  it('uses the current mailbox and cancels reminders after salary is submitted', async () => {
    const h = setup();
    await expect(h.service.evaluate(h.task, now)).resolves.toEqual({ recipients: ['current@example.test'] });
    h.submit();
    await expect(h.service.evaluate(h.task, now)).resolves.toMatchObject({ cancelReason: expect.stringContaining('客户已提交') });
    expect(h.manager.query).toHaveBeenCalledWith(expect.stringContaining("status IN ('received','completed')"), ['customer', '2026-09']);
  });
  it('cancels when salary permissions or customer activation are withdrawn', async () => {
    const h = setup();
    h.account.businessPermissions = ['employee_changes'];
    await expect(h.service.evaluate(h.task, now)).resolves.toMatchObject({ cancelReason: expect.stringContaining('薪资权限') });
    h.account.businessPermissions = ['salary']; h.customer.isActive = false;
    await expect(h.service.evaluate(h.task, now)).resolves.toMatchObject({ cancelReason: expect.stringContaining('客户已停用') });
  });
  it('cancels stale or reconfigured reminders rather than sending a wrong date or period', async () => {
    const h = setup();
    await expect(h.service.evaluate(h.task, new Date('2026-09-11T01:00:00Z'))).resolves.toMatchObject({ cancelReason: expect.stringContaining('提醒日期') });
    h.rule.salaryRules.billingDay = 20;
    await expect(h.service.evaluate(h.task, now)).resolves.toMatchObject({ cancelReason: expect.stringContaining('账单日') });
  });
  it('suppresses old account activation notices when session or email has changed', async () => {
    const h = setup();
    h.task.notificationContext = { kind: 'account_opened', accountId: 'account', accountVersion: 1, loginEmail: 'current@example.test', scheduledDate: '2026-09-10' };
    await expect(h.service.evaluate(h.task, now)).resolves.toEqual({ recipients: ['current@example.test'] });
    h.account.sessionVersion = 2;
    await expect(h.service.evaluate(h.task, now)).resolves.toMatchObject({ cancelReason: expect.stringContaining('旧开通通知') });
  });
  it('monthly collection remains universal even for already submitted salary, within that collection month', async () => {
    const h = setup(); h.submit();
    h.task.notificationContext = { kind: 'salary_monthly', accountId: 'account', salaryMonth: '2026-09', scheduledDate: '2026-09-01' };
    await expect(h.service.evaluate(h.task, now)).resolves.toEqual({ recipients: ['current@example.test'] });
    await expect(h.service.evaluate(h.task, new Date('2026-10-01T01:00:00Z'))).resolves.toMatchObject({ cancelReason: expect.stringContaining('收集月份') });
  });
  it('selects valid distinct scoped business-assignee mailboxes for escalation', async () => {
    const h = setup();
    await expect(h.service.staffRecipients('customer')).resolves.toEqual(['business@example.test']);
    expect(h.manager.query).toHaveBeenCalledWith(expect.stringContaining('ca.is_active = true'), ['customer', BusinessScope.BEILUN, expect.arrayContaining(['biz_member'])]);
  });
});
