import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ImportJob,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderType,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderFieldDirtyMark,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';

interface HarnessOptions {
  workOrder: WorkOrder;
  children?: DispatchedOrder[];
  withdrawLog?: OperationLog | null;
  urgeLog?: OperationLog | null;
}

interface Harness {
  service: WorkOrderService;
  workOrderRepo: MockRepository<WorkOrder>;
  dispatchedRepo: MockRepository<DispatchedOrder>;
  notificationRepo: MockRepository<Notification>;
  operationLogRepo: MockRepository<OperationLog>;
}

type MockRepository<T extends object> = {
  [key: string]: jest.Mock | T[] | { transaction: jest.Mock } | undefined;
  manager?: {
    transaction: jest.Mock;
  };
  saved: T[];
};

const owner: JwtUserPayload = { sub: 'owner-1', username: 'owner', roles: ['biz_member'] };
const other: JwtUserPayload = { sub: 'other-1', username: 'other', roles: ['biz_member'] };
const handler: JwtUserPayload = { sub: 'handler-1', username: 'handler', roles: ['contract_specialist'] };
const admin: JwtUserPayload = { sub: 'admin-1', username: 'admin', roles: ['admin'] };

function makeWorkOrder(status: WorkOrderStatus, overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo-1',
    orderNo: 'WO-001',
    orderType: OrderType.ONBOARDING,
    status,
    createdBy: 'owner-1',
    departmentId: 'dept-1',
    customerId: 'customer-1',
    branchId: null,
    customerCode: 'C001',
    branchCode: 'C001',
    customerName: '客户A',
    employeeName: '张三',
    employeeIdCard: '330000000000000000',
    extraData: {},
    submittedAt: new Date('2026-05-01T00:00:00.000Z'),
    completedAt: null,
    lastModifiedAt: null,
    lastModifiedBy: null,
    modificationRound: 0,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    dispatchedOrders: [],
    fieldSupplementLogs: [],
    ...overrides,
  } as WorkOrder;
}

function makeChild(overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  return {
    id: 'do-1',
    parentOrderId: 'wo-1',
    parentOrder: makeWorkOrder(WorkOrderStatus.PROCESSING),
    moduleCode: 'contract',
    status: DispatchedOrderStatus.PROCESSING,
    handlerId: 'handler-1',
    handler: null,
    visibleFields: null,
    returnReason: null,
    flowRound: 0,
    completionRemark: null,
    dispatchedAt: new Date('2026-05-01T00:00:00.000Z'),
    acceptedAt: null,
    completedAt: null,
    voidAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    fieldSupplementLogs: [],
    ...overrides,
  } as DispatchedOrder;
}

function createMockRepository<T extends object>(): MockRepository<T> {
  const saved: T[] = [];
  return {
    saved,
    create: jest.fn((entity: T) => entity),
    save: jest.fn(async (entity: T) => {
      saved.push(entity);
      return entity;
    }),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    count: jest.fn(async () => 0),
  };
}

