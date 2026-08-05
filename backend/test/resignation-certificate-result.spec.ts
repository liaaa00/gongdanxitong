import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';
import { InServiceOrderKind, InServiceOrderStatus, WorkOrder } from 'src/entities';

describe('resignation certificate result writeback', () => {
  it('writes HR result back to the source resignation work order', async () => {
    const source = Object.assign(new WorkOrder(), {
      id: 'source-1',
      extraData: { need_resignation_cert: '是', resignation_cert_attachments: ['old.pdf'] },
    });
    const order = {
      id: 'certificate-1',
      orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      status: InServiceOrderStatus.PROCESSING,
      handlerId: 'hr-1',
      extraData: { source_work_order_id: source.id },
      attachments: [],
      completionRemark: null,
      completedAt: null,
    } as any;
    const repository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn().mockImplementation(async (value) => value),
    } as any;
    const workOrderRepository = {
      findOne: jest.fn().mockResolvedValue(source),
      save: jest.fn().mockImplementation(async (value) => value),
    } as any;
    const handlerPicker = {} as any;
    const exportTemplatesService = {} as any;
    const service = new InServiceOrdersService(
      repository,
      handlerPicker,
      exportTemplatesService,
      workOrderRepository,
    );

    await service.complete(
      'certificate-1',
      { remark: '已上传盖章离职证明', attachments: ['signed.pdf'] },
      { sub: 'hr-1', username: 'hr', roles: [] },
    );

    expect(workOrderRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({
        resignation_cert_status: '已开具',
        resignation_cert_result: '已上传盖章离职证明',
        resignation_cert_attachments: ['old.pdf', 'signed.pdf'],
        resignation_cert_completed_at: expect.any(String),
      }),
    }));
  });
});
