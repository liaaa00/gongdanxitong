import { FieldPermissionMode, FieldSupplementLog, FieldSupplementRule, DispatchedOrder, Notification, WorkOrder } from 'src/entities';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
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

describe('FieldSupplementService', () => {
  it('supplements one field and syncs visible fields to configured modules', async () => {
    const version = new Date('2026-05-11T00:00:00.000Z');
    const ruleRepo = repoMock<FieldSupplementRule>({
      findOne: jest.fn(async () => ({ id: 'rule-1', syncToModules: ['data_entry'], fieldCode: 'bank_name', supplementerModule: 'onboarding_contact', isActive: true } as unknown as FieldSupplementRule)),
    });
    const logRepo = repoMock<FieldSupplementLog>({ save: jest.fn(async (input: FieldSupplementLog) => input) });
    const workOrderRepo = repoMock<WorkOrder>({ save: jest.fn(async (input: WorkOrder) => input) });
    const childOrder = { id: 'child-1', moduleCode: 'data_entry', visibleFields: ['employee_name'] } as unknown as DispatchedOrder;
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({ id: 'do-1', moduleCode: 'onboarding_contact', parentOrder: { id: 'wo-1', orderNo: 'ON1', status: 'processing', createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: '张三', employeeIdCard: '330102199001010011', extraData: { bank_name: '旧值' }, submittedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: version } as unknown as WorkOrder } as unknown as DispatchedOrder)),
      find: jest.fn(async () => [childOrder]),
      save: jest.fn(async (input: DispatchedOrder) => input),
    });
    const notificationRepo = repoMock<Notification>({ save: jest.fn(async (input: Notification) => input) });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['bank_name', FieldPermissionMode.VISIBLE]])),
    } as unknown as FieldPermissionService;

    const service = new FieldSupplementService(ruleRepo, logRepo, workOrderRepo, dispatchedRepo, notificationRepo, fieldPermissionService);
    const result = await service.supplement({ dispatchedOrderId: 'do-1', fieldCode: 'bank_name', newValue: '新值', userId: 'u1', workOrderUpdatedAt: version.toISOString() });

    expect(result.success).toBe(true);
    expect(logRepo.save).toHaveBeenCalled();
    expect(workOrderRepo.save).toHaveBeenCalled();
    expect(dispatchedRepo.save).toHaveBeenCalled();
    expect(notificationRepo.save).toHaveBeenCalled();
  });

  it('rejects stale version updates', async () => {
    const workOrder = { id: 'wo-1', orderNo: 'ON1', status: 'processing', createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: '张三', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date('2026-01-01T00:00:00.000Z') } as unknown as WorkOrder;
    const dispatchedRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => ({ id: 'do-1', moduleCode: 'onboarding_contact', parentOrder: workOrder } as unknown as DispatchedOrder)) });
    const ruleRepo = repoMock<FieldSupplementRule>({ findOne: jest.fn(async () => ({ id: 'rule-1', syncToModules: [], fieldCode: 'bank_name', supplementerModule: 'onboarding_contact', isActive: true } as unknown as FieldSupplementRule)) });
    const logRepo = repoMock<FieldSupplementLog>();
    const workOrderRepo = repoMock<WorkOrder>();
    const notificationRepo = repoMock<Notification>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(async () => new Map([['bank_name', FieldPermissionMode.VISIBLE]])) } as unknown as FieldPermissionService;
    const service = new FieldSupplementService(ruleRepo, logRepo, workOrderRepo, dispatchedRepo, notificationRepo, fieldPermissionService);

    await expect(service.supplement({ dispatchedOrderId: 'do-1', fieldCode: 'bank_name', newValue: '新值', userId: 'u1', workOrderUpdatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString() })).rejects.toThrow();
  });
});
