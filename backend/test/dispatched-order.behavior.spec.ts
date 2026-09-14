import { HttpStatus } from '@nestjs/common';
import {
  BusinessScope,
  DispatchModuleCode,
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleHandler,
  Notification,
  OperationLog,
  OrderType,
  RoleLevel,
  User,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

/**
 * 派单域行为测试网（治理计划 2-1 / T03）。
 *
 * 目标：为 dispatched-order.service.ts 的核心行为（接单 / 认领 / 办结 / 退回 / 批量 / 权限边界）
 * 建立"可观察行为"回归保护网，作为 T04 巨石拆分的安全网。
 *
 * 设计原则：
 * - 用测试替身（纯 mock 仓储 + 内存夹具）隔离，绝不连库、零数据污染。
 * - 断言**可观察行为**：状态变迁结果（写回仓储/更新语句的 set 值）、DB 副作用（save/log/notification
 *   的实际入参）、权限边界的对外错误码与文案；**不断言私有方法调用次数等内部实现细节**。
 * - 读写回（findOne 详情）用测试替身桩隔离，以聚焦每个动作自身的写副作用与前置校验。
 */

function makeUser(overrides: Partial<JwtUserPayload> = {}): JwtUserPayload {
  return {
    sub: 'handler-1',
    username: 'handler-1',
    realName: '处理人',
    roles: ['data_entry_specialist'],
    ...overrides,
  } as JwtUserPayload;
}

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo-1',
    orderNo: 'ON20260915001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
    departmentId: 'dept-1',
    customerId: 'cust-1',
    employeeName: '张三',
    employeeIdCard: '330102199001010011',
    businessScope: BusinessScope.BEILUN,
    extraData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as WorkOrder;
}

function makeDispatchedOrder(
  overrides: Partial<DispatchedOrder> & { parentOrder?: WorkOrder } = {},
): DispatchedOrder {
  const parentOrder = overrides.parentOrder ?? makeWorkOrder();
  return {
    id: 'do-1',
    parentOrderId: parentOrder.id,
    parentOrder,
    moduleCode: DispatchModuleCode.DATA_ENTRY,
    status: DispatchedOrderStatus.PENDING,
    handlerId: 'handler-1',
    visibleFields: null,
    returnReason: null,
    returnTargetType: null,
    returnTargetId: null,
    dispatchedAt: new Date(),
    acceptedAt: null,
    completedAt: null,
    completionRemark: null,
    voidAt: null,
    flowRound: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as DispatchedOrder;
}

/** 查询链替身：列表/关联读取场景返回空集，避免影响写动作断言。 */
function selectQb(rows: unknown[] = [], total = 0) {
  const qb: Record<string, jest.Mock> = {};
  qb.leftJoinAndSelect = jest.fn(() => qb);
  qb.innerJoin = jest.fn(() => qb);
  qb.leftJoin = jest.fn(() => qb);
  qb.select = jest.fn(() => qb);
  qb.addSelect = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.where = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.offset = jest.fn(() => qb);
  qb.limit = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => rows);
  qb.getManyAndCount = jest.fn(async () => [rows, total]);
  qb.getRawMany = jest.fn(async () => rows);
  qb.getCount = jest.fn(async () => total);
  return qb;
}

/** 链式更新语句替身：记录 set 入参并按预设返回 affected。 */
function updateQb(affected: number) {
  const captured: { set: Record<string, unknown> | null; returned: unknown } = { set: null, returned: undefined };
  const qb: Record<string, jest.Mock> = {};
  qb.update = jest.fn(() => qb);
  qb.set = jest.fn((value: Record<string, unknown>) => {
    captured.set = value;
    return qb;
  });
  qb.where = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.returning = jest.fn((value: unknown) => {
    captured.returned = value;
    return qb;
  });
  qb.execute = jest.fn(async () => ({ affected, raw: [], generatedMaps: [] }));
  return { qb, captured };
}

interface HarnessOptions {
  order?: DispatchedOrder;
  /** loadDispatchedOrder 每次读取返回的快照；不传则复用同一 order 引用；传 null 表示单子不存在。 */
  orderForLoad?: DispatchedOrder | null;
  updateAffected?: number;
  handlerCount?: number;
  supervisorLevel?: boolean;
  moduleHandlerRows?: ModuleHandler[];
}

