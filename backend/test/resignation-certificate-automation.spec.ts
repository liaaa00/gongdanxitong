import { EntityManager, Repository } from 'typeorm';
import {
  BusinessScope,
  DispatchModuleCode,
  DispatchStrategy,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
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
      resignation_date: '2026-08-03',
      resignation_reason: '个人原因',
      cert_delivery_address: '宁波市北仑区',
    },
    ...overrides,
  });
}

function makeManager(existing: InServiceOrder | null = null) {
  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn(async () => existing),
  };
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  const repository = {
    create: jest.fn((input: Partial<InServiceOrder>) => input as InServiceOrder),
    save: jest.fn(async (input: InServiceOrder) => Object.assign(input, { id: input.id ?? 'certificate-1' })),
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as Repository<InServiceOrder>;
  const manager = {
    query: jest.fn(async () => undefined),
    getRepository: jest.fn(() => repository),
  } as unknown as EntityManager;
  return {
    manager,
    repository: repository as unknown as {
      create: jest.Mock;
      save: jest.Mock;
      createQueryBuilder: jest.Mock;
    },
    queryBuilder,
  };
}

describe('ResignationCertificateAutomationService', () => {
  const picker = {
    pick: jest.fn(async () => null),
  } as unknown as HandlerPickerService;
  let service: ResignationCertificateAutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResignationCertificateAutomationService(picker);
  });

  it.each([
    ['submission', '否'],
    ['materials_completed', '是'],
  ] as Array<[ResignationCertificateTrigger, string]>)(
    'creates and maps a certificate for %s',
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
      expect(picker.pick).toHaveBeenCalledWith(
        DispatchStrategy.TEAM_CLAIM,
        DispatchModuleCode.RESIGNATION_CERT,
      );
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
        orderType: OrderType.IN_SERVICE,
        orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
        businessScope: BusinessScope.BEILUN,
        status: InServiceOrderStatus.DISPATCHED,
        handlerId: null,
        createdBy: 'creator-1',
        extraData: expect.objectContaining({
          resignationDate: '2026-08-03',
          resignationReason: '个人原因',
          deliveryAddress: '宁波市北仑区',
          source_work_order_id: 'work-order-1',
          source_order_no: 'RS20260803001',
          source_trigger: trigger,
        }),
      }));
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ id: 'certificate-1' }));
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
      expect(picker.pick).not.toHaveBeenCalled();
    },
  );

  it('returns the existing source certificate after taking the idempotency lock', async () => {
    const existing = Object.assign(new InServiceOrder(), { id: 'existing-certificate' });
    const { manager, repository } = makeManager(existing);

    await expect(service.ensureForWorkOrder(
      makeSource(),
      'submission',
      manager,
    )).resolves.toBe(existing);

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
    expect(picker.pick).not.toHaveBeenCalled();
  });
});