function createHarness(options: HarnessOptions): Harness {
  const workOrderRepo = createMockRepository<WorkOrder>();
  const dispatchedRepo = createMockRepository<DispatchedOrder>();
  const notificationRepo = createMockRepository<Notification>();
  const operationLogRepo = createMockRepository<OperationLog>();
  const moduleHandlerRepo = createMockRepository<ModuleHandler>();
  const moduleSupervisorRepo = createMockRepository<ModuleSupervisor>();
  const userRoleRepo = createMockRepository<UserRole>();

  (workOrderRepo.findOne as jest.Mock).mockResolvedValue(options.workOrder);
  (dispatchedRepo.find as jest.Mock).mockResolvedValue(options.children ?? []);
  (operationLogRepo.findOne as jest.Mock).mockImplementation(async ({ where }: { where?: { actionType?: string } } = {}) => {
    if (where?.actionType === 'urge') return options.urgeLog ?? null;
    return options.withdrawLog ?? null;
  });

  const repositories = new Map<unknown, unknown>([
    [WorkOrder, workOrderRepo],
    [DispatchedOrder, dispatchedRepo],
    [Notification, notificationRepo],
    [OperationLog, operationLogRepo],
    [ModuleHandler, moduleHandlerRepo],
    [ModuleSupervisor, moduleSupervisorRepo],
    [UserRole, userRoleRepo],
  ]);
  const manager = {
    query: jest.fn(async () => undefined),
    getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
  };
  workOrderRepo.manager = {
    transaction: jest.fn(async (callback: (transactionManager: typeof manager) => Promise<unknown>) => callback(manager)),
  };

  const service = new WorkOrderService(
    workOrderRepo as unknown as Repository<WorkOrder>,
    dispatchedRepo as unknown as Repository<DispatchedOrder>,
    createMockRepository<FieldConfig>() as unknown as Repository<FieldConfig>,
    createMockRepository<ImportJob>() as unknown as Repository<ImportJob>,
    notificationRepo as unknown as Repository<Notification>,
    operationLogRepo as unknown as Repository<OperationLog>,
    {} as never,
    {} as never,
    undefined,
    undefined,
    createMockRepository<ModuleField>() as unknown as Repository<ModuleField>,
    createMockRepository<WorkOrderFieldDirtyMark>() as unknown as Repository<WorkOrderFieldDirtyMark>,
    moduleHandlerRepo as unknown as Repository<ModuleHandler>,
    moduleSupervisorRepo as unknown as Repository<ModuleSupervisor>,
    userRoleRepo as unknown as Repository<UserRole>,
  );

  return { service, workOrderRepo, dispatchedRepo, notificationRepo, operationLogRepo };
}

function expectHttpStatus(error: unknown, status: HttpStatus): void {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
}

describe('WorkOrderService withdraw flow', () => {
  it('rejects terminal work order statuses with 409', async () => {
    const { service } = createHarness({ workOrder: makeWorkOrder(WorkOrderStatus.COMPLETED) });

    try {
      await service.withdraw('wo-1', {}, owner);
      throw new Error('expected withdraw to fail');
    } catch (error) {
      expectHttpStatus(error, HttpStatus.CONFLICT);
    }
  });

  it('rejects non-owner withdraw requests with 403', async () => {
    const { service } = createHarness({ workOrder: makeWorkOrder(WorkOrderStatus.PROCESSING) });

    await expect(service.withdraw('wo-1', {}, other)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects duplicate withdraw requests with 409', async () => {
    const { service } = createHarness({ workOrder: makeWorkOrder(WorkOrderStatus.WITHDRAW_PENDING) });

    try {
      await service.withdraw('wo-1', {}, owner);
      throw new Error('expected withdraw to fail');
    } catch (error) {
      expectHttpStatus(error, HttpStatus.CONFLICT);
    }
  });

  it('moves to withdraw_pending, stores previous_status, and notifies active child handlers', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.PROCESSING);
    const { service, notificationRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [
        makeChild({ id: 'do-1', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING }),
        makeChild({ id: 'do-2', handlerId: 'handler-2', status: DispatchedOrderStatus.PENDING }),
        makeChild({ id: 'do-3', handlerId: 'handler-3', status: DispatchedOrderStatus.COMPLETED }),
      ],
    });

    const result = await service.withdraw('wo-1', { reason: '客户取消' }, owner);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.WITHDRAW_PENDING });
    expect(workOrder.status).toBe(WorkOrderStatus.WITHDRAW_PENDING);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'withdraw_request',
      afterData: expect.objectContaining({ previous_status: WorkOrderStatus.PROCESSING }),
    }));
    expect(notificationRepo.save).toHaveBeenCalledTimes(2);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-1', bizType: 'withdraw_request' }));
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-2', bizType: 'withdraw_request' }));
  });

  it('rolls back to previous_status when withdraw is rejected and notifies creator', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.WITHDRAW_PENDING);
    const withdrawLog = {
      afterData: { previous_status: WorkOrderStatus.RETURNED },
    } as unknown as OperationLog;
    const { service, notificationRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [makeChild({ handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING })],
      withdrawLog,
    });

    const result = await service.approveWithdraw('wo-1', { approved: false, comment: '仍需处理' }, handler);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.RETURNED });
    expect(workOrder.status).toBe(WorkOrderStatus.RETURNED);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'withdraw_rejected',
      afterData: expect.objectContaining({ previous_status: WorkOrderStatus.RETURNED }),
    }));
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      bizType: 'withdraw_rejected',
    }));
  });

  it('sets withdrawn when approved by admin and notifies creator', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.WITHDRAW_PENDING);
    const withdrawLog = {
      afterData: { previous_status: WorkOrderStatus.PROCESSING },
    } as unknown as OperationLog;
    const { service, notificationRepo } = createHarness({ workOrder, withdrawLog });

    const result = await service.approveWithdraw('wo-1', { approved: true }, admin);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.WITHDRAWN });
    expect(workOrder.status).toBe(WorkOrderStatus.WITHDRAWN);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      bizType: 'withdraw_approved',
    }));
  });
});

