import { CustomerPortalService } from 'src/modules/customer-portal/customer-portal.service';
import { BusinessScope } from 'src/entities';

describe('CustomerPortalService salary workbench', () => {
  const customerA = { id: '11111111-1111-4111-8111-111111111111', customerName: '甲客户', customerCode: 'A001', businessScope: BusinessScope.BEILUN, isActive: true };
  const customerB = { id: '22222222-2222-4222-8222-222222222222', customerName: '乙客户', customerCode: 'B001', businessScope: BusinessScope.BEILUN, isActive: true };
  function fixture() {
    const customers = { find: jest.fn().mockResolvedValue([customerA, customerB]), findOne: jest.fn() };
    const rules = { find: jest.fn().mockResolvedValue([{ customerId: customerA.id, isActive: true }]), findOne: jest.fn() };
    const submissions = { find: jest.fn().mockResolvedValue([{ id: 'submission-a', customerId: customerA.id, requestNo: 'SAL-202609-A', fields: { month: '2026-09', mode: 'changed', channel: 'attachment', note: '' }, status: 'completed', resultNote: '已核对', createdAt: new Date('2026-09-01'), completedAt: new Date('2026-09-02') }]) };
    const mails = { find: jest.fn().mockResolvedValue([{ id: 'mail-a', customerId: customerA.id, portalSubmissionId: 'submission-a', templateCode: 'portal-attachments', status: 'sent', attachmentIds: ['file-a'], attachmentId: null, createdAt: new Date('2026-09-01') }, { id: 'mail-result', customerId: customerA.id, portalSubmissionId: 'submission-a', templateCode: 'portal-salary-completion', status: 'pending', attachmentIds: [], attachmentId: 'file-result', createdAt: new Date('2026-09-02') }]) };
    const uploads = { resolveFile: jest.fn().mockImplementation(async (fileId: string) => ({ fileId, originalName: fileId === 'file-a' ? '工资变动.xlsx' : '办结结果.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 123, kind: 'excel', filePath: '' })) };
    const dataSource = { getRepository: jest.fn().mockReturnValue({ find: jest.fn().mockResolvedValue([{ customerId: customerA.id }]) }) };
    const service = new CustomerPortalService({} as never, dataSource as never, submissions as never, { find: jest.fn().mockResolvedValue([]) } as never, rules as never, customers as never, {} as never, {} as never, mails as never, {} as never, {} as never, {} as never, {} as never, {} as never, uploads as never, {} as never, {} as never);
    return { service, customers, submissions, mails, uploads };
  }
  it('returns submitted, completed and not submitted customers for the selected month', async () => {
    const { service } = fixture();
    const result = await service.listSalaryWorkbench('2026-09', { sub: 'u', username: 'admin', roles: ['admin'], businessScope: BusinessScope.BEILUN });
    expect(result.summary).toEqual({ total: 2, submitted: 1, notSubmitted: 1, received: 0, completed: 1 });
    expect(result.list[0]).toMatchObject({ customerId: customerA.id, status: 'completed', completionEmailStatus: 'pending', attachmentCount: 2 });
    expect(result.list[0].attachments.map((file) => file.fileName)).toEqual(['工资变动.xlsx', '办结结果.xlsx']);
    expect(result.list[1]).toMatchObject({ customerId: customerB.id, status: 'not_submitted', submissionId: null, attachmentCount: 0 });
  });
  it('lists salary returns with attachments and email statuses', async () => {
    const { service } = fixture();
    const result = await service.listSalaryReturns({ month: '2026-09' }, { sub: 'u', username: 'admin', roles: ['admin'], businessScope: BusinessScope.BEILUN });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ customerId: customerA.id, requestNo: 'SAL-202609-A', status: 'completed', resultNote: '已核对' });
    expect(result.items[0].attachments.map((file: { fileName: string }) => file.fileName)).toEqual(['工资变动.xlsx', '办结结果.xlsx']);
    expect(result.items[0].submissionAttachments.map((file: { fileName: string }) => file.fileName)).toEqual(['工资变动.xlsx']);
    expect(result.items[0].completionAttachments.map((file: { fileName: string }) => file.fileName)).toEqual(['办结结果.xlsx']);
    expect(result.items[0].attachmentEmail).toMatchObject({ status: 'sent' });
    expect(result.items[0].completionEmail).toMatchObject({ status: 'pending' });
  });

  it('limits salary returns for ordinary business users to assigned customers', async () => {
    const { service, customers } = fixture();
    const result = await service.listSalaryReturns({}, { sub: 'salesperson-1', username: '业务员', roles: ['business_group_member'], businessScope: BusinessScope.BEILUN });
    expect(customers.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: expect.anything(), businessScope: BusinessScope.BEILUN, isActive: true }) }));
    expect(result.total).toBe(1);
    expect(result.items[0].customerId).toBe(customerA.id);
  });
  it('rejects an invalid month before querying customer data', async () => {
    const { service, customers } = fixture();
    await expect(service.listSalaryWorkbench('2026-13', { sub: 'u', username: 'admin', roles: ['admin'], businessScope: BusinessScope.BEILUN })).rejects.toThrow('YYYY-MM');
    expect(customers.find).not.toHaveBeenCalled();
  });
});