function makeHarness(options: HarnessOptions = {}) {
  const order = options.order ?? makeDispatchedOrder();
  const orderForLoad = 'orderForLoad' in options ? options.orderForLoad : order;
  const { qb: updateStatement, captured: updateCaptured } = updateQb(options.updateAffected ?? 1);

  const dispatchedOrderRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    findOne: jest.fn(async () => orderForLoad),
    find: jest.fn(async () => [order]),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    // accept/claim 走 createQueryBuilder().update()；complete 走事务内 manager 仓储同款链
    createQueryBuilder: jest.fn(() => updateStatement),
    manager: {
      // 默认：直接以同一 manager 执行回调，manager.getRepository 回落到各替身仓储。
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkOrder) return workOrderRepo;
        if (entity === DispatchedOrder) {
          return { createQueryBuilder: jest.fn(() => updateStatement), save: workOrderSaveForManager };
        }
        return { find: jest.fn(async () => []), save: jest.fn(async (x: unknown) => x), create: jest.fn((x: unknown) => x) };
      }),
    },
  } as unknown as Record<string, jest.Mock | unknown> & Repositoryish;

  const workOrderSaveForManager = jest.fn(async (x: unknown) => x);
  const workOrderRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    findOne: jest.fn(async () => order.parentOrder),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(() => selectQb()),
    manager: { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb({})) },
  };
  const manager = {
    getRepository: (dispatchedOrderRepo.manager as { getRepository: (e: unknown) => unknown }).getRepository,
    query: jest.fn(async () => []),
  };

  const moduleHandlerRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    findOne: jest.fn(async () => ({ handlerId: 'handler-1', moduleCode: order.moduleCode, isActive: true })),
    find: jest.fn(async () => options.moduleHandlerRows ?? []),
    count: jest.fn(async () => options.handlerCount ?? 0),
    createQueryBuilder: jest.fn(() => selectQb()),
  };
  const userRoleRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () =>
      options.supervisorLevel
        ? [{ userId: 'handler-1', role: { level: RoleLevel.SUPERVISOR } }]
        : [{ userId: 'handler-1', role: { level: RoleLevel.EXECUTION } }]),
    count: jest.fn(async () => 0),
  };
  const fieldConfigRepo = {
    find: jest.fn(async () => [] as FieldConfig[]),
    findOne: jest.fn(async () => null),
  };
  const notificationRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    find: jest.fn(async () => [] as Notification[]),
  };
  const operationLogRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    find: jest.fn(async () => [] as OperationLog[]),
    count: jest.fn(async () => 0),
  };
  const fieldPermissionService = {
    getPermissionsForUser: jest.fn(async () => new Map<string, unknown>()),
    applyExtraData: jest.fn(async (x: unknown) => x),
    applyFieldViews: jest.fn(async (x: unknown) => x),
  } as unknown as FieldPermissionService;
  const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
  const exportTemplatesService = {
    exportSingleDispatchedOrder: jest.fn(),
    exportDispatchedOrdersAuto: jest.fn(),
  };
  const validationService = { resolveUserDepartmentIds: jest.fn(async () => ['dept-1']) };
  const userRepository = {
    find: jest.fn(async () => [{ id: 'handler-1' }, { id: 'creator-1' }] as User[]),
  };

  const service = new DispatchedOrderService(
    dispatchedOrderRepo as never,
    workOrderRepo as never,
    moduleHandlerRepo as never,
    userRoleRepo as never,
    fieldConfigRepo as never,
    notificationRepo as never,
    operationLogRepo as never,
    fieldPermissionService,
    fieldSupplementService,
    exportTemplatesService as never,
    validationService as never,
    undefined, // orderStageRepository
    undefined, // fieldChangeHook
    undefined, // dirtyMarkRepository
    undefined, // moduleFieldRepository
    undefined, // moduleSupervisorRepository
    undefined, // returnRecordRepository
    undefined, // fieldSyncBatchRepository
    undefined, // fieldSyncItemRepository
    undefined, // detailViewTemplatesService
    undefined, // uploadsService
    undefined, // roleActionPermissionService
    undefined, // resignationCertificateAutomationService
    userRepository as never,
    undefined, // completionEmailService
  );

  // 读回详情用替身桩隔离，使各写动作断言聚焦于自身副作用。
  const findOneSpy = jest.spyOn(service, 'findOne').mockImplementation(async (id: string) => ({
    id,
    stubbedDetail: true,
  }) as never);

  return {
    service,
    order,
    orderForLoad,
    dispatchedOrderRepo,
    workOrderRepo,
    moduleHandlerRepo,
    notificationRepo,
    operationLogRepo,
    updateCaptured,
    findOneSpy,
  };
}

