import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleHandler,
  Notification,
  OperationLog,
  OrderStage,
  OrderType,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

function makeBenefitOrder(): DispatchedOrder {
  const parentOrder = Object.assign(new WorkOrder(), {
    id: 'wo-benefit-1',
    orderNo: 'BE20260512001',
    orderType: OrderType.BENEFIT,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'sales-1',
    departmentId: 'dep-1',
    customerId: 'customer-1',
    employeeName: 'Alice',
    employeeIdCard: '110101199001011234',
    extraData: {},
    submittedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return Object.assign(new DispatchedOrder(), {
    id: 'do-benefit-1',
    parentOrderId: parentOrder.id,
    parentOrder,
    moduleCode: 'benefit_apply',
    status: DispatchedOrderStatus.PROCESSING,
    handlerId: 'benefit-handler-1',
    visibleFields: null,
    returnReason: null,
    dispatchedAt: new Date(),
    acceptedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('P7 benefit state machine', () => {
  function makeService(orderStageRepo: Repository<OrderStage>) {
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => makeBenefitOrder()) });
    const workOrderRepo = repoMock<WorkOrder>();
    const operationLogRepo = repoMock<OperationLog>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      operationLogRepo,
      {} as FieldPermissionService,
      {} as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      orderStageRepo,
    );
    return { service, workOrderRepo, operationLogRepo };
  }

  const user: JwtUserPayload = { sub: 'benefit-handler-1', username: 'benefit01', roles: ['data_entry_team'] } as JwtUserPayload;

  it('moves draft to submitted and writes an order_stages row', async () => {
    const orderStageRepo = repoMock<OrderStage>({
      findOne: jest.fn(async () => null),
      save: jest.fn(async (input: OrderStage) => ({ ...input, id: 'stage-1', createdAt: new Date() } as OrderStage)),
    });
    const { service, workOrderRepo, operationLogRepo } = makeService(orderStageRepo);

    const result = await service.transitionBenefitStage('do-benefit-1', { nextStage: 'submitted', payload: { channel: 'api' } }, user);

    expect(result).toMatchObject({ success: true, previousStage: 'draft', currentStage: 'submitted' });
    expect(orderStageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'wo-benefit-1',
      dispatchedOrderId: 'do-benefit-1',
      stageCode: 'submitted',
      operatorId: 'benefit-handler-1',
      payload: { channel: 'api' },
    }));
    expect(workOrderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({ benefit_stage: 'submitted' }),
    }));
    expect(operationLogRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid state jumps', async () => {
    const orderStageRepo = repoMock<OrderStage>({
      findOne: jest.fn(async () => ({ stageCode: 'submitted', happenedAt: new Date(), createdAt: new Date() } as OrderStage)),
    });
    const { service } = makeService(orderStageRepo);

    await expect(service.transitionBenefitStage('do-benefit-1', { nextStage: 'stamped' }, user)).rejects.toBeInstanceOf(HttpException);
  });
});
