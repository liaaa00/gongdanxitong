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
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

type MockRepo<T extends object> = Repository<T> & { saved?: T[] };

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): MockRepo<T> {
  const saved: T[] = [];
  return {
    saved,
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => { saved.push(input); return input; }),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as MockRepo<T>;
}

function makeParent(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo-1',
    orderNo: 'WO-001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
    departmentId: 'dept-1',
    customerId: 'cust-1',
    customerCode: 'C001',
    branchId: null,
    branchCode: null,
    customerName: 'Customer',
    employeeName: 'Alice',
    employeeIdCard: '330102199001010011',
    extraData: {},
    submittedAt: null,
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
    id: '00000000-0000-4000-8000-000000000001',
    parentOrderId: 'wo-1',
    parentOrder: makeParent(),
    moduleCode: 'data_entry',
    status: DispatchedOrderStatus.PROCESSING,
    handlerId: 'handler-1',
    handler: null,
    visibleFields: ['employee_name'],
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

function makeService(options: {
  dispatchedRepo?: MockRepo<DispatchedOrder>;
  workOrderRepo?: MockRepo<WorkOrder>;
  moduleHandlerRepo?: MockRepo<ModuleHandler>;
  userRoleRepo?: MockRepo<UserRole>;
  notificationRepo?: MockRepo<Notification>;
  operationLogRepo?: MockRepo<OperationLog>;
} = {}) {
  const dispatchedRepo = options.dispatchedRepo ?? repoMock<DispatchedOrder>();
  const workOrderRepo = options.workOrderRepo ?? repoMock<WorkOrder>();
  const moduleHandlerRepo = options.moduleHandlerRepo ?? repoMock<ModuleHandler>();
  const userRoleRepo = options.userRoleRepo ?? repoMock<UserRole>();
  const notificationRepo = options.notificationRepo ?? repoMock<Notification>();
  const operationLogRepo = options.operationLogRepo ?? repoMock<OperationLog>();
  const service = new DispatchedOrderService(
    dispatchedRepo,
    workOrderRepo,
    moduleHandlerRepo,
    userRoleRepo,
    repoMock<FieldConfig>(),
    notificationRepo,
    operationLogRepo,
    { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService,
    { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService,
    { exportSingleDispatchedOrder: jest.fn() } as never,
  );
  return { service, dispatchedRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, notificationRepo, operationLogRepo };
}

describe('five control-flow regression coverage', () => {
  const creator: JwtUserPayload = { sub: 'creator-1', username: 'creator', roles: ['biz_member'] };
  const handler: JwtUserPayload = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] };

  // 0602 E-5/目标-6：处理中/待处理/已退回作废仍走 VOID_PENDING 后道审批；已撤回作废改为直接终态（见下一用例）。
  it('creator void from RETURNED must stay approval-bound and never direct void', async () => {
    const order = makeChild({ status: DispatchedOrderStatus.RETURNED, parentOrder: makeParent({ status: WorkOrderStatus.RETURNED }) });
    const dispatchedRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>({ count: jest.fn(async () => 0) });
    const { service } = makeService({ dispatchedRepo, notificationRepo, operationLogRepo });

    await service.voidByCreator('00000000-0000-4000-8000-000000000001', { reason: 'cancel' }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.VOID_PENDING);
    expect(order.voidAt).toBeNull();
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_void_request' }));
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bizType: 'creator_void_request' }),
    ]));
  });

  // 0602 E-5：已撤回子单作废 → 直接进入 VOID 终态，无需后道二次审批（合并撤销作废语义）。
  it('creator void from WITHDRAWN goes straight to VOID terminal without downstream approval', async () => {
    const order = makeChild({ status: DispatchedOrderStatus.WITHDRAWN, parentOrder: makeParent({ status: WorkOrderStatus.WITHDRAWN }) });
    const dispatchedRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>({ count: jest.fn(async () => 0) });
    const { service } = makeService({ dispatchedRepo, notificationRepo, operationLogRepo });

    await service.voidByCreator('00000000-0000-4000-8000-000000000001', { reason: 'cancel' }, creator);

    expect(order.status).toBe(DispatchedOrderStatus.VOID);
    expect(order.voidAt).toBeInstanceOf(Date);
    expect(operationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'creator_void_direct' }));
    // 通知发起人作废完成（void_approved），不生成后道审批待办（creator_void_request）。
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ bizType: 'void_approved' }));
    expect(notificationRepo.save).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bizType: 'creator_void_request' }),
    ]));
  });

  it('backend batch urge notifies related creators and skips terminal sub orders', async () => {
    const pending = makeChild({ id: 'do-pending', status: DispatchedOrderStatus.PENDING, parentOrder: makeParent({ id: 'wo-1', createdBy: 'creator-1' }) });
    const completed = makeChild({ id: 'do-completed', status: DispatchedOrderStatus.COMPLETED, parentOrder: makeParent({ id: 'wo-2', createdBy: 'creator-2' }) });
    const dispatchedRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async ({ where }: { where: { id: string } }) => where.id === 'do-pending' ? pending : completed) });
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>({ count: jest.fn(async () => 0) });
    const { service } = makeService({ dispatchedRepo, notificationRepo, operationLogRepo });

    const result = await service.batchUrge({ ids: ['do-pending', 'do-completed'], reason: 'please update' }, handler);

    expect(result.urged).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'creator-1',
      bizType: 'backend_urge_creator',
      isRead: false,
    }));
  });

  it.each([
    ['social_insurance', 'social-user', 'social_insurance_team'],
    ['data_entry', 'data-user', 'data_entry_team'],
  ])('strictly maps %s module visibility to configured handler access', async (moduleCode, userId, roleCode) => {
    const qb = {
      leftJoinAndSelect: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      offset: jest.fn(),
      limit: jest.fn(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    Object.values(qb).forEach((fn) => typeof fn === 'function' && (fn as jest.Mock).mockReturnValue(qb));
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    const dispatchedRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => qb) });
    const moduleHandlerRepo = repoMock<ModuleHandler>({
      find: jest.fn(async () => [{ moduleCode, handlerId: userId, isActive: true } as ModuleHandler]),
    });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as UserRole]) });
    const { service } = makeService({ dispatchedRepo, moduleHandlerRepo, userRoleRepo });

    await service.findAll({ page: 1, pageSize: 20 } as never, { sub: userId, username: userId, roles: [roleCode] });

    const bracket = qb.andWhere.mock.calls[0][0] as { whereFactory: (scope: { where: jest.Mock; orWhere: jest.Mock }) => void };
    const scope = { where: jest.fn(), orWhere: jest.fn() };
    bracket.whereFactory(scope);
    expect(scope.orWhere).toHaveBeenCalledWith('d.handler_id IS NULL AND d.module_code IN (:...modules)', { modules: [moduleCode] });
  });

  // 0602 C/目标-B：社保公积金办理（含入职/离职拆分）与待遇申报暂留空，不绑定 fuqianwen/yangchun/jianglu。
  // 江璐(shared_leader + contract_specialist + onboarding_specialist) 的可见模块只能来自其合同/入离职处理人绑定，
  // 绝不能因为遗留 seed 或角色兜底而看到 data_entry / social_insurance / benefit_apply。
  it('shared leader 江璐 module scope never includes data_entry / social_insurance / benefit_apply', async () => {
    const jianglu: JwtUserPayload = {
      sub: 'jianglu',
      username: 'jianglu',
      roles: ['shared_leader', 'contract_specialist', 'onboarding_specialist'],
    };
    // 江璐实际生效的处理人绑定：合同 / 续签 / 入职联系 / 离职联系 / 离职证明（备份），不含社保/待遇/数据录入。
    const jiangluHandlerModules = ['contract', 'renewal_contract', 'onboarding_contact', 'resignation_contact', 'resignation_cert'];
    const forbiddenModules = ['data_entry', 'social_insurance', 'onboarding_social_insurance', 'resignation_social_insurance', 'benefit_apply'];

    const qb = {
      leftJoinAndSelect: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      offset: jest.fn(),
      limit: jest.fn(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    Object.values(qb).forEach((fn) => typeof fn === 'function' && (fn as jest.Mock).mockReturnValue(qb));
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    const dispatchedRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => qb) });
    const moduleHandlerRepo = repoMock<ModuleHandler>({
      find: jest.fn(async () => jiangluHandlerModules.map((moduleCode) => ({ moduleCode, handlerId: 'jianglu', isActive: true } as ModuleHandler))),
    });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.SUPERVISOR } } as UserRole]) });
    const { service } = makeService({ dispatchedRepo, moduleHandlerRepo, userRoleRepo });

    await service.findAll({ page: 1, pageSize: 20 } as never, jianglu);

    const bracket = qb.andWhere.mock.calls[0][0] as { whereFactory: (scope: { where: jest.Mock; orWhere: jest.Mock }) => void };
    const scope = { where: jest.fn(), orWhere: jest.fn() };
    bracket.whereFactory(scope);

    // 监督级可见本模块全部子单：scope 必须按 module_code 限定，且模块集合不含任何被禁模块。
    const moduleScopeCall = scope.orWhere.mock.calls.find(([clause]) => clause === 'd.module_code IN (:...modules)');
    expect(moduleScopeCall).toBeDefined();
    const scopedModules = (moduleScopeCall![1] as { modules: string[] }).modules;
    expect(scopedModules.sort()).toEqual([...jiangluHandlerModules].sort());
    for (const forbidden of forbiddenModules) {
      expect(scopedModules).not.toContain(forbidden);
    }
  });
});

