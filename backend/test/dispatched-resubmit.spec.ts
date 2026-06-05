import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleHandler,
  Notification,
  OperationLog,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { DispatchedOrderDetailItem } from 'src/modules/dispatched-orders/dispatched-order.types';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = 'creator-1';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

function makeOrder(
  status: DispatchedOrderStatus,
  parentStatus: WorkOrderStatus,
  overrides: Partial<DispatchedOrder> = {},
): DispatchedOrder {
  return {
    id: ORDER_ID,
    parentOrderId: 'wo-1',
    parentOrder: {
      id: 'wo-1',
      orderNo: 'ON20260602001',
      orderType: 'onboarding',
      status: parentStatus,
      createdBy: CREATOR_ID,
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: '张三',
      employeeIdCard: '330102199001010011',
      extraData: { employee_name: '张三' },
      submittedAt: null,
      completedAt: null,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    },
    moduleCode: 'contract',
    status,
    handlerId: 'handler-old',
    visibleFields: ['employee_name'],
    returnReason: status === DispatchedOrderStatus.RETURNED ? '缺资料' : null,
    voidAt: status === DispatchedOrderStatus.VOID ? new Date('2026-06-02T01:00:00.000Z') : null,
    dispatchedAt: new Date('2026-06-02T00:00:00.000Z'),
    acceptedAt: null,
    completedAt: status === DispatchedOrderStatus.WITHDRAWN ? new Date('2026-06-02T01:00:00.000Z') : null,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  } as unknown as DispatchedOrder;
}

function buildService(order: DispatchedOrder, handlerRows: Array<Partial<ModuleHandler>> = []) {
  const dispatchedOrderRepo = repoMock<DispatchedOrder>({
    findOne: jest.fn(async () => order),
    save: jest.fn(async (input: DispatchedOrder) => input),
  });
  const workOrderRepo = repoMock<WorkOrder>({ save: jest.fn(async (input: WorkOrder) => input) });
  const moduleHandlerRepo = repoMock<ModuleHandler>({
    find: jest.fn(async () => handlerRows as ModuleHandler[]),
  });
  const userRoleRepo = repoMock<UserRole>({
    find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as unknown as UserRole]),
  });
  const fieldConfigRepo = repoMock<FieldConfig>();
  const notificationRepo = repoMock<Notification>();
  const operationLogRepo = repoMock<OperationLog>();
  const fieldPermissionService = {} as FieldPermissionService;
  const fieldSupplementService = { getLogs: jest.fn() } as unknown as FieldSupplementService;
  const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
  const service = new DispatchedOrderService(
    dispatchedOrderRepo,
    workOrderRepo,
    moduleHandlerRepo,
    userRoleRepo,
    fieldConfigRepo,
    notificationRepo,
    operationLogRepo,
    fieldPermissionService,
    fieldSupplementService,
    exportTemplatesService as never,
    { resolveUserDepartmentIds: jest.fn(async () => ['d1']) } as never,
  );
  // Isolate state-transition logic from the detail-mapping chain.
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: ORDER_ID } as DispatchedOrderDetailItem);
  return { service, dispatchedOrderRepo, workOrderRepo, notificationRepo, operationLogRepo };
}

const creator: JwtUserPayload = { sub: CREATOR_ID, username: 'sales', roles: ['business_group_member'] } as JwtUserPayload;

