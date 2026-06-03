import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleHandler,
  Notification,
  OperationLog,
  OrderType,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';

const ORDER_ID = '00000000-0000-4000-8000-000000000601';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

function makeQueryBuilder(rows: DispatchedOrder[]) {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(async () => rows),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  return qb;
}

function makeParent(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo-social-1',
    orderNo: 'ON20260603001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
    departmentId: 'dept-1',
    customerId: 'customer-1',
    customerCode: 'C001',
    customerName: 'Customer A',
    employeeName: 'Employee A',
    employeeIdCard: '330102199001010011',
    extraData: { employee_name: 'Employee A', social_base: 5000 },
    submittedAt: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as WorkOrder;
}

function makeSocialOrder(overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  const status = overrides.status ?? DispatchedOrderStatus.PENDING;
  return {
    id: ORDER_ID,
    parentOrderId: 'wo-social-1',
    parentOrder: makeParent(),
    moduleCode: 'social_insurance',
    status,
    handlerId: 'handler-1',
    handler: null,
    visibleFields: ['employee_name', 'social_base'],
    returnReason: null,
    flowRound: 0,
    completionRemark: null,
    dispatchedAt: new Date('2026-06-01T00:00:00.000Z'),
    acceptedAt: status === DispatchedOrderStatus.PROCESSING ? new Date('2026-06-02T00:00:00.000Z') : null,
    completedAt: null,
    voidAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as DispatchedOrder;
}

function makeService(order: DispatchedOrder) {
  const qb = makeQueryBuilder([order]);
  const dispatchedOrderRepo = repoMock<DispatchedOrder>({
    findOne: jest.fn(async () => order),
    save: jest.fn(async (input: DispatchedOrder) => input),
    createQueryBuilder: jest.fn(() => qb),
  });
  const workOrderRepo = repoMock<WorkOrder>({ save: jest.fn(async (input: WorkOrder) => input) });
  const moduleHandlerRepo = repoMock<ModuleHandler>({
    count: jest.fn(async () => 1),
    find: jest.fn(async () => [{ moduleCode: order.moduleCode, handlerId: 'handler-1', isActive: true } as ModuleHandler]),
  });
  const operationLogRepo = repoMock<OperationLog>();
  const fieldChangeHook = { buildDiff: jest.fn((before: Record<string, unknown>, after: Record<string, unknown>) => Object.keys(after).filter((key) => before[key] !== after[key]).map((field) => ({ field, before: before[field], after: after[field] }))) };
  const service = new DispatchedOrderService(
    dispatchedOrderRepo,
    workOrderRepo,
    moduleHandlerRepo,
    repoMock<UserRole>(),
    repoMock<FieldConfig>(),
    repoMock<Notification>(),
    operationLogRepo,
    { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService,
    { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService,
    { exportSingleDispatchedOrder: jest.fn() } as never,
    undefined,
    fieldChangeHook as never,
  );
  return { service, dispatchedOrderRepo, workOrderRepo, operationLogRepo };
}

const creator: JwtUserPayload = { sub: 'creator-1', username: 'sales01', roles: ['salesperson'] };
const handler: JwtUserPayload = { sub: 'handler-1', username: 'fuqianwen', roles: ['social_insurance_specialist'] };

describe('social insurance state flow guards (0603)', () => {
  it('allows salesperson to directly edit, withdraw and void social insurance before acceptance', async () => {
    const editOrder = makeSocialOrder({ status: DispatchedOrderStatus.PENDING, acceptedAt: null });
    const editContext = makeService(editOrder);

    await editContext.service.creatorUpdateFields(ORDER_ID, { fields: { social_base: 6000 }, reason: 'correct before accept' }, creator);
    expect(editOrder.parentOrder.extraData.social_base).toBe(6000);
    expect(editContext.workOrderRepo.save).toHaveBeenCalledWith(editOrder.parentOrder);

    const withdrawOrder = makeSocialOrder({ status: DispatchedOrderStatus.PENDING, acceptedAt: null });
    const withdrawContext = makeService(withdrawOrder);
    await withdrawContext.service.withdraw(ORDER_ID, { reason: 'cancel before accept' }, creator);
    expect(withdrawOrder.status).toBe(DispatchedOrderStatus.WITHDRAWN);
    expect(withdrawContext.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_withdraw_direct_before_accept' }));

    const voidOrder = makeSocialOrder({ status: DispatchedOrderStatus.PENDING, acceptedAt: null });
    const voidContext = makeService(voidOrder);
    await voidContext.service.voidByCreator(ORDER_ID, { reason: 'void before accept' }, creator);
    expect(voidOrder.status).toBe(DispatchedOrderStatus.VOID);
    expect(voidOrder.voidAt).toBeInstanceOf(Date);
    expect(voidContext.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_void_direct_before_accept' }));
  });

  it('locks salesperson direct edit after social insurance is accepted and keeps withdraw/void approval-bound', async () => {
    const acceptedOrder = makeSocialOrder({ status: DispatchedOrderStatus.PROCESSING, acceptedAt: new Date('2026-06-02T00:00:00.000Z') });
    const acceptedContext = makeService(acceptedOrder);
    await expect(acceptedContext.service.creatorUpdateFields(ORDER_ID, { fields: { social_base: 7000 }, reason: 'late change' }, creator))
      .rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(acceptedContext.workOrderRepo.save).not.toHaveBeenCalled();

    const withdrawOrder = makeSocialOrder({ status: DispatchedOrderStatus.PROCESSING, acceptedAt: new Date('2026-06-02T00:00:00.000Z') });
    const withdrawContext = makeService(withdrawOrder);
    await withdrawContext.service.withdraw(ORDER_ID, { reason: 'withdraw after accept' }, creator);
    expect(withdrawOrder.status).toBe(DispatchedOrderStatus.WITHDRAW_PENDING);
    expect(withdrawContext.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_withdraw_request' }));

    const voidOrder = makeSocialOrder({ status: DispatchedOrderStatus.PROCESSING, acceptedAt: new Date('2026-06-02T00:00:00.000Z') });
    const voidContext = makeService(voidOrder);
    await voidContext.service.voidByCreator(ORDER_ID, { reason: 'void after accept' }, creator);
    expect(voidOrder.status).toBe(DispatchedOrderStatus.VOID_PENDING);
    expect(voidContext.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_void_request' }));
  });

  it('keeps retry/waiting batch feedback in processing instead of adding extra failure states', async () => {
    const order = makeSocialOrder({ status: DispatchedOrderStatus.PENDING, acceptedAt: null, handlerId: 'handler-1' });
    const { service, dispatchedOrderRepo, operationLogRepo } = makeService(order);

    const result = await service.batchImport({
      moduleCode: 'social_insurance',
      mode: 'status',
      forceAction: 'processing',
      rows: [{ orderNo: order.parentOrder.orderNo, result: 'retry waiting', remark: 'awaiting retry' }],
    }, handler);

    expect(result.rows[0]).toMatchObject({ success: true, action: 'processing' });
    expect(order.status).toBe(DispatchedOrderStatus.PROCESSING);
    expect(order.acceptedAt).toBeInstanceOf(Date);
    expect(dispatchedOrderRepo.save).toHaveBeenCalledWith(order);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'batch_import_keep_processing' }));
  });
});
