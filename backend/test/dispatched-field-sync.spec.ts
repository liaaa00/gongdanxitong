import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleHandler,
  Notification,
  OperationLog,
  OrderType,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderFieldSyncBatch,
  WorkOrderFieldSyncItem,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { DispatchedOrderDetailItem } from 'src/modules/dispatched-orders/dispatched-order.types';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const WORK_ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CREATOR_ID = 'creator-1';
const HANDLER_ID = 'handler-contract-1';
const fixedDate = new Date('2026-06-24T00:00:00.000Z');

type Repo<T extends object> = Repository<T> & {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  count: jest.Mock;
};

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repo<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | T[]) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repo<T>;
}

function makeWorkOrder(extraData: Record<string, unknown> = { employee_name: 'Alice', mobile: 'old' }): WorkOrder {
  return {
    id: WORK_ORDER_ID,
    orderNo: 'ON20260624001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.PROCESSING,
    createdBy: CREATOR_ID,
    departmentId: 'dep-1',
    customerId: 'customer-1',
    employeeName: String(extraData.employee_name ?? 'Alice'),
    employeeIdCard: '330102199001010011',
    extraData,
    submittedAt: fixedDate,
    completedAt: null,
    lastModifiedAt: null,
    lastModifiedBy: null,
    modificationRound: 0,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    creator: { id: CREATOR_ID, username: 'sales', realName: 'Sales' },
  } as unknown as WorkOrder;
}

function makeOrder(status: DispatchedOrderStatus, overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  return {
    id: ORDER_ID,
    parentOrderId: WORK_ORDER_ID,
    parentOrder: makeWorkOrder(),
    moduleCode: 'contract',
    status,
    handlerId: status === DispatchedOrderStatus.PENDING ? null : HANDLER_ID,
    visibleFields: ['employee_name', 'mobile'],
    returnReason: null,
    flowRound: 0,
    completionRemark: null,
    dispatchedAt: fixedDate,
    dueAt: null,
    slaHours: null,
    slaReminderBeforeHours: null,
    acceptedAt: status === DispatchedOrderStatus.PENDING ? null : fixedDate,
    completedAt: null,
    voidAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    handler: status === DispatchedOrderStatus.PENDING ? null : { id: HANDLER_ID, realName: 'Handler' },
    ...overrides,
  } as unknown as DispatchedOrder;
}

function buildService(order: DispatchedOrder) {
  const dispatchedOrderRepo = repoMock<DispatchedOrder>({
    findOne: jest.fn(async () => order),
    find: jest.fn(async () => [order]),
    save: jest.fn(async (input: DispatchedOrder) => input),
  });
  const workOrderRepo = repoMock<WorkOrder>({ save: jest.fn(async (input: WorkOrder) => input) });
  const moduleHandlerRepo = repoMock<ModuleHandler>({
    find: jest.fn(async () => [{ moduleCode: 'contract', handlerId: HANDLER_ID, isActive: true } as ModuleHandler]),
    count: jest.fn(async () => 1),
  });
  const userRoleRepo = repoMock<UserRole>({
    find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as UserRole]),
  });
  const fieldConfigRepo = repoMock<FieldConfig>({
    find: jest.fn(async () => [
      { fieldCode: 'employee_name', fieldName: 'Employee Name', orderType: null, isActive: true } as FieldConfig,
      { fieldCode: 'mobile', fieldName: 'Mobile', orderType: null, isActive: true } as FieldConfig,
    ]),
  });
  const notificationRepo = repoMock<Notification>();
  const operationLogRepo = repoMock<OperationLog>();
  const fieldSyncBatchRepo = repoMock<WorkOrderFieldSyncBatch>({
    create: jest.fn((input: Partial<WorkOrderFieldSyncBatch>) => ({
      id: 'batch-1',
      createdAt: fixedDate,
      updatedAt: fixedDate,
      ...input,
    } as WorkOrderFieldSyncBatch)),
    save: jest.fn(async (input: WorkOrderFieldSyncBatch) => input),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  });
  const fieldSyncItemRepo = repoMock<WorkOrderFieldSyncItem>({
    create: jest.fn((input: Partial<WorkOrderFieldSyncItem>) => ({
      id: `item-${input.fieldCode ?? 'field'}`,
      createdAt: fixedDate,
      updatedAt: fixedDate,
      ...input,
    } as WorkOrderFieldSyncItem)),
    save: jest.fn(async (input: WorkOrderFieldSyncItem | WorkOrderFieldSyncItem[]) => input),
    find: jest.fn(async () => []),
  });

  const validationService = {
    resolveUserDepartmentIds: jest.fn(async () => ['dep-1']),
    validateWorkOrder: jest.fn(async () => undefined),
  };
  const service = new DispatchedOrderService(
    dispatchedOrderRepo,
    workOrderRepo,
    moduleHandlerRepo,
    userRoleRepo,
    fieldConfigRepo,
    notificationRepo,
    operationLogRepo,
    {} as FieldPermissionService,
    { getLogs: jest.fn() } as unknown as FieldSupplementService,
    {} as never,
    validationService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    fieldSyncBatchRepo,
    fieldSyncItemRepo,
  );
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: ORDER_ID } as DispatchedOrderDetailItem);
  return { service, dispatchedOrderRepo, workOrderRepo, operationLogRepo, fieldSyncBatchRepo, fieldSyncItemRepo, validationService };
}

