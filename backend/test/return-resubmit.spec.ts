import { EntityManager, Repository } from 'typeorm';
import { WorkOrderResubmitService } from 'src/modules/work-orders/work-order-resubmit.service';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  ModuleHandler,
  Notification,
  OperationLog,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(),
    update: jest.fn(async () => undefined),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

describe('return-resubmit flow', () => {
  it('resubmits a returned work order and rebinds pending child handlers', async () => {
    const user: JwtUserPayload = { sub: 'u1', username: 'sales', roles: ['salesperson'], departmentId: 'd1' } as JwtUserPayload;
    const returnedOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: 'onboarding',
      status: WorkOrderStatus.RETURNED,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: '张三',
      employeeIdCard: '330102199001010011',
      extraData: { employee_name: '张三', id_card_no: '330102199001010011' },
      submittedAt: new Date('2026-05-11T00:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
    } as unknown as WorkOrder;
    const returnedChild = { id: 'do-1', parentOrderId: 'wo-1', moduleCode: 'contract', status: 'returned', handlerId: 'handler-old', visibleFields: ['employee_name'], returnReason: '缺资料', dispatchedAt: new Date(), acceptedAt: null, completedAt: null } as unknown as DispatchedOrder;
    const nextChild = { id: 'do-2', parentOrderId: 'wo-1', moduleCode: 'data_entry', status: 'pending', handlerId: 'handler-new', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null } as unknown as DispatchedOrder;

    const txWorkOrderRepo = repoMock<WorkOrder>({
      findOne: jest.fn(async () => returnedOrder),
      save: jest.fn(async (input: WorkOrder) => input),
    });
    const txDispatchedRepo = repoMock<DispatchedOrder>({
      find: jest.fn(async () => [returnedChild]),
      save: jest.fn(async (input: DispatchedOrder) => input),
      create: jest.fn((input: Partial<DispatchedOrder>) => input as DispatchedOrder),
    });
    const txNotificationRepo = repoMock<Notification>({ save: jest.fn(async (input: Notification) => input), create: jest.fn((input: Partial<Notification>) => input as Notification) });
    const txOperationLogRepo = repoMock<OperationLog>({ save: jest.fn(async (input: OperationLog) => input), create: jest.fn((input: Partial<OperationLog>) => input as OperationLog) });
    const txModuleHandlerRepo = repoMock<ModuleHandler>({
      findOne: jest.fn(async ({ where }: { where: { moduleCode: string } }) => ({ handlerId: `handler-${where.moduleCode}` } as ModuleHandler)),
    });
    const managerMock = {
      query: jest.fn(async () => undefined),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return txWorkOrderRepo;
        if (entity === DispatchedOrder) return txDispatchedRepo;
        if (entity === Notification) return txNotificationRepo;
        if (entity === OperationLog) return txOperationLogRepo;
        if (entity === ModuleHandler) return txModuleHandlerRepo;
        throw new Error('unknown repo');
      }),
    };

    const workOrderRepo = repoMock<WorkOrder>({
      manager: { transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) => callback(managerMock as unknown as EntityManager)) } as unknown as EntityManager,
      findOne: jest.fn(async () => ({
        ...returnedOrder,
        status: WorkOrderStatus.PENDING,
        creator: { id: 'u1', username: 'sales', realName: '业务员' },
        department: { id: 'd1', name: '业务部' },
        customer: { id: 'c1', customerCode: 'C001', customerName: '客户A' },
        dispatchedOrders: [nextChild],
      } as unknown as WorkOrder)),
    });

    const dispatchedOrderRepo = repoMock<DispatchedOrder>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const validationService = {
      validateWorkOrder: jest.fn(async () => undefined),
      requireText: jest.fn((value: unknown) => String(value ?? '')),
      normalizeHeader: jest.fn((value: string) => value),
      resolveDepartmentId: jest.fn(async () => 'd1'),
      resolveCustomerId: jest.fn(async () => 'c1'),
      resolveUserDepartmentIds: jest.fn(async () => ['d1']),
    } as unknown as WorkOrderValidationService;
    const fieldPermissionService = {
      getVisibleFieldsForScenario: jest.fn(async () => ['employee_name']),
    } as unknown as FieldPermissionService;

    const service = new WorkOrderResubmitService(
      workOrderRepo,
      dispatchedOrderRepo,
      notificationRepo,
      operationLogRepo,
      validationService,
      fieldPermissionService,
    );

    const result = await service.resubmit('wo-1', { extraData: { employee_name: '张三' } } as never, user);

    expect(result.workOrder.status).toBe(WorkOrderStatus.PENDING);
    expect(txWorkOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PENDING }));
    expect(txOperationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'salesperson_modify_resubmit',
      afterData: expect.objectContaining({ auditTitle: '业务员修改后重提' }),
    }));
    expect(txDispatchedRepo.save).toHaveBeenCalled();
    expect(txNotificationRepo.save).toHaveBeenCalled();
  });

  it('treats POST resubmit as idempotent after PUT already moved processing work order to pending', async () => {
    const user: JwtUserPayload = { sub: 'u1', username: 'sales', roles: ['biz_member'], departmentId: 'd1' } as JwtUserPayload;
    const pendingOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511002',
      orderType: 'onboarding',
      status: WorkOrderStatus.PENDING,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: '张三',
      employeeIdCard: '330102199001010011',
      extraData: { employee_name: '张三', id_card_no: '330102199001010011', mobile: 'old' },
      submittedAt: new Date('2026-05-11T00:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
    } as unknown as WorkOrder;
    const child = { id: 'do-1', parentOrderId: 'wo-1', moduleCode: 'data_entry', status: 'pending', handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null } as unknown as DispatchedOrder;

    const txWorkOrderRepo = repoMock<WorkOrder>({
      findOne: jest.fn(async () => pendingOrder),
      save: jest.fn(async (input: WorkOrder) => input),
    });
    const txDispatchedRepo = repoMock<DispatchedOrder>({
      find: jest.fn(async () => [child]),
    });
    const txOperationLogRepo = repoMock<OperationLog>({
      findOne: jest.fn(async () => ({
        id: 'log-1',
        entityType: 'work_order',
        entityId: 'wo-1',
        userId: 'u1',
        actionType: 'salesperson_modify_resubmit',
      } as unknown as OperationLog)),
      save: jest.fn(async (input: OperationLog) => input),
      create: jest.fn((input: Partial<OperationLog>) => input as OperationLog),
    });
    const managerMock = {
      query: jest.fn(async () => undefined),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return txWorkOrderRepo;
        if (entity === DispatchedOrder) return txDispatchedRepo;
        if (entity === Notification) return repoMock<Notification>();
        if (entity === OperationLog) return txOperationLogRepo;
        if (entity === ModuleHandler) return repoMock<ModuleHandler>();
        throw new Error('unknown repo');
      }),
    };

    const workOrderRepo = repoMock<WorkOrder>({
      manager: { transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) => callback(managerMock as unknown as EntityManager)) } as unknown as EntityManager,
      findOne: jest.fn(async () => ({
        ...pendingOrder,
        extraData: { ...pendingOrder.extraData, mobile: '13800000000' },
        creator: { id: 'u1', username: 'sales', realName: '业务员' },
        department: { id: 'd1', name: '业务部' },
        customer: { id: 'c1', customerCode: 'C001', customerName: '客户A' },
        dispatchedOrders: [child],
      } as unknown as WorkOrder)),
    });
    const validationService = {
      validateWorkOrder: jest.fn(async () => undefined),
      requireText: jest.fn((value: unknown) => String(value ?? '')),
      resolveUserDepartmentIds: jest.fn(async () => ['d1']),
    } as unknown as WorkOrderValidationService;
    const fieldPermissionService = {
      getVisibleFieldsForScenario: jest.fn(async () => ['employee_name']),
    } as unknown as FieldPermissionService;
    const service = new WorkOrderResubmitService(
      workOrderRepo,
      repoMock<DispatchedOrder>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      validationService,
      fieldPermissionService,
    );

    const result = await service.resubmit('wo-1', { extraData: { mobile: '13800000000' } } as never, user);

    expect(result.workOrder.status).toBe(WorkOrderStatus.PENDING);
    expect(txWorkOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkOrderStatus.PENDING,
      extraData: expect.objectContaining({ mobile: '13800000000' }),
    }));
    expect(txDispatchedRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PENDING,
      returnReason: null,
    }));
    expect(txOperationLogRepo.save).not.toHaveBeenCalled();
  });
});
