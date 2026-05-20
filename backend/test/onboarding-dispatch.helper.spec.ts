import {
  DispatchModuleCode,
  ExceptionModuleHandler,
  ModuleField,
  ModuleHandler,
  OrderType,
  WorkOrder,
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

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'wo-1',
    orderType: OrderType.ONBOARDING,
    customerCode: 'C001',
    extraData: {},
    ...overrides,
  });
}

describe('onboarding-dispatch helper', () => {
  it('returns exception handler when module/customer exception exists', async () => {
    const exceptionRepo = createRepositoryMock();
    const moduleHandlerRepo = createRepositoryMock();
    exceptionRepo.findOne.mockResolvedValue({ handlerId: 'handler-vip' });
    const manager = createManager(new Map<unknown, RepositoryMock>([
      [ExceptionModuleHandler, exceptionRepo],
      [ModuleHandler, moduleHandlerRepo],
    ]));

    const result = await resolveModuleHandler(DispatchModuleCode.CONTRACT, manager, 'C001');

    expect(result).toBe('handler-vip');
    expect(exceptionRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.CONTRACT, customerCode: 'C001' },
    });
    expect(moduleHandlerRepo.findOne).not.toHaveBeenCalled();
  });

  it('falls back to active primary module handler when no exception exists', async () => {
    const exceptionRepo = createRepositoryMock();
    const moduleHandlerRepo = createRepositoryMock();
    exceptionRepo.findOne.mockResolvedValue(null);
    moduleHandlerRepo.findOne.mockResolvedValueOnce({ handlerId: 'handler-primary' });
    const manager = createManager(new Map<unknown, RepositoryMock>([
      [ExceptionModuleHandler, exceptionRepo],
      [ModuleHandler, moduleHandlerRepo],
    ]));

    const result = await resolveModuleHandler(DispatchModuleCode.DATA_ENTRY, manager, 'C001');

    expect(result).toBe('handler-primary');
    expect(moduleHandlerRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.DATA_ENTRY, isActive: true, isBackup: false },
      order: { weight: 'DESC' },
    });
  });

  it('falls back to backup module handler when no primary exists', async () => {
    const exceptionRepo = createRepositoryMock();
    const moduleHandlerRepo = createRepositoryMock();
    exceptionRepo.findOne.mockResolvedValue(null);
    moduleHandlerRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ handlerId: 'handler-backup' });
    const manager = createManager(new Map<unknown, RepositoryMock>([
      [ExceptionModuleHandler, exceptionRepo],
      [ModuleHandler, moduleHandlerRepo],
    ]));

    const result = await resolveModuleHandler(DispatchModuleCode.SOCIAL_INSURANCE, manager, 'C001');

    expect(result).toBe('handler-backup');
    expect(moduleHandlerRepo.findOne).toHaveBeenLastCalledWith({
      where: { moduleCode: DispatchModuleCode.SOCIAL_INSURANCE, isActive: true },
      order: { isBackup: 'ASC', weight: 'DESC' },
    });
  });

  it('keeps onboarding child split conditional instead of always generating four modules', async () => {
    const exceptionRepo = createRepositoryMock();
    const moduleHandlerRepo = createRepositoryMock();
    const moduleFieldRepo = createRepositoryMock();
    exceptionRepo.findOne.mockResolvedValue(null);
    moduleHandlerRepo.findOne.mockImplementation(async ({ where }: { where: { moduleCode: string; isBackup?: boolean } }) => {
      if (where.isBackup === false) return { handlerId: `handler-${where.moduleCode}` };
      return null;
    });
    moduleFieldRepo.find.mockResolvedValue([]);
    const manager = createManager(new Map<unknown, RepositoryMock>([
      [ExceptionModuleHandler, exceptionRepo],
      [ModuleHandler, moduleHandlerRepo],
      [ModuleField, moduleFieldRepo],
    ]));
    const fieldPermissionService = {
      getVisibleFieldsForScenario: jest.fn(async () => ['employee_name']),
    };

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
    expect(exceptionRepo.findOne).toHaveBeenCalledWith({
      where: { moduleCode: DispatchModuleCode.DATA_ENTRY, customerCode: 'C001' },
    });
  });
});
