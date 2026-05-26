import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy, OrderType, WorkOrder } from 'src/entities';
import { findDuplicateIdCardInMonth, throwDuplicateIdCardConflict, DUPLICATE_ID_CARD_IN_MONTH } from 'src/modules/work-orders/duplicate-id-card.util';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { FieldChangeHook } from 'src/modules/notifications/field-change.hook';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

function qbChain(result: unknown) {
  const qb: Record<string, jest.Mock> = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getOne: jest.fn(async () => result),
  };
  return qb;
}

describe('BE-A4 duplicate id-card in month', () => {
  it('builds month range and excludes withdrawn/order id', async () => {
    const qb = qbChain({ orderNo: 'ON202605001' });
    const repo = { createQueryBuilder: jest.fn(() => qb) } as unknown as Repository<WorkOrder>;
    const row = await findDuplicateIdCardInMonth(repo, {
      orderType: OrderType.ONBOARDING,
      employeeIdCard: '3301',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
      excludeId: 'current',
    });
    expect(row?.orderNo).toBe('ON202605001');
    expect(qb.andWhere).toHaveBeenCalledWith('w.createdAt >= :monthStart', { monthStart: new Date(2026, 4, 1) });
    expect(qb.andWhere).toHaveBeenCalledWith('w.createdAt < :monthEnd', { monthEnd: new Date(2026, 5, 1) });
    expect(qb.andWhere).toHaveBeenCalledWith('w.id <> :excludeId', { excludeId: 'current' });
  });

  it('throws structured DUPLICATE_ID_CARD_IN_MONTH error', () => {
    expect(() => throwDuplicateIdCardConflict({ conflictOrderNo: 'ON1' })).toThrow(HttpException);
    try {
      throwDuplicateIdCardConflict({ conflictOrderNo: 'ON1' });
    } catch (error) {
      const body = (error as HttpException).getResponse() as { message: string; details: Record<string, unknown> };
      expect(body.message).toBe(DUPLICATE_ID_CARD_IN_MONTH);
      expect(body.details.code).toBe(DUPLICATE_ID_CARD_IN_MONTH);
      expect(body.details.conflictOrderNo).toBe('ON1');
    }
  });
});

describe('BE-A5 dispatch rule priority', () => {
  it('selects customer rule over department and default, then uses fallback when assignee inactive', async () => {
    const rules: DispatchRule[] = [
      { id: 'default', ruleName: 'default', orderType: OrderType.ONBOARDING, triggerConditions: null, targetModule: 'contract', subModule: 'contract', customerId: null, departmentId: null, assigneeUserId: 'default-user', fallbackUserId: null, dispatchStrategy: DispatchStrategy.FIXED, priority: 1, isActive: true, allowManualOverride: true, createdAt: new Date() } as DispatchRule,
      { id: 'group', ruleName: 'group', orderType: OrderType.ONBOARDING, triggerConditions: null, targetModule: 'contract', subModule: 'contract', customerId: null, departmentId: 'dep-1', assigneeUserId: 'group-user', fallbackUserId: null, dispatchStrategy: DispatchStrategy.FIXED, priority: 1, isActive: true, allowManualOverride: true, createdAt: new Date() } as DispatchRule,
      { id: 'customer', ruleName: 'customer', orderType: OrderType.ONBOARDING, triggerConditions: null, targetModule: 'contract', subModule: 'contract', customerId: 'cus-1', departmentId: null, assigneeUserId: 'inactive-user', fallbackUserId: 'fallback-user', dispatchStrategy: DispatchStrategy.FIXED, priority: 99, isActive: true, allowManualOverride: true, createdAt: new Date() } as DispatchRule,
    ];
    const service = new DispatchEngineService(
      { find: jest.fn(async () => rules) } as never,
      { find: jest.fn(async () => []) } as never,
      new AstEvaluator(),
      { pick: jest.fn(async () => 'picked') } as never,
      { getVisibleFieldsForScenario: jest.fn(async () => ['employee_name']) } as never,
    );
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity.name === 'DispatchRule') return { find: jest.fn(async () => rules) };
        if (entity.name === 'WorkOrderModuleConfig') return { find: jest.fn(async () => []) };
        return { findOne: jest.fn(async ({ where }: { where: { id: string } }) => where.id === 'fallback-user' ? { id: 'fallback-user', isActive: true } : null) };
      }),
    } as never;
    const result = await service.evaluateDetailed({ id: 'wo', orderType: OrderType.ONBOARDING, customerId: 'cus-1', departmentId: 'dep-1', extraData: {} } as WorkOrder, manager);
    const contract = result.childrenToCreate.find((child) => child.moduleCode === 'contract');
    expect(contract?.handlerId).toBe('fallback-user');
    expect(contract?.ruleId).toBe('customer');
  });
});

