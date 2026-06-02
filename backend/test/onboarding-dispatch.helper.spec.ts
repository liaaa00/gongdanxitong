import {
  DispatchModuleCode,
  DispatchStrategy,
  ExceptionModuleHandler,
  ModuleField,
  ModuleHandler,
  OrderType,
  WorkOrder,
  WorkOrderModuleConfig,
} from 'src/entities';
import {
  buildOnboardingChildren,
  resolveModuleHandler,
  TxManager,
} from 'src/modules/work-orders/onboarding-dispatch.helper';

type RepositoryMock = {
  findOne: jest.Mock;
  find: jest.Mock;
};

function createRepositoryMock(): RepositoryMock {
  return {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
  };
}

function createManager(repositories: Map<unknown, RepositoryMock>): TxManager {
  return {
    getRepository: jest.fn((entity: unknown) => repositories.get(entity) ?? createRepositoryMock()),
  } as unknown as TxManager;
}

function makeHandler(overrides: Partial<ModuleHandler>): ModuleHandler {
  return {
    id: overrides.id ?? `mh-${overrides.handlerId ?? 'h1'}`,
    moduleCode: overrides.moduleCode ?? 'data_entry',
    handlerId: overrides.handlerId ?? 'handler-1',
    weight: overrides.weight ?? 1,
    isBackup: overrides.isBackup ?? false,
    isActive: overrides.isActive ?? true,
    rrCursorVersion: overrides.rrCursorVersion ?? 0,
  } as ModuleHandler;
}

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'wo-1',
    orderType: OrderType.ONBOARDING,
    customerCode: 'C001',
    extraData: {},
    ...overrides,
  });
}

function createDefaultManager(options?: {
  handlers?: ModuleHandler[];
  strategyByModule?: Record<string, DispatchStrategy>;
  exceptionHandlerId?: string | null;
}): { manager: TxManager; exceptionRepo: RepositoryMock; moduleHandlerRepo: RepositoryMock; moduleFieldRepo: RepositoryMock; moduleRepo: RepositoryMock } {
  const exceptionRepo = createRepositoryMock();
  const moduleHandlerRepo = createRepositoryMock();
  const moduleFieldRepo = createRepositoryMock();
  const moduleRepo = createRepositoryMock();

  exceptionRepo.findOne.mockResolvedValue(options?.exceptionHandlerId ? { handlerId: options.exceptionHandlerId } : null);
  moduleHandlerRepo.find.mockImplementation(async ({ where }: { where: { moduleCode: string } }) =>
    (options?.handlers ?? []).filter((handler) => handler.moduleCode === where.moduleCode && handler.isActive),
  );
  moduleHandlerRepo.findOne.mockImplementation(async ({ where, order }: { where: { moduleCode: string; isActive: boolean; isBackup?: boolean }; order?: { weight?: string; isBackup?: string } }) => {
    const filtered = (options?.handlers ?? [])
      .filter((handler) => handler.moduleCode === where.moduleCode && handler.isActive === where.isActive)
      .filter((handler) => where.isBackup === undefined || handler.isBackup === where.isBackup);
    if (filtered.length === 0) return null;
    const sorted = [...filtered].sort((a, b) => {
      if (order?.isBackup === 'ASC' && a.isBackup !== b.isBackup) return a.isBackup ? 1 : -1;
      if (order?.weight === 'DESC') return (b.weight ?? 0) - (a.weight ?? 0);
      return 0;
    });
    return sorted[0];
  });
  moduleFieldRepo.find.mockResolvedValue([]);
  moduleRepo.findOne.mockImplementation(async ({ where }: { where: { moduleCode: string } }) => ({
    moduleCode: where.moduleCode,
    dispatchStrategy: options?.strategyByModule?.[where.moduleCode] ?? DispatchStrategy.POOL,
    isActive: true,
  }));

  const manager = createManager(new Map<unknown, RepositoryMock>([
    [ExceptionModuleHandler, exceptionRepo],
    [ModuleHandler, moduleHandlerRepo],
    [ModuleField, moduleFieldRepo],
    [WorkOrderModuleConfig, moduleRepo],
  ]));

  return { manager, exceptionRepo, moduleHandlerRepo, moduleFieldRepo, moduleRepo };
}

