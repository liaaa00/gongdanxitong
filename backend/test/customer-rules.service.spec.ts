import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Branch, BusinessScope, Customer, CustomerAssignee, CustomerPortalRule, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { AddCustomerPaymentLocationRules20260910110000 } from 'src/database/migrations/20260910110000-AddCustomerPaymentLocationRules';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CustomerRulesService } from 'src/modules/customer-rules/customer-rules.service';

function user(roles: string[], sub = 'user-1'): JwtUserPayload {
  return { sub, username: sub, roles };
}

function customer(id = '11111111-1111-4111-8111-111111111111'): Customer {
  return {
    id,
    customerCode: 'CUST001',
    customerName: '测试客户',
    isActive: true,
    businessScope: BusinessScope.BEILUN,
    createdAt: new Date('2026-09-03T00:00:00Z'),
    branches: [],
    assignees: [],
    workOrders: [],
  };
}

const BRANCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function branch(overrides: Partial<Branch> = {}): Partial<Branch> {
  return { id: BRANCH_ID, customerId: customer().id, businessScope: BusinessScope.BEILUN, isActive: true, branchCode: 'B01', branchName: '宁波商社', city: '宁波', ...overrides };
}
function locationRule(overrides: Partial<CustomerPortalRule['paymentLocationRules'][number]> = {}) {
  return { socialLocation: '宁波', branchId: BRANCH_ID, onboardingDefaults: { employee_type: '正式员工' }, resignationDefaults: { need_resignation_cert: '否' }, ...overrides };
}

function queryBuilder(result: Customer | null, list: Customer[] = result ? [result] : []) {
  let customerId: string | undefined;
  let customerIds: string[] | undefined;
  let businessScope: BusinessScope | undefined;
  let activeOnly = false;
  let skip = 0;
  let take = list.length;
  const filter = () => list.filter((item) => (!activeOnly || item.isActive)
    && (!businessScope || item.businessScope === businessScope)
    && (!customerId || item.id === customerId) && (!customerIds || customerIds.includes(item.id)));
  const applyWhere = (sql: string, params?: { customerId?: string; customerIds?: string[]; assignedCustomerIds?: string[]; businessScope?: BusinessScope }) => {
    if (sql === 'customer.id = :customerId') customerId = params?.customerId;
    if (sql.includes('customer.id IN (:...customerIds)')) customerIds = params?.customerIds;
    if (sql.includes('customer.id IN (:...assignedCustomerIds)')) customerIds = params?.assignedCustomerIds;
    if (sql === 'customer.isActive = true') activeOnly = true;
    if (sql === 'customer.businessScope = :businessScope') businessScope = params?.businessScope;
    return qb;
  };
  const qb: any = {
    where: jest.fn((sql, params) => { customerId = undefined; customerIds = undefined; businessScope = undefined; activeOnly = false; return applyWhere(sql, params); }),
    andWhere: jest.fn(applyWhere),
    innerJoin: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn((value) => { skip = value; return qb; }),
    take: jest.fn((value) => { take = value; return qb; }),
    getOne: jest.fn(async () => filter()[0] ?? null),
    getMany: jest.fn(async () => filter()),
    getManyAndCount: jest.fn(async () => [filter().slice(skip, skip + take), filter().length]),
  };
  return qb;
}

function makeService(options: {
  accessibleCustomer?: Customer | null;
  listCustomers?: Customer[];
  existingRule?: Partial<CustomerPortalRule> | null;
  customerExists?: boolean;
  workOrders?: Partial<WorkOrder>[];
  branches?: Partial<Branch>[];
  assignees?: Partial<CustomerAssignee>[];
} = {}) {
  const accessibleCustomer = options.accessibleCustomer === undefined ? customer() : options.accessibleCustomer;
  const customerQb = queryBuilder(accessibleCustomer, options.listCustomers ?? (accessibleCustomer ? [accessibleCustomer] : []));
  const ruleListQb: any = {
    where: jest.fn(() => ruleListQb),
    getMany: jest.fn(async () => options.existingRule ? [options.existingRule] : []),
  };
  const fullRule = options.existingRule ? {
    onboardingDefaults: {},
    resignationDefaults: {},
    salaryRules: { billingDay: null, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
    sharedEmailRules: { mailbox: '', routeKey: '' },
    completionEmailEnabled: false,
    completionEmailTo: [],
    completionEmailCc: [],
    completionEmailReplyTo: null,
    completionEmailBusinessTypes: [],
    objectionDeadlineDays: null,
    isActive: true,
    updatedBy: null,
    updatedAt: new Date('2026-09-03T00:00:00Z'),
    ...options.existingRule,
  } as CustomerPortalRule : null;
  const ruleRepository: any = {
    createQueryBuilder: jest.fn(() => ruleListQb),
    find: jest.fn(async () => options.existingRule ? [fullRule] : []),
    findOne: jest.fn(async ({ where }) => fullRule && fullRule.customerId === where.customerId && (where.isActive === undefined || fullRule.isActive === where.isActive) ? structuredClone(fullRule) : null),
    create: jest.fn((value) => ({ ...value })),
    save: jest.fn(async (value) => ({ id: 'rule-1', updatedAt: new Date('2026-09-03T01:00:00Z'), ...value })),
  };
  const customerRepository: any = {
    createQueryBuilder: jest.fn(() => customerQb),
    exist: jest.fn(async () => options.customerExists ?? false),
  };
  const workOrderRepository: any = {
    find: jest.fn(async () => options.workOrders ?? []),
  };
  const branchRepository = {
    find: jest.fn(async ({ where }) => (options.branches ?? []).filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof Branch] === value))),
    findOne: jest.fn(async ({ where }) => (options.branches ?? []).find((row) => Object.entries(where).every(([key, value]) => row[key as keyof Branch] === value)) ?? null),
  };
  const assigneeRepository = options.assignees === undefined ? undefined : {
    find: jest.fn(async ({ where }: any) => (options.assignees ?? []).filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof CustomerAssignee] === value))),
  };
  return {
    service: new CustomerRulesService(ruleRepository, customerRepository, workOrderRepository, branchRepository as any, assigneeRepository as any),
    customerQb,
    ruleRepository,
    customerRepository,
    workOrderRepository,
    branchRepository,
  };
}

