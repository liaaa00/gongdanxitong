import { BusinessScope, Customer, CustomerPortalAccount, CustomerPortalAccountLink, CustomerPortalRule, OperationLog, WorkOrderCompletionEmail } from 'src/entities';
import { PortalNotificationsService } from 'src/modules/portal-notifications/portal-notifications.service';
import { DEFAULT_PORTAL_NOTIFICATION_CONFIG } from 'src/modules/portal-notifications/portal-notification.config';

function setup() {
  const customers = [{ id: 'customer-a', customerName: '同名客户', isActive: true, businessScope: BusinessScope.BEILUN }, { id: 'customer-b', customerName: '同名客户', isActive: true, businessScope: BusinessScope.BEILUN }];
  const accounts = [
    { id: 'salary-a', customerId: 'customer-a', loginEmail: 'salary@example.test', businessPermissions: ['salary'], isActive: true, sessionVersion: 1 },
    { id: 'employees-a', customerId: 'customer-a', loginEmail: 'employees@example.test', businessPermissions: ['employee_changes'], isActive: true },
    { id: 'disabled-a', customerId: 'customer-a', loginEmail: 'disabled@example.test', businessPermissions: ['salary'], isActive: false },
    { id: 'salary-b', customerId: 'customer-b', loginEmail: 'other@example.test', businessPermissions: ['salary'], isActive: true },
  ];
  // 默认关联与迁移回填口径一致：每账号一条单成员主主体关联，旧单主体用例行为不变。
  const links: CustomerPortalAccountLink[] = accounts.map((account) => ({ accountId: account.id, customerId: account.customerId, isPrimary: true } as CustomerPortalAccountLink));
  const rules = customers.map((customer) => ({ customerId: customer.id, isActive: true, salaryRules: { billingDay: 15, reminderEnabled: true, payrollMonthMode: 'current' } }));
  const queue: WorkOrderCompletionEmail[] = [];
  const logs: any[] = [];
  let acquired = true;
  const select = (rows: any[], where: Record<string, any>) => rows.filter((row) => Object.entries(where).every(([key, value]) => value?.type === 'in' ? value.value.includes(row[key]) : row[key] === value));
  const mailRepo = {
    createQueryBuilder: jest.fn(() => {
      let value: any;
      const builder: any = { insert: () => builder, values: (input: any) => { value = input; return builder; }, orIgnore: () => builder, returning: () => builder, execute: async () => {
        if (queue.some((row) => row.deduplicationKey === value.deduplicationKey)) return { raw: [] };
        queue.push({ id: `mail-${queue.length}`, ...value });
        return { raw: [{ id: queue[queue.length - 1].id }] };
      } };
      return builder;
    }),
    findOne: jest.fn(async ({ where }: any) => queue.find((item) => item.id === where.id) ?? null),
    save: jest.fn(async (row) => row),
  };
  const manager: any = {
    query: jest.fn(async () => [{ acquired }]),
    getRepository: (entity: any) => {
      if (entity === WorkOrderCompletionEmail) return mailRepo;
      if (entity === OperationLog) return { create: (value: any) => value, save: async (value: any) => { logs.push(value); return value; } };
      if (entity === CustomerPortalAccountLink) return { find: async ({ where }: any) => select(links, where) };
      const rows = entity === Customer ? customers : entity === CustomerPortalAccount ? accounts : entity === CustomerPortalRule ? rules : [];
      return { find: async ({ where }: any) => select(rows, where) };
    },
  };
  const source: any = { transaction: async (fn: any) => fn(manager) };
  const settings = { get: jest.fn(async () => ({ settings: { ...DEFAULT_PORTAL_NOTIFICATION_CONFIG }, calendar: {} })) };
  const eligibility = { salarySubmitted: jest.fn(async (_customerId: string, _month: string, _manager: any) => false), staffRecipients: jest.fn(async (_customerId: string, _manager: any) => ['business@example.test']), evaluate: jest.fn(async (_row: any, _now: any, _manager: any): Promise<{ recipients: string[]; cancelReason?: string }> => ({ recipients: ['current@example.test'] })) };
  return { service: new PortalNotificationsService(source, settings as any, eligibility as any), queue, manager, customers, accounts, links, rules, settings, eligibility, mailRepo, logs, loseLock: () => { acquired = false; } };
}

