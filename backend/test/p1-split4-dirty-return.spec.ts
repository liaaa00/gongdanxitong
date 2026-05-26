import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderReturnRecord,
  DispatchedOrderStatus,
  FieldConfig,
  FieldType,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderType,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';

function repo<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | T[]) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

function user(overrides: Partial<JwtUserPayload> = {}): JwtUserPayload {
  return { sub: 'sales-1', username: 'sales01', roles: ['biz_member'], ...overrides } as JwtUserPayload;
}

const parent = Object.assign(new WorkOrder(), {
  id: 'wo-1',
  orderNo: 'ON1',
  orderType: OrderType.ONBOARDING,
  status: WorkOrderStatus.PROCESSING,
  createdBy: 'sales-1',
  departmentId: 'dep-1',
  customerId: 'cus-1',
  employeeName: '张三',
  employeeIdCard: '330102199001010011',
  extraData: { employee_name: '张三', mobile: '13800000000' },
  modificationRound: 0,
  submittedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  creator: { id: 'sales-1', username: 'sales01', realName: '业务员' },
  department: { id: 'dep-1', name: '业务一组' },
  customer: { id: 'cus-1', customerCode: 'C001', customerName: '客户' },
  dispatchedOrders: [],
});

function child(overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  return Object.assign(new DispatchedOrder(), {
    id: 'do-1',
    parentOrderId: 'wo-1',
    parentOrder: parent,
    moduleCode: 'social_insurance',
    status: DispatchedOrderStatus.PROCESSING,
    handlerId: 'handler-1',
    handler: { id: 'handler-1', realName: '处理人' },
    visibleFields: ['employee_name', 'mobile'],
    returnReason: null,
    flowRound: 0,
    completionRemark: null,
    dispatchedAt: new Date(),
    acceptedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('P1 split4 dirty return backend rules', () => {
  it('creates field-level dirty marks when salesperson updates active main order fields', async () => {
    const workOrderRepo = repo<WorkOrder>();
    const dispatchedRepo = repo<DispatchedOrder>({
      find: jest.fn(async () => [child({ id: 'do-social' })]),
      createQueryBuilder: jest.fn(() => ({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn(async () => ({ affected: 1 })) })),
    });
    const fieldRepo = repo<FieldConfig>({
      find: jest.fn(async () => [Object.assign(new FieldConfig(), { fieldCode: 'mobile', fieldName: '移动电话', fieldType: FieldType.PHONE, isActive: true })]),
    });
    const dirtyRepo = repo<WorkOrderFieldDirtyMark>();
    const moduleFieldRepo = repo<ModuleField>({ find: jest.fn(async () => [Object.assign(new ModuleField(), { moduleCode: 'social_insurance', fieldCode: 'mobile', isActive: true })]) });

    (workOrderRepo.findOne as jest.Mock)
      .mockResolvedValueOnce(Object.assign(new WorkOrder(), parent, { extraData: { employee_name: '张三', mobile: '13800000000' } }))
      .mockResolvedValueOnce(Object.assign(new WorkOrder(), parent, { extraData: { employee_name: '张三', mobile: '13900000000' }, dispatchedOrders: [] }));
    (workOrderRepo.save as jest.Mock).mockImplementation(async (input: WorkOrder) => input);

    const service = new WorkOrderService(
      workOrderRepo,
      dispatchedRepo,
      fieldRepo,
      repo() as never,
      repo<Notification>(),
      repo<OperationLog>(),
      { requireText: jest.fn((value) => String(value)) } as never,
      { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
      undefined,
      undefined,
      moduleFieldRepo,
      dirtyRepo,
    );

    await service.update('wo-1', { extraData: { mobile: '13900000000' } }, user());

    expect(dirtyRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ dispatchedOrderId: 'do-social', moduleCode: 'social_insurance', fieldCode: 'mobile', oldValue: '13800000000', newValue: '13900000000' }),
    ]));
  });

  it('denies normal handler returning a completed child but allows configured module supervisor', async () => {
    const completed = child({ status: DispatchedOrderStatus.COMPLETED, handlerId: 'handler-1' });
    const dispatchedRepo = repo<DispatchedOrder>({ findOne: jest.fn(async () => completed) });
    const workOrderRepo = repo<WorkOrder>();
    const supervisorRepo = repo<ModuleSupervisor>({ count: jest.fn(async ({ where }: { where: { supervisorId: string } }) => where.supervisorId === 'sup-1' ? 1 : 0) });
    const returnRecordRepo = repo<DispatchedOrderReturnRecord>();

    const service = new DispatchedOrderService(
      dispatchedRepo,
      workOrderRepo,
      repo<ModuleHandler>(),
      repo<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } }]) }),
      repo<FieldConfig>(),
      repo<Notification>(),
      repo<OperationLog>(),
      {} as never,
      { supplement: jest.fn(), getLogs: jest.fn() } as never,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      supervisorRepo,
      returnRecordRepo,
    );

    await expect(service.returnOrder('do-1', { returnReason: '资料有误' }, user({ sub: 'handler-1', roles: ['onboarding_specialist'] }))).rejects.toBeInstanceOf(HttpException);
    await expect(service.returnOrder('do-1', { returnReason: '资料有误' }, user({ sub: 'sup-1', roles: ['shared_leader'] }))).resolves.toMatchObject({ id: 'do-1' });
    expect(returnRecordRepo.save).toHaveBeenCalledWith(expect.objectContaining({ returnedBy: 'sup-1', returnReason: '资料有误', beforeStatus: DispatchedOrderStatus.COMPLETED }));
  });

  it('requires Chinese-readable remark for social insurance batch complete', async () => {
    const service = new DispatchedOrderService(
      repo<DispatchedOrder>(),
      repo<WorkOrder>(),
      repo<ModuleHandler>(),
      repo<UserRole>(),
      repo<FieldConfig>(),
      repo<Notification>(),
      repo<OperationLog>(),
      {} as never,
      { supplement: jest.fn(), getLogs: jest.fn() } as never,
      { exportSingleDispatchedOrder: jest.fn() } as never,
    );

    await expect(service.batchCompleteSocialInsurance({ ids: ['00000000-0000-4000-8000-000000000001'], remark: '   ' }, user({ sub: 'handler-1' }))).rejects.toThrow('社保批量完成备注必填');
  });
});