describe('seed module handler assignments (0602 final business matrix)', () => {
  async function readSeed(): Promise<string> {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    return readFileSync(join(process.cwd(), 'src/database/seeds/seed-module-handlers.ts'), 'utf8');
  }

  it('leaves social_insurance and benefit_apply unassigned (no fuqianwen / yangchun / jianglu binding)', async () => {
    const seed = await readSeed();
    const activeSeedBlock = seed.slice(0, seed.indexOf('const managedModules'));

    // 社保公积金/待遇申报不得出现在生效的处理人绑定数组中。
    expect(activeSeedBlock).not.toMatch(/moduleCode:\s*'social_insurance'/);
    expect(activeSeedBlock).not.toMatch(/moduleCode:\s*'onboarding_social_insurance'/);
    expect(activeSeedBlock).not.toMatch(/moduleCode:\s*'resignation_social_insurance'/);
    expect(activeSeedBlock).not.toMatch(/moduleCode:\s*'benefit_apply'/);

    // 不得把社保/待遇强行绑定给 fuqianwen，也不得让 benefit_apply 落到 yangchun/jianglu。
    expect(seed).not.toMatch(/'social_insurance'[^\n]*fuqianwen/);
    expect(seed).not.toMatch(/'benefit_apply'[^\n]*(yangchun|jianglu)/);

    // 任何遗留的社保/待遇处理人绑定都必须被置为 inactive（留空口径）。
    expect(seed).toMatch(/vacatedModules/);
    expect(seed).toMatch(/isActive:\s*false/);
  });

  it('keeps contract / onboarding / data_entry assignments intact for the configured owners', async () => {
    const seed = await readSeed();
    expect(seed).toMatch(/moduleCode:\s*'contract',\s*username:\s*'yangchun'/);
    expect(seed).toMatch(/moduleCode:\s*'onboarding_contact',\s*username:\s*'maoyani'/);
    expect(seed).toMatch(/moduleCode:\s*'data_entry',\s*username:\s*'annazhen'/);
  });
});
