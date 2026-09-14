import { HttpException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { Repository } from 'typeorm';
import {
  Branch,
  BusinessScope,
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ImportJob,
  Notification,
  OperationLog,
  OrderAttachment,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
  ModuleHandler,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { toWorkOrderSubOrderItems } from 'src/modules/work-orders/work-order.mapper';
import {
  requiresResignationAttachmentOnSubmission,
  shouldDispatchWorkOrderChildAtSubmission,
  WorkOrderService,
} from 'src/modules/work-orders/work-order.service';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';

type TransactionManagerMock = {
  query: jest.Mock;
  getRepository: jest.Mock;
};

type RepositoryMock<T> = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  count: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: {
    transaction: jest.Mock;
    getRepository: jest.Mock;
  };
};

type QueryBuilderMock<T> = {
  leftJoinAndSelect: jest.Mock;
  andWhere: jest.Mock;
  addSelect: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getCount: jest.Mock;
  getMany: jest.Mock;
};

const fixedDate = new Date('2026-05-11T00:00:00.000Z');

function createRepositoryMock<T>(): RepositoryMock<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | Partial<T> | Array<T | Partial<T>>) => input as T),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(),
      getRepository: jest.fn(),
    },
  };
}

function createQueryBuilderMock<T>(rows: T[], total = rows.length): QueryBuilderMock<T> {
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getCount: jest.fn(async () => total),
    getMany: jest.fn(async () => rows),
  } as QueryBuilderMock<T>;
  qb.andWhere.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return qb;
}

function makeUser(overrides: Partial<JwtUserPayload> = {}): JwtUserPayload {
  return {
    sub: 'user-sales-1',
    username: 'sales01',
    roles: ['salesperson'],
    ...overrides,
  };
}

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'wo-1',
    orderNo: 'ON20260511001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.DRAFT,
    createdBy: 'user-sales-1',
    departmentId: 'dep-sales',
    customerId: 'customer-1',
    employeeName: 'Alice',
    employeeIdCard: '110101199001011234',
    extraData: {
      customer_name: 'Acme',
      customer_code: 'C001',
      employee_name: 'Alice',
      id_card_no: '110101199001011234',
      need_company_contract: '是',
      need_onboarding_contact: '是',
    },
    submittedAt: null,
    completedAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    creator: { id: 'user-sales-1', username: 'sales01', realName: 'Sales One' },
    department: { id: 'dep-sales', name: '业务部' },
    customer: { id: 'customer-1', customerCode: 'C001', customerName: 'Acme' },
    dispatchedOrders: [],
    ...overrides,
  });
}

function makeDispatched(overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  return Object.assign(new DispatchedOrder(), {
    id: 'do-1',
    parentOrderId: 'wo-1',
    moduleCode: 'contract',
    status: DispatchedOrderStatus.PENDING,
    handlerId: 'handler-contract-1',
    handler: { id: 'handler-contract-1', realName: 'Contract Handler' },
    visibleFields: ['employee_name', 'id_card_no'],
    returnReason: null,
    dispatchedAt: fixedDate,
    acceptedAt: null,
    completedAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  });
}

