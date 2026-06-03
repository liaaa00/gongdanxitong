import { NotFoundException } from '@nestjs/common';
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

describe('P7 benefit state machine (phase-1 hidden)', () => {
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

  it('hides benefit_apply detail/transition in phase 1 instead of exposing the old state machine', async () => {
    const orderStageRepo = repoMock<OrderStage>({
      findOne: jest.fn(async () => null),
      save: jest.fn(async (input: OrderStage) => ({ ...input, id: 'stage-1', createdAt: new Date() } as OrderStage)),
    });
    const { service, workOrderRepo, operationLogRepo } = makeService(orderStageRepo);

    await expect(service.transitionBenefitStage('do-benefit-1', { nextStage: 'submitted', payload: { channel: 'api' } }, user))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(orderStageRepo.save).not.toHaveBeenCalled();
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    expect(operationLogRepo.save).not.toHaveBeenCalled();
  });
});