describe('PortalNotificationsService', () => {
  it('queues monthly notices only for active salary accounts and remains idempotent per customer UUID', async () => {
    const h = setup();
    h.eligibility.salarySubmitted.mockResolvedValue(true);
    const now = new Date('2026-09-01T01:00:00Z');
    expect((await h.service.runDue(now)).queued).toBe(2);
    expect((await h.service.runDue(now)).queued).toBe(0);
    expect(h.queue.map((row) => row.toRecipients)).toEqual([['salary@example.test'], ['other@example.test']]);
    expect(h.queue.every((row) => row.notificationContext?.kind === 'salary_monthly')).toBe(true);
    expect(h.eligibility.salarySubmitted).not.toHaveBeenCalled();
  });
  it('queues one notice per subject for an account linked to multiple subjects, so the same account and month do not exclude each other', async () => {
    const h = setup();
    h.eligibility.salarySubmitted.mockResolvedValue(true);
    // 批次3：账号 salary-a 额外挂载 customer-b；同账号同月两个主体各自独立入队（dedup key 含主体段）。
    h.links.push({ accountId: 'salary-a', customerId: 'customer-b', isPrimary: false } as CustomerPortalAccountLink);
    const now = new Date('2026-09-01T01:00:00Z');
    expect((await h.service.runDue(now)).queued).toBe(3);
    const keys = h.queue.map((row) => row.deduplicationKey ?? '');
    expect(new Set(keys).size).toBe(3);
    expect(keys.filter((key) => key.includes(':customer-b:'))).toHaveLength(2);
    expect(keys.every((key) => key.startsWith('portal:monthly:'))).toBe(true);
    expect((await h.service.runDue(now)).queued).toBe(0);
  });
  it('queues 3 and 2 day reminders only for unsubmitted target periods', async () => {
    const h = setup();
    h.eligibility.salarySubmitted.mockImplementation(async (id) => id === 'customer-b');
    expect(await h.service.runDue(new Date('2026-09-10T01:00:00Z'))).toEqual({ queued: 1, alreadySubmitted: 1 });
    expect(h.queue[0]).toMatchObject({ customerId: 'customer-a', notificationContext: { kind: 'salary_reminder', offset: 3, salaryMonth: '2026-09' } });
    expect((await h.service.runDue(new Date('2026-09-11T01:00:00Z'))).queued).toBe(1);
    expect(h.queue[1].notificationContext!.offset).toBe(2);
  });
  it('escalates the final working-day reminder to assigned internal business users', async () => {
    const h = setup();
    h.eligibility.staffRecipients.mockImplementation(async (id) => id === 'customer-a' ? ['business@example.test'] : []);
    await h.service.runDue(new Date('2026-09-14T01:00:00Z'));
    expect(h.queue[0]).toMatchObject({ toRecipients: ['business@example.test'], notificationContext: { kind: 'salary_escalation', offset: 1 } });
    expect(h.queue[1]).toMatchObject({ status: 'failed', toRecipients: [], lastError: expect.stringContaining('业务员邮箱') });
  });
  it('calculates reminders in the previous year for early January billing and previous salary month', async () => {
    const h = setup();
    h.rules.forEach((rule) => { rule.salaryRules.billingDay = 1; rule.salaryRules.payrollMonthMode = 'previous'; });
    await h.service.runDue(new Date('2026-12-29T01:00:00Z'));
    expect(h.queue[0].notificationContext).toMatchObject({ billingDate: '2027-01-01', salaryMonth: '2026-12', offset: 3 });
  });
  it('does not queue before sendHour, with settings disabled, or when another instance holds the lock', async () => {
    const h = setup();
    await h.service.runDue(new Date('2026-09-01T00:00:00Z'));
    expect(h.queue).toHaveLength(0);
    h.settings.get.mockResolvedValue({ settings: { ...DEFAULT_PORTAL_NOTIFICATION_CONFIG, enabled: false }, calendar: {} });
    await h.service.runDue(new Date('2026-09-01T01:00:00Z'));
    expect(h.queue).toHaveLength(0);
    h.loseLock();
    h.settings.get.mockClear();
    await h.service.runDue(new Date('2026-09-01T01:00:00Z'));
    expect(h.settings.get).not.toHaveBeenCalled();
  });
  it('deduplicates account activation by account and version and stores no credentials', async () => {
    const h = setup();
    const account = { ...h.accounts[0], contactName: '联系人', sessionVersion: 1 };
    await h.service.enqueueAccountActivation(h.manager, account, h.customers[0] as Customer);
    await h.service.enqueueAccountActivation(h.manager, account, h.customers[0] as Customer);
    expect(h.queue).toHaveLength(1);
    expect(h.queue[0].bodySnapshot).toContain('安全渠道');
    expect(h.queue[0].notificationContext).not.toHaveProperty('password');
    await h.service.enqueueAccountActivation(h.manager, { ...account, sessionVersion: 3 }, h.customers[0] as Customer);
    expect(h.queue).toHaveLength(2);
  });
  it('allows manual retry only on a failed eligible notification, refreshes recipients and writes audit', async () => {
    const h = setup();
    await h.service.runDue(new Date('2026-09-01T01:00:00Z'));
    const row = h.queue[0];
    await expect(h.service.retry(row.id, 'operator')).rejects.toThrow('仅失败');
    row.status = 'failed'; row.attemptCount = 3;
    h.eligibility.evaluate.mockResolvedValueOnce({ recipients: [], cancelReason: '客户已提交' });
    await expect(h.service.retry(row.id, 'operator')).rejects.toThrow('客户已提交');
    expect(row.status).toBe('failed');
    await h.service.retry(row.id, 'operator');
    expect(row).toMatchObject({ status: 'pending', attemptCount: 0, toRecipients: ['current@example.test'] });
    expect(h.logs).toHaveLength(1);
    expect(h.mailRepo.findOne).toHaveBeenLastCalledWith({ where: { id: row.id }, lock: { mode: 'pessimistic_write' } });
  });
});