describe('WorkOrderService urge flow', () => {
  it('notifies target module handlers, writes urge log, and does not change work order status', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.PROCESSING);
    const { service, notificationRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [
        makeChild({ id: 'do-1', moduleCode: 'contract', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING }),
        makeChild({ id: 'do-2', moduleCode: 'data_entry', handlerId: 'handler-2', status: DispatchedOrderStatus.PENDING }),
        makeChild({ id: 'do-3', moduleCode: 'contract', handlerId: 'handler-3', status: DispatchedOrderStatus.COMPLETED }),
      ],
    });

    const result = await service.urge('wo-1', { moduleCode: 'contract' }, owner);

    expect(result.ok).toBe(true);
    expect(result.notifiedHandlers).toBe(1);
    expect(workOrder.status).toBe(WorkOrderStatus.PROCESSING);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-1', bizType: 'urge_received' }));
    expect(notificationRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-2', bizType: 'urge_received' }));
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'urge',
      afterData: expect.objectContaining({ moduleCode: 'contract', moduleKey: 'contract', notifiedHandlers: 1 }),
    }));
  });

  it('throttles the same work order and module within 30 minutes', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.PROCESSING);
    const urgeLog = { afterData: { moduleKey: 'contract' }, createdAt: new Date() } as unknown as OperationLog;
    const { service } = createHarness({
      workOrder,
      urgeLog,
      children: [makeChild({ moduleCode: 'contract', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING })],
    });

    await expect(service.urge('wo-1', { moduleCode: 'contract' }, owner)).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('rejects urge from non-owner and non-admin users', async () => {
    const { service } = createHarness({ workOrder: makeWorkOrder(WorkOrderStatus.PROCESSING) });

    await expect(service.urge('wo-1', {}, other)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('WorkOrderService void flow', () => {
  it('requires a non-empty void reason', async () => {
    const { service } = createHarness({ workOrder: makeWorkOrder(WorkOrderStatus.PROCESSING) });

    await expect(service.void('wo-1', { reason: '   ' }, owner)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('moves to void_pending, stores previous_status, and notifies active child handlers', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.PROCESSING);
    const { service, notificationRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [
        makeChild({ id: 'do-1', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING }),
        makeChild({ id: 'do-2', handlerId: 'handler-2', status: DispatchedOrderStatus.PENDING }),
        makeChild({ id: 'do-3', handlerId: 'handler-3', status: DispatchedOrderStatus.COMPLETED }),
      ],
    });

    const result = await service.void('wo-1', { reason: '客户确认取消入职' }, owner);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.VOID_PENDING });
    expect(workOrder.status).toBe(WorkOrderStatus.VOID_PENDING);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'void_request',
      afterData: expect.objectContaining({ previous_status: WorkOrderStatus.PROCESSING, reason: '客户确认取消入职' }),
    }));
    expect(notificationRepo.save).toHaveBeenCalledTimes(2);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-1', bizType: 'void_request' }));
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'handler-2', bizType: 'void_request' }));
  });

  it('voids directly after withdraw approval without entering void_pending', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.WITHDRAWN);
    const processingChild = makeChild({ id: 'do-1', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING });
    const pendingChild = makeChild({ id: 'do-2', handlerId: 'handler-2', status: DispatchedOrderStatus.PENDING });
    const completedChild = makeChild({ id: 'do-3', handlerId: 'handler-3', status: DispatchedOrderStatus.COMPLETED });
    const { service, notificationRepo, dispatchedRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [processingChild, pendingChild, completedChild],
    });

    const result = await service.void('wo-1', { reason: 'withdrawn order should be voided' }, owner);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.VOID });
    expect(workOrder.status).toBe(WorkOrderStatus.VOID);
    expect(processingChild.status).toBe(DispatchedOrderStatus.VOID);
    expect(pendingChild.status).toBe(DispatchedOrderStatus.VOID);
    expect(completedChild.status).toBe(DispatchedOrderStatus.COMPLETED);
    expect(processingChild.voidAt).toBeInstanceOf(Date);
    expect(pendingChild.voidAt).toBeInstanceOf(Date);
    expect(completedChild.voidAt).toBeNull();
    expect(dispatchedRepo.save).toHaveBeenCalledWith(processingChild);
    expect(dispatchedRepo.save).toHaveBeenCalledWith(pendingChild);
    expect(notificationRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ bizType: 'void_request' }));
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'void_direct_after_withdrawn',
      afterData: expect.objectContaining({ previous_status: WorkOrderStatus.WITHDRAWN, reason: 'withdrawn order should be voided' }),
    }));
  });

  it('rolls back to previous_status when void is rejected and notifies creator', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.VOID_PENDING);
    const voidLog = { afterData: { previous_status: WorkOrderStatus.WITHDRAW_PENDING } } as unknown as OperationLog;
    const { service, notificationRepo, operationLogRepo } = createHarness({
      workOrder,
      children: [makeChild({ handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING })],
      withdrawLog: voidLog,
    });

    const result = await service.approveVoid('wo-1', { approved: false, comment: '仍需继续办理' }, handler);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.WITHDRAW_PENDING });
    expect(workOrder.status).toBe(WorkOrderStatus.WITHDRAW_PENDING);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'void_rejected',
      afterData: expect.objectContaining({ previous_status: WorkOrderStatus.WITHDRAW_PENDING }),
    }));
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      bizType: 'void_rejected',
    }));
  });

  it('sets void terminal status and marks unfinished child orders voidAt when approved', async () => {
    const workOrder = makeWorkOrder(WorkOrderStatus.VOID_PENDING);
    const processingChild = makeChild({ id: 'do-1', handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING });
    const pendingChild = makeChild({ id: 'do-2', handlerId: 'handler-2', status: DispatchedOrderStatus.PENDING });
    const completedChild = makeChild({ id: 'do-3', handlerId: 'handler-3', status: DispatchedOrderStatus.COMPLETED });
    const voidLog = { afterData: { previous_status: WorkOrderStatus.PROCESSING } } as unknown as OperationLog;
    const { service, notificationRepo, dispatchedRepo } = createHarness({
      workOrder,
      children: [processingChild, pendingChild, completedChild],
      withdrawLog: voidLog,
    });

    const result = await service.approveVoid('wo-1', { approved: true }, admin);

    expect(result).toEqual({ id: 'wo-1', status: WorkOrderStatus.VOID });
    expect(workOrder.status).toBe(WorkOrderStatus.VOID);
    expect(processingChild.voidAt).toBeInstanceOf(Date);
    expect(pendingChild.voidAt).toBeInstanceOf(Date);
    expect(completedChild.voidAt).toBeNull();
    expect(dispatchedRepo.save).toHaveBeenCalledWith(processingChild);
    expect(dispatchedRepo.save).toHaveBeenCalledWith(pendingChild);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      bizType: 'void_approved',
    }));
  });
});