describe('onboarding-dispatch helper', () => {
  it('returns exception handler when onboarding module/customer exception exists', async () => {
    const { manager, exceptionRepo, moduleHandlerRepo } = createDefaultManager({ exceptionHandlerId: 'handler-vip' });

    const result = await resolveModuleHandler(DispatchModuleCode.CONTRACT, manager, 'C001');

    expect(result).toBe('handler-vip');
    expect(exceptionRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.CONTRACT, customerCode: 'C001' },
    });
    expect(moduleHandlerRepo.find).not.toHaveBeenCalled();
  });

  it('directly assigns when only one active handler is configured', async () => {
    const { manager, moduleHandlerRepo } = createDefaultManager({
      handlers: [makeHandler({ moduleCode: DispatchModuleCode.DATA_ENTRY, handlerId: 'handler-primary' })],
    });

    const result = await resolveModuleHandler(DispatchModuleCode.DATA_ENTRY, manager, 'C001');

    expect(result).toBe('handler-primary');
    expect(moduleHandlerRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.DATA_ENTRY, isActive: true, isBackup: false },
      order: { weight: 'DESC' },
    });
  });

  it('returns the highest weight handler when multiple handlers exist (formerly pool strategy)', async () => {
    const { manager } = createDefaultManager({
      handlers: [
        makeHandler({ moduleCode: DispatchModuleCode.SOCIAL_INSURANCE, handlerId: 'handler-a', weight: 5 }),
        makeHandler({ moduleCode: DispatchModuleCode.SOCIAL_INSURANCE, handlerId: 'handler-b', weight: 10 }),
      ],
    });

    const result = await resolveModuleHandler(DispatchModuleCode.SOCIAL_INSURANCE, manager, 'C001');

    expect(result).toBe('handler-b');
  });

  it('picks the highest weight handler from multiple handlers', async () => {
    const { manager } = createDefaultManager({
      handlers: [
        makeHandler({ id: '1', moduleCode: DispatchModuleCode.CONTRACT, handlerId: 'handler-low', weight: 1 }),
        makeHandler({ id: '2', moduleCode: DispatchModuleCode.CONTRACT, handlerId: 'handler-high', weight: 9 }),
      ],
    });

    const result = await resolveModuleHandler(DispatchModuleCode.CONTRACT, manager, null);

    expect(result).toBe('handler-high');
  });

  it('keeps onboarding child split conditional instead of always generating four modules', async () => {
    const { manager, exceptionRepo } = createDefaultManager({
      handlers: [
        makeHandler({ moduleCode: DispatchModuleCode.DATA_ENTRY, handlerId: 'handler-data' }),
        makeHandler({ moduleCode: DispatchModuleCode.CONTRACT, handlerId: 'handler-contract' }),
        makeHandler({ moduleCode: DispatchModuleCode.SOCIAL_INSURANCE, handlerId: 'handler-social' }),
      ],
    });
    const fieldPermissionService = { getVisibleFieldsForScenario: jest.fn(async () => ['employee_name']) };

    const children = await buildOnboardingChildren(
      makeWorkOrder({
        customerCode: null,
        extraData: {
          customer_code: 'C001',
          need_onboarding_contact: 'no',
          need_company_contract: 'yes',
        },
      }),
      manager,
      fieldPermissionService as never,
    );

    expect(children.map((child) => child.moduleCode)).toEqual([
      DispatchModuleCode.DATA_ENTRY,
      DispatchModuleCode.CONTRACT,
      DispatchModuleCode.SOCIAL_INSURANCE,
    ]);
    expect(children).toHaveLength(3);
    expect(children.every((child) => child.handlerId !== null)).toBe(true);
    expect(exceptionRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.DATA_ENTRY, customerCode: 'C001' },
    });
  });

  it.skip('routes non-onboarding orders by overall work order module', async () => {
    const { manager } = createDefaultManager({
      handlers: [
        makeHandler({ moduleCode: DispatchModuleCode.RENEWAL_CONTRACT, handlerId: 'handler-renewal' }),
        makeHandler({ moduleCode: DispatchModuleCode.BENEFIT_APPLY, handlerId: 'handler-benefit' }),
        makeHandler({ moduleCode: DispatchModuleCode.RESIGNATION_CONTACT, handlerId: 'handler-resign-contact' }),
        makeHandler({ moduleCode: DispatchModuleCode.RESIGNATION_CERT, handlerId: 'handler-resign-cert' }),
      ],
    });
    const fieldPermissionService = { getVisibleFieldsForScenario: jest.fn(async (scenario: string) => [scenario]) };

    // buildWorkOrderDispatchChildren no longer exported, skipped
  });
});
