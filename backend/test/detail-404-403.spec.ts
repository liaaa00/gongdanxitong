import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { DispatchedOrder, FieldConfig, WorkOrder } from 'src/entities';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const DISPATCHED_ORDER_ID = '22222222-2222-4222-8222-222222222222';

function invalidUuidQueryError(): QueryFailedError {
  return new QueryFailedError('select ... where id = $1', ['not-exist-qa'], { code: '22P02' } as never);
}

function makeWorkOrderService(findOne: jest.Mock, resolveUserDepartmentIds = jest.fn(async () => [])) {
  return new WorkOrderService(
    { findOne } as unknown as Repository<WorkOrder>,
    { createQueryBuilder: jest.fn(), find: jest.fn(async () => []) } as never,
    { find: jest.fn(async () => []) } as never,
    null as never,
    null as never,
    null as never,
    { resolveUserDepartmentIds } as never,
    { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
  );
}

function makeDispatchedOrderService(findOne: jest.Mock) {
  return new DispatchedOrderService(
    { findOne } as unknown as Repository<DispatchedOrder>,
    null as never,
    { count: jest.fn(async () => 0) } as never,
    { find: jest.fn(async () => []) } as never,
    { find: jest.fn(async () => []) } as unknown as Repository<FieldConfig>,
    null as never,
    null as never,
    null as never,
    { getLogs: jest.fn(async () => []) } as never,
    null as never,
  );
}

describe('P1 detail 404/403 normalization', () => {
  it('work-orders detail converts TypeORM invalid uuid error to NotFoundException', async () => {
    const service = makeWorkOrderService(jest.fn(async () => { throw invalidUuidQueryError(); }));
    await expect(service.findOne('not-exist-qa', { sub: 'u1', username: 'u1', roles: ['salesperson'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('work-orders detail returns NotFoundException when uuid does not exist', async () => {
    const service = makeWorkOrderService(jest.fn(async () => null));
    await expect(service.findOne(WORK_ORDER_ID, { sub: 'u1', username: 'u1', roles: ['salesperson'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('work-orders detail returns ForbiddenException when user has no scope', async () => {
    const service = makeWorkOrderService(jest.fn(async () => ({ id: WORK_ORDER_ID, createdBy: 'owner', departmentId: 'dep1' } as WorkOrder)));
    await expect(service.findOne(WORK_ORDER_ID, { sub: 'u2', username: 'u2', roles: ['salesperson'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dispatched-orders detail converts TypeORM invalid uuid error to NotFoundException', async () => {
    const service = makeDispatchedOrderService(jest.fn(async () => { throw invalidUuidQueryError(); }));
    await expect(service.findOne('not-exist-qa', { sub: 'u1', username: 'u1', roles: ['contract_specialist'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dispatched-orders supplement-logs converts TypeORM invalid uuid error to NotFoundException', async () => {
    const service = makeDispatchedOrderService(jest.fn(async () => { throw invalidUuidQueryError(); }));
    await expect(service.getSupplementLogs('not-exist-qa', { sub: 'u1', username: 'u1', roles: ['contract_specialist'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dispatched-orders detail returns NotFoundException when uuid does not exist', async () => {
    const service = makeDispatchedOrderService(jest.fn(async () => null));
    await expect(service.findOne(DISPATCHED_ORDER_ID, { sub: 'u1', username: 'u1', roles: ['contract_specialist'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dispatched-orders supplement-logs returns NotFoundException when uuid does not exist', async () => {
    const service = makeDispatchedOrderService(jest.fn(async () => null));
    await expect(service.getSupplementLogs(DISPATCHED_ORDER_ID, { sub: 'u1', username: 'u1', roles: ['contract_specialist'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dispatched-orders detail returns NotFoundException when user has no module scope', async () => {
    const service = makeDispatchedOrderService(jest.fn(async () => ({ id: DISPATCHED_ORDER_ID, handlerId: 'handler', moduleCode: 'contract', parentOrder: { id: WORK_ORDER_ID } } as DispatchedOrder)));
    await expect(service.findOne(DISPATCHED_ORDER_ID, { sub: 'u2', username: 'u2', roles: ['salesperson'] })).rejects.toBeInstanceOf(NotFoundException);
  });
});
