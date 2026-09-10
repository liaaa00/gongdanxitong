import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'node:crypto';
import { BusinessScope, Customer, CustomerPortalAccount } from 'src/entities';
import { CustomerPortalAccountsService, PortalBusinessPermission } from 'src/modules/customer-portal-accounts/customer-portal-accounts.service';

const ALL_PERMISSIONS: PortalBusinessPermission[] = ['employee_changes', 'salary'];
const SECRET = 'portal-test-secret-which-is-longer-than-32-characters';
const ACCOUNT_INPUT = { loginEmail: 'portal@example.test', contactName: '联系人', password: 'Password123', businessPermissions: ALL_PERMISSIONS, mustChangePassword: false };
const COMPLETE_RULE = {
  isActive: true,
  onboardingDefaults: { contract_subject: '测试主体' },
  resignationDefaults: { need_resignation_cert: '否' },
  salaryRules: { billingDay: 20 },
  sharedEmailRules: { mailbox: 'shared@example.test' },
};

function makeCustomer(id: string, isActive = true): Customer {
  return {
    id,
    businessScope: BusinessScope.BEILUN,
    customerCode: id === 'customer-1' ? 'CUST001' : 'CUST002',
    customerName: id === 'customer-1' ? '测试客户一' : '测试客户二',
    isActive,
    createdAt: new Date('2026-09-08T00:00:00Z'),
    branches: [],
    assignees: [],
    workOrders: [],
  };
}

function makeService(customerRows = [makeCustomer('customer-1'), makeCustomer('customer-2')], portalRule: Record<string, unknown> | null = COMPLETE_RULE) {
  const accounts: CustomerPortalAccount[] = [];
  let sequence = 0;
  const accountRepository: any = {
    create: jest.fn((value) => ({ ...value })),
    save: jest.fn(async (value: CustomerPortalAccount) => {
      const now = new Date('2026-09-08T01:00:00Z');
      const row = value as CustomerPortalAccount;
      if (!row.id) row.id = `account-${++sequence}`;
      row.createdAt ||= now;
      row.updatedAt = now;
      const index = accounts.findIndex((item) => item.id === row.id);
      if (index >= 0) accounts[index] = row; else accounts.push(row);
      return row;
    }),
    update: jest.fn(async (where: Record<string, unknown>, changes: Partial<CustomerPortalAccount>) => {
      const row = accounts.find((item) => Object.entries(where).every(([key, value]) => (item as any)[key] === value));
      if (!row) return { affected: 0 };
      Object.assign(row, changes);
      return { affected: 1 };
    }),
    find: jest.fn(async ({ where }: any) => accounts.filter((item) => item.customerId === where.customerId)),
    findOne: jest.fn(async ({ where, relations }: any) => {
      const row = accounts.find((item) => Object.entries(where).every(([key, value]) => (item as any)[key] === value));
      if (!row) return null;
      if (relations?.customer) return { ...row, customer: customerRows.find((item) => item.id === row.customerId) };
      return { ...row };
    }),
  };
  const customerRepository: any = {
    findOne: jest.fn(async ({ where }: any) => customerRows.find((item) => item.id === where.id) || null),
  };
  const configService: any = { get: jest.fn(() => SECRET) };
  const ruleRepository = {
    findOne: jest.fn(async (): Promise<Record<string, unknown> | null> => portalRule ? { isActive: true, ...portalRule } : null),
  };
  const notifications = { enqueueAccountActivation: jest.fn(async (..._args: unknown[]) => undefined) };
  accountRepository.manager = {
    transaction: jest.fn(async (callback) => {
      const before = accounts.map((account) => ({ ...account }));
      try { return await callback({ getRepository: () => accountRepository }); }
      catch (error) { accounts.splice(0, accounts.length, ...before); throw error; }
    }),
  };
  return {
    service: new CustomerPortalAccountsService(accountRepository, customerRepository, configService, ruleRepository as any, notifications as any),
    notifications,
    accounts,
    accountRepository,
    ruleRepository,
  };
}

