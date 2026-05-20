import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DispatchedOrder, DispatchedOrderStatus, FieldConfig, ModuleHandler, Notification, OperationLog, OrderStage, OrderType, RoleLevel, UserRole, WorkOrder, WorkOrderStatus } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

function qbMock(rows: DispatchedOrder[], total = rows.length) {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    getManyAndCount: jest.fn(async () => [rows, total]),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.offset.mockReturnValue(qb);
  qb.limit.mockReturnValue(qb);
  return qb;
}

describe('DispatchedOrderService', () => {
  function makeService(moduleHandlerRepoOverrides: Partial<Record<string, unknown>> = {}) {
    const rows = [{ id: 'do-1', parentOrderId: 'wo-1', parentOrder: { id: 'wo-1', orderNo: 'ON20260511001', orderType: 'onboarding', status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: 'employee', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() }, moduleCode: 'data_entry', status: DispatchedOrderStatus.PENDING, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder];
    const queryBuilder = qbMock(rows, 1);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => queryBuilder) });
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>({ find: jest.fn(async () => [{ moduleCode: 'data_entry', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]), ...moduleHandlerRepoOverrides });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as unknown as UserRole]) });
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never);
    return { service, queryBuilder };
  }

  it('filters list results and paginates with offset/limit', async () => {
    const rows = [{ id: 'do-1', parentOrderId: 'wo-1', parentOrder: { id: 'wo-1', orderNo: 'ON20260511001', orderType: 'onboarding', status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: '张三', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() }, moduleCode: 'data_entry', status: DispatchedOrderStatus.PENDING, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder];
    const queryBuilder = qbMock(rows, 1);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => queryBuilder) });
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>({ find: jest.fn(async () => [{ moduleCode: 'data_entry', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]) });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as unknown as UserRole]) });
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never);
    const user: JwtUserPayload = { sub: 'user-1', username: 'dataentry01', roles: ['data_entry_team'] } as JwtUserPayload;

    const result = await service.findAll({ page: 1, pageSize: 20, moduleCode: 'data_entry' } as never, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'data_entry' });
    expect(queryBuilder.offset).toHaveBeenCalledWith(0);
    expect(queryBuilder.limit).toHaveBeenCalledWith(20);
    expect(result.total).toBe(1);
    expect(result.items[0].handlerId).toBe('handler-1');
  });

  it('removes a dispatched order and writes an operation log', async () => {
    const parentOrder = { id: 'wo-1', orderNo: 'ON20260511001', orderType: OrderType.ONBOARDING, status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: 'employee', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as WorkOrder;
    const order = { id: 'do-1', parentOrderId: 'wo-1', parentOrder, moduleCode: 'data_entry', status: DispatchedOrderStatus.PENDING, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>();
    const userRoleRepo = repoMock<UserRole>();
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never);

    const result = await service.remove('do-1', { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload);

    expect(dispatchedOrderRepo.delete).toHaveBeenCalledWith('do-1');
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'dispatched_order', entityId: 'do-1', actionType: 'delete' }));
    expect(result).toEqual({ success: true, id: 'do-1' });
  });

  it('throws NotFoundException when removing a missing dispatched order', async () => {
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => null) });
    const service = new DispatchedOrderService(dispatchedOrderRepo, repoMock<WorkOrder>(), repoMock<ModuleHandler>(), repoMock<UserRole>(), repoMock<FieldConfig>(), repoMock<Notification>(), repoMock<OperationLog>(), {} as FieldPermissionService, { getLogs: jest.fn() } as unknown as FieldSupplementService, { exportSingleDispatchedOrder: jest.fn() } as never);

    await expect(service.remove('missing-id', { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload)).rejects.toMatchObject({ status: 404 });
    expect(dispatchedOrderRepo.delete).not.toHaveBeenCalled();
  });

  it.each(['data_entry', 'onboarding_contact', 'contract', 'renewal_contract', 'resignation_contact', 'resignation_cert', 'benefit_apply'])(
    'lists %s module without throwing and applies module filter',
    async (moduleCode) => {
      const { service, queryBuilder } = makeService({
        find: jest.fn(async () => [{ moduleCode, handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]),
      });
      const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: [`${moduleCode}_team`] } as JwtUserPayload;

      await expect(service.findAll({ page: 1, pageSize: 20, moduleCode } as never, user)).resolves.toMatchObject({ total: 1 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode });
    },
  );

  it('rejects complete when parent work order is voided or the child has voidAt', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.VOID,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: 'employee',
      employeeIdCard: '330102199001010011',
      extraData: {},
      submittedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as WorkOrder;
    const order = {
      id: 'do-1',
      parentOrderId: 'wo-1',
      parentOrder,
      moduleCode: 'data_entry',
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: null,
      dispatchedAt: new Date(),
      acceptedAt: new Date(),
      completedAt: null,
      voidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
    );

    await expect(service.complete('do-1', { remark: 'done' }, { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload))
      .rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(dispatchedOrderRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
