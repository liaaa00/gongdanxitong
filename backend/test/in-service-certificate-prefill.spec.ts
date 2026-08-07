import { Repository } from 'typeorm';
import {
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  WorkOrderStatus,
} from 'src/entities';
import {
  InServiceOrdersService,
  expandInServiceStatusFilter,
} from 'src/modules/in-service-orders/in-service-orders.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

describe('certificate history defaults', () => {
  it('prefills hire date, job title and income reference from local history', async () => {
    let saved: InServiceOrder | null = null;
    const repository = {
      create: jest.fn((input: Partial<InServiceOrder>) => Object.assign(new InServiceOrder(), input, {
        id: 'certificate-1',
        orderNo: 'CERT-TEST',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      })),
      save: jest.fn(async (order: InServiceOrder) => {
        saved = order;
        return order;
      }),
      findOne: jest.fn(async () => saved),
      find: jest.fn(async () => []),
    } as unknown as Repository<InServiceOrder>;
    const source = {
      id: 'source-1',
      status: WorkOrderStatus.COMPLETED,
      orderNo: 'ON-TEST',
      employeeName: '历史员工',
      employeeIdCard: '330206199001011234',
      extraData: {
        contract_start_date: '2023-01-01',
        position: '招商主管',
        base_salary: 9000,
      },
      createdAt: new Date(),
    };
    const service = new InServiceOrdersService(
      repository,
      { find: jest.fn(async () => [source]) } as never,
      { pick: jest.fn(async () => 'handler-1') } as never,
      {} as never,
    );

    await service.create({
      customerId: '22222222-2222-4222-8222-222222222222',
      departmentId: '33333333-3333-4333-8333-333333333333',
      orderKind: InServiceOrderKind.CERTIFICATE,
      employeeName: '历史员工',
      idCardNo: '330206199001011234',
      extraData: { certificateType: 'income', purpose: '购房', averageMonthlyIncome: 8500 },
    }, { sub: 'user-1', username: 'user', roles: ['biz_member'] } as JwtUserPayload);

    const actual = saved as InServiceOrder | null;
    expect(actual?.extraData).toEqual(expect.objectContaining({
      hireDate: '2023-01-01',
      jobTitle: '招商主管',
      referenceBaseSalary: 9000,
    }));
    expect(actual?.extraData.averageMonthlyIncome).toBe(8500);
  });

  it('expands the four certificate states without changing other order kinds', () => {
    expect(expandInServiceStatusFilter(
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderStatus.DISPATCHED,
    )).toEqual([InServiceOrderStatus.DRAFT, InServiceOrderStatus.DISPATCHED]);
    expect(expandInServiceStatusFilter(
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderStatus.PROCESSING,
    )).toEqual([
      InServiceOrderStatus.ACCEPTED,
      InServiceOrderStatus.READY,
      InServiceOrderStatus.PROCESSING,
    ]);
    expect(expandInServiceStatusFilter(
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderStatus.COMPLETED,
    )).toEqual([InServiceOrderStatus.COMPLETED, InServiceOrderStatus.ARCHIVED]);
    expect(expandInServiceStatusFilter(
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderStatus.PENDING_INFO,
    )).toEqual([
      InServiceOrderStatus.PENDING_INFO,
      InServiceOrderStatus.FAILED,
      InServiceOrderStatus.CANCELLED,
    ]);
    expect(expandInServiceStatusFilter(
      InServiceOrderKind.CONTRACT_RENEWAL,
      InServiceOrderStatus.PROCESSING,
    )).toEqual([InServiceOrderStatus.PROCESSING]);
  });
});