function decodeToken(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

describe('CustomerPortalAccountsService', () => {
  it('atomically queues activation without any password, and only queues again upon reactivation', async () => {
    const { service, notifications, accountRepository } = makeService();
    const created = await service.create('customer-1', ACCOUNT_INPUT);
    expect(accountRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(notifications.enqueueAccountActivation).toHaveBeenCalledTimes(1);
    expect(notifications.enqueueAccountActivation.mock.calls[0][1]).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(notifications.enqueueAccountActivation.mock.calls)).not.toContain(ACCOUNT_INPUT.password);
    await service.update('customer-1', created.id, { contactName: '新联系人' });
    await service.update('customer-1', created.id, { isActive: false });
    expect(notifications.enqueueAccountActivation).toHaveBeenCalledTimes(1);
    await service.update('customer-1', created.id, { isActive: true });
    expect(notifications.enqueueAccountActivation).toHaveBeenCalledTimes(2);
    expect(notifications.enqueueAccountActivation.mock.calls[1][1]).toMatchObject({ id: created.id, sessionVersion: 4 });
  });

  it('does not leave an active account committed when durable activation enqueue fails', async () => {
    const { service, notifications, accounts } = makeService();
    notifications.enqueueAccountActivation.mockRejectedValueOnce(new Error('queue unavailable') as never);
    await expect(service.create('customer-1', ACCOUNT_INPUT)).rejects.toThrow('queue unavailable');
    expect(accounts).toHaveLength(0);
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, isActive: false });
    expect(notifications.enqueueAccountActivation).toHaveBeenCalledTimes(1);
    notifications.enqueueAccountActivation.mockRejectedValueOnce(new Error('queue unavailable') as never);
    await expect(service.update('customer-1', created.id, { isActive: true })).rejects.toThrow('queue unavailable');
    expect(accounts[0].isActive).toBe(false);
    expect(accounts[0].sessionVersion).toBe(1);
  });
  it('creates a normalized account and stores only a password hash', async () => {
    const { service, accounts } = makeService();
    const result = await service.create('customer-1', {
      loginEmail: ' Customer@Example.COM ', contactName: ' 张女士 ', password: 'Password123', businessPermissions: ALL_PERMISSIONS,
    });

    expect(result).toMatchObject({ customerId: 'customer-1', loginEmail: 'customer@example.com', contactName: '张女士', isActive: true });
    expect(accounts[0].passwordHash).not.toBe('Password123');
    expect(await bcrypt.compare('Password123', accounts[0].passwordHash)).toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate login email globally', async () => {
    const { service } = makeService();
    await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'same@example.com', contactName: '联系人一' });
    await expect(service.create('customer-2', { ...ACCOUNT_INPUT, loginEmail: 'SAME@example.com', contactName: '联系人二', password: 'Password456' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects wrong passwords and disabled accounts', async () => {
    const { service } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'login@example.com' });
    await expect(service.login('login@example.com', 'Wrong123')).rejects.toBeInstanceOf(UnauthorizedException);
    await service.update('customer-1', created.id, { isActive: false });
    await expect(service.login('login@example.com', 'Password123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login when the customer is disabled', async () => {
    const disabledCustomer = makeCustomer('customer-1', false);
    const { service } = makeService([disabledCustomer]);
    await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'disabled@example.com' });
    await expect(service.login('disabled@example.com', 'Password123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('updates last login and issues a customer-scoped token', async () => {
    const { service, accounts } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'login@example.com' });
    const result = await service.login('LOGIN@example.com', 'Password123');
    const payload = decodeToken(result.linkToken);

    expect(accounts[0].lastLoginAt).toBeInstanceOf(Date);
    expect(payload).toMatchObject({ aud: 'customer-portal', customerId: 'customer-1', accountId: created.id });
    expect(result.customer).toMatchObject({ id: 'customer-1', customerCode: 'CUST001' });
  });

  it('keeps list and edit operations isolated by customer UUID', async () => {
    const { service } = makeService();
    const first = await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'first@example.com', contactName: '联系人一' });
    await service.create('customer-2', { ...ACCOUNT_INPUT, loginEmail: 'second@example.com', contactName: '联系人二', password: 'Password456' });

    expect(await service.list('customer-1')).toHaveLength(1);
    expect((await service.list('customer-1'))[0].loginEmail).toBe('first@example.com');
    await expect(service.update('customer-2', first.id, { contactName: '越权修改' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resets passwords without exposing the hash', async () => {
    const { service, accounts } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, loginEmail: 'reset@example.com' });
    const originalHash = accounts[0].passwordHash;
    const result = await service.resetPassword('customer-1', created.id, 'NewPassword456', true);

    expect(accounts[0].passwordHash).not.toBe(originalHash);
    expect(await bcrypt.compare('NewPassword456', accounts[0].passwordHash)).toBe(true);
    expect(result.mustChangePassword).toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it.each([undefined, [], ['employee_changes', 'employee_changes'], ['onboarding'], ['admin']])('requires explicit nonempty valid permissions: %j', async (businessPermissions) => {
    const { service, accounts } = makeService();
    await expect(service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: businessPermissions as PortalBusinessPermission[] })).rejects.toBeInstanceOf(BadRequestException);
    expect(accounts).toHaveLength(0);
  });

  it('enforces permissions using the current account and revokes existing sessions after a grant change', async () => {
    const { service } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] });
    const loggedIn = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    expect(loggedIn.businessPermissions).toEqual(['employee_changes']);
    await expect(service.session(loggedIn.linkToken, 'onboarding')).resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
    await expect(service.session(loggedIn.linkToken, 'resignation')).resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
    await expect(service.session(loggedIn.linkToken, 'salary')).rejects.toBeInstanceOf(ForbiddenException);

    await service.update('customer-1', created.id, { businessPermissions: ['salary'] });
    await expect(service.session(loggedIn.linkToken, 'onboarding')).rejects.toBeInstanceOf(UnauthorizedException);
    const refreshed = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    await expect(service.session(refreshed.linkToken, 'salary')).resolves.toMatchObject({ businessPermissions: ['salary'] });
    await expect(service.session(refreshed.linkToken, 'onboarding')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps legacy onboarding and resignation grants to the merged employee_changes permission', async () => {
    const { service, accounts } = makeService();
    const created = await service.create('customer-1', ACCOUNT_INPUT);
    accounts[0].businessPermissions = ['onboarding', 'resignation'];

    expect((await service.list('customer-1'))[0].businessPermissions).toEqual(['employee_changes']);
    const loggedIn = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    expect(loggedIn.businessPermissions).toEqual(['employee_changes']);
    await expect(service.session(loggedIn.linkToken, 'onboarding')).resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
    await expect(service.session(loggedIn.linkToken, 'resignation')).resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
    expect(created.id).toBe(accounts[0].id);
  });

  it('rejects old sessions after disable, re-enable and password reset', async () => {
    const { service } = makeService();
    const created = await service.create('customer-1', ACCOUNT_INPUT);
    const first = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    await service.update('customer-1', created.id, { isActive: false });
    await expect(service.session(first.linkToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await service.update('customer-1', created.id, { isActive: true });
    await expect(service.session(first.linkToken)).rejects.toBeInstanceOf(UnauthorizedException);
    const second = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    await service.resetPassword('customer-1', created.id, 'ResetPassword123');
    await expect(service.session(second.linkToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('checks only the selected business rule groups before granting an account', async () => {
    const incomplete = makeService(undefined, {
      onboardingDefaults: { contract_subject: '主体' },
      resignationDefaults: {},
      salaryRules: { billingDay: null },
      sharedEmailRules: { mailbox: '' },
    });
    await expect(incomplete.service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] }))
      .rejects.toThrow('离职规则');

    const salaryReady = makeService(undefined, {
      onboardingDefaults: {}, resignationDefaults: {},
      salaryRules: { billingDay: 20 },
      sharedEmailRules: { mailbox: 'shared@example.test' },
    });
    await expect(salaryReady.service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['salary'] }))
      .resolves.toMatchObject({ businessPermissions: ['salary'] });

    const employeesReady = makeService(undefined, { ...COMPLETE_RULE, salaryRules: { billingDay: null } });
    await expect(employeesReady.service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] }))
      .resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
  });

  it.each([
    { rule: null, message: '整套客户办理规则' },
    { rule: { ...COMPLETE_RULE, isActive: false }, message: '启用整套客户规则' },
    { rule: { ...COMPLETE_RULE, sharedEmailRules: { mailbox: '' } }, message: '共享邮箱地址' },
  ])('always reads the rule repository and rejects incomplete opening requirements: $message', async ({ rule, message }) => {
    const { service, accounts, ruleRepository } = makeService(undefined, rule);
    await expect(service.create('customer-1', ACCOUNT_INPUT)).rejects.toThrow(message);
    expect(ruleRepository.findOne).toHaveBeenCalledWith({ where: { customerId: 'customer-1' } });
    expect(accounts).toHaveLength(0);
  });

  it.each([
    { contactName: '更新联系人' },
    { contactName: '更新联系人', businessPermissions: ALL_PERMISSIONS },
    { businessPermissions: ['salary'] as PortalBusinessPermission[] },
    { isActive: false, businessPermissions: ALL_PERMISSIONS },
  ])('keeps contact edits, unchanged grants, permission removal and disabling available when rules become incomplete: %j', async (changes) => {
    const { service, ruleRepository } = makeService();
    const created = await service.create('customer-1', ACCOUNT_INPUT);
    ruleRepository.findOne.mockResolvedValue(null);
    ruleRepository.findOne.mockClear();

    await expect(service.update('customer-1', created.id, changes)).resolves.toMatchObject(changes);
    expect(ruleRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a new grant when its rules are missing without changing the account', async () => {
    const { service, accounts, ruleRepository, accountRepository } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] });
    ruleRepository.findOne.mockResolvedValue({ ...COMPLETE_RULE, salaryRules: { billingDay: null } });

    await expect(service.update('customer-1', created.id, { businessPermissions: ALL_PERMISSIONS })).rejects.toThrow('薪资账单日');
    expect(accountRepository.update).not.toHaveBeenCalled();
    expect(accounts[0].businessPermissions).toEqual(['employee_changes']);
  });

  it('checks only new grants on an active account while keeping its previous grants intact', async () => {
    const { service, ruleRepository } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] });
    ruleRepository.findOne.mockResolvedValue({ ...COMPLETE_RULE, onboardingDefaults: {}, resignationDefaults: {} });

    await expect(service.update('customer-1', created.id, { businessPermissions: ALL_PERMISSIONS }))
      .resolves.toMatchObject({ businessPermissions: ALL_PERMISSIONS });
  });

  it('checks all retained grants before re-enabling even when no permissions are included in the update', async () => {
    const { service, accounts, ruleRepository } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, isActive: false });
    ruleRepository.findOne.mockResolvedValue({ ...COMPLETE_RULE, resignationDefaults: {} });

    await expect(service.update('customer-1', created.id, { isActive: true })).rejects.toThrow('离职规则');
    expect(accounts[0].isActive).toBe(false);
    ruleRepository.findOne.mockResolvedValue({ ...COMPLETE_RULE, onboardingDefaults: {}, resignationDefaults: {} });
    await expect(service.update('customer-1', created.id, { isActive: true, businessPermissions: ['salary'] }))
      .resolves.toMatchObject({ isActive: true, businessPermissions: ['salary'] });
  });

  it('normalizes unchanged legacy employee grants before deciding whether a rule check is required', async () => {
    const { service, accounts, ruleRepository } = makeService();
    const created = await service.create('customer-1', { ...ACCOUNT_INPUT, businessPermissions: ['employee_changes'] });
    accounts[0].businessPermissions = ['onboarding', 'resignation'];
    ruleRepository.findOne.mockResolvedValue(null);
    ruleRepository.findOne.mockClear();

    await expect(service.update('customer-1', created.id, { businessPermissions: ['employee_changes'] }))
      .resolves.toMatchObject({ businessPermissions: ['employee_changes'] });
    expect(ruleRepository.findOne).not.toHaveBeenCalled();
  });

  it('blocks business access until first password change and rotates the session after change', async () => {
    const { service, accounts } = makeService();
    await service.create('customer-1', { ...ACCOUNT_INPUT, mustChangePassword: undefined });
    const original = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    expect(original.mustChangePassword).toBe(true);
    await expect(service.session(original.linkToken)).resolves.toMatchObject({ mustChangePassword: true });
    await expect(service.session(original.linkToken, 'onboarding')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.changePassword(original.linkToken, 'WrongPassword1', 'Changed1234')).rejects.toThrow('原密码错误');
    await expect(service.changePassword(original.linkToken, ACCOUNT_INPUT.password, ACCOUNT_INPUT.password)).rejects.toThrow('新密码不能');
    const updated = await service.changePassword(original.linkToken, ACCOUNT_INPUT.password, 'Changed1234');
    expect(updated).toMatchObject({ mustChangePassword: false, account: { mustChangePassword: false }, businessPermissions: ALL_PERMISSIONS });
    expect(updated.linkToken).not.toBe(original.linkToken);
    expect(await bcrypt.compare('Changed1234', accounts[0].passwordHash)).toBe(true);
    await expect(service.session(original.linkToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.session(updated.linkToken, 'onboarding')).resolves.toMatchObject({ mustChangePassword: false });
    await expect(service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not overwrite a concurrent administrator reset during self password change', async () => {
    const { service, accountRepository } = makeService();
    await service.create('customer-1', ACCOUNT_INPUT);
    const original = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    accountRepository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.changePassword(original.linkToken, ACCOUNT_INPUT.password, 'Changed1234')).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks token audience, signature, expiry, account/customer binding and version before access', async () => {
    const { service } = makeService();
    await service.create('customer-1', ACCOUNT_INPUT);
    const original = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    const payload = decodeToken(original.linkToken);
    const sign = (value: unknown) => {
      const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${encoded}.${createHmac('sha256', process.env.PORTAL_LINK_SECRET || SECRET).update(encoded).digest('base64url')}`;
    };
    for (const invalid of [
      `${original.linkToken}x`,
      sign({ ...payload, aud: 'internal' }),
      sign({ ...payload, exp: 1 }),
      sign({ ...payload, customerId: 'customer-2' }),
      sign({ ...payload, accountId: 'missing-account' }),
      sign({ ...payload, sessionVersion: undefined }),
      sign({ ...payload, sessionVersion: 2 }),
    ]) await expect(service.session(invalid)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('invalidates sessions immediately when the customer is disabled', async () => {
    const customer = makeCustomer('customer-1');
    const { service } = makeService([customer]);
    await service.create(customer.id, ACCOUNT_INPUT);
    const original = await service.login(ACCOUNT_INPUT.loginEmail, ACCOUNT_INPUT.password);
    customer.isActive = false;
    await expect(service.session(original.linkToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
