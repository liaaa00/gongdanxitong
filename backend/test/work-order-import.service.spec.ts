import { DataSource } from 'typeorm';
import {
  BusinessScope,
  InServiceOrderKind,
  OrderType,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderImportService } from 'src/modules/imports/work-order-import.service';
import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';

function makeUser(): JwtUserPayload {
  return {
    sub: 'user-1',
    username: 'tester',
    roles: ['salesperson'],
    businessScope: BusinessScope.OUT_OF_PROVINCE,
  };
}

function makeServices(query: jest.Mock = jest.fn(async () => [])) {
  const workOrderService = {
    createDraft: jest.fn(async () => ({ id: 'wo-1' })),
    submit: jest.fn(),
  } as unknown as WorkOrderService;
  const dataSource = { query } as unknown as DataSource;
  const inServiceOrdersService = {
    create: jest.fn(async () => ({ id: 'direct-1' })),
  } as unknown as InServiceOrdersService;
  const service = new WorkOrderImportService(
    workOrderService,
    dataSource,
    inServiceOrdersService,
  );
  return { service, workOrderService, inServiceOrdersService };
}

describe('WorkOrderImportService', () => {
  it('keeps onboarding imports on the main work-order path with derived fields', async () => {
    const { service, workOrderService, inServiceOrdersService } = makeServices();

    await service.writeOne({
      orderType: OrderType.ONBOARDING,
      normalized: {
        customer_name: '示例客户',
        customer_code: 'C001',
        employee_name: '张三',
        id_card_no: '330106199001011237',
        probation_start_date: '2026-06-01',
        probation_months: '3',
      },
      autoSubmit: false,
      user: makeUser(),
    });

    const payload = (workOrderService.createDraft as jest.Mock).mock.calls[0][0];
    expect(payload.extraData).toMatchObject({
      gender: '男',
      birth_date: '1990-01-01',
      probation_end_date: '2026-08-31',
    });
    expect(typeof payload.extraData.age).toBe('number');
    expect(inServiceOrdersService.create).not.toHaveBeenCalled();
  });

  it('keeps resignation imports on the main work-order path so draft creation can inherit onboarding data', async () => {
    const query = jest.fn(async () => [{ id: 'customer-1' }]);
    const { service, workOrderService, inServiceOrdersService } = makeServices(query);

    await service.writeOne({
      orderType: OrderType.RESIGNATION,
      normalized: {
        customer_name: '示例客户',
        customer_code: 'C001',
        employee_name: '张三',
        id_card_no: '330106199001011237',
        resignation_date: '2026-08-13',
      },
      autoSubmit: false,
      user: makeUser(),
    });

    expect(workOrderService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: OrderType.RESIGNATION,
        customerId: 'customer-1',
        extraData: expect.objectContaining({
          id_card_no: '330106199001011237',
        }),
      }),
      makeUser(),
    );
    expect(inServiceOrdersService.create).not.toHaveBeenCalled();
  });

  it('creates a new customer with the business-scope composite conflict target', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'customer-new' }]);
    const { service, workOrderService } = makeServices(query);

    await service.writeOne({
      orderType: OrderType.ONBOARDING,
      normalized: {
        customer_name: '新客户',
        customer_code: 'C-NEW',
        employee_name: '张三',
        id_card_no: '330106199001011237',
      },
      autoSubmit: false,
      user: makeUser(),
    });

    expect(workOrderService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-new' }),
      makeUser(),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT (customer_code, business_scope)'),
      ['C-NEW', '新客户', BusinessScope.BEILUN],
    );
  });

  it('creates one direct order per out-of-province import row without a main work order', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'customer-1' }])
      .mockResolvedValueOnce([{ id: 'department-1' }]);
    const { service, workOrderService, inServiceOrdersService } = makeServices(query);

    const result = await service.writeOne({
      orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
      normalized: {
        customer_name: '菜鸟项目',
        customer_code: 'CN001',
        employee_name: '李四',
        id_card_no: '330106199102020022',
        province: '浙江',
        city: '杭州市',
        payment_institution: '杭州账户A',
        contract_start_date: '2026-08-01',
        contract_end_date: '2027-07-31',
      },
      autoSubmit: true,
      user: makeUser(),
    });

    expect(result).toEqual({ workOrderId: 'direct-1' });
    expect(workOrderService.createDraft).not.toHaveBeenCalled();
    expect(workOrderService.submit).not.toHaveBeenCalled();
    expect(inServiceOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        departmentId: 'department-1',
        orderKind: InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
        businessScope: BusinessScope.OUT_OF_PROVINCE,
        employeeName: '李四',
        idCardNo: '330106199102020022',
        province: '浙江',
        city: '杭州市',
        extraData: expect.objectContaining({
          paymentInstitution: '杭州账户A',
          contractStartDate: '2026-08-01',
          contractEndDate: '2027-07-31',
        }),
      }),
      makeUser(),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM user_roles'),
      ['user-1'],
    );
  });
});
