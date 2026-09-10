import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessScope, Customer, CustomerPortalRule, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
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

function queryBuilder(result: Customer | null, list: Customer[] = result ? [result] : []) {
  let customerId: string | undefined;
  let customerIds: string[] | undefined;
  let activeOnly = false;
  let skip = 0;
  let take = list.length;
  const filter = () => list.filter((item) => (!activeOnly || item.isActive)
    && (!customerId || item.id === customerId) && (!customerIds || customerIds.includes(item.id)));
  const applyWhere = (sql: string, params?: { customerId?: string; customerIds?: string[] }) => {
    if (sql === 'customer.id = :customerId') customerId = params?.customerId;
    if (sql === 'customer.id IN (:...customerIds)') customerIds = params?.customerIds;
    if (sql === 'customer.isActive = true') activeOnly = true;
    return qb;
  };
  const qb: any = {
    where: jest.fn((sql, params) => { customerId = undefined; customerIds = undefined; activeOnly = false; return applyWhere(sql, params); }),
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
  return {
    service: new CustomerRulesService(ruleRepository, customerRepository, workOrderRepository),
    customerQb,
    ruleRepository,
    customerRepository,
    workOrderRepository,
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

  it('allows every business role to list all active customers without assignee filtering', async () => {
    for (const role of ['business_group_member', 'business_group_leader', 'salesperson']) {
      const { service, customerQb } = makeService();
      const result = await service.list({ page: 1, pageSize: 20 }, user([role], 'sales-1'));
      expect(result.total).toBe(1);
      expect(customerQb.innerJoin).not.toHaveBeenCalled();
    }
  });

  it('allows a business member to maintain any existing customer and only rejects missing customers', async () => {
    const { service } = makeService();
    await expect(service.get('11111111-1111-4111-8111-111111111111', user(['business_group_member']))).resolves.toMatchObject({ customerId: '11111111-1111-4111-8111-111111111111' });

    const missing = makeService({ accessibleCustomer: null, customerExists: true });
    await expect(missing.service.get('22222222-2222-4222-8222-222222222222', user(['business_group_member']))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts only the internal onboarding default whitelist and normalizes values', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: {
        business_mode: '  直营网  ',
        need_esign: true,
        fund_ratio: 12,
        special_remark: '',
      },
    }, user(['business_group_member']));

    expect(result.onboardingDefaults).toEqual({ business_mode: '直营网', need_esign: true, fund_ratio: 12 });
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
    expect(result.salaryRules).toEqual({ billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] });
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
        onboardingDefaults: { contract_subject: '浙江企服', need_esign: true },
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
      onboardingDefaults: { contract_subject: '浙江企服', need_esign: true },
      resignationDefaults: { need_resignation_cert: '否' },
      salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
      sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'CUST001' },
      readiness: { ready: true, missing: [] },
    });
    expect(result).not.toHaveProperty('completionEmailTo');
  });

  it('batch imports valid customers and reports invalid rows without losing valid rows', async () => {
    const { service } = makeService();
    const result = await service.batchUpsert([
      { customerId: '11111111-1111-4111-8111-111111111111', rule: { onboardingDefaults: { contract_subject: '浙江企服' } } },
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
      onboardingDefaults: { contract_subject: '人工主体', need_esign: false },
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
    expect(result.onboardingDefaults).toEqual({ contract_subject: '人工主体', need_esign: false, business_mode: '新增业务模式' });
    expect(result.resignationDefaults).toMatchObject({ need_resignation_cert: '是', cert_delivery_address: '人工地址', cert_delivery_method: '电子版' });
    expect(result.salaryRules).toEqual({ billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] });
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
      onboardingDefaults: { contract_subject: '人工主体', special_remark: '旧说明' },
    } });
    const result = await service.upsert('11111111-1111-4111-8111-111111111111', {
      onboardingDefaults: { special_remark: null, fund_ratio: '5%+5%' },
    }, user(['admin']));
    expect(result.onboardingDefaults).toEqual({ contract_subject: '人工主体', fund_ratio: '5%+5%' });
  });

  it('reports malformed rows and original Excel row numbers while continuing valid rows', async () => {
    const { service, ruleRepository } = makeService();
    const result = await service.batchUpsert([
      null,
      { customerId: '', rule: {} },
      { customerId: 'CUST001', rule: { isActive: true }, rowNumber: 9 },
      { customerId: '11111111-1111-4111-8111-111111111111', rule: { onboardingDefaults: { need_esign: false } }, rowNumber: 12 },
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
      { customerId: other, rule: { onboardingDefaults: { contract_subject: '正确客户' } } },
    ], user(['admin']));
    expect(result).toMatchObject({ successCount: 1, failedCount: 2 });
    expect(result.results.slice(0, 2).every((row) => row.message.includes('重复'))).toBe(true);
    expect(ruleRepository.save).toHaveBeenCalledTimes(1);
    expect(ruleRepository.save.mock.calls[0][0]).toMatchObject({ customerId: other, onboardingDefaults: { contract_subject: '正确客户' } });
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

});
