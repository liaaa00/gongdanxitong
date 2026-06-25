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
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
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

function makeOrder(moduleCode: string, handlerId: string, status: DispatchedOrderStatus = DispatchedOrderStatus.PROCESSING): DispatchedOrder {
  const parentOrder = {
    id: 'wo-1',
    orderNo: 'ON20260608001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
    departmentId: 'd1',
    customerId: 'c1',
    employeeName: '员工',
    employeeIdCard: '330102199001010011',
    extraData: {},
    submittedAt: null,
    completedAt: null,
    createdAt: new Date('2026-06-08T00:00:00.000Z'),
    updatedAt: new Date('2026-06-08T00:00:00.000Z'),
  } as unknown as WorkOrder;

  return {
    id: `do-${moduleCode}`,
    parentOrderId: parentOrder.id,
    parentOrder,
    moduleCode,
    status,
    handlerId,
    visibleFields: ['bank_account'],
    returnReason: null,
    dispatchedAt: new Date('2026-06-08T00:00:00.000Z'),
    acceptedAt: new Date('2026-06-08T00:00:00.000Z'),
    completedAt: null,
    voidAt: null,
    createdAt: new Date('2026-06-08T00:00:00.000Z'),
    updatedAt: new Date('2026-06-08T00:00:00.000Z'),
  } as unknown as DispatchedOrder;
}

function makeService(order: DispatchedOrder) {
  const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
  const fieldSupplementServiceMock = {
    supplement: jest.fn(async ({ fieldCode }: { fieldCode: string }) => ({ success: true, workOrderId: order.parentOrderId, fieldCode })),
    getLogs: jest.fn(),
  };
  const service = new DispatchedOrderService(
    dispatchedOrderRepo,
    repoMock<WorkOrder>(),
    repoMock<ModuleHandler>(),
    repoMock<UserRole>(),
    repoMock<FieldConfig>(),
    repoMock<Notification>(),
    repoMock<OperationLog>(),
    {} as FieldPermissionService,
    fieldSupplementServiceMock as unknown as FieldSupplementService,
    { exportSingleDispatchedOrder: jest.fn() } as never,
    { resolveUserDepartmentIds: jest.fn(async () => ['d1']) } as never,
  );
  return { service, fieldSupplementService: fieldSupplementServiceMock };
}

function user(sub: string, username: string, roles: string[]): JwtUserPayload {
  return { sub, username, roles } as JwtUserPayload;
}

describe('DispatchedOrderService supplement permission fallback', () => {
  it.each([
    ['maoyani', ['onboarding_specialist']],
    ['jianglu', ['shared_leader', 'onboarding_specialist', 'contract_specialist']],
  ])('allows %s to supplement onboarding_contact after existing handle checks pass', async (username, roles) => {
    const currentUser = user(`${username}-id`, username, roles);
    const { service, fieldSupplementService } = makeService(makeOrder('onboarding_contact', currentUser.sub));

    await expect(service.supplement('do-onboarding_contact', { fieldCode: 'bank_account', newValue: '6222' }, currentUser))
      .resolves.toEqual({ success: true, workOrderId: 'wo-1', fieldCode: 'bank_account' });

    expect(fieldSupplementService.supplement).toHaveBeenCalledWith({
      dispatchedOrderId: 'do-onboarding_contact',
      fieldCode: 'bank_account',
      newValue: '6222',
      userId: currentUser.sub,
      workOrderUpdatedAt: undefined,
    });
  });

  it('rejects allowed users when the child module is contract', async () => {
    const currentUser = user('jianglu-id', 'jianglu', ['shared_leader', 'contract_specialist', 'onboarding_specialist']);
    const { service, fieldSupplementService } = makeService(makeOrder('contract', currentUser.sub));

    await expect(service.supplement('do-contract', { fieldCode: 'bank_account', newValue: '6222' }, currentUser))
      .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    expect(fieldSupplementService.supplement).not.toHaveBeenCalled();
  });

  it('rejects other onboarding backend users even on onboarding_contact', async () => {
    const currentUser = user('other-id', 'otheronboard', ['onboarding_specialist']);
    const { service, fieldSupplementService } = makeService(makeOrder('onboarding_contact', currentUser.sub));

    await expect(service.supplement('do-onboarding_contact', { fieldCode: 'bank_account', newValue: '6222' }, currentUser))
      .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    expect(fieldSupplementService.supplement).not.toHaveBeenCalled();
  });

  it('rejects admin direct supplement calls outside the maoyani/jianglu whitelist', async () => {
    const currentUser = user('admin-id', 'lizhanbo', ['admin']);
    const { service, fieldSupplementService } = makeService(makeOrder('onboarding_contact', 'someone-else'));

    await expect(service.supplement('do-onboarding_contact', { fieldCode: 'bank_account', newValue: '6222' }, currentUser))
      .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    expect(fieldSupplementService.supplement).not.toHaveBeenCalled();
  });

  it.each([
    DispatchedOrderStatus.PENDING,
    DispatchedOrderStatus.COMPLETED,
    DispatchedOrderStatus.MODIFY_PENDING,
  ])('rejects allowed users when onboarding_contact is not processing: %s', async (status) => {
    const currentUser = user('maoyani-id', 'maoyani', ['onboarding_specialist']);
    const { service, fieldSupplementService } = makeService(makeOrder('onboarding_contact', currentUser.sub, status));

    await expect(service.supplement('do-onboarding_contact', { fieldCode: 'bank_account', newValue: '6222' }, currentUser))
      .rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    expect(fieldSupplementService.supplement).not.toHaveBeenCalled();
  });
});