const creator: JwtUserPayload = { sub: CREATOR_ID, username: 'sales', roles: ['business_group_member'] } as JwtUserPayload;
const handler: JwtUserPayload = { sub: HANDLER_ID, username: 'handler', roles: ['contract_specialist'] } as JwtUserPayload;

describe('dispatched order field sync records', () => {
  it('records direct sync details for an unaccepted child order', async () => {
    const order = makeOrder(DispatchedOrderStatus.PENDING);
    const { service, workOrderRepo, fieldSyncBatchRepo, fieldSyncItemRepo } = buildService(order);

    await service.creatorUpdateFields(ORDER_ID, { fields: { mobile: 'new' }, reason: 'fix typo' }, creator);

    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({ mobile: 'new' }),
    }));
    expect(fieldSyncBatchRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'direct_synced',
      trigger: 'creator_update_before_accept',
      changedFields: ['mobile'],
    }));
    expect(fieldSyncItemRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        dispatchedOrderId: ORDER_ID,
        fieldCode: 'mobile',
        oldValue: 'old',
        newValue: 'new',
        status: 'synced',
        requiresApproval: false,
      }),
    ]));
  });

  it('records approval pending details for an accepted child order without applying new value', async () => {
    const order = makeOrder(DispatchedOrderStatus.PROCESSING);
    const { service, workOrderRepo, dispatchedOrderRepo, fieldSyncBatchRepo, fieldSyncItemRepo } = buildService(order);

    await service.creatorUpdateFields(ORDER_ID, { fields: { mobile: 'new' }, reason: 'need change' }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.MODIFY_PENDING);
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: DispatchedOrderStatus.MODIFY_PENDING }));
    expect(fieldSyncBatchRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approval_pending',
      trigger: 'creator_modify_request',
    }));
    expect(fieldSyncItemRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        fieldCode: 'mobile',
        oldValue: 'old',
        newValue: 'new',
        status: 'approval_pending',
        requiresApproval: true,
      }),
    ]));
    expect(order.parentOrder.extraData.mobile).toBe('old');
  });

  it('marks rejected approval as kept_old and preserves the old value', async () => {
    const order = makeOrder(DispatchedOrderStatus.MODIFY_PENDING);
    const { service, operationLogRepo, fieldSyncBatchRepo, fieldSyncItemRepo, workOrderRepo } = buildService(order);
    operationLogRepo.findOne.mockResolvedValue({
      userId: CREATOR_ID,
      createdAt: fixedDate,
      afterData: {
        pendingFields: { mobile: 'new' },
        previousStatus: DispatchedOrderStatus.PROCESSING,
      },
    } as unknown as OperationLog);
    fieldSyncBatchRepo.findOne.mockResolvedValue({
      id: 'batch-1',
      workOrderId: WORK_ORDER_ID,
      sourceDispatchedOrderId: ORDER_ID,
      sourceModuleCode: 'contract',
      trigger: 'creator_modify_request',
      status: 'approval_pending',
      changedFields: ['mobile'],
      requestedBy: CREATOR_ID,
      reason: 'need change',
      createdAt: fixedDate,
      updatedAt: fixedDate,
    } as WorkOrderFieldSyncBatch);
    fieldSyncItemRepo.find.mockResolvedValue([
      {
        id: 'item-mobile',
        batchId: 'batch-1',
        workOrderId: WORK_ORDER_ID,
        dispatchedOrderId: ORDER_ID,
        moduleCode: 'contract',
        fieldCode: 'mobile',
        fieldLabel: 'Mobile',
        oldValue: 'old',
        newValue: 'new',
        status: 'approval_pending',
        requiresApproval: true,
        approvedBy: null,
        approvedAt: null,
        comment: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } as WorkOrderFieldSyncItem,
    ]);

    await service.approveModify(ORDER_ID, { approved: false, comment: 'reject' }, handler);

    expect(workOrderRepo.save).not.toHaveBeenCalled();
    expect(order.parentOrder.extraData.mobile).toBe('old');
    expect(fieldSyncBatchRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
    expect(fieldSyncItemRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        status: 'kept_old',
        approvedBy: HANDLER_ID,
        comment: 'reject',
      }),
    ]));
  });

  it('allows a completed child modification through approval and preserves its completion time', async () => {
    const order = makeOrder(DispatchedOrderStatus.COMPLETED, { completedAt: fixedDate });
    order.parentOrder.status = WorkOrderStatus.COMPLETED;
    order.parentOrder.completedAt = fixedDate;
    const { service, operationLogRepo, validationService } = buildService(order);

    await service.creatorUpdateFields(ORDER_ID, { fields: { mobile: 'new' }, reason: 'completed correction' }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.MODIFY_PENDING);
    expect(order.completedAt).toEqual(fixedDate);
    expect(order.parentOrder.extraData.mobile).toBe('old');
    expect(validationService.validateWorkOrder).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({ mobile: 'new' }),
    }));

    operationLogRepo.findOne.mockResolvedValue({
      userId: CREATOR_ID,
      createdAt: fixedDate,
      afterData: {
        pendingFields: { mobile: 'new' },
        previousStatus: DispatchedOrderStatus.COMPLETED,
      },
    } as unknown as OperationLog);

    await service.approveModify(ORDER_ID, { approved: true, comment: 'agree' }, handler);

    expect(order.status).toBe(DispatchedOrderStatus.COMPLETED);
    expect(order.completedAt).toEqual(fixedDate);
    expect(order.parentOrder.extraData.mobile).toBe('new');
  });

  it('redispatches a returned child after its modification is approved', async () => {
    const order = makeOrder(DispatchedOrderStatus.MODIFY_PENDING);
    order.parentOrder.status = WorkOrderStatus.RETURNED;
    const { service, operationLogRepo, workOrderRepo } = buildService(order);
    operationLogRepo.findOne.mockResolvedValue({
      userId: CREATOR_ID,
      createdAt: fixedDate,
      afterData: {
        pendingFields: { mobile: 'new' },
        previousStatus: DispatchedOrderStatus.RETURNED,
      },
    } as unknown as OperationLog);

    await service.approveModify(ORDER_ID, { approved: true, comment: 'agree' }, handler);

    // 修复问题3：批准修改后，从RETURNED状态应恢复为PROCESSING（已接单）而非PENDING（未接单）
    expect(order.status).toBe(DispatchedOrderStatus.PROCESSING);
    expect(order.acceptedAt).toBeTruthy(); // 应该有接单时间
    expect(order.completedAt).toBeNull();
    expect(order.returnReason).toBeNull();
    expect(order.parentOrder.status).toBe(WorkOrderStatus.PROCESSING);
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PROCESSING }));
  });

  it('allows an accepted child modification request when another affected child is completed', async () => {
    const order = makeOrder(DispatchedOrderStatus.PROCESSING);
    const completed = makeOrder(DispatchedOrderStatus.COMPLETED, {
      id: '33333333-3333-4333-8333-333333333333',
      handlerId: 'handler-contract-2',
      acceptedAt: fixedDate,
      completedAt: fixedDate,
    });
    const { service, dispatchedOrderRepo, workOrderRepo, fieldSyncBatchRepo, fieldSyncItemRepo } = buildService(order);
    dispatchedOrderRepo.find.mockResolvedValue([order, completed]);

    await service.creatorUpdateFields(ORDER_ID, { fields: { mobile: 'new' } }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.MODIFY_PENDING);
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    expect(fieldSyncBatchRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'approval_pending' }));
    expect(fieldSyncItemRepo.save).toHaveBeenCalled();
  });
});
