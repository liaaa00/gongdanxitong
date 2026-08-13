import {
  BusinessScope,
  DispatchedOrder,
  FieldPermissionMode,
  FieldSupplementLog,
  FieldSupplementRule,
  Notification,
  WorkOrder,
} from 'src/entities';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { Repository } from 'typeorm';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    update: jest.fn(async () => undefined),
    ...overrides,
  } as unknown as Repository<T>;
}

function makeWorkOrder(version = new Date('2026-05-11T00:00:00.000Z')): WorkOrder {
  return {
    id: 'wo-1',
    orderNo: 'ON1',
    status: 'processing',
    businessScope: BusinessScope.BEILUN,
    createdBy: 'u1',
    departmentId: 'd1',
    customerId: 'c1',
    employeeName: 'Test User',
    employeeIdCard: '330102199001010011',
    extraData: { bank_name: 'Old Bank' },
    submittedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: version,
  } as unknown as WorkOrder;
}

describe('FieldSupplementService', () => {
  it('supplements one onboarding field and syncs visible fields to configured modules', async () => {
    const version = new Date('2026-05-11T00:00:00.000Z');
    const ruleRepo = repoMock<FieldSupplementRule>({
      findOne: jest.fn(async () => ({
        id: 'rule-1',
        syncToModules: ['data_entry'],
        fieldCode: 'bank_name',
        supplementerModule: 'onboarding_contact',
        isActive: true,
      } as unknown as FieldSupplementRule)),
    });
    const logRepo = repoMock<FieldSupplementLog>();
    const workOrderRepo = repoMock<WorkOrder>();
    const childOrder = { id: 'child-1', moduleCode: 'data_entry', visibleFields: ['employee_name'] } as unknown as DispatchedOrder;
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({
        id: 'do-1',
        moduleCode: 'onboarding_contact',
        parentOrder: makeWorkOrder(version),
      } as unknown as DispatchedOrder)),
      find: jest.fn(async () => [childOrder]),
    });
    const notificationRepo = repoMock<Notification>();
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['bank_name', FieldPermissionMode.VISIBLE]])),
    } as unknown as FieldPermissionService;

    const service = new FieldSupplementService(
      ruleRepo,
      logRepo,
      workOrderRepo,
      dispatchedRepo,
      notificationRepo,
      fieldPermissionService,
    );
    const result = await service.supplement({
      dispatchedOrderId: 'do-1',
      fieldCode: 'bank_name',
      newValue: 'New Bank',
      userId: 'u1',
      workOrderUpdatedAt: version.toISOString(),
    });

    expect(result.success).toBe(true);
    expect(logRepo.save).toHaveBeenCalled();
    expect(workOrderRepo.save).toHaveBeenCalled();
    expect(dispatchedRepo.save).toHaveBeenCalled();
    expect(notificationRepo.save).toHaveBeenCalled();
  });

  it('allows an explicitly visible social-insurance field without a supplement rule', async () => {
    const workOrder = makeWorkOrder();
    const ruleRepo = repoMock<FieldSupplementRule>();
    const logRepo = repoMock<FieldSupplementLog>();
    const workOrderRepo = repoMock<WorkOrder>();
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({
        id: 'do-social',
        moduleCode: 'social_insurance',
        visibleFields: ['employee_name'],
        parentOrder: workOrder,
      } as unknown as DispatchedOrder)),
    });
    const notificationRepo = repoMock<Notification>();
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['bank_name', FieldPermissionMode.VISIBLE]])),
    } as unknown as FieldPermissionService;
    const service = new FieldSupplementService(
      ruleRepo,
      logRepo,
      workOrderRepo,
      dispatchedRepo,
      notificationRepo,
      fieldPermissionService,
    );

    await expect(service.supplement({
      dispatchedOrderId: 'do-social',
      fieldCode: 'bank_name',
      newValue: 'New Bank',
      userId: 'social-user',
    })).resolves.toMatchObject({ success: true, fieldCode: 'bank_name' });

    expect(ruleRepo.findOne).not.toHaveBeenCalled();
    expect(fieldPermissionService.getPermissionsForUser).toHaveBeenCalledWith(
      'social-user',
      'dispatched:social_insurance',
      BusinessScope.BEILUN,
    );
  });

  it.each([
    ['readonly permission', FieldPermissionMode.READONLY],
    ['masked permission', FieldPermissionMode.MASKED],
    ['hidden permission', FieldPermissionMode.HIDDEN],
  ])('rejects a social-insurance field with %s', async (_label, permission) => {
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({
        id: 'do-social',
        moduleCode: 'social_insurance',
        visibleFields: ['employee_name'],
        parentOrder: makeWorkOrder(),
      } as unknown as DispatchedOrder)),
    });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['bank_name', permission]])),
    } as unknown as FieldPermissionService;
    const service = new FieldSupplementService(
      repoMock<FieldSupplementRule>(),
      repoMock<FieldSupplementLog>(),
      repoMock<WorkOrder>(),
      dispatchedRepo,
      repoMock<Notification>(),
      fieldPermissionService,
    );

    await expect(service.supplement({
      dispatchedOrderId: 'do-social',
      fieldCode: 'bank_name',
      newValue: 'New Bank',
      userId: 'social-user',
    })).rejects.toMatchObject({ status: 403 });
  });

  it('rejects stale version updates', async () => {
    const workOrder = makeWorkOrder(new Date('2026-01-01T00:00:00.000Z'));
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({
        id: 'do-1',
        moduleCode: 'onboarding_contact',
        parentOrder: workOrder,
      } as unknown as DispatchedOrder)),
    });
    const ruleRepo = repoMock<FieldSupplementRule>({
      findOne: jest.fn(async () => ({
        id: 'rule-1',
        syncToModules: [],
        fieldCode: 'bank_name',
        supplementerModule: 'onboarding_contact',
        isActive: true,
      } as unknown as FieldSupplementRule)),
    });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['bank_name', FieldPermissionMode.VISIBLE]])),
    } as unknown as FieldPermissionService;
    const service = new FieldSupplementService(
      ruleRepo,
      repoMock<FieldSupplementLog>(),
      repoMock<WorkOrder>(),
      dispatchedRepo,
      repoMock<Notification>(),
      fieldPermissionService,
    );

    await expect(service.supplement({
      dispatchedOrderId: 'do-1',
      fieldCode: 'bank_name',
      newValue: 'New Bank',
      userId: 'u1',
      workOrderUpdatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    })).rejects.toThrow();
  });
});