describe('CustomerRulesService', () => {
  it('allows administrators and business owners to list all active customers', async () => {
    for (const role of ['admin', 'business_owner', 'biz_manager']) {
      const { service, customerQb } = makeService();
      const result = await service.list({ page: 1, pageSize: 20 }, user([role]));
      expect(result.total).toBe(1);
      expect(result.list[0]).toMatchObject({ customerId: '11111111-1111-4111-8111-111111111111', configured: false });
      expect(customerQb.innerJoin).not.toHaveBeenCalled();
    }
  });

  it('returns no customers to business users without an active assignment', async () => {
    for (const role of ['business_group_member', 'business_group_leader', 'salesperson']) {
      const { service, customerQb } = makeService({ assignees: [] });
      const result = await service.list({ page: 1, pageSize: 20 }, user([role], 'sales-1'));
      expect(result.total).toBe(0);
      expect(customerQb.andWhere).not.toHaveBeenCalledWith('customer.id IN (:...assignedCustomerIds)', expect.anything());
    }
  });

  it('limits business members to active customer assignments and keeps managers read-only', async () => {
    const firstId = '11111111-1111-4111-8111-111111111111';
    const secondId = '22222222-2222-4222-8222-222222222222';
    const assigned = makeService({ listCustomers: [customer(firstId), customer(secondId)], assignees: [{ customerId: firstId, userId: 'user-1', businessScope: BusinessScope.BEILUN, isActive: true }] });
    const member = user(['business_group_member']);
    expect((await assigned.service.list({ page: 1, pageSize: 20 }, member)).list.map((item) => item.customerId)).toEqual([firstId]);
    await expect(assigned.service.get(firstId, member)).resolves.toMatchObject({ customerId: firstId });
    await expect(assigned.service.get(secondId, member)).rejects.toBeInstanceOf(ForbiddenException);

    const manager = makeService({ assignees: [] });
    await expect(manager.service.get(firstId, user(['business_owner']))).resolves.toMatchObject({ customerId: firstId });
    await expect(manager.service.upsert(firstId, { isActive: true }, user(['business_owner']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts only the internal onboarding default whitelist and normalizes values', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: {
        employee_type: '正式员工',
        business_mode: '  直营网  ',
        need_esign: true,
        fund_ratio: 12,
        special_remark: '',
      },
    }, user(['business_group_member']));

    expect(result.onboardingDefaults).toEqual({ employee_type: '正式员工', business_mode: '直营网', need_esign: true, fund_ratio: 12 });
    expect(ruleRepository.save).toHaveBeenCalledWith(expect.objectContaining({ updatedBy: 'user-1' }));
  });

  it('rejects customer-editable or unknown fields in internal onboarding defaults', async () => {
    const { service } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: { employee_name: '客户填写值' },
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves trusted resignation, salary, and shared email rules', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      resignationDefaults: {
        need_resignation_cert: '是',
        cert_delivery_address: ' hr@example.com ',
        cert_delivery_method: '电子版',
        certificate_template: '标准模板',
      },
      salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
      sharedEmailRules: { mailbox: ' SHARED@EXAMPLE.COM ', routeKey: ' customer-1 ' },
    }, user(['business_group_member']));

    expect(result.resignationDefaults).toMatchObject({ need_resignation_cert: '是', cert_delivery_address: 'hr@example.com' });
    expect(result.salaryRules).toEqual({ billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1], payrollMonthMode: 'current' });
    expect(result.sharedEmailRules).toEqual({ mailbox: 'shared@example.com', routeKey: 'customer-1' });
    expect(ruleRepository.save).toHaveBeenCalledWith(expect.objectContaining({ customerId: '11111111-1111-4111-8111-111111111111' }));
  });

  it('rejects incomplete resignation certificate rules and non-final salary reminder offsets', async () => {
    const { service } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      resignationDefaults: { need_resignation_cert: '是' },
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [5, 3, 1] },
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires all three business types for completion result email', async () => {
    const { service } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      completionEmailBusinessTypes: ['onboarding', 'resignation'],
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
  });
  it('requires at least one recipient when completion result email is enabled', async () => {
    const { service } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      completionEmailEnabled: true,
      completionEmailTo: [],
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty or invalid completion email result fields', async () => {
    const { service } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      completionEmailFields: [],
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', {
      completionEmailFields: ['order_no', 'invalid field!'],
    }, user(['business_group_member']))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes and deduplicates completion email result fields', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      completionEmailFields: [' order_no ', 'employee_name', 'order_no'],
    }, user(['business_group_member']));

    expect(result.completionEmailFields).toEqual(['order_no', 'employee_name']);
    expect(ruleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      completionEmailFields: ['order_no', 'employee_name'],
    }));
  });

  it('returns only trusted onboarding defaults to the portal connector', async () => {
    const { service } = makeService({
      existingRule: {
        customerId: '11111111-1111-4111-8111-111111111111',
        onboardingDefaults: { employee_type: '正式员工', contract_subject: '浙江企服', need_esign: true },
        resignationDefaults: { need_resignation_cert: '否' },
        salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
        sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'CUST001' },
        completionEmailEnabled: true,
        completionEmailTo: ['customer@example.com'],
      },
    });
    const result = await service.getPortalDefaults('11111111-1111-4111-8111-111111111111', user(['admin']));
    expect(result).toEqual({
      customerId: '11111111-1111-4111-8111-111111111111',
      customerCode: 'CUST001',
      configured: true,
      onboardingDefaults: { employee_type: '正式员工', contract_subject: '浙江企服', need_esign: true },
      resignationDefaults: { need_resignation_cert: '否' },
      paymentLocationRules: [],
      salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1], payrollMonthMode: 'current' },
      sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'CUST001' },
      readiness: { ready: true, missing: [] },
    });
    expect(result).not.toHaveProperty('completionEmailTo');
  });

  it('batch imports valid customers and reports invalid rows without losing valid rows', async () => {
    const { service } = makeService();
    const result = await service.batchUpsert([
      { customerId: '11111111-1111-4111-8111-111111111111', rule: { onboardingDefaults: { employee_type: '正式员工', contract_subject: '浙江企服' } } },
      { customerId: '99999999-9999-4999-8999-999999999999', rule: { onboardingDefaults: { contract_subject: '无效客户' } } },
    ], user(['business_group_member']));

    expect(result).toMatchObject({ total: 2, successCount: 1, failedCount: 1 });
    expect(result.results[0]).toMatchObject({ customerId: '11111111-1111-4111-8111-111111111111', success: true });
    expect(result.results[1]).toMatchObject({ customerId: '99999999-9999-4999-8999-999999999999', success: false });
  });

  it('derives missing customer defaults from the newest historical orders without overwriting manual rules', async () => {
    const existingRule = {
      customerId: '11111111-1111-4111-8111-111111111111',
      onboardingDefaults: { contract_subject: '人工配置主体' },
      resignationDefaults: {},
    } as Partial<CustomerPortalRule>;
    const { service, ruleRepository } = makeService({
      existingRule,
      workOrders: [
        {
          businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED,
          customerId: '11111111-1111-4111-8111-111111111111', orderType: OrderType.ONBOARDING,
          extraData: { contract_subject: '历史主体', business_mode: '北仑自营', need_esign: '1.是' },
          submittedAt: new Date('2026-09-08T01:00:00Z'), updatedAt: new Date('2026-09-08T03:00:00Z'),
        },
        {
          businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED,
          customerId: '11111111-1111-4111-8111-111111111111', orderType: OrderType.RESIGNATION,
          extraData: { need_resignation_cert: '是', cert_delivery_address: 'hr@example.com' },
          submittedAt: new Date('2026-09-08T01:00:00Z'), updatedAt: new Date('2026-09-08T02:00:00Z'),
        },
      ],
    });

    const result = await service.importFromExistingOrders(['11111111-1111-4111-8111-111111111111'], user(['business_group_member']));

    expect(result).toMatchObject({ customerCount: 1, importedCount: 1, sourceOrderCount: 2 });
    expect(ruleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      onboardingDefaults: expect.objectContaining({ contract_subject: '人工配置主体', business_mode: '北仑自营', need_esign: true }),
      resignationDefaults: {},
    }));
  });

  it('merges explicit rule fields and keeps omitted Excel cells and manual false values', async () => {
    const { service } = makeService({ existingRule: {
      customerId: '11111111-1111-4111-8111-111111111111',
      onboardingDefaults: { employee_type: '正式员工', contract_subject: '人工主体', need_esign: false },
      resignationDefaults: { need_resignation_cert: '是', cert_delivery_address: '人工地址' },
      salaryRules: { billingDay: 20, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] },
      sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'manual' },
      completionEmailTo: ['hr@example.com'], completionEmailEnabled: true,
    } });
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: { business_mode: '新增业务模式' },
      resignationDefaults: { cert_delivery_method: '电子版' },
      salaryRules: { reminderEnabled: true },
      sharedEmailRules: { routeKey: 'updated' },
      completionEmailCc: [' cc@example.com '],
    }, user(['admin']));
    expect(result.onboardingDefaults).toEqual({ employee_type: '正式员工', contract_subject: '人工主体', need_esign: false, business_mode: '新增业务模式' });
    expect(result.resignationDefaults).toMatchObject({ need_resignation_cert: '是', cert_delivery_address: '人工地址', cert_delivery_method: '电子版' });
    expect(result.salaryRules).toEqual({ billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1], payrollMonthMode: 'current' });
    expect(result.sharedEmailRules).toEqual({ mailbox: 'shared@example.com', routeKey: 'updated' });
    expect(result.completionEmailEnabled).toBe(true);
    expect(result.completionEmailTo).toEqual(['hr@example.com']);
  });

  it.each([
    { completionEmailEnabled: 'false' }, { isActive: 'false' }, { onboardingDefaults: null },
    { resignationDefaults: [] }, { salaryRules: { billingDay: true } }, { salaryRules: { billingDay: 29 } },
    { salaryRules: { reminderEnabled: 'false' } }, { sharedEmailRules: { mailbox: {} } },
    { sharedEmailRules: { mailbox: 'invalid' } }, { completionEmailTo: ['invalid'] },
    { completionEmailTo: 'hr@example.com' }, { completionEmailReplyTo: 'invalid' },
    { completionEmailFields: null }, { completionEmailBusinessTypes: null },
    { objectionDeadlineDays: -1 }, { objectionDeadlineDays: 1.5 }, { objectionDeadlineDays: 31 },
    { onboardingDefaults: { need_esign: 'false' } }, { onboardingDefaults: { fund_ratio: 'NaN' } },
    { onboardingDefaults: { fund_ratio: -1 } }, { onboardingDefaults: { fund_ratio: 101 } },
    { onboardingDefaults: { contract_subject: true } }, { unknownField: 'bad' },
    { resignationDefaults: { need_resignation_cert: true } },
    { resignationDefaults: { cert_delivery_method: '未知形式' } },
  ])('rejects malformed direct and batch business fields: %j', async (input) => {
    const { service, ruleRepository } = makeService();
    await expect(service.upsert('11111111-1111-4111-8111-111111111111', input as any, user(['admin']))).rejects.toBeInstanceOf(BadRequestException);
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('supports an explicit empty field without clearing omitted fields', async () => {
    const { service } = makeService({ existingRule: {
      customerId: '11111111-1111-4111-8111-111111111111',
      onboardingDefaults: { employee_type: '正式员工', contract_subject: '人工主体', special_remark: '旧说明' },
    } });
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: { special_remark: null, fund_ratio: '5%+5%' },
    }, user(['admin']));
    expect(result.onboardingDefaults).toEqual({ employee_type: '正式员工', contract_subject: '人工主体', fund_ratio: '5%+5%' });
  });

  it('reports malformed rows and original Excel row numbers while continuing valid rows', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.batchUpsert([
      null,
      { customerId: '', rule: {} },
      { customerId: 'CUST001', rule: { isActive: true }, rowNumber: 9 },
      { customerId: '11111111-1111-4111-8111-111111111111', rule: { onboardingDefaults: { employee_type: '正式员工', need_esign: false } }, rowNumber: 12 },
      { customerId: '22222222-2222-4222-8222-222222222222', rule: undefined },
    ] as any, user(['admin']));
    expect(result).toMatchObject({ total: 5, successCount: 1, failedCount: 4 });
    expect(result.results.map((row) => row.rowNumber)).toEqual([2, 3, 9, 12, 6]);
    expect(result.results[3]).toMatchObject({ success: true, customerCode: 'CUST001', customerName: '测试客户' });
    expect(ruleRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects every duplicate UUID row and does not match by repeated code or name', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const other = '22222222-2222-4222-8222-222222222222';
    const { service, ruleRepository } = makeService({ listCustomers: [customer(id), customer(other)] });
    const result = await service.batchUpsert([
      { customerId: id, rule: { onboardingDefaults: { contract_subject: '不应保存' } } },
      { customerId: ` ${id.toUpperCase()} `, rule: { onboardingDefaults: { contract_subject: '同样不保存' } } },
      { customerId: other, rule: { onboardingDefaults: { employee_type: '正式员工', contract_subject: '正确客户' } } },
    ], user(['admin']));
    expect(result).toMatchObject({ successCount: 1, failedCount: 2 });
    expect(result.results.slice(0, 2).every((row) => row.message.includes('重复'))).toBe(true);
    expect(ruleRepository.save).toHaveBeenCalledTimes(1);
    expect(ruleRepository.save.mock.calls[0][0]).toMatchObject({ customerId: other, onboardingDefaults: { employee_type: '正式员工', contract_subject: '正确客户' } });
  });

  it('rejects empty and oversized batches before making writes', async () => {
    const { service, ruleRepository } = makeService();
    await expect(service.batchUpsert([], user(['admin']))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.batchUpsert(Array(501).fill({}), user(['admin']))).rejects.toBeInstanceOf(BadRequestException);
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('excludes draft, returned, withdrawn, void, approval-pending and other-scope historical orders', async () => {
    const base = { customerId: '11111111-1111-4111-8111-111111111111', orderType: OrderType.ONBOARDING, businessScope: BusinessScope.BEILUN, submittedAt: new Date('2026-09-08T01:00:00Z') };
    const { service, workOrderRepository, ruleRepository } = makeService({ workOrders: [
      ...[WorkOrderStatus.DRAFT, WorkOrderStatus.RETURNED, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID, WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAW_PENDING]
        .map((status) => ({ ...base, status, extraData: { contract_subject: '不可信' } })),
      { ...base, businessScope: BusinessScope.OUT_OF_PROVINCE, status: WorkOrderStatus.COMPLETED, extraData: { contract_subject: '其他账套' } },
      { ...base, orderType: OrderType.RENEWAL, status: WorkOrderStatus.COMPLETED, extraData: { contract_subject: '续签' } },
      ...[null, undefined, new Date('invalid')].map((submittedAt) => ({ ...base, submittedAt, status: WorkOrderStatus.COMPLETED, extraData: { contract_subject: '缺少可信提交时间' } })),
      { ...base, status: WorkOrderStatus.COMPLETED, extraData: { contract_subject: '可信主体' } },
    ] });
    const result = await service.importFromExistingOrders([base.customerId], user(['admin']));
    expect(result).toMatchObject({ importedCount: 1, sourceOrderCount: 1 });
    expect(ruleRepository.save.mock.calls[0][0].onboardingDefaults).toEqual({ contract_subject: '可信主体' });
    expect(workOrderRepository.find.mock.calls[0][0].where).toMatchObject({ businessScope: BusinessScope.BEILUN });
  });

  it('never guesses personal data, billing dates or email configuration and preserves all manual choices', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const existingRule: Partial<CustomerPortalRule> = {
      customerId: id, onboardingDefaults: { need_esign: false, contract_subject: '人工主体' },
      resignationDefaults: { need_resignation_cert: '否' },
      salaryRules: { billingDay: 20, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] },
      sharedEmailRules: { mailbox: 'manual@example.com', routeKey: 'manual' },
      completionEmailEnabled: true, completionEmailTo: ['hr@example.com'], isActive: false,
    };
    const { service, ruleRepository } = makeService({ existingRule, workOrders: [
      { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.ONBOARDING, submittedAt: new Date('2026-09-08T01:00:00Z'),
        extraData: { need_esign: '1.是', contract_subject: '历史主体', business_mode: '可信模式', special_remark: '员工备注',
          employee_name: '员工姓名', fund_ratio: 12, project_name: '个人项目', billingDay: 25, mailbox: 'guessed@example.com', completionEmailTo: ['guessed@example.com'] } },
      { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.RESIGNATION, submittedAt: new Date('2026-09-08T01:00:00Z'),
        extraData: { need_resignation_cert: '是', cert_delivery_address: '员工家里', cert_delivery_method: '纸质版' } },
    ] });
    const result = await service.importFromExistingOrders([id], user(['admin']));
    expect(result).toMatchObject({ importedCount: 1, skippedCount: 0, failedCount: 0 });
    const saved = ruleRepository.save.mock.calls[0][0];
    expect(saved.onboardingDefaults).toEqual({ need_esign: false, contract_subject: '人工主体', business_mode: '可信模式' });
    expect(saved.resignationDefaults).toEqual({ need_resignation_cert: '否', cert_delivery_method: '纸质版' });
    expect(saved).toMatchObject({ salaryRules: existingRule.salaryRules, sharedEmailRules: existingRule.sharedEmailRules,
      completionEmailEnabled: true, completionEmailTo: ['hr@example.com'], isActive: false });
    const repeated = makeService({ existingRule: saved, workOrders: [
      { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.ONBOARDING, submittedAt: new Date('2026-09-08T01:00:00Z'),
        extraData: { need_esign: '1.是', contract_subject: '历史主体', business_mode: '可信模式' } },
    ] });
    expect(await repeated.service.importFromExistingOrders([id], user(['admin']))).toMatchObject({ importedCount: 0, skippedCount: 1 });
    expect(repeated.ruleRepository.save).not.toHaveBeenCalled();
  });

  it('only derives certificate=yes when an existing manual delivery address makes it complete', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const { service, ruleRepository } = makeService({ existingRule: { customerId: id, resignationDefaults: { cert_delivery_address: '人工客户地址' } }, workOrders: [
      { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.RESIGNATION, submittedAt: new Date('2026-09-08T01:00:00Z'),
        extraData: { need_resignation_cert: '是', cert_delivery_address: '员工地址' } },
    ] });
    await service.importFromExistingOrders([id], user(['admin']));
    expect(ruleRepository.save.mock.calls[0][0].resignationDefaults).toEqual({ need_resignation_cert: '是', cert_delivery_address: '人工客户地址' });
  });

  it('reports one history failure and continues other customers', async () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
    const { service, ruleRepository } = makeService({ listCustomers: ids.map((id) => customer(id)), workOrders: ids.slice(0, 2).map((id) => ({
      customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED,
      orderType: OrderType.ONBOARDING, submittedAt: new Date('2026-09-08T01:00:00Z'), extraData: { need_company_payroll: '否' },
    })) });
    ruleRepository.save.mockRejectedValueOnce(new Error('数据库暂时不可用'));
    const result = await service.importFromExistingOrders(ids, user(['admin']));
    expect(result).toMatchObject({ customerCount: 3, importedCount: 1, skippedCount: 1, failedCount: 1 });
    expect(result.results.map((item) => item.status)).toEqual(['failed', 'imported', 'skipped']);
  });


  it('skips identical manual defaults even when historical keys have a different order', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const { service, ruleRepository } = makeService({ existingRule: { customerId: id, onboardingDefaults: { need_esign: false, business_mode: '人工模式' } }, workOrders: [
      { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.ONBOARDING, submittedAt: new Date('2026-09-08T01:00:00Z'),
        extraData: { business_mode: '历史模式', need_esign: '1.是' } },
    ] });
    expect(await service.importFromExistingOrders([id], user(['admin']))).toMatchObject({ importedCount: 0, skippedCount: 1 });
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('skips malformed latest values and uses an older trusted value without copying free text', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const base = { customerId: id, businessScope: BusinessScope.BEILUN, status: WorkOrderStatus.COMPLETED, orderType: OrderType.ONBOARDING, submittedAt: new Date('2026-09-08T01:00:00Z') };
    const { service, ruleRepository } = makeService({ workOrders: [
      { ...base, extraData: { need_esign: 'maybe', contract_subject: {}, is_common_template: 'unknown', special_remark: '个人备注' } },
      { ...base, extraData: { need_esign: '2.否', contract_subject: '有效主体', is_common_template: '是' } },
    ] });
    await service.importFromExistingOrders([id], user(['admin']));
    expect(ruleRepository.save.mock.calls[0][0].onboardingDefaults).toEqual({ need_esign: false, contract_subject: '有效主体', is_common_template: '是' });
  });

  it('saves location-specific rules using the selected branch UUID without guessing from names or codes', async () => {
    const { service, branchRepository } = makeService({ branches: [branch()] });
    const saved = await service.upsert(customer().id, { paymentLocationRules: [locationRule({ socialLocation: ' 宁波 ' })] }, user(['business_group_member']));
    expect(saved.paymentLocationRules).toEqual([locationRule()]);
    expect(branchRepository.findOne).toHaveBeenCalledWith({ where: { id: BRANCH_ID, customerId: customer().id, businessScope: BusinessScope.BEILUN, isActive: true } });
    expect(saved.readiness.missing).not.toContain('入职规则');
    expect(saved.readiness.missing).not.toContain('离职规则');
  });

  it.each([
    { isActive: false },
    { customerId: '22222222-2222-4222-8222-222222222222' },
    { businessScope: BusinessScope.OUT_OF_PROVINCE },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  ])('rejects a branch outside the active UUID/customer/scope boundary: %j', async (changes) => {
    const { service, ruleRepository } = makeService({ branches: [branch(changes)] });
    await expect(service.upsert(customer().id, { paymentLocationRules: [locationRule()] }, user(['admin']))).rejects.toThrow('所选商社不存在、已停用或不属于当前客户及业务范围');
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate locations after trim while preserving other exact location differences', async () => {
    const { service, ruleRepository } = makeService({ branches: [branch()] });
    await expect(service.upsert(customer().id, { paymentLocationRules: [locationRule(), locationRule({ socialLocation: ' 宁波 ' })] }, user(['admin']))).rejects.toThrow('缴纳地重复');
    expect(ruleRepository.save).not.toHaveBeenCalled();
    const saved = await service.upsert(customer().id, { paymentLocationRules: [locationRule(), locationRule({ socialLocation: '宁波市' })] }, user(['admin']));
    expect(saved.paymentLocationRules.map((item) => item.socialLocation)).toEqual(['宁波', '宁波市']);
  });

  it.each([null, {}, [null], [{ ...locationRule(), branchId: 'B01' }], [{ ...locationRule(), customerCode: 'CUST001' }], [{ ...locationRule(), socialLocation: '  ' }], [{ ...locationRule(), onboardingDefaults: [] }]])('rejects malformed location configuration without saving: %j', async (paymentLocationRules) => {
    const { service, ruleRepository } = makeService({ branches: [branch()] });
    await expect(service.upsert(customer().id, { paymentLocationRules } as any, user(['admin']))).rejects.toBeInstanceOf(BadRequestException);
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('validates effective per-location defaults while preserving only the local overrides', async () => {
    const { service } = makeService({ branches: [branch()] });
    const saved = await service.upsert(customer().id, {
      onboardingDefaults: { employee_type: '正式员工', need_esign: false },
      resignationDefaults: { need_resignation_cert: '是', cert_delivery_address: '客户指定收件地址' },
      paymentLocationRules: [locationRule({ onboardingDefaults: { payroll_cycle: '次月', payroll_date: '15', need_payroll_slip: '否' }, resignationDefaults: { cert_delivery_method: '纸质版' } })],
    }, user(['admin']));
    expect(saved.paymentLocationRules[0].onboardingDefaults).toEqual({ payroll_cycle: '次月', payroll_date: '15', need_payroll_slip: '否' });
    expect(saved.paymentLocationRules[0].resignationDefaults).toEqual({ cert_delivery_method: '纸质版' });
    await expect(service.upsert(customer().id, { paymentLocationRules: [locationRule({ resignationDefaults: { need_resignation_cert: '是' } })] }, user(['admin']))).rejects.toThrow('送达地址');
  });

  it('returns location rules from detail, list and portal defaults and allows an explicit empty array', async () => {
    const existingRule = { customerId: customer().id, paymentLocationRules: [locationRule()] };
    const { service } = makeService({ existingRule });
    expect((await service.get(customer().id, user(['admin']))).paymentLocationRules).toEqual(existingRule.paymentLocationRules);
    expect((await service.list({ page: 1, pageSize: 20 }, user(['admin']))).list[0].paymentLocationRules).toEqual(existingRule.paymentLocationRules);
    expect((await service.getPortalDefaults(customer().id, user(['admin']))).paymentLocationRules).toEqual(existingRule.paymentLocationRules);
    expect((await service.upsert(customer().id, { paymentLocationRules: [] }, user(['admin']))).paymentLocationRules).toEqual([]);
  });

  it('returns only active branches for the current customer and business scope', async () => {
    const { service, branchRepository } = makeService({ branches: [branch(), branch({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isActive: false }), branch({ customerId: '22222222-2222-4222-8222-222222222222' }), branch({ businessScope: BusinessScope.OUT_OF_PROVINCE })] });
    expect(await service.getLocationOptions(customer().id, user(['business_group_member']))).toEqual([{ id: BRANCH_ID, branchCode: 'B01', branchName: '宁波商社', city: '宁波' }]);
    expect(branchRepository.find).toHaveBeenCalledWith({ where: { customerId: customer().id, businessScope: BusinessScope.BEILUN, isActive: true }, order: { branchCode: 'ASC', id: 'ASC' } });
  });

  it('keeps list, detail, branch options and writes within the authenticated business scope', async () => {
    const second = { ...customer('22222222-2222-4222-8222-222222222222'), businessScope: BusinessScope.OUT_OF_PROVINCE };
    const { service, ruleRepository } = makeService({ listCustomers: [customer(), second] });
    const caller = { ...user(['admin']), businessScope: BusinessScope.BEILUN };
    expect((await service.list({ page: 1, pageSize: 20 }, caller)).list.map((item) => item.customerId)).toEqual([customer().id]);
    await expect(service.get(second.id, caller)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getLocationOptions(second.id, caller)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.upsert(second.id, { salaryRules: { billingDay: 20 } }, caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(ruleRepository.save).not.toHaveBeenCalled();
  });

  it('requires employee type for edited onboarding configurations but permits legacy salary and mailbox-only updates', async () => {
    const { service } = makeService({ existingRule: { customerId: customer().id, onboardingDefaults: { need_esign: false } } });
    await expect(service.upsert(customer().id, { onboardingDefaults: { contract_subject: '主体' } }, user(['admin']))).rejects.toThrow('员工类型');
    await expect(service.upsert(customer().id, { onboardingDefaults: { employee_type: '   ' } }, user(['admin']))).rejects.toThrow('员工类型');
    const saved = await service.upsert(customer().id, { salaryRules: { billingDay: 20 }, sharedEmailRules: { mailbox: 'shared@example.test' } }, user(['admin']));
    expect(saved.onboardingDefaults).toEqual({ need_esign: false });
    expect(saved.readiness.missing).toContain('入职规则·员工类型');
  });

  it('shows missing employee type in each applicable location and accepts a location-specific employee type', async () => {
    const { service } = makeService({ branches: [branch()], existingRule: { customerId: customer().id, onboardingDefaults: { need_esign: false }, paymentLocationRules: [locationRule({ onboardingDefaults: {} })] } });
    expect((await service.get(customer().id, user(['admin']))).readiness.missing).toContain('宁波·入职规则·员工类型');
    const saved = await service.upsert(customer().id, { onboardingDefaults: { need_company_payroll: true }, paymentLocationRules: [locationRule()] }, user(['admin']));
    expect(saved.readiness.missing.some((item) => item.includes('员工类型'))).toBe(false);
  });

  it('stores payroll and informational fee fields as configured text without requiring fee fields', async () => {
    const { service } = makeService();
    const defaults = { employee_type: '正式员工', payroll_cycle: '当月', payroll_date: '31', need_payroll_slip: '是', purchased_products: '社保服务、工资代发', service_fee: '按合同约定', deposit: '未约定' };
    const saved = await service.upsert(customer().id, { onboardingDefaults: defaults }, user(['admin']));
    expect(saved.onboardingDefaults).toEqual(defaults);
    await expect(service.upsert(customer().id, { onboardingDefaults: { employee_type: '正式员工' } }, user(['admin']))).resolves.toMatchObject({ onboardingDefaults: { employee_type: '正式员工' } });
  });

  it.each([{ payroll_cycle: '上月' }, { payroll_date: '0' }, { payroll_date: '32' }, { payroll_date: 15 }, { need_payroll_slip: true }, { need_payroll_slip: '不知道' }, { purchased_products: [] }, { service_fee: 10 }, { deposit: false }])('rejects invalid payroll and fee rule values: %j', async (defaults) => {
    const { service } = makeService();
    await expect(service.upsert(customer().id, { onboardingDefaults: { employee_type: '正式员工', ...defaults } }, user(['admin']))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('defaults legacy payroll month to current and preserves previous through other salary patches', async () => {
    const { service } = makeService({ existingRule: { customerId: customer().id, salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1], payrollMonthMode: 'previous' } } });
    expect((await makeService().service.get(customer().id, user(['admin']))).salaryRules.payrollMonthMode).toBe('current');
    expect((await service.upsert(customer().id, { salaryRules: { reminderEnabled: false } }, user(['admin']))).salaryRules).toEqual({ billingDay: 20, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1], payrollMonthMode: 'previous' });
    for (const payrollMonthMode of ['next', null, 1, false]) await expect(service.upsert(customer().id, { salaryRules: { payrollMonthMode } }, user(['admin']))).rejects.toThrow('薪资所属月份');
  });

  it('never derives new payroll, fee, employee-type or branch mappings from historical orders', async () => {
    const defaults = { payroll_cycle: '次月', payroll_date: '15', need_payroll_slip: '是', purchased_products: '产品', service_fee: '100', deposit: '500', employee_type: '正式员工' };
    const { service, ruleRepository } = makeService({ workOrders: [{ customerId: customer().id, businessScope: BusinessScope.BEILUN, orderType: OrderType.ONBOARDING, status: WorkOrderStatus.COMPLETED, submittedAt: new Date('2026-09-10T00:00:00Z'), extraData: { ...defaults, need_esign: '否', branch_id: BRANCH_ID, social_location: '宁波', payrollMonthMode: 'previous' } }] });
    await service.importFromExistingOrders([customer().id], user(['admin']));
    expect(ruleRepository.save.mock.calls[0][0].onboardingDefaults).toEqual({ need_esign: false });
    expect(ruleRepository.save.mock.calls[0][0].paymentLocationRules).toEqual([]);
    expect(ruleRepository.save.mock.calls[0][0].salaryRules.payrollMonthMode).toBe('current');
  });

  it('adds only the payment-location JSONB column without rewriting existing rules or business data', async () => {
    const query = jest.fn();
    await new AddCustomerPaymentLocationRules20260910110000().up({ query } as any);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("ADD COLUMN IF NOT EXISTS payment_location_rules jsonb NOT NULL DEFAULT '[]'::jsonb"));
    expect(query.mock.calls[0][0]).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

});
