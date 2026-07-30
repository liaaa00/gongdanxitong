import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  DispatchRule,
  DispatchStrategy,
  DispatchedOrder,
  DispatchedOrderStatus,
  ModuleHandler,
  ModuleHandlerDelegation,
  Notification,
  OperationLog,
  User,
  WorkOrderModuleConfig,
} from 'src/entities';
import { DispatchRulesService } from 'src/modules/admin/dispatch-rules/dispatch-rules.service';
import { ModuleDelegationsService } from 'src/modules/admin/module-delegations/module-delegations.service';
import { UserHandoverService } from 'src/modules/admin/users/user-handover.service';
import { BatchReassignStrategy } from 'src/modules/dispatched-orders/dto/batch-reassign.dto';

function repositoryMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

function qualifiedUser(id: string): User {
  return {
    id,
    realName: id,
    isActive: true,
    userRoles: [{
      role: { code: 'data_entry_leader', isActive: true },
    }],
  } as unknown as User;
}

describe('admin workforce continuity services', () => {
  it('replaces module handlers and module settings in one dispatch-config transaction', async () => {
    const moduleConfig = {
      id: 'config-1',
      moduleCode: 'data_entry',
      dispatchStrategy: DispatchStrategy.FIXED,
      slaHours: 24,
      slaReminderBeforeHours: 4,
      isActive: true,
    } as WorkOrderModuleConfig;
    const oldHandler = {
      id: 'handler-old',
      moduleCode: 'data_entry',
      handlerId: 'old-user',
      weight: 1,
      isBackup: false,
      isActive: true,
    } as ModuleHandler;
    const users = [qualifiedUser('replacement-1'), qualifiedUser('replacement-2')];
    const manager = {
      findOne: jest.fn(async (entity: unknown) => entity === WorkOrderModuleConfig ? moduleConfig : null),
      find: jest.fn(async (entity: unknown) => {
        if (entity === User) return users;
        if (entity === ModuleHandler) return [oldHandler];
        return [];
      }),
      create: jest.fn((_entity: unknown, input: object) => input),
      save: jest.fn(async (_entity: unknown, input: unknown) => input),
    };
    const dataSource = {
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const service = new DispatchRulesService(
      dataSource,
      repositoryMock<DispatchRule>(),
      repositoryMock<ModuleHandler>(),
      repositoryMock<WorkOrderModuleConfig>(),
      {} as never,
      {} as never,
    );

    const result = await service.saveModuleDispatchConfig('data_entry', {
      handlerIds: ['replacement-1', 'replacement-2'],
      dispatchStrategy: DispatchStrategy.ROUND_ROBIN,
      slaHours: 12,
      slaReminderBeforeHours: 2,
      isActive: true,
      changeReason: '  coverage adjustment  ',
    });

    const savedHandlers = manager.save.mock.calls
      .find(([entity]) => entity === ModuleHandler)?.[1] as ModuleHandler[];
    expect(oldHandler.isActive).toBe(false);
    expect(savedHandlers).toEqual(expect.arrayContaining([
      expect.objectContaining({ handlerId: 'replacement-1', weight: 2, isActive: true }),
      expect.objectContaining({ handlerId: 'replacement-2', weight: 1, isActive: true }),
    ]));
    expect(moduleConfig).toMatchObject({
      dispatchStrategy: DispatchStrategy.ROUND_ROBIN,
      slaHours: 12,
      slaReminderBeforeHours: 2,
      isActive: true,
    });
    expect(result.changeReason).toBe('coverage adjustment');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('hands open work round-robin to qualified replacements and revokes the departing session', async () => {
    const departing = {
      id: 'departing-user',
      username: 'departing',
      realName: 'Departing User',
      isActive: true,
      authVersion: 3,
    } as User;
    const oldHandler = {
      id: 'handler-old',
      moduleCode: 'data_entry',
      handlerId: departing.id,
      isActive: true,
      isBackup: false,
      weight: 1,
    } as ModuleHandler;
    const orders = [
      {
        id: 'order-1',
        parentOrderId: 'parent-1',
        moduleCode: 'data_entry',
        handlerId: departing.id,
        status: DispatchedOrderStatus.PROCESSING,
        acceptedAt: new Date(),
      },
      {
        id: 'order-2',
        parentOrderId: 'parent-2',
        moduleCode: 'data_entry',
        handlerId: departing.id,
        status: DispatchedOrderStatus.PENDING,
        acceptedAt: null,
      },
    ] as DispatchedOrder[];
    const replacements = [qualifiedUser('replacement-1'), qualifiedUser('replacement-2')];
    const manager = {
      findOne: jest.fn(async (entity: unknown) => entity === User ? departing : null),
      find: jest.fn(async (entity: unknown) => {
        if (entity === ModuleHandler) return [oldHandler];
        if (entity === DispatchedOrder) return orders;
        if (entity === User) return replacements;
        return [];
      }),
      create: jest.fn((_entity: unknown, input: object) => input),
      save: jest.fn(async (_entity: unknown, input: unknown) => input),
      count: jest.fn(async () => 0),
    };
    const dataSource = {
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const service = new UserHandoverService(dataSource);

    const result = await service.execute(departing.id, {
      replacementUserIds: replacements.map((user) => user.id),
      strategy: BatchReassignStrategy.ROUND_ROBIN,
      reason: '  employee departure  ',
    }, 'admin-user');

    expect(result).toMatchObject({
      success: true,
      transferredOrders: 2,
      replacedModules: ['data_entry'],
      rolesPreserved: true,
    });
    expect(orders.map((order) => order.handlerId)).toEqual(['replacement-1', 'replacement-2']);
    expect(orders.every((order) => order.status === DispatchedOrderStatus.PENDING && order.acceptedAt === null)).toBe(true);
    expect(oldHandler.isActive).toBe(false);
    expect(departing).toMatchObject({ isActive: false, authVersion: 4 });
    expect(manager.save).toHaveBeenCalledWith(Notification, expect.objectContaining({
      bizType: 'user_handover',
      content: 'employee departure',
    }));
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a delegation only after validating source, delegate role, and schedule overlap', async () => {
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of ['where', 'andWhere']) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.getOne = jest.fn(async () => null);
    const delegationRepository = repositoryMock<ModuleHandlerDelegation>({
      createQueryBuilder: jest.fn(() => queryBuilder),
    });
    const service = new ModuleDelegationsService(
      delegationRepository,
      repositoryMock<ModuleHandler>({
        findOne: jest.fn(async () => ({ moduleCode: 'data_entry', handlerId: 'source-user', isActive: true })),
      }),
      repositoryMock<User>({
        findOne: jest.fn(async () => qualifiedUser('delegate-user')),
      }),
    );

    const result = await service.create({
      moduleCode: 'data_entry',
      sourceHandlerId: 'source-user',
      delegateHandlerId: 'delegate-user',
      startsAt: '2026-07-15T01:00:00.000Z',
      endsAt: '2026-07-16T01:00:00.000Z',
      reason: '  annual leave  ',
    }, 'admin-user');

    expect(delegationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      sourceHandlerId: 'source-user',
      delegateHandlerId: 'delegate-user',
      reason: 'annual leave',
      isActive: true,
      createdBy: 'admin-user',
    }));
    expect(result.startsAt).toEqual(new Date('2026-07-15T01:00:00.000Z'));
    expect(result.endsAt).toEqual(new Date('2026-07-16T01:00:00.000Z'));
  });

  it('rejects overlapping delegation windows before persisting a second record', async () => {
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of ['where', 'andWhere']) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.getOne = jest.fn(async () => ({ id: 'existing-delegation' }));
    const delegationRepository = repositoryMock<ModuleHandlerDelegation>({
      createQueryBuilder: jest.fn(() => queryBuilder),
    });
    const service = new ModuleDelegationsService(
      delegationRepository,
      repositoryMock<ModuleHandler>({
        findOne: jest.fn(async () => ({ moduleCode: 'data_entry', handlerId: 'source-user', isActive: true })),
      }),
      repositoryMock<User>(),
    );

    await expect(service.create({
      moduleCode: 'data_entry',
      sourceHandlerId: 'source-user',
      startsAt: '2026-07-15T01:00:00.000Z',
      endsAt: '2026-07-16T01:00:00.000Z',
      reason: 'pause dispatching',
    }, 'admin-user')).rejects.toBeInstanceOf(BadRequestException);

    expect(delegationRepository.save).not.toHaveBeenCalled();
  });
});