describe('sub-order level resubmit (0602 E)', () => {
  it('E-1: 已退回子单可重新提交，回到 pending 并通知后道', async () => {
    const order = makeOrder(DispatchedOrderStatus.RETURNED, WorkOrderStatus.RETURNED);
    const { service, dispatchedOrderRepo, workOrderRepo, notificationRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);

    await service.resubmitDispatched(ORDER_ID, {}, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PENDING,
      returnReason: null,
      voidAt: null,
      handlerId: 'handler-old',
    }));
    // 父工单从 RETURNED 回到 PROCESSING
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PROCESSING }));
    expect(notificationRepo.save).toHaveBeenCalled();
  });

  it('E-1b: 已退回子单先保存字段仍保持 returned，再重新提交后 pending 且后道看到新字段', async () => {
    const order = makeOrder(DispatchedOrderStatus.RETURNED, WorkOrderStatus.RETURNED);
    const { service, dispatchedOrderRepo, workOrderRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);
    (service as unknown as { fieldChangeHook: { buildDiff: () => Array<{ field: string; before: unknown; after: unknown }> } }).fieldChangeHook = {
      buildDiff: () => [{ field: 'employee_name', before: '张三', after: '李四' }],
    };

    await service.creatorUpdateFields(ORDER_ID, { fields: { employee_name: '李四' } }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.RETURNED);
    expect(order.parentOrder.extraData).toEqual(expect.objectContaining({ employee_name: '李四' }));
    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await service.resubmitDispatched(ORDER_ID, {}, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: DispatchedOrderStatus.PENDING }));
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkOrderStatus.PROCESSING,
      extraData: expect.objectContaining({ employee_name: '李四' }),
    }));
  });

  it('E-2: 已撤回子单可重新提交，回到 pending', async () => {
    const order = makeOrder(DispatchedOrderStatus.WITHDRAWN, WorkOrderStatus.WITHDRAWN);
    const { service, dispatchedOrderRepo, workOrderRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);

    await service.resubmitDispatched(ORDER_ID, {}, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PENDING,
      completedAt: null,
    }));
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PROCESSING }));
  });

  it('E-3: 已作废子单可重新提交，清空 voidAt 并回到 pending（合并撤销作废语义）', async () => {
    const order = makeOrder(DispatchedOrderStatus.VOID, WorkOrderStatus.VOID);
    const { service, dispatchedOrderRepo, workOrderRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);

    await service.resubmitDispatched(ORDER_ID, {}, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PENDING,
      voidAt: null,
    }));
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WorkOrderStatus.PROCESSING }));
  });

  it('重提时 handlerId 为空则按模块默认主办重新指派', async () => {
    const order = makeOrder(DispatchedOrderStatus.VOID, WorkOrderStatus.VOID, { handlerId: null });
    const { service, dispatchedOrderRepo, moduleHandlerRepo } = buildService(order) as never as {
      service: DispatchedOrderService;
      dispatchedOrderRepo: Repository<DispatchedOrder>;
      moduleHandlerRepo: Repository<ModuleHandler>;
    };
    // resolveDefaultModuleHandler 查询 isBackup:false 主办
    (order as DispatchedOrder).handlerId = null;
    const handlerRepo = (service as unknown as { moduleHandlerRepository: Repository<ModuleHandler> }).moduleHandlerRepository;
    (handlerRepo.find as jest.Mock).mockResolvedValue([
      { moduleCode: 'contract', handlerId: 'yangchun-id', isActive: true, isBackup: false, weight: 10 },
    ]);

    await service.resubmitDispatched(ORDER_ID, {}, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PENDING,
      handlerId: 'yangchun-id',
    }));
  });

  it('E-6: 非发起人调用重新提交被后端拒绝（FORBIDDEN）', async () => {
    const order = makeOrder(DispatchedOrderStatus.RETURNED, WorkOrderStatus.RETURNED);
    const { service } = buildService(order);
    const other: JwtUserPayload = { sub: 'someone-else', username: 'other', roles: ['business_group_member'] } as JwtUserPayload;

    await expect(service.resubmitDispatched(ORDER_ID, {}, other)).rejects.toMatchObject({ status: 403 });
  });

  it('处理中子单不可重新提交（CONFLICT）', async () => {
    const order = makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.PROCESSING);
    const { service } = buildService(order);

    await expect(service.resubmitDispatched(ORDER_ID, {}, creator)).rejects.toMatchObject({ status: 409 });
  });
});

describe('withdrawn-then-void goes directly to terminal (0602 E-5)', () => {
  it('E-5: 已撤回子单作废 → 直接 VOID 终态，无需后道审批', async () => {
    const order = makeOrder(DispatchedOrderStatus.WITHDRAWN, WorkOrderStatus.WITHDRAWN);
    const { service, dispatchedOrderRepo, notificationRepo } = buildService(order);

    await service.voidByCreator(ORDER_ID, { reason: '不再需要' }, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.VOID,
      voidAt: expect.any(Date),
    }));
    // 直接作废，不进入 VOID_PENDING 审批流，并通知后道关注终态变化。
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bizType: 'creator_void_before_accept' }),
    ]));
  });

  it('处理中子单作废仍走 VOID_PENDING 审批流（不被 E-5 影响）', async () => {
    const order = makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.PROCESSING, { acceptedAt: new Date() });
    const { service, dispatchedOrderRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);

    await service.voidByCreator(ORDER_ID, { reason: '客户取消' }, creator);

    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.VOID_PENDING,
    }));
  });
});

describe('creator modify does not auto-resubmit (0602 E-4)', () => {
  it('keeps accepted child edits pending approval even when field change hook is unavailable', async () => {
    const order = makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.PROCESSING, {
      acceptedAt: new Date('2026-06-02T01:00:00.000Z'),
    });
    const { service, dispatchedOrderRepo, workOrderRepo, operationLogRepo } = buildService(order, [
      { moduleCode: 'contract', handlerId: 'handler-old', isActive: true },
    ]);

    await service.creatorUpdateFields(ORDER_ID, { fields: { employee_name: '李四' }, reason: '业务员修正姓名' }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.MODIFY_PENDING);
    expect(order.returnReason).toContain('业务员修改申请');
    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: DispatchedOrderStatus.MODIFY_PENDING }));
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'creator_modify_request',
      afterData: expect.objectContaining({
        pendingFields: { employee_name: '李四' },
        previousStatus: DispatchedOrderStatus.PROCESSING,
        status: DispatchedOrderStatus.MODIFY_PENDING,
      }),
    }));
  });

  it('E-4: 修改已退回子单仅保存内容，状态保持 RETURNED 不自动重提', async () => {
    const order = makeOrder(DispatchedOrderStatus.RETURNED, WorkOrderStatus.RETURNED);
    const { service, dispatchedOrderRepo, workOrderRepo, operationLogRepo } = buildService(order);
    // creatorUpdateFields 使用 fieldChangeHook.buildDiff；未注入时默认 diff=[]，会提前返回。
    // 注入一个简单 diff hook，使其进入保存分支。
    (service as unknown as { fieldChangeHook: { buildDiff: () => Array<{ field: string; before: unknown; after: unknown }> } }).fieldChangeHook = {
      buildDiff: () => [{ field: 'employee_name', before: '张三', after: '李四' }],
    };

    await service.creatorUpdateFields(ORDER_ID, { fields: { employee_name: '李四' } }, creator);

    // 只保存父工单内容，子单状态不变（不调用 dispatchedOrderRepository.save 改状态）
    expect(workOrderRepo.save).toHaveBeenCalled();
    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'creator_update_fields',
      afterData: expect.objectContaining({ resubmitted: false }),
    }));
  });
});
