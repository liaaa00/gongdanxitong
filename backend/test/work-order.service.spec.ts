import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ImportJob,
  Notification,
  OperationLog,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
  ModuleHandler,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';
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
  };
};

type QueryBuilderMock<T> = {
  andWhere: jest.Mock;
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
    },
  };
}

function createQueryBuilderMock<T>(rows: T[], total = rows.length): QueryBuilderMock<T> {
  const qb = {
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getCount: jest.fn(async () => total),
    getMany: jest.fn(async () => rows),
  } as QueryBuilderMock<T>;
  qb.andWhere.mockReturnValue(qb);
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
      { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
    );
  });

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
    expect(savedModules).toEqual(['contract', 'data_entry', 'onboarding_contact', 'social_insurance']);
    expect(txNotificationRepo.save).toHaveBeenCalledTimes(4);
    expect(result.dispatchedOrders.map((item) => item.moduleCode).sort()).toEqual(['contract', 'data_entry', 'onboarding_contact', 'social_insurance']);
  });

  it('filters list results by business group leader department scope and returns pagination metadata', async () => {
    const rows = [makeWorkOrder({ id: 'wo-1' }), makeWorkOrder({ id: 'wo-2', orderNo: 'ON20260511002' })];
    const qb = createQueryBuilderMock(rows, 2);
    workOrderRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll(
      { page: 2, pageSize: 10, status: WorkOrderStatus.PROCESSING },
      makeUser({ sub: 'leader-1', roles: ['business_group_leader', 'salesperson'] }),
    );

    expect(validationService.resolveUserDepartmentIds).toHaveBeenCalledWith('leader-1');
    expect(qb.andWhere).toHaveBeenCalledWith('w.department_id IN (:...departmentIds)', { departmentIds: ['dep-sales'] });
    expect(qb.andWhere).toHaveBeenCalledWith('w.status = :status', { status: WorkOrderStatus.PROCESSING });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 2, page: 2, pageSize: 10 });
    expect(result.items).toHaveLength(2);
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

  it('removes a work order and writes an operation log', async () => {
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({ id: 'wo-delete', dispatchedOrders: [] }));

    const result = await service.remove('wo-delete', makeUser({ sub: 'admin-1', roles: ['admin'] }));

    expect(workOrderRepository.delete).toHaveBeenCalledWith('wo-delete');
    expect(operationLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'work_order', entityId: 'wo-delete', actionType: 'delete' }));
    expect(result).toEqual({ success: true, id: 'wo-delete' });
  });

  it('denies work order detail access to unrelated execution users', async () => {
    workOrderRepository.findOne.mockResolvedValue(makeWorkOrder({ createdBy: 'owner-1' }));

    await expect(
      service.findOne('wo-1', makeUser({ sub: 'other-1', roles: ['salesperson'] })),
    ).rejects.toBeInstanceOf(HttpException);
  });

});