describe('BE-A6 field diff hook', () => {
  it('builds meaningful diffs and ignores audit fields', () => {
    const hook = new FieldChangeHook(null as never, null as never, null as never, null as never);
    expect(hook.buildDiff({ a: 1, updatedAt: 'old' }, { a: 2, updatedAt: 'new' })).toEqual([{ field: 'a', before: 1, after: 2 }]);
  });

  it('fans out field change notification to downstream plus creator excluding actor', async () => {
    const notificationService = { bulkCreate: jest.fn(async (rows) => rows) };
    const hook = new FieldChangeHook(
      { findOne: jest.fn(async () => ({ id: 'wo', orderNo: 'ON1', createdBy: 'creator', creator: { id: 'creator', realName: '发起人' } })) } as never,
      { find: jest.fn(async () => [{ handlerId: 'h1' }, { handlerId: 'actor' }, { handlerId: null }]) } as never,
      { findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, realName: where.id })) } as never,
      notificationService as never,
    );
    await hook.onWorkOrderUpdated({ orderId: 'wo', actorUserId: 'actor', diff: [{ field: 'x', before: '1', after: '2' }] });
    const rows = notificationService.bulkCreate.mock.calls[0][0];
    expect(rows.map((row: { userId: string }) => row.userId).sort()).toEqual(['creator', 'h1']);
    expect(rows[0].bizType).toBe('order.field_changed');
  });

  it('keeps downstream targets and creator audit notification when actor is creator', async () => {
    const notificationService = { bulkCreate: jest.fn(async (rows) => rows) };
    const hook = new FieldChangeHook(
      { findOne: jest.fn(async () => ({ id: 'wo', orderNo: 'ON1', createdBy: 'creator', creator: { id: 'creator', realName: '发起人' } })) } as never,
      { find: jest.fn(async () => [{ handlerId: 'h1' }, { handlerId: 'h2' }, { handlerId: 'h3' }]) } as never,
      { findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, realName: where.id })) } as never,
      notificationService as never,
    );
    await hook.onWorkOrderUpdated({ orderId: 'wo', actorUserId: 'creator', diff: [{ field: 'x', before: '1', after: '2' }] });
    const rows = notificationService.bulkCreate.mock.calls[0][0];
    expect(rows.map((row: { userId: string }) => row.userId).sort()).toEqual(['creator', 'h1', 'h2', 'h3']);
  });

  it('notifies creator when actor is not creator and downstream is empty', async () => {
    const notificationService = { bulkCreate: jest.fn(async (rows) => rows) };
    const hook = new FieldChangeHook(
      { findOne: jest.fn(async () => ({ id: 'wo', orderNo: 'ON1', createdBy: 'creator', creator: { id: 'creator', realName: '发起人' } })) } as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, realName: where.id })) } as never,
      notificationService as never,
    );
    await hook.onWorkOrderUpdated({ orderId: 'wo', actorUserId: 'actor', diff: [{ field: 'x', before: '1', after: '2' }] });
    const rows = notificationService.bulkCreate.mock.calls[0][0];
    expect(rows.map((row: { userId: string }) => row.userId)).toEqual(['creator']);
  });
});

describe('BE-A10 dispatched order claim', () => {
  it('uses atomic handler_id IS NULL update', async () => {
    const qb: Record<string, jest.Mock> = {
      update: jest.fn(() => qb),
      set: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      returning: jest.fn(() => qb),
      execute: jest.fn(async () => ({ affected: 1 })),
    };
    const repo = {
      findOne: jest.fn(async () => ({ id: 'd1', moduleCode: 'contract', handlerId: null, parentOrder: { id: 'wo', orderNo: 'ON1', orderType: OrderType.ONBOARDING, status: 'processing', createdBy: 'creator', updatedAt: new Date(), extraData: {} } })),
      createQueryBuilder: jest.fn(() => qb),
    };
    const service = new DispatchedOrderService(
      repo as never,
      null as never,
      { count: jest.fn(async () => 1) } as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      null as never,
      { save: jest.fn(async () => undefined), create: jest.fn((x) => x) } as never,
      { getPermissionsForUser: jest.fn(async () => new Map()), getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
      null as never,
      null as never,
      null as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'd1' } as never);
    await service.claim('d1', { sub: 'user-1', username: 'u', roles: [] });
    expect(qb.andWhere).toHaveBeenCalledWith('handler_id IS NULL');
    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ handlerId: 'user-1' }));
  });
});