describe('WorkOrderService unit tests', () => {
  let workOrderRepository: RepositoryMock<WorkOrder>;
  let dispatchedOrderRepository: RepositoryMock<DispatchedOrder>;
  let fieldConfigRepository: RepositoryMock<FieldConfig>;
  let importJobRepository: RepositoryMock<ImportJob>;
  let notificationRepository: RepositoryMock<Notification>;
  let operationLogRepository: RepositoryMock<OperationLog>;
  let validationService: {
    resolveCustomerId: jest.Mock;
    resolveDepartmentId: jest.Mock;
    resolveBranchId: jest.Mock;
    generateOrderNo: jest.Mock;
    requireText: jest.Mock;
    validateWorkOrder: jest.Mock;
    resolveUserDepartmentIds: jest.Mock;
    normalizeHeader: jest.Mock;
  };
  let service: WorkOrderService;

  beforeEach(() => {
    workOrderRepository = createRepositoryMock<WorkOrder>();
    dispatchedOrderRepository = createRepositoryMock<DispatchedOrder>();
    fieldConfigRepository = createRepositoryMock<FieldConfig>();
    importJobRepository = createRepositoryMock<ImportJob>();
    notificationRepository = createRepositoryMock<Notification>();
    operationLogRepository = createRepositoryMock<OperationLog>();

    validationService = {
      resolveCustomerId: jest.fn(async () => 'customer-1'),
      resolveDepartmentId: jest.fn(async () => 'dep-sales'),
      resolveBranchId: jest.fn(async () => 'legacy-branch'),
      generateOrderNo: jest.fn(async () => 'ON20260511001'),
      requireText: jest.fn((value: unknown) => String(value)),
      validateWorkOrder: jest.fn(async () => undefined),
      resolveUserDepartmentIds: jest.fn(async () => ['dep-sales']),
      normalizeHeader: jest.fn((value: string) => value.trim().toLowerCase().replace(/\s+/g, '')),
    };

    service = new WorkOrderService(
      workOrderRepository as unknown as Repository<WorkOrder>,
      dispatchedOrderRepository as unknown as Repository<DispatchedOrder>,
      fieldConfigRepository as unknown as Repository<FieldConfig>,
      importJobRepository as unknown as Repository<ImportJob>,
      notificationRepository as unknown as Repository<Notification>,
      operationLogRepository as unknown as Repository<OperationLog>,
      validationService as unknown as WorkOrderValidationService,
      { getVisibleFieldsForScenario: jest.fn(async () => []), getPermissionsForUser: jest.fn(async () => new Map([['employee_name', 'visible'], ['mobile', 'readonly']])) } as never,
    );
  });

  it.each([
    ['是', '是', false, false],
    ['是', '否', false, false],
    ['否', '是', true, true],
    ['否', '否', true, false],
  ] as Array<[string, string, boolean, boolean]>)(
    'applies resignation submission rules for material collection=%s and certificate=%s',
    (share, certificate, attachmentRequired, certificateDispatched) => {
      const order = makeWorkOrder({
        orderType: OrderType.RESIGNATION,
        extraData: {
          need_resignation_share: share,
          need_resignation_cert: certificate,
        },
      });

      expect(requiresResignationAttachmentOnSubmission(order)).toBe(attachmentRequired);
      expect(shouldDispatchWorkOrderChildAtSubmission(order, 'resignation_cert')).toBe(certificateDispatched);
      expect(shouldDispatchWorkOrderChildAtSubmission(order, 'resignation_contact')).toBe(true);
    },
  );

  it.each([OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE])(
    'rejects province main-order creation through the generic endpoint: %s', async (orderType) => {
      await expect(service.createDraft({ orderType, extraData: {} }, makeUser()))
        .rejects.toMatchObject({ status: 410 });
      expect(workOrderRepository.save).not.toHaveBeenCalled();
      expect(validationService.resolveCustomerId).not.toHaveBeenCalled();
    },
  );

  it('creates a draft work order and persists all business fields in extraData', async () => {
    const saved = makeWorkOrder();
    workOrderRepository.save.mockResolvedValue(saved);
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({ dispatchedOrders: [] }));

    const result = await service.createDraft(
      {
        orderType: OrderType.ONBOARDING,
        extraData: {
          employee_name: 'Alice',
          id_card_no: '110101199001011234',
          need_company_contract: '是',
        },
      },
      makeUser(),
    );

    expect(validationService.resolveCustomerId).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ need_company_contract: '是' }),
      BusinessScope.BEILUN,
    );
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderNo: 'ON20260511001',
      status: WorkOrderStatus.DRAFT,
      extraData: expect.objectContaining({ need_company_contract: '是' }),
    }));
    expect(operationLogRepository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('wo-1');
    expect(result.extraData.need_company_contract).toBe('是');
  });

  it('keeps the existing branch resolver for callers that do not specify a portal branch', async () => {
    workOrderRepository.save.mockResolvedValue(makeWorkOrder());
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder());
    await service.createDraft({ orderType: OrderType.ONBOARDING, extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', customer_code: 'C001' } }, makeUser());
    expect(validationService.resolveBranchId).toHaveBeenCalledWith(undefined, 'customer-1', expect.any(Object), BusinessScope.BEILUN);
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'legacy-branch', branchCode: 'C001' }));
    expect(workOrderRepository.manager.getRepository).not.toHaveBeenCalled();
  });

  it('does not guess a branch or retain client branch codes when a portal location is not mapped', async () => {
    workOrderRepository.save.mockResolvedValue(makeWorkOrder());
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder());
    await service.createDraft({
      orderType: OrderType.ONBOARDING,
      extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', customer_code: 'C001', branchId: 'wrong-branch', branch_code: 'WRONG' },
    }, makeUser(), null);
    expect(validationService.resolveBranchId).not.toHaveBeenCalled();
    expect(workOrderRepository.manager.getRepository).not.toHaveBeenCalled();
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      branchId: null, branchCode: null,
      extraData: expect.not.objectContaining({ branchId: expect.anything(), branch_code: expect.anything() }),
    }));
  });

  it('uses an explicitly matched active customer branch and its authoritative code', async () => {
    const branchRepo = createRepositoryMock<Branch>();
    branchRepo.findOne.mockResolvedValue({ id: 'matched-branch', customerId: 'customer-1', businessScope: BusinessScope.BEILUN, isActive: true, branchCode: 'SH-002' });
    workOrderRepository.manager.getRepository.mockReturnValue(branchRepo);
    workOrderRepository.save.mockResolvedValue(makeWorkOrder());
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder());
    await service.createDraft({
      orderType: OrderType.ONBOARDING,
      extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', customer_code: 'C001', branch_code: 'WRONG' },
    }, makeUser(), 'matched-branch');
    expect(branchRepo.findOne).toHaveBeenCalledWith({ where: { id: 'matched-branch', customerId: 'customer-1', businessScope: BusinessScope.BEILUN, isActive: true } });
    expect(validationService.resolveBranchId).not.toHaveBeenCalled();
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'matched-branch', branchCode: 'SH-002', extraData: expect.objectContaining({ branchId: 'matched-branch', branch_code: 'SH-002' }) }));
  });

  it.each([
    { customerId: 'other-customer', businessScope: BusinessScope.BEILUN, isActive: true },
    { customerId: 'customer-1', businessScope: BusinessScope.OUT_OF_PROVINCE, isActive: true },
    { customerId: 'customer-1', businessScope: BusinessScope.BEILUN, isActive: false },
  ])('rejects a portal branch outside the matched customer scope: %p', async (record) => {
    const branchRepo = createRepositoryMock<Branch>();
    branchRepo.findOne.mockImplementation(async ({ where }) => Object.entries(record).every(([key, value]) => where[key] === value) ? { ...record, id: 'branch-1' } : null);
    workOrderRepository.manager.getRepository.mockReturnValue(branchRepo);
    await expect(service.createDraft({ orderType: OrderType.ONBOARDING, extraData: { employee_name: 'Alice', id_card_no: '110101199001011234' } }, makeUser(), 'branch-1')).rejects.toThrow('门户办理商社');
    expect(workOrderRepository.save).not.toHaveBeenCalled();
    expect(validationService.resolveBranchId).not.toHaveBeenCalled();
  });

  it('inherits the latest valid onboarding contract subject when creating a resignation draft', async () => {
    const onboarding = makeWorkOrder({
      id: 'wo-onboarding-history',
      status: WorkOrderStatus.COMPLETED,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        contract_subject: '历史劳动合同主体有限公司',
      },
    });
    const resignation = makeWorkOrder({
      id: 'wo-resignation',
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        contract_subject: '历史劳动合同主体有限公司',
      },
      dispatchedOrders: [],
    });
    workOrderRepository.findOne
      .mockResolvedValueOnce(onboarding)
      .mockResolvedValueOnce(resignation);

    await service.createDraft({
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
      },
    }, makeUser());

    expect(workOrderRepository.findOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        customerId: 'customer-1',
        employeeIdCard: '110101199001011234',
        orderType: OrderType.ONBOARDING,
        status: expect.anything(),
      }),
      order: { createdAt: 'DESC' },
    }));
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderType: OrderType.RESIGNATION,
      extraData: expect.objectContaining({
        contract_subject: '历史劳动合同主体有限公司',
      }),
    }));
  });

  it('keeps an explicitly supplied resignation insured unit instead of overwriting it from onboarding history', async () => {
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({
      id: 'wo-resignation',
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        insured_unit: '本次离职明确参保单位',
      },
      dispatchedOrders: [],
    }));

    await service.createDraft({
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        insured_unit: '本次离职明确参保单位',
      },
    }, makeUser());

    expect(workOrderRepository.findOne).toHaveBeenCalledTimes(1);
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({
        insured_unit: '本次离职明确参保单位',
      }),
    }));
    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.not.objectContaining({
        contract_subject: expect.anything(),
      }),
    }));
  });

  it('leaves the resignation contract subject empty when no onboarding subject is available', async () => {
    const resignation = makeWorkOrder({
      id: 'wo-resignation',
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
      },
      dispatchedOrders: [],
    });
    workOrderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(resignation);

    await service.createDraft({
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
      },
    }, makeUser());

    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.not.objectContaining({
        contract_subject: expect.anything(),
      }),
    }));
  });

  it('derives Beilun scope on the backend and strips client province scope aliases', async () => {
    const provinceOrder = makeWorkOrder({
      orderType: OrderType.ONBOARDING,
      businessScope: BusinessScope.BEILUN,
      extraData: {
        customer_name: 'Acme',
        customer_code: 'C001',
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        province: '福建',
      },
      dispatchedOrders: [],
    });
    workOrderRepository.save.mockImplementation(async (input) => input as WorkOrder);
    workOrderRepository.findOne.mockResolvedValue(provinceOrder);

    await service.createDraft({
      orderType: OrderType.ONBOARDING,
      extraData: {
        ...provinceOrder.extraData,
        businessScope: BusinessScope.OUT_OF_PROVINCE,
        business_scope: BusinessScope.OUT_OF_PROVINCE,
      },
    }, makeUser());

    expect(workOrderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderType: OrderType.ONBOARDING,
      businessScope: BusinessScope.BEILUN,
      extraData: expect.not.objectContaining({
        businessScope: expect.anything(),
        business_scope: expect.anything(),
      }),
    }));
  });

  it('updates draft extraData and records an operation log', async () => {
    const existing = makeWorkOrder({
      extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', mobile: 'old' },
    });
    workOrderRepository.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(makeWorkOrder({
        employeeName: 'Bob',
        extraData: { employee_name: 'Bob', id_card_no: '110101199001011234', mobile: '13800000000' },
      }));
    workOrderRepository.save.mockImplementation(async (input) => input as WorkOrder);

    const result = await service.update(
      'wo-1',
      { extraData: { employee_name: 'Bob', mobile: '13800000000' } },
      makeUser(),
    );

    expect(workOrderRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      employeeName: 'Bob',
      extraData: expect.objectContaining({ mobile: '13800000000' }),
    }));
    expect(operationLogRepository.save).toHaveBeenCalledTimes(1);
    expect(result.employeeName).toBe('Bob');
  });

  it.each([OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE])(
    'blocks generic update and submit for historical province main orders: %s', async (orderType) => {
      const order = makeWorkOrder({ orderType });
      workOrderRepository.findOne.mockResolvedValue(order);
      await expect(service.update(order.id, { extraData: { employee_name: 'Changed' } }, makeUser()))
        .rejects.toMatchObject({ status: 410 });
      const manager = { query: jest.fn(async () => []), getRepository: jest.fn(() => workOrderRepository) };
      workOrderRepository.manager.transaction.mockImplementation(async callback => callback(manager));
      await expect(service.submit(order.id, { extraData: { employee_name: 'Changed' } }, makeUser()))
        .rejects.toMatchObject({ status: 410 });
      expect(order.extraData.employee_name).not.toBe('Changed');
      expect(workOrderRepository.save).not.toHaveBeenCalled();
      expect(dispatchedOrderRepository.save).not.toHaveBeenCalled();
    },
  );

  it('blocks dispatch of persisted pending portal configuration before a payload can clear it', async () => {
    const draft = makeWorkOrder({ extraData: { employee_name: 'Alice', portal_configuration_pending: true } });
    const txWorkOrderRepo = createRepositoryMock<WorkOrder>();
    txWorkOrderRepo.findOne.mockResolvedValue(draft);
    const manager: TransactionManagerMock = { query: jest.fn(async () => []), getRepository: jest.fn((entity) => entity === WorkOrder ? txWorkOrderRepo : createRepositoryMock<unknown>()) };
    workOrderRepository.manager.transaction.mockImplementation(async (callback) => callback(manager));
    await expect(service.submit('wo-1', { extraData: { portal_configuration_pending: false, employee_name: 'Changed' } }, makeUser())).rejects.toThrow('门户办理配置尚未补齐');
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['work_order:submit:wo-1']);
    expect(draft.extraData.portal_configuration_pending).toBe(true);
    expect(draft.extraData.employee_name).toBe('Alice');
    expect(validationService.validateWorkOrder).not.toHaveBeenCalled();
    expect(txWorkOrderRepo.save).not.toHaveBeenCalled();
  });

  it('does not allow ordinary draft updates to clear the pending portal configuration flag before submission', async () => {
    const draft = makeWorkOrder({ extraData: { employee_name: 'Alice', portal_configuration_pending: true } });
    workOrderRepository.findOne.mockResolvedValue(draft);
    await expect(service.update('wo-1', { extraData: { portal_configuration_pending: false } }, makeUser())).rejects.toThrow('只能通过客户办理配置同步更新');
    expect(draft.extraData.portal_configuration_pending).toBe(true);
    expect(workOrderRepository.save).not.toHaveBeenCalled();
  });

  it('submits a draft, builds onboarding children via helper, and notifies handlers', async () => {
    const draft = makeWorkOrder();
    const detailed = makeWorkOrder({
      status: WorkOrderStatus.PROCESSING,
      submittedAt: fixedDate,
      dispatchedOrders: [makeDispatched({ id: 'do-contract', moduleCode: 'contract' })],
    });
    workOrderRepository.findOne.mockResolvedValue(detailed);

    const txWorkOrderRepo = createRepositoryMock<WorkOrder>();
    const txDispatchedRepo = createRepositoryMock<DispatchedOrder>();
    const txNotificationRepo = createRepositoryMock<Notification>();
    const txOperationLogRepo = createRepositoryMock<OperationLog>();
    const txModuleHandlerRepo = createRepositoryMock<ModuleHandler>();
    txModuleHandlerRepo.findOne.mockImplementation(async ({ where }: { where: { moduleCode: string } }) => ({ handlerId: `handler-${where.moduleCode}` }));
    txWorkOrderRepo.findOne.mockResolvedValue(draft);
    txWorkOrderRepo.save.mockImplementation(async (input) => input as WorkOrder);
    txDispatchedRepo.save.mockImplementation(async (input) => {
      const children = Array.isArray(input) ? input : [input];
      return children.map((child, index) => ({
        ...child,
        id: `do-${index + 1}`,
      } as DispatchedOrder));
    });

    const manager: TransactionManagerMock = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return txWorkOrderRepo as unknown as RepositoryMock<unknown>;
        if (entity === DispatchedOrder) return txDispatchedRepo as unknown as RepositoryMock<unknown>;
        if (entity === ModuleHandler) return txModuleHandlerRepo as unknown as RepositoryMock<unknown>;
        if (entity === Notification) return txNotificationRepo as unknown as RepositoryMock<unknown>;
        return txOperationLogRepo as unknown as RepositoryMock<unknown>;
      }),
    };
    workOrderRepository.manager.transaction.mockImplementation(async (callback) => callback(manager));

    const result = await service.submit('wo-1', { extraData: { payroll_location: '宁波' } }, makeUser());

    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['work_order:submit:wo-1']);
    expect(validationService.validateWorkOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'wo-1' }));
    const savedModules = txDispatchedRepo.save.mock.calls
      .flatMap((call) => (Array.isArray(call[0]) ? call[0] : [call[0]]))
      .map((entry: { moduleCode: string }) => entry.moduleCode)
      .sort();
    expect(savedModules).toEqual(['contract', 'data_entry', 'onboarding_contact', 'payroll_bank_card', 'social_insurance']);
    expect(txNotificationRepo.save).toHaveBeenCalledTimes(4);
    const notifications = txNotificationRepo.save.mock.calls.map(([row]) => row as Notification);
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'handler-contract', content: '主工单 ON20260511001 分派到 劳动合同新签', payload: expect.objectContaining({ moduleCode: 'contract', moduleName: '劳动合同新签' }) }),
      expect.objectContaining({ userId: 'handler-data_entry', content: '主工单 ON20260511001 分派到 增员报岗录入', payload: expect.objectContaining({ moduleCode: 'data_entry', moduleName: '增员报岗录入' }) }),
      expect.objectContaining({ userId: 'handler-onboarding_contact', content: '主工单 ON20260511001 分派到 入职联系', payload: expect.objectContaining({ moduleCode: 'onboarding_contact', moduleName: '入职联系' }) }),
      expect.objectContaining({ userId: 'handler-social_insurance', content: '主工单 ON20260511001 分派到 社保公积金增员', payload: expect.objectContaining({ moduleCode: 'social_insurance', moduleName: '社保公积金增员' }) }),
    ]));
    expect(notifications.map((item) => item.content).join(' ')).not.toContain('social_insurance');
    expect(result.dispatchedOrders.map((item) => item.moduleCode).sort()).toEqual(['contract', 'data_entry', 'onboarding_contact', 'social_insurance']);
  });

  it('rejects resignation submission without an attachment when material collection is disabled', async () => {
    const draft = makeWorkOrder({
      orderType: OrderType.RESIGNATION,
      extraData: {
        employee_name: 'Alice',
        id_card_no: '110101199001011234',
        need_resignation_share: '否',
        need_resignation_cert: '是',
      },
    });
    const txWorkOrderRepo = createRepositoryMock<WorkOrder>();
    const txAttachmentRepo = createRepositoryMock<OrderAttachment>();
    txWorkOrderRepo.findOne.mockResolvedValue(draft);
    txAttachmentRepo.count.mockResolvedValue(0);
    const manager: TransactionManagerMock = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return txWorkOrderRepo as unknown as RepositoryMock<unknown>;
        if (entity === OrderAttachment) return txAttachmentRepo as unknown as RepositoryMock<unknown>;
        return createRepositoryMock<unknown>();
      }),
    };
    workOrderRepository.manager.transaction.mockImplementation(async (callback) => callback(manager));

    await expect(service.submit('wo-1', {}, makeUser())).rejects.toThrow('附件至少上传一份');
    expect(txAttachmentRepo.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workOrderId: 'wo-1',
        bizPurpose: 'resignation_material',
      }),
    }));
    expect(txWorkOrderRepo.save).not.toHaveBeenCalled();
  });

  it('filters list results by own creator, submitted time, and returns pagination metadata', async () => {
    const rows = [makeWorkOrder({ id: 'wo-1' }), makeWorkOrder({ id: 'wo-2', orderNo: 'ON20260511002' })];
    const qb = createQueryBuilderMock(rows, 2);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll(
      {
        page: 2,
        pageSize: 10,
        status: WorkOrderStatus.PROCESSING,
        submittedAfter: '2026-08-01T00:00:00.000Z',
        submittedBefore: '2026-08-31T23:59:59.999Z',
      },
      makeUser({ sub: 'leader-1', roles: ['business_group_leader', 'salesperson'] }),
    );

    expect(validationService.resolveUserDepartmentIds).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('w.created_by = :userId', { userId: 'leader-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('w.status = :status', { status: WorkOrderStatus.PROCESSING });
    expect(qb.andWhere).toHaveBeenCalledWith('w.submitted_at >= :submittedAfter', { submittedAfter: '2026-08-01T00:00:00.000Z' });
    expect(qb.andWhere).toHaveBeenCalledWith('w.submitted_at <= :submittedBefore', { submittedBefore: '2026-08-31T23:59:59.999Z' });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 2, page: 2, pageSize: 10 });
    expect(result.items).toHaveLength(2);
  });

  it('uses latest submitted time by default and leaves drafts last', async () => {
    const qb = createQueryBuilderMock([makeWorkOrder()], 1);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll(
      { page: 1, pageSize: 20 },
      makeUser({ roles: ['admin'] }),
    );

    expect(qb.orderBy).toHaveBeenCalledWith('w.submittedAt', 'DESC', 'NULLS LAST');
    expect(qb.orderBy).not.toHaveBeenCalledWith('status_priority', 'ASC');
  });

  it('supports explicit submitted-time and created-time sorting', async () => {
    const qb = createQueryBuilderMock([makeWorkOrder()], 1);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll(
      { page: 1, pageSize: 20, sort: 'submitted_at:asc' },
      makeUser({ roles: ['admin'] }),
    );

    expect(qb.orderBy).toHaveBeenCalledWith('w.submittedAt', 'ASC');
  });

  it('lets an explicit created-time sort override the default submitted-time order', async () => {
    const qb = createQueryBuilderMock([makeWorkOrder()], 1);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll(
      { page: 1, pageSize: 20, sort: 'created_at:asc' },
      makeUser({ roles: ['admin'] }),
    );

    expect(qb.orderBy).toHaveBeenCalledWith('w.createdAt', 'ASC');
  });

  it('exports only selected onboarding/resignation main orders for administrators', async () => {
    const order = makeWorkOrder({
      id: 'wo-export',
      orderType: OrderType.RESIGNATION,
      extraData: {
        position: '工程师',
        bank_name: '=危险公式',
        social_insurance_result: '是',
        medical_insurance_result: '否',
        housing_fund_result: '是',
        social_insurance_remark: '已反馈',
      },
    });
    workOrderRepository.find.mockResolvedValue([order]);
    dispatchedOrderRepository.find.mockResolvedValue([
      makeDispatched({
        parentOrderId: 'wo-export',
        moduleCode: 'social_insurance',
        status: DispatchedOrderStatus.COMPLETED,
      }),
    ]);
    fieldConfigRepository.find.mockResolvedValue([
      { fieldCode: 'position', fieldName: '岗位', displayOrder: 1, isActive: true },
      { fieldCode: 'bank_name', fieldName: '开户银行', displayOrder: 2, isActive: true },
    ] as FieldConfig[]);

    const result = await service.batchExport(
      ['wo-export'],
      OrderType.RESIGNATION,
      makeUser({ roles: ['admin'] }),
    );

    expect(workOrderRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderType: OrderType.RESIGNATION, businessScope: BusinessScope.BEILUN }),
      relations: { creator: true },
    }));
    expect(result.fileName).toMatch(/^离职主工单批量导出-\d{8}\.xlsx$/);
    expect(result.rowCount).toBe(1);
    expect(result.buffer).toBeInstanceOf(Buffer);

    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining([
      '工单编号', '员工姓名', '岗位', '开户银行', '提交时间',
      '社保公积金状态', '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注',
    ]));
    const headers = sheet.getRow(1).values as unknown[];
    const statusColumn = headers.findIndex((value) => value === '社保公积金状态');
    const feedbackColumn = headers.findIndex((value) => value === '社保是否办结');
    expect(sheet.getRow(2).getCell(statusColumn).value).toBe('已完成');
    expect(sheet.getRow(2).getCell(feedbackColumn).value).toBe('是');
    const bankNameColumn = headers.findIndex((value) => value === '开户银行');
    expect(bankNameColumn).toBeGreaterThan(0);
    expect(sheet.getRow(2).getCell(bankNameColumn).value).toBe("'=危险公式");
  });

  it('rejects main-order export for non-administrators', async () => {
    await expect(service.batchExport(['wo-1'], OrderType.ONBOARDING, makeUser())).rejects.toMatchObject({
      status: 403,
    });
  });

  it('includes dispatched order summaries in list response after parent pagination', async () => {
    const rows = [makeWorkOrder({ id: 'wo-1' }), makeWorkOrder({ id: 'wo-2', orderNo: 'ON20260511002' })];
    const qb = createQueryBuilderMock(rows, 2);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);
    dispatchedOrderRepository.find.mockResolvedValue([
      makeDispatched({
        id: 'do-social',
        parentOrderId: 'wo-1',
        moduleCode: 'social_insurance',
        status: DispatchedOrderStatus.PROCESSING,
        handlerId: 'handler-social-1',
        handler: { id: 'handler-social-1', realName: 'Social Handler' } as never,
      }),
      makeDispatched({ id: 'do-contract', parentOrderId: 'wo-1', moduleCode: 'contract' }),
    ]);

    const result = await service.findAll({ page: 1, pageSize: 20 }, makeUser());

    expect(dispatchedOrderRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ parentOrderId: expect.any(Object) }),
      relations: { handler: true },
    }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].dispatched_orders?.map((item) => item.moduleCode)).toEqual(['contract', 'social_insurance']);
    expect(result.items[0].sub_orders?.map((item) => item.handlerName)).toEqual(['Contract Handler', 'Social Handler']);
    expect(result.items[0].dispatchedOrders).toBe(result.items[0].subOrders);
    expect(result.items[1].dispatched_orders).toEqual([]);
  });

  it('allows business owners to read all business-team work orders within their department tree', async () => {
    const rows = [makeWorkOrder({ id: 'wo-1' })];
    const qb = createQueryBuilderMock(rows, 1);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll(
      { page: 1, pageSize: 10, status: WorkOrderStatus.PROCESSING },
      makeUser({ sub: 'owner-1', roles: ['business_owner'] }),
    );

    expect(validationService.resolveUserDepartmentIds).toHaveBeenCalledWith('owner-1');
    expect(qb.andWhere).toHaveBeenCalledWith('w.department_id IN (:...departmentIds)', { departmentIds: ['dep-sales'] });
    expect(qb.andWhere).toHaveBeenCalledWith('w.status = :status', { status: WorkOrderStatus.PROCESSING });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 10 });
  });

  it('removes a work order, clears related unread reminders, and writes an operation log', async () => {
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({ id: 'wo-delete', orderNo: 'ON-DELETE', dispatchedOrders: [] }));
    dispatchedOrderRepository.find.mockResolvedValue([
      makeDispatched({ id: 'do-delete-1', parentOrderId: 'wo-delete' }),
    ]);
    const relatedByWorkOrder = Object.assign(new Notification(), {
      id: 'n-work-order',
      isRead: false,
      readAt: null,
      payload: { workOrderId: 'wo-delete' },
      link: '/work-orders/wo-delete',
    });
    const relatedByChild = Object.assign(new Notification(), {
      id: 'n-child',
      isRead: false,
      readAt: null,
      payload: { dispatchedOrderId: 'do-delete-1' },
      link: '/my-dispatched/do-delete-1',
    });
    const unrelated = Object.assign(new Notification(), {
      id: 'n-other',
      isRead: false,
      readAt: null,
      payload: { workOrderId: 'wo-other' },
      link: '/work-orders/wo-other',
    });
    notificationRepository.find.mockResolvedValue([relatedByWorkOrder, relatedByChild, unrelated]);

    const result = await service.remove('wo-delete', makeUser({ sub: 'admin-1', roles: ['admin'] }));

    expect(workOrderRepository.delete).toHaveBeenCalledWith('wo-delete');
    expect(notificationRepository.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'n-work-order', isRead: true, readAt: expect.any(Date) }),
      expect.objectContaining({ id: 'n-child', isRead: true, readAt: expect.any(Date) }),
    ]));
    expect(unrelated.isRead).toBe(false);
    expect(operationLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'work_order', entityId: 'wo-delete', actionType: 'delete' }));
    expect(result).toEqual({ success: true, id: 'wo-delete' });
  });

  it('denies work order detail access to unrelated execution users', async () => {
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({ createdBy: 'owner-1' }));

    await expect(
      service.findOne('wo-1', makeUser({ sub: 'other-1', roles: ['salesperson'] })),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('excludes payroll export records from work-order child summaries', () => {
    const children = toWorkOrderSubOrderItems([
      makeDispatched({ id: 'do-contract', moduleCode: 'contract' }),
      makeDispatched({ id: 'do-payroll', moduleCode: 'payroll_bank_card', handlerId: null }),
    ]);

    expect(children).toEqual([
      expect.objectContaining({ id: 'do-contract', moduleCode: 'contract' }),
    ]);
  });

  // 历史用例「maps resignation_date to last_work_date」已删除：mapper 不再输出扁平 lastWorkDate/last_work_date，
  // 前端列表直接读取 extra_data.last_work_date（见 OnboardingModule/index.tsx），HEAD 上该断言早已失配。

  it('restricts resignation certificate child summaries to handlers, admins, and business creators', async () => {
    const filter = (service as unknown as {
      filterSubOrdersByUserPermission: (
        parentCreatedBy: string,
        subOrders: ReturnType<typeof toWorkOrderSubOrderItems>,
        user: JwtUserPayload,
      ) => Promise<Array<{ moduleCode: string }>>;
    }).filterSubOrdersByUserPermission.bind(service);
    const children = toWorkOrderSubOrderItems([
      makeDispatched({ id: 'do-cert', moduleCode: 'resignation_cert', handlerId: 'yang-id' }),
      makeDispatched({ id: 'do-social', moduleCode: 'resignation_social_insurance', handlerId: 'social-id' }),
    ]);

    await expect(filter('social-id', children, makeUser({
      sub: 'social-id',
      username: 'fuqianwen',
      realName: '傅倩雯',
      roles: ['social_insurance_specialist'],
    }))).resolves.toEqual([
      expect.objectContaining({ moduleCode: 'resignation_social_insurance' }),
    ]);

    for (const handler of [
      makeUser({ sub: 'yang-id', username: 'yangchun', realName: '杨纯', roles: ['contract_specialist'] }),
      makeUser({ sub: 'jiang-id', username: 'jianglu', realName: '江璐', roles: ['shared_leader'] }),
    ]) {
      await expect(filter('creator-id', children, handler)).resolves.toEqual([
        expect.objectContaining({ moduleCode: 'resignation_cert' }),
      ]);
    }

    await expect(filter('creator-id', children, makeUser({ sub: 'admin-id', roles: ['admin'] }))).resolves.toHaveLength(2);

    // 任务1：业务侧父单创建人（业务员/组长）可查看自己主工单下的离职证明子工单。
    for (const businessRole of [['business_group_member'], ['business_group_leader']]) {
      await expect(filter('biz-creator-id', children, makeUser({
        sub: 'biz-creator-id',
        username: 'member1',
        roles: businessRole,
      }))).resolves.toHaveLength(2);
    }

    // 非创建人的业务员仍无权查看他人的离职证明子工单。
    await expect(filter('biz-creator-id', children, makeUser({
      sub: 'biz-other-id',
      username: 'member2',
      roles: ['business_group_member'],
    }))).resolves.toEqual([]);
  });

  it('creates the historical resignation certificate in dispatched_orders and notifies only on first creation', async () => {
    const source = makeWorkOrder({
      id: 'wo-resign',
      orderNo: 'ON20260709003',
      orderType: OrderType.RESIGNATION,
      status: WorkOrderStatus.PROCESSING,
      extraData: { need_resignation_cert: '否' },
    });
    const certificate = makeDispatched({
      id: 'do-resignation-cert',
      parentOrderId: source.id,
      moduleCode: 'resignation_cert',
      handlerId: 'handler-cert',
    });
    const automation = {
      ensureManualForWorkOrder: jest.fn()
        .mockResolvedValueOnce({ order: certificate, created: true })
        .mockResolvedValueOnce({ order: certificate, created: false }),
    };
    const txWorkOrderRepo = createRepositoryMock<WorkOrder>();
    const txNotificationRepo = createRepositoryMock<Notification>();
    const txOperationLogRepo = createRepositoryMock<OperationLog>();
    txWorkOrderRepo.findOne.mockResolvedValue(source);
    txWorkOrderRepo.save.mockImplementation(async (input) => input as WorkOrder);
    const manager: TransactionManagerMock = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return txWorkOrderRepo as unknown as RepositoryMock<unknown>;
        if (entity === Notification) return txNotificationRepo as unknown as RepositoryMock<unknown>;
        return txOperationLogRepo as unknown as RepositoryMock<unknown>;
      }),
    };
    workOrderRepository.manager.transaction.mockImplementation(async (callback) => callback(manager));
    service = new WorkOrderService(
      workOrderRepository as unknown as Repository<WorkOrder>,
      dispatchedOrderRepository as unknown as Repository<DispatchedOrder>,
      fieldConfigRepository as unknown as Repository<FieldConfig>,
      importJobRepository as unknown as Repository<ImportJob>,
      notificationRepository as unknown as Repository<Notification>,
      operationLogRepository as unknown as Repository<OperationLog>,
      validationService as unknown as WorkOrderValidationService,
      { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      automation as never,
    );

    await expect(service.setHistoricalResignationCertificate(
      source.id,
      '是',
      true,
      makeUser({ sub: 'admin-id', roles: ['admin'] }),
    )).resolves.toEqual({
      workOrderId: source.id,
      needResignationCert: '是',
      certificateOrderId: certificate.id,
    });
    expect(txOperationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'dispatched_order',
      entityId: certificate.id,
      actionType: 'dispatched',
    }));
    expect(txNotificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'handler-cert',
      link: `/dispatched-orders/${certificate.id}`,
      payload: expect.objectContaining({ moduleCode: 'resignation_cert' }),
    }));

    txNotificationRepo.save.mockClear();
    txOperationLogRepo.save.mockClear();
    await service.setHistoricalResignationCertificate(
      source.id,
      '是',
      true,
      makeUser({ sub: 'admin-id', roles: ['admin'] }),
    );

    expect(txNotificationRepo.save).not.toHaveBeenCalled();
    expect(txOperationLogRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'dispatched_order',
      actionType: 'dispatched',
    }));
  });

  it('allows salesperson to update a processing work order and resubmit it to pending', async () => {
    const resubmitService = {
      resubmit: jest.fn(async () => ({
        workOrder: { id: 'wo-1', status: WorkOrderStatus.PENDING },
        dispatchedOrders: [],
      })),
    };
    service = new WorkOrderService(
      workOrderRepository as unknown as Repository<WorkOrder>,
      dispatchedOrderRepository as unknown as Repository<DispatchedOrder>,
      fieldConfigRepository as unknown as Repository<FieldConfig>,
      importJobRepository as unknown as Repository<ImportJob>,
      notificationRepository as unknown as Repository<Notification>,
      operationLogRepository as unknown as Repository<OperationLog>,
      validationService as unknown as WorkOrderValidationService,
      { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
      resubmitService as never,
    );
    const processing = makeWorkOrder({
      status: WorkOrderStatus.PROCESSING,
      extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', mobile: 'old' },
    });
    workOrderRepository.findOne
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(makeWorkOrder({
        status: WorkOrderStatus.PROCESSING,
        extraData: { employee_name: 'Alice', id_card_no: '110101199001011234', mobile: '13800000000' },
      }));

    await service.update('wo-1', { extraData: { mobile: '13800000000' } }, makeUser());
    const result = await service.resubmit('wo-1', {}, makeUser());

    expect(resubmitService.resubmit).toHaveBeenCalledWith('wo-1', {}, expect.objectContaining({ sub: 'user-sales-1' }));
    expect(result.workOrder.status).toBe(WorkOrderStatus.PENDING);
    expect(workOrderRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PENDING }));
    expect(operationLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'salesperson_modify_resubmit',
      afterData: expect.objectContaining({
        auditTitle: '业务员修改后重提',
        contextFields: expect.objectContaining({
          oldStatus: WorkOrderStatus.PROCESSING,
          newStatus: WorkOrderStatus.PENDING,
        }),
      }),
    }));
  });

  it('does not expose the legacy confirmImport bypass on WorkOrderService', () => {
    expect('confirmImport' in service).toBe(false);
    expect((service as unknown as { confirmImport?: unknown }).confirmImport).toBeUndefined();
  });

  it('requires a claimed portal reviewer and protects source fields before submit',async()=>{
    const guard=(service as unknown as {assertPortalReviewWrite(order:WorkOrder,user:JwtUserPayload,patch?:Record<string,unknown>):Promise<void>}).assertPortalReviewWrite.bind(service);
    const portal=makeWorkOrder({extraData:{portal_intake_key:'intake',portal_reviewed_by:'other'}});
    await expect(guard(portal,makeUser())).rejects.toThrow('认领');
    portal.extraData.portal_reviewed_by='user-sales-1';
    await expect(guard(portal,makeUser())).resolves.toBeUndefined();
    await expect(guard(portal,makeUser(),{employee_name:'Changed'})).resolves.toBeUndefined();
    await expect(guard(portal,makeUser(),{mobile:'Changed'})).rejects.toThrow('无权修改');
    await expect(guard(portal,makeUser(),{portal_intake_key:'Changed'})).rejects.toThrow('系统配置维护');
  });

  it.each([{ customerId: 'other-customer' }, { departmentId: 'other-department' }])('protects portal identity during update: %p', async (patch) => {
    const portal = makeWorkOrder({extraData:{portal_intake_key:'intake',portal_reviewed_by:'user-sales-1'}});
    workOrderRepository.findOne.mockResolvedValue(portal);
    await expect(service.update(portal.id,patch,makeUser())).rejects.toThrow('客户和审核部门不可');
    expect(portal.customerId).toBe('customer-1');
    expect(portal.departmentId).toBe('dep-sales');
    expect(workOrderRepository.save).not.toHaveBeenCalled();
  });

  it.each([false, 'false'])('normalizes explicit portal false (%p) to the active dropdown before business validation', async (value) => {
    const portal = makeWorkOrder({extraData:{portal_intake_key:'intake',portal_reviewed_by:'user-sales-1',need_esign:value,need_company_contract:true}});
    fieldConfigRepository.find.mockResolvedValue([
      {fieldCode:'need_esign',dropdownOptions:['1.是','2.否']},
      {fieldCode:'need_company_contract',dropdownOptions:['是','否']},
    ]);
    const manager: TransactionManagerMock = {query:jest.fn(async()=>[]),getRepository:jest.fn(()=>workOrderRepository)};
    workOrderRepository.manager.transaction.mockImplementation(async callback=>callback(manager));
    workOrderRepository.findOne.mockResolvedValue(portal);
    validationService.validateWorkOrder.mockRejectedValue(new Error('validation checkpoint'));
    await expect(service.submit(portal.id,{},makeUser())).rejects.toThrow('validation checkpoint');
    expect(validationService.validateWorkOrder).toHaveBeenCalledWith(expect.objectContaining({extraData:expect.objectContaining({need_esign:'2.否',need_company_contract:'是'})}));
    expect(workOrderRepository.save).not.toHaveBeenCalled();
  });

});
