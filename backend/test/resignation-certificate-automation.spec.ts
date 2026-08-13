import { EntityManager, Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import {
  ResignationCertificateAutomationService,
  ResignationCertificateTrigger,
} from 'src/modules/work-orders/resignation-certificate-automation.service';

function makeSource(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'work-order-1',
    orderNo: 'RS20260803001',
    orderType: OrderType.RESIGNATION,
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
    departmentId: 'department-1',
    customerId: 'customer-1',
    employeeName: '张三',
    employeeIdCard: '330206199001011234',
    extraData: {
      need_resignation_cert: '是',
      need_resignation_share: '否',
    },
    ...overrides,
  });
}

function makeManager(existing: DispatchedOrder | null = null) {
  const repository = {
    findOne: jest.fn(async () => existing),
    create: jest.fn((input: Partial<DispatchedOrder>) => input as DispatchedOrder),
    save: jest.fn(async (input: DispatchedOrder) => Object.assign(input, { id: input.id ?? 'certificate-1' })),
  } as unknown as Repository<DispatchedOrder>;
  const manager = {
    query: jest.fn(async () => undefined),
    getRepository: jest.fn(() => repository),
  } as unknown as EntityManager;
  return {
    manager,
    repository: repository as unknown as {
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    },
  };
}

describe('ResignationCertificateAutomationService', () => {
  const dispatchEngine = {
    evaluateDetailed: jest.fn(async () => ({
      hits: [],
      childrenToCreate: [{
        moduleCode: 'resignation_cert',
        handlerId: 'handler-1',
        visibleFields: ['employee_name', 'id_card_no'],
        ruleId: 'rule-cert',
        ruleName: 'resignation-cert',
        dispatchStrategy: 'team_claim',
        dueAt: new Date('2026-08-13T00:00:00.000Z'),
        slaHours: 24,
        slaReminderBeforeHours: 4,
      }],
    })),
  } as unknown as DispatchEngineService;
  let service: ResignationCertificateAutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResignationCertificateAutomationService(dispatchEngine);
  });

  it.each([
    ['submission', '否'],
    ['materials_completed', '是'],
  ] as Array<[ResignationCertificateTrigger, string]>)(
    'creates a configured resignation_cert child for %s',
    async (trigger, shareValue) => {
      const source = makeSource({
        extraData: {
          ...makeSource().extraData,
          need_resignation_share: shareValue,
        },
      });
      const { manager, repository } = makeManager();

      const result = await service.ensureForWorkOrder(source, trigger, manager);

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['resignation_certificate:work-order-1'],
      );
      expect(dispatchEngine.evaluateDetailed).toHaveBeenCalledWith(source, manager);
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
        parentOrderId: 'work-order-1',
        moduleCode: 'resignation_cert',
        status: DispatchedOrderStatus.PENDING,
        handlerId: 'handler-1',
        visibleFields: ['employee_name', 'id_card_no'],
        slaHours: 24,
        slaReminderBeforeHours: 4,
      }));
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        order: expect.objectContaining({ id: 'certificate-1', moduleCode: 'resignation_cert' }),
        created: true,
      });
    },
  );

  it.each([
    ['not requested', { need_resignation_cert: '否', need_resignation_share: '否' }, 'submission'],
    ['cert field is null', { need_resignation_cert: null, need_resignation_share: '否' }, 'submission'],
    ['cert field is empty', { need_resignation_cert: '', need_resignation_share: '否' }, 'submission'],
    ['cert field is undefined', { need_resignation_share: '否' }, 'submission'],
    ['missing share flag', { need_resignation_cert: '是' }, 'submission'],
    ['waits for materials', { need_resignation_cert: '是', need_resignation_share: '是' }, 'submission'],
    ['does not use material trigger without sharing', { need_resignation_cert: '是', need_resignation_share: '否' }, 'materials_completed'],
  ] as Array<[string, Record<string, unknown>, ResignationCertificateTrigger]>)(
    'does not create when %s',
    async (_label, extraData, trigger) => {
      const { manager, repository } = makeManager();

      await expect(service.ensureForWorkOrder(
        makeSource({ extraData }),
        trigger,
        manager,
      )).resolves.toBeNull();

      expect(manager.query).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
      expect(dispatchEngine.evaluateDetailed).not.toHaveBeenCalled();
    },
  );

  it('allows an explicit manual dispatch when the historical share flag is missing', async () => {
    const { manager, repository } = makeManager();
    const source = makeSource({ extraData: { need_resignation_cert: '是' } });

    await expect(service.ensureManualForWorkOrder(source, manager))
      .resolves.toEqual({
        order: expect.objectContaining({ id: 'certificate-1' }),
        created: true,
      });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(dispatchEngine.evaluateDetailed).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing resignation_cert child after taking the idempotency lock', async () => {
    const existing = Object.assign(new DispatchedOrder(), {
      id: 'existing-certificate',
      parentOrderId: 'work-order-1',
      moduleCode: 'resignation_cert',
    });
    const { manager, repository } = makeManager(existing);

    await expect(service.ensureForWorkOrder(
      makeSource(),
      'submission',
      manager,
    )).resolves.toEqual({ order: existing, created: false });

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
    expect(dispatchEngine.evaluateDetailed).not.toHaveBeenCalled();
  });

  it('does not create a different order model when the configured child is missing', async () => {
    const missingDispatchEngine = {
      evaluateDetailed: jest.fn(async () => ({ hits: [], childrenToCreate: [] })),
    } as unknown as DispatchEngineService;
    const { manager, repository } = makeManager();
    const missingService = new ResignationCertificateAutomationService(missingDispatchEngine);

    await expect(missingService.ensureManualForWorkOrder(makeSource(), manager)).resolves.toBeNull();

    expect(repository.save).not.toHaveBeenCalled();
  });
});
