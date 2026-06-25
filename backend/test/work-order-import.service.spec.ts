import { DataSource } from 'typeorm';
import { OrderType } from 'src/entities';
import { WorkOrderImportService } from 'src/modules/imports/work-order-import.service';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

function makeUser(): JwtUserPayload {
  return { sub: 'user-1', username: 'tester', roles: ['salesperson'] };
}

describe('WorkOrderImportService derived fields', () => {
  it('writes onboarding import derived identity and probation fields into extraData', async () => {
    const workOrderService = {
      createDraft: jest.fn(async () => ({ id: 'wo-1' })),
      submit: jest.fn(),
    } as unknown as WorkOrderService;
    const dataSource = {
      query: jest.fn(async () => []),
    } as unknown as DataSource;
    const service = new WorkOrderImportService(workOrderService, dataSource);

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
  });
});
