import { Repository } from 'typeorm';
import { InServiceOrder, InServiceOrderKind, InServiceOrderStatus, OrderType } from 'src/entities';
import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

describe('batch renewal creation', () => {
  it('reuses single-order validation and dispatches every item', async () => {
    let current: InServiceOrder | null = null;
    const repository = {
      create: jest.fn((input: Partial<InServiceOrder>) => Object.assign(new InServiceOrder(), input, {
        id: input.id ?? 'renewal-' + Math.random(),
        orderNo: input.orderNo ?? 'RN-TEST',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      })),
      save: jest.fn(async (order: InServiceOrder) => {
        current = order;
        return order;
      }),
      findOne: jest.fn(async () => current),
      find: jest.fn(async () => []),
    } as unknown as Repository<InServiceOrder>;
    const picker = { pick: jest.fn(async () => 'handler-1') } as unknown as HandlerPickerService;
    const service = new InServiceOrdersService(
      repository,
      { find: jest.fn(async () => []) } as never,
      picker,
      {} as ExportTemplatesService,
    );
    const user = { sub: 'user-1', username: 'user', roles: ['biz_member'] } as JwtUserPayload;
    const base = {
      customerId: '22222222-2222-4222-8222-222222222222',
      departmentId: '33333333-3333-4333-8333-333333333333',
      employeeName: '员工',
      idCardNo: '330206199001011234',
      extraData: {
        contract_term_type: '固定期限',
        contract_term: '1年',
        contract_start_date: '2026-09-01',
        contract_end_date: '2027-08-31',
        base_salary: 8000,
      },
    };

    const result = await service.batchCreateRenewals([base, { ...base, employeeName: '员工2', idCardNo: '330206199001011235' }], user);

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(picker.pick).toHaveBeenCalledTimes(2);
  });

  it('rejects non-renewal items before creating orders', async () => {
    const service = new InServiceOrdersService(
      { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { pick: jest.fn() } as never,
      {} as ExportTemplatesService,
    );
    await expect(service.batchCreateRenewals([{
      customerId: '22222222-2222-4222-8222-222222222222',
      departmentId: '33333333-3333-4333-8333-333333333333',
      orderKind: 'single_business' as never,
    }], { sub: 'user-1', username: 'user', roles: ['biz_member'] } as JwtUserPayload))
      .rejects.toThrow('仅支持劳动合同续签');
  });
});
