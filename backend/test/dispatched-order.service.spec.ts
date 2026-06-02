import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { Repository } from 'typeorm';
import { DispatchedOrder, DispatchedOrderStatus, FieldConfig, ModuleField, ModuleHandler, Notification, OperationLog, OrderType, RoleLevel, User, UserRole, WorkOrder, WorkOrderFieldDirtyMark, WorkOrderStatus } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { BatchCompleteDispatchedOrderDto } from 'src/modules/dispatched-orders/dto/batch-complete.dto';
import { ListDispatchedOrderQueryDto } from 'src/modules/dispatched-orders/dto/list-query.dto';
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
  function makeDispatchedOrder(status: DispatchedOrderStatus = DispatchedOrderStatus.PENDING): DispatchedOrder {
    return { id: `do-${status}`, parentOrderId: 'wo-1', parentOrder: { id: 'wo-1', orderNo: 'ON20260511001', orderType: 'onboarding', status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: 'employee', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() }, moduleCode: 'data_entry', status, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: status === DispatchedOrderStatus.PROCESSING ? new Date() : null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder;
  }

  function makeService(moduleHandlerRepoOverrides: Partial<Record<string, unknown>> = {}, rows: DispatchedOrder[] = [makeDispatchedOrder()]) {
    const queryBuilder = qbMock(rows, rows.length);
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

  it('maps Chinese moduleName and nodeType filters to module_code', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [{ moduleCode: 'onboarding_contact', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]),
    });
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['shared_team_owner'] } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20, moduleName: '入职联系' } as never, user);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'onboarding_contact' });

    queryBuilder.andWhere.mockClear();
    await service.findAll({ page: 1, pageSize: 20, nodeType: '劳动合同签订' } as never, user);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'contract' });
  });

  it('applies multi-status and compatible header filter fields before pagination', async () => {
    const { service, queryBuilder } = makeService();
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;

    await service.findAll({
      page: 2,
      pageSize: 10,
      statuses: 'pending,processing,invalid',
      assignee: ['handler-1', 'handler-2'],
      department: 'dep-1,dep-2',
      type: ['onboarding', 'renewal'],
      employee_id_card: '3301',
      customerName: 'Acme',
      employee_name: 'Alice',
    } as never, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.handler_id IN'), { handlerId: ['handler-1', 'handler-2'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('w.department_id IN'), { departmentIds: ['dep-1', 'dep-2'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('w.order_type IN'), { orderTypes: ['onboarding', 'renewal'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('employee_id_card'), { idCardNo: '%3301%' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('customerName'), { customerName: '%Acme%' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('employeeName'), { employeeName: '%Alice%' });
    expect(queryBuilder.offset).toHaveBeenCalledWith(10);
    expect(queryBuilder.limit).toHaveBeenCalledWith(10);
  });

  it('accepts repeated status query arrays through the global validation pipe contract', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform({ status: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ status: ['processing', 'completed'] }));
    await expect(pipe.transform({ statuses: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statuses: ['processing', 'completed'] }));
    await expect(pipe.transform({ statusIn: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statusIn: ['processing', 'completed'] }));
    await expect(pipe.transform({ statuses: 'processing,completed' }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statuses: ['processing', 'completed'] }));
  });

  it('accepts dashboard fallback scope query through the global validation pipe contract', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform(
      { scope: 'team', page: '1', pageSize: '100' },
      { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' },
    )).resolves.toEqual(expect.objectContaining({ scope: 'team', page: 1, pageSize: 100 }));
  });

  it('applies status/statuses/statusIn single processing filters and returns processing rows', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const processingOrder = makeDispatchedOrder(DispatchedOrderStatus.PROCESSING);
    const cases: Array<Record<string, string>> = [
      { status: 'processing' },
      { statuses: 'processing' },
      { statusIn: 'processing' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [processingOrder]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status = :status'), { status: DispatchedOrderStatus.PROCESSING });
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('applies status/statuses/statusIn array and comma forms to the same status IN filter', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Partial<ListDispatchedOrderQueryDto>> = [
      { status: ['processing', 'completed'] },
      { statuses: ['processing', 'completed'] },
      { statusIn: ['processing', 'completed'] },
      { status: ['processing,completed'] },
      { statuses: 'processing,completed' },
      { statusIn: 'processing,completed' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PROCESSING, DispatchedOrderStatus.COMPLETED] });
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('normalizes Chinese processing label to pending and processing filters', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Record<string, string | string[]>> = [
      { status: '处理中' },
      { statuses: ['处理中'] },
      { statusIn: '處理中' },
      { statuses: '处理中,in_progress,processing' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PENDING), makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING] });
      expect(result.items.map((item) => item.status)).toEqual([DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING]);
    }
  });

  it('normalizes legacy English processing aliases to processing filters', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Record<string, string | string[]>> = [
      { statuses: ['accepted'] },
      { statusIn: 'in_progress' },
      { status: 'handling' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status = :status'), { status: DispatchedOrderStatus.PROCESSING });
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('limits batch complete ids to 50 items', () => {
    const dto = Object.assign(new BatchCompleteDispatchedOrderDto(), {
      ids: Array.from({ length: 51 }, (_item, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`),
      remark: 'done',
    });

    expect(validateSync(dto).some((error) => error.property === 'ids')).toBe(true);
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

  it('uses concrete actor name in field-change notifications for dispatched recipients', async () => {
    const parentOrder = { id: 'wo-1', orderNo: 'ON20260511001', modificationRound: 0 } as unknown as WorkOrder;
    const sourceOrder = { id: 'do-source', parentOrderId: 'wo-1', parentOrder, moduleCode: 'data_entry' } as unknown as DispatchedOrder;
    const child = {
      id: 'do-target',
      parentOrderId: 'wo-1',
      parentOrder,
      moduleCode: 'data_entry',
      status: DispatchedOrderStatus.PENDING,
      handlerId: 'recipient-1',
      visibleFields: ['employee_name'],
      voidAt: null,
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ find: jest.fn(async () => [child]) });
    const workOrderRepo = repoMock<WorkOrder>({
      manager: {
        getRepository: jest.fn(() => ({ findOne: jest.fn(async () => ({ id: 'actor-1', realName: '张三', username: 'zhangsan' } as User)) })),
      },
    });
    const notificationRepo = repoMock<Notification>();
    const dirtyMarkRepo = repoMock<WorkOrderFieldDirtyMark>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>({ find: jest.fn(async () => [{ fieldCode: 'employee_name', fieldName: '员工姓名' }]) }),
      notificationRepo,
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      undefined,
      undefined,
      dirtyMarkRepo,
      repoMock<ModuleField>({ find: jest.fn(async () => []) }),
    );

    await (service as unknown as {
      markAndNotifyAffectedDispatchedOrders: (order: DispatchedOrder, diff: Array<{ field: string; before: unknown; after: unknown }>, actorUserId: string, bizType: string) => Promise<void>;
    }).markAndNotifyAffectedDispatchedOrders(sourceOrder, [{ field: 'employee_name', before: '李四', after: '王五' }], 'actor-1', 'order.field_changed');

    expect(notificationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'recipient-1',
      content: expect.stringContaining('张三'),
    }));
    expect(notificationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining('办理人'),
    }));
  });

  it('requires standardized batch import action and rejects business-side imports before row processing', async () => {
    const { service } = makeService();
    const businessUser = { sub: 'biz-1', username: 'sales', roles: ['business_group_member'] } as JwtUserPayload;

    await expect(service.batchImport({
      moduleCode: 'contract',
      mode: 'status',
      rows: [{ orderNo: 'ON20260511001', result: '完成' }],
    }, businessUser)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    await expect(service.batchImport({
      moduleCode: 'contract',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ orderNo: 'ON20260511001' }],
    }, businessUser)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('matches exported template rows using database column names and identity aliases', async () => {
    const order = makeDispatchedOrder(DispatchedOrderStatus.PENDING);
    const qb = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn(async () => [order]),
      update: jest.fn(),
      set: jest.fn(),
      execute: jest.fn(),
    };
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => qb), save: jest.fn(async (input) => input) });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>({ count: jest.fn(async () => 1) }),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
    );

    await service.batchImport({
      moduleCode: '数据录入',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ raw: { 工单编号: order.parentOrder.orderNo, 员工证件号: order.parentOrder.employeeIdCard } }],
      defaultRemark: 'done',
    }, { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload);

    expect(qb.where).toHaveBeenCalledWith('d.module_code = :moduleCode', { moduleCode: 'data_entry' });
    expect(qb.andWhere).toHaveBeenCalledWith('w.order_no = :orderNo', { orderNo: order.parentOrder.orderNo });
    expect(qb.andWhere).toHaveBeenCalledWith('w.employee_id_card = :employeeIdCard', { employeeIdCard: order.parentOrder.employeeIdCard });
    expect(qb.orderBy).toHaveBeenCalledWith('d.created_at', 'DESC');
  });

  it('rejects accept/claim/complete/return when parent work order is void, void_pending, withdraw_pending, withdrawn, or child has voidAt', async () => {
    const makeParent = (status: WorkOrderStatus) => ({
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status,
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
    } as unknown as WorkOrder);
    const makeOrder = (status: DispatchedOrderStatus, parentStatus: WorkOrderStatus, overrides: Partial<DispatchedOrder> = {}) => ({
      id: 'do-1',
      parentOrderId: 'wo-1',
      parentOrder: makeParent(parentStatus),
      moduleCode: 'data_entry',
      status,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: null,
      dispatchedAt: new Date(),
      acceptedAt: status === DispatchedOrderStatus.PROCESSING ? new Date() : null,
      completedAt: null,
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as unknown as DispatchedOrder);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>();
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
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PENDING, WorkOrderStatus.VOID));
    await expect(service.accept('do-1', {}, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PENDING, WorkOrderStatus.VOID_PENDING, { handlerId: null }));
    await expect(service.claim('do-1', user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.WITHDRAW_PENDING));
    await expect(service.complete('do-1', { remark: 'done' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.WITHDRAWN));
    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.PROCESSING, { voidAt: new Date() }));
    await expect(service.complete('do-1', { remark: 'done' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(dispatchedOrderRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returnOrder rejects with 409 and writes nothing to parent/child when parent work order is withdrawn', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.WITHDRAWN,
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
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const workOrderRepo = repoMock<WorkOrder>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
    );
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    // 父单兜底必须在任何写入前拦截：子单与父单都不得被持久化。
    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    // 状态保持原值，绝不能被改写成 RETURNED。
    expect(order.status).toBe(DispatchedOrderStatus.PROCESSING);
    expect(parentOrder.status).toBe(WorkOrderStatus.WITHDRAWN);
  });

  it('returnOrder rejects with 409 and writes nothing when the child order itself is withdrawn', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
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
      status: DispatchedOrderStatus.WITHDRAWN,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: '业务员撤回已通过，可直接作废',
      dispatchedAt: new Date(),
      acceptedAt: new Date(),
      completedAt: new Date(),
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const workOrderRepo = repoMock<WorkOrder>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
    );
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    // 已撤回子单的状态保持不变，不得被改写成 RETURNED。
    expect(order.status).toBe(DispatchedOrderStatus.WITHDRAWN);
    expect(parentOrder.status).toBe(WorkOrderStatus.PROCESSING);
  });
});
