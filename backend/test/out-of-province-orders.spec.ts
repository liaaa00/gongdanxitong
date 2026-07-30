import { Repository } from 'typeorm';
import { AddWorkOrderBusinessScope20260727002000 } from 'src/database/migrations/20260727002000-AddWorkOrderBusinessScope';
import { seedDispatchRules } from 'src/database/seeds/seed-dispatch-rules';
import {
  BusinessScope,
  DispatchModuleCode,
  DispatchStrategy,
  DispatchedOrderStatus,
  ModuleHandler,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import {
  FIRST_PHASE_IMPORT_ORDER_TYPES,
  WORK_ORDER_IMPORT_ORDER_TYPES,
  assertCanImportWorkOrder,
} from 'src/modules/imports/import-permissions';
import { OutOfProvinceOrdersService } from 'src/modules/out-of-province-orders/out-of-province-orders.service';

function chainQuery(rows: WorkOrder[] = []) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(async () => rows.length),
    getMany: jest.fn(async () => rows),
  };
}

function makeService(options: { rows?: WorkOrder[]; scoped?: WorkOrder | null } = {}) {
  const qb = chainQuery(options.rows ?? []);
  const workOrderRepository = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => options.scoped ?? null),
  };
  const dispatchedOrderRepository = { find: jest.fn(async () => []) };
  const workOrderService = {
    createDraft: jest.fn(async (payload) => ({
      id: 'wo-out-1',
      orderType: payload.orderType,
      businessScope: BusinessScope.OUT_OF_PROVINCE,
      extraData: payload.extraData,
    })),
    update: jest.fn(),
    submit: jest.fn(),
    resubmit: jest.fn(),
  };
  const validationService = { resolveUserDepartmentIds: jest.fn(async () => ['dep-1']) };
  const service = new OutOfProvinceOrdersService(
    workOrderRepository as unknown as Repository<WorkOrder>,
    dispatchedOrderRepository as never,
    workOrderService as never,
    validationService as never,
  );
  return { service, qb, workOrderRepository, workOrderService };
}

describe('out-of-province order scope', () => {
  it('forces province data through the dedicated create endpoint', async () => {
    const { service, workOrderService } = makeService();
    await service.create({
      orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
      province: '福建',
      extraData: {
        province: '广东',
        employee_name: 'Alice',
        id_card_no: '330101199001011234',
      },
    }, { sub: 'sales-1', username: 'sales', roles: ['salesperson'] });

    expect(workOrderService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
        extraData: expect.objectContaining({ province: '福建' }),
      }),
      expect.objectContaining({ sub: 'sales-1' }),
    );
  });

  it('always filters the province list by scope and the two province order types', async () => {
    const { service, qb } = makeService();
    await service.findAll(
      { page: 1, pageSize: 20 },
      { sub: 'admin-1', username: 'admin', roles: ['admin'] },
    );

    expect(qb.where).toHaveBeenCalledWith(
      'w.business_scope = :businessScope',
      { businessScope: BusinessScope.OUT_OF_PROVINCE },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'w.order_type IN (:...orderTypes)',
      {
        orderTypes: [
          OrderType.OUT_OF_PROVINCE_INCREASE,
          OrderType.OUT_OF_PROVINCE_DECREASE,
        ],
      },
    );
  });

  it('does not resolve a Beilun order from the province detail endpoint', async () => {
    const { service, workOrderRepository } = makeService({ scoped: null });
    await expect(service.findOne(
      '3c36236a-12c4-4db5-9228-814015ec4bb1',
      { sub: 'admin-1', username: 'admin', roles: ['admin'] },
    )).rejects.toMatchObject({ status: 404 });
    expect(workOrderRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessScope: BusinessScope.OUT_OF_PROVINCE }),
    }));
  });
});

describe('out-of-province dispatch and import contracts', () => {
  it('seeds both production rules into the Sheet5 module', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        saved.push(value);
        return value;
      }),
    };
    await seedDispatchRules({ getRepository: jest.fn(() => repository) } as never);

    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({
        orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
        targetModule: DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      }),
      expect.objectContaining({
        orderType: OrderType.OUT_OF_PROVINCE_DECREASE,
        targetModule: DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      }),
    ]));
  });

  it('keeps the first Fujian Sheet5 handler as the initial assignee', async () => {
    const moduleCode = `${DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH}__福建`;
    const repository = {
      find: jest.fn(async () => [
        {
          id: 'fujian-backup', moduleCode, handlerId: 'backup-user', weight: 1,
          isBackup: true, isActive: true, handler: { isActive: true },
        },
        {
          id: 'fujian-primary', moduleCode, handlerId: 'primary-user', weight: 100,
          isBackup: false, isActive: true, handler: { isActive: true },
        },
      ] as ModuleHandler[]),
    };
    const picker = new HandlerPickerService(
      repository as unknown as Repository<ModuleHandler>,
      undefined,
      undefined,
    );

    await expect(picker.pick(
      DispatchStrategy.FIXED,
      DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      undefined,
      { province: '福建', mappingSource: 'sheet5' },
    )).resolves.toBe('primary-user');
  });

  it('opens province upload without pretending a province template is available', () => {
    expect(WORK_ORDER_IMPORT_ORDER_TYPES).toEqual(expect.arrayContaining([
      OrderType.OUT_OF_PROVINCE_INCREASE,
      OrderType.OUT_OF_PROVINCE_DECREASE,
    ]));
    expect(FIRST_PHASE_IMPORT_ORDER_TYPES).toEqual([
      OrderType.ONBOARDING,
      OrderType.RESIGNATION,
    ]);
    expect(() => assertCanImportWorkOrder(
      { sub: 'sales-1', username: 'sales', roles: ['salesperson'] },
      OrderType.OUT_OF_PROVINCE_INCREASE,
    )).not.toThrow();
  });

  it('reuses the resignation completion notification for province decreases', async () => {
    const parentOrder = {
      id: 'wo-out-decrease',
      orderNo: 'OP20260727001',
      orderType: OrderType.OUT_OF_PROVINCE_DECREASE,
      status: WorkOrderStatus.PROCESSING,
      createdBy: 'sales-1',
      completedAt: null,
    } as WorkOrder;
    const dispatchedOrderRepository = {
      find: jest.fn(async () => [{ status: DispatchedOrderStatus.COMPLETED }]),
    };
    const workOrderRepository = {
      findOne: jest.fn(async () => parentOrder),
      save: jest.fn(async (value) => value),
    };
    const notificationRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new DispatchedOrderService(
      dispatchedOrderRepository as never,
      workOrderRepository as never,
      {} as never,
      {} as never,
      {} as never,
      notificationRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service as any, 'writeLog').mockResolvedValue(undefined);

    await (service as any).checkMainOrderComplete(parentOrder.id);

    expect(parentOrder.status).toBe(WorkOrderStatus.COMPLETED);
    expect(notificationRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      bizType: 'resignation_completed',
      payload: expect.objectContaining({
        workOrderId: parentOrder.id,
        orderType: OrderType.OUT_OF_PROVINCE_DECREASE,
      }),
    }));
  });

  it('backfills scope and creates the contracted three-column index', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    };

    await new AddWorkOrderBusinessScope20260727002000().up(queryRunner as never);

    const sql = queries.join(' ').replace(/\s+/g, ' ');
    expect(sql).toContain('SET business_scope = CASE');
    expect(sql).toContain("ELSE 'beilun'");
    expect(sql).toContain('ALTER COLUMN business_scope SET NOT NULL');
    expect(sql).toContain('ON work_orders (business_scope, order_type, created_at)');
  });
});