type Repositoryish = { [k: string]: unknown };

function assertBusinessError(err: unknown, code: number, status: HttpStatus, message: string): void {
  const e = err as { getResponse?: () => { code?: number; message?: string }; getStatus?: () => number; message?: string };
  const body = typeof e.getResponse === 'function' ? (e.getResponse() as { code?: number; message?: string }) : undefined;
  expect(body?.code).toBe(code);
  expect(e.getStatus?.()).toBe(status);
  expect(body?.message ?? e.message).toContain(message);
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('预期抛出异常，但调用成功返回');
}

describe('DispatchedOrderService 行为测试网 (T03)', () => {
  // ---------- 接单 accept ----------
  it('accept: 将 PENDING 子单原子更新为 PROCESSING 并写接单日志', async () => {
    const h = makeHarness({ updateAffected: 1 });
    const user = makeUser({ sub: 'handler-1' });

    await expect(h.service.accept('do-1', {} as never, user)).resolves.toMatchObject({ id: 'do-1' });

    // DB 副作用：状态变迁由 UPDATE set 表达
    expect(h.updateCaptured.set).toMatchObject({
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
    });
    expect((h.updateCaptured.set as { acceptedAt: unknown }).acceptedAt).toBeInstanceOf(Date);
    // 审计副作用
    expect(h.operationLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'accept', entityId: 'do-1', userId: 'handler-1' }),
    );
  });

  it('accept: 非 PENDING 状态被拒（4201 状态不允许接单）', async () => {
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING });
    const h = makeHarness({ order });
    const err = await captureError(() => h.service.accept('do-1', {} as never, makeUser()));
    assertBusinessError(err, 4201, HttpStatus.CONFLICT, '子工单状态不允许接单');
    expect(h.operationLogRepo.save).not.toHaveBeenCalled();
  });

  it('accept: 已分配他人且非管理员被拒（4220 已分配给他人）', async () => {
    const order = makeDispatchedOrder({ handlerId: 'someone-else', status: DispatchedOrderStatus.PENDING });
    const h = makeHarness({ order });
    const err = await captureError(() => h.service.accept('do-1', {} as never, makeUser({ sub: 'handler-1' })));
    assertBusinessError(err, 4220, HttpStatus.CONFLICT, '已分配给他人');
  });

  it('accept: 无指派人的公共池单，无权接取该模块时 5000 拒绝', async () => {
    const order = makeDispatchedOrder({ handlerId: null, status: DispatchedOrderStatus.PENDING });
    const h = makeHarness({ order, handlerCount: 0 });
    const err = await captureError(() =>
      h.service.accept('do-1', {} as never, makeUser({ sub: 'stranger-9', roles: ['contract_specialist'] })),
    );
    assertBusinessError(err, 5000, HttpStatus.FORBIDDEN, '无权接取该模块待认领工单');
  });

  it('accept: 并发下 UPDATE 命中 0 行时报状态已变化（4220）', async () => {
    const h = makeHarness({ updateAffected: 0 });
    const err = await captureError(() => h.service.accept('do-1', {} as never, makeUser()));
    assertBusinessError(err, 4220, HttpStatus.CONFLICT, '状态已变化');
  });

  // ---------- 认领 claim ----------
  it('claim: 无指派人时认领，更新 handler_id IS NULL 条件并写日志', async () => {
    const order = makeDispatchedOrder({ handlerId: null, status: DispatchedOrderStatus.PENDING });
    const h = makeHarness({ order, handlerCount: 1 });
    await expect(h.service.claim('do-1', makeUser({ sub: 'pool-1' }))).resolves.toMatchObject({ id: 'do-1' });
    expect(h.updateCaptured.set).toMatchObject({ handlerId: 'pool-1', status: DispatchedOrderStatus.PROCESSING });
    expect(h.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'claim' }));
  });

  it('claim: 已有指派人时拒绝认领（4220 已被认领）', async () => {
    const order = makeDispatchedOrder({ handlerId: 'handler-1' });
    const h = makeHarness({ order });
    const err = await captureError(() => h.service.claim('do-1', makeUser()));
    assertBusinessError(err, 4220, HttpStatus.CONFLICT, '已被认领');
  });

  // ---------- 退回 returnOrder ----------
  it('returnOrder: 退回给发起人，子单转 RETURNED、父单转 RETURNED 并通知发起人+写日志', async () => {
    const parent = makeWorkOrder({ status: WorkOrderStatus.PROCESSING });
    const order = makeDispatchedOrder({
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
      parentOrder: parent,
    });
    const h = makeHarness({ order });

    await expect(
      h.service.returnOrder('do-1', { returnReason: '资料不齐' } as never, makeUser({ sub: 'handler-1' })),
    ).resolves.toMatchObject({ id: 'do-1' });

    // 可观察状态变迁
    expect(order.status).toBe(DispatchedOrderStatus.RETURNED);
    expect(order.returnTargetType).toBe('creator');
    expect(order.returnReason).toBe('资料不齐');
    expect(parent.status).toBe(WorkOrderStatus.RETURNED);
    expect(h.dispatchedOrderRepo.save).toHaveBeenCalledWith(order);
    expect(h.workOrderRepo.save).toHaveBeenCalledWith(parent);
    // 通知发起人（副作用）
    expect(h.notificationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'creator-1', bizType: 'dispatched_returned' }),
    );
    expect(h.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'return' }));
  });

  it('returnOrder: 退回原因缺失时 4222 拒绝', async () => {
    const h = makeHarness();
    const err = await captureError(() =>
      h.service.returnOrder('do-1', { returnReason: '   ' } as never, makeUser()),
    );
    assertBusinessError(err, 4222, HttpStatus.BAD_REQUEST, '退回原因必填');
  });

  it('returnOrder: 退回目标处理人未配置在该模块时 4220 拒绝', async () => {
    const parent = makeWorkOrder();
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING, handlerId: 'handler-1', parentOrder: parent });
    const h = makeHarness({ order });
    (h.moduleHandlerRepo.findOne as jest.Mock).mockResolvedValueOnce(null); // 目标未配置

    const err = await captureError(() =>
      h.service.returnOrder(
        'do-1',
        { returnReason: '改派', returnTargetType: 'module_handler', returnTargetId: 'no-such-handler' } as never,
        makeUser({ sub: 'handler-1' }),
      ),
    );
    assertBusinessError(err, 4220, HttpStatus.BAD_REQUEST, '退回目标未配置在当前模块');
  });

  it('returnOrder: 已完成子单被非办理人/非主管退回时 5001 拒绝', async () => {
    const parent = makeWorkOrder();
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.COMPLETED, handlerId: 'handler-1', parentOrder: parent });
    const h = makeHarness({ order });
    const err = await captureError(() =>
      h.service.returnOrder(
        'do-1',
        { returnReason: '撤销' } as never,
        makeUser({ sub: 'stranger-9', roles: ['contract_specialist'] }),
      ),
    );
    // assertCanReturnCompleted → 5001
    assertBusinessError(err, 5001, HttpStatus.FORBIDDEN, '仅当前办理人、模块主管或管理员可退回');
  });

  // ---------- 父单联动守卫 ----------
  it('accept: 父单已作废时禁止办理（4204）', async () => {
    const parent = makeWorkOrder({ status: WorkOrderStatus.VOID });
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PENDING, handlerId: 'handler-1', parentOrder: parent });
    const h = makeHarness({ order });
    const err = await captureError(() => h.service.accept('do-1', {} as never, makeUser()));
    assertBusinessError(err, 4204, HttpStatus.CONFLICT, '父工单已作废');
  });

  // ---------- 批量 ----------
  it('batchAccept: 去重后逐个接单，聚合成功数与跳过原因', async () => {
    const h = makeHarness();
    const acceptSpy = jest.spyOn(h.service, 'accept');
    acceptSpy
      .mockResolvedValueOnce({ id: 'a' } as never)
      .mockRejectedValueOnce(Object.assign(new Error('状态已变化'), { getStatus: () => 409 }))
      .mockResolvedValueOnce({ id: 'c' } as never);

    const result = await h.service.batchAccept({ ids: ['a', 'b', 'a', 'c'] } as never, makeUser());

    // 去重：a 只接一次 → 实际调用 3 次（a/b/c）
    expect(acceptSpy).toHaveBeenCalledTimes(3);
    expect(result.accepted).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('b');
  });

  it('batchReturn: 缺少退回原因整体拒绝（4222）', async () => {
    const h = makeHarness();
    const err = await captureError(() => h.service.batchReturn({ ids: ['a', 'b'], returnReason: '' } as never, makeUser()));
    assertBusinessError(err, 4222, HttpStatus.BAD_REQUEST, '批量退回原因必填');
  });

  it('batchReturn: 逐单退回，聚合成功与跳过', async () => {
    const h = makeHarness();
    const returnSpy = jest.spyOn(h.service, 'returnOrder');
    returnSpy
      .mockResolvedValueOnce({ id: 'a' } as never)
      .mockRejectedValueOnce(new Error('无权操作'));
    const result = await h.service.batchReturn({ ids: ['a', 'b'], returnReason: '需修改' } as never, makeUser());
    expect(result.returned).toBe(1);
    expect(result.skipped).toEqual([{ id: 'b', reason: '无权操作' }]);
  });

  it('batchComplete: 缺少备注整体拒绝（4223）', async () => {
    const h = makeHarness();
    const err = await captureError(() => h.service.batchComplete({ ids: ['a'], remark: '  ' } as never, makeUser()));
    assertBusinessError(err, 4223, HttpStatus.BAD_REQUEST, '批量完成备注必填');
  });

  // ---------- 办结 complete（非反馈模块 → 直接 COMPLETED） ----------
  it('complete: 数据录入子单办结为 COMPLETED、写父单额外数据并记 complete 日志', async () => {
    const parent = makeWorkOrder({ extraData: {} });
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING, handlerId: 'handler-1', moduleCode: DispatchModuleCode.DATA_ENTRY, parentOrder: parent });
    const h = makeHarness({ order, updateAffected: 1 });

    await expect(
      h.service.complete('do-1', { remark: '录入完成', extraData: { employee_name: '张三' } } as never, makeUser({ sub: 'handler-1' })),
    ).resolves.toMatchObject({ id: 'do-1' });

    expect(h.updateCaptured.set).toMatchObject({ status: DispatchedOrderStatus.COMPLETED });
    expect((h.updateCaptured.set as { completedAt: unknown }).completedAt).toBeInstanceOf(Date);
    expect(h.operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'complete' }));
  });

  it('complete: 状态冲突（UPDATE 命中 0 行）报 4201', async () => {
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING, handlerId: 'handler-1' });
    const h = makeHarness({ order, updateAffected: 0 });
    const err = await captureError(() =>
      h.service.complete('do-1', { remark: 'x' } as never, makeUser({ sub: 'handler-1' })),
    );
    assertBusinessError(err, 4201, HttpStatus.CONFLICT, '子工单状态不允许该操作');
  });

  // ---------- 读取权限边界（不桩 findOne，直接验证读守卫） ----------
  it('findOne: 与该子单无关且无模块权限者读取被拒（403）', async () => {
    const parent = makeWorkOrder({ createdBy: 'creator-1' });
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING, handlerId: 'handler-1', parentOrder: parent });
    const h = makeHarness({ order });
    h.findOneSpy.mockRestore(); // 走真实 findOne

    await expect(
      h.service.findOne('do-1', makeUser({ sub: 'stranger-9', roles: ['contract_specialist'] })),
    ).rejects.toBeInstanceOf(Error);

    const err = await captureError(() =>
      h.service.findOne('do-1', makeUser({ sub: 'stranger-9', roles: ['contract_specialist'] })),
    ) as { getStatus?: () => number };
    expect(err.getStatus?.()).toBe(HttpStatus.FORBIDDEN);
  });

  it('findOne: 父单发起人可读取自己发起的子单', async () => {
    const parent = makeWorkOrder({ createdBy: 'creator-1' });
    const order = makeDispatchedOrder({ status: DispatchedOrderStatus.PROCESSING, handlerId: 'handler-1', parentOrder: parent });
    const h = makeHarness({ order });
    h.findOneSpy.mockRestore(); // 走真实读取路径

    await expect(
      h.service.findOne('do-1', makeUser({ sub: 'creator-1', roles: ['biz_member'] })),
    ).resolves.toMatchObject({ id: 'do-1' });
  });

  it('findOne: 子单不存在时 404', async () => {
    const h = makeHarness({ orderForLoad: null as unknown as DispatchedOrder });
    h.findOneSpy.mockRestore();
    const err = await captureError(() => h.service.findOne('missing', makeUser({ roles: ['admin'] }))) as { getStatus?: () => number };
    expect(err.getStatus?.()).toBe(HttpStatus.NOT_FOUND);
  });
});
