import * as JSZip from 'jszip';
import {
  DispatchModuleCode,
  DispatchStrategy,
  DispatchedOrder,
  DispatchedOrderStatus,
  InServiceOrder,
  OrderAttachment,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { seedDispatchRules } from 'src/database/seeds/seed-dispatch-rules';
import {
  buildResignationCertificateResultPatch,
  canStartResignationCertificate,
} from 'src/modules/dispatched-orders/dispatched-order.service';
import {
  buildResignationCertificateReplacements,
} from 'src/modules/dispatched-orders/resignation-certificate';

describe('离职证明子工单', () => {
  it('only writes the certificate result back when the resignation certificate child completes', () => {
    const completedAt = new Date('2026-08-06T10:00:00.000Z');

    expect(buildResignationCertificateResultPatch(
      DispatchModuleCode.RESIGNATION_CERT,
      completedAt,
      '已上传正式离职证明',
    )).toEqual({
      resignation_cert_status: '已开具',
      resignation_cert_result: '已上传正式离职证明',
      resignation_cert_completed_at: '2026-08-06T10:00:00.000Z',
    });

    expect(buildResignationCertificateResultPatch(
      DispatchModuleCode.RESIGNATION_CONTACT,
      completedAt,
      '材料已收齐',
    )).toEqual({});
  });

  it('waits for material collection only when the resignation requires it', () => {
    expect(canStartResignationCertificate(
      DispatchModuleCode.RESIGNATION_CERT,
      { need_resignation_share: '否' },
      null,
    )).toBe(true);
    expect(canStartResignationCertificate(
      DispatchModuleCode.RESIGNATION_CERT,
      { need_resignation_share: '是' },
      DispatchedOrderStatus.PROCESSING,
    )).toBe(false);
    expect(canStartResignationCertificate(
      DispatchModuleCode.RESIGNATION_CERT,
      { need_resignation_share: '是' },
      DispatchedOrderStatus.COMPLETED,
    )).toBe(true);
    expect(canStartResignationCertificate(
      DispatchModuleCode.RESIGNATION_CONTACT,
      { need_resignation_share: '是' },
      null,
    )).toBe(true);
  });

  it('updates the canonical rule and disables obsolete unconditional certificate rules', async () => {
    const canonical = {
      ruleName: 'resignation-certificate-when-needed',
      orderType: OrderType.RESIGNATION,
      triggerConditions: null,
      targetModule: DispatchModuleCode.RESIGNATION_CERT,
      dispatchStrategy: DispatchStrategy.FIXED,
      priority: 99,
      isActive: false,
    };
    const legacy = {
      ruleName: 'resignation-default-certificate',
      orderType: OrderType.RESIGNATION,
      triggerConditions: null,
      targetModule: DispatchModuleCode.RESIGNATION_CERT,
      dispatchStrategy: DispatchStrategy.FIXED,
      priority: 10,
      isActive: true,
    };
    const repository = {
      findOne: jest.fn(async ({ where }: { where: { ruleName: string } }) => (
        where.ruleName === canonical.ruleName ? canonical : null
      )),
      find: jest.fn(async () => [canonical, legacy]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };

    await seedDispatchRules({
      getRepository: jest.fn(() => repository),
    } as never);

    expect(canonical).toMatchObject({
      triggerConditions: {
        op: 'AND',
        children: [{ field: 'need_resignation_cert', op: 'EQ', value: '是' }],
      },
      priority: 20,
      isActive: true,
    });
    expect(legacy.isActive).toBe(false);
  });

  it('seeds the resignation certificate as a child module instead of an independent order', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const seed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-dispatch-rules.ts'), 'utf8');

    expect(seed).toContain("name: 'resignation-certificate-when-needed'");
    expect(seed).toContain("targetModule: 'resignation_cert'");
    expect(seed).toContain("triggerConditions: yesCondition('need_resignation_cert')");
  });

  it('renders an indefinite contract and the selected fourth reason without broken placeholders', () => {
    const replacements = buildResignationCertificateReplacements({
      employeeName: '张三',
      idCardNo: '330206199001019999',
      historyData: {
        renewal_term_type: '无固定期限',
        renewal_start_date: '2025-01-01',
        renewal_position: '客户经理',
      },
      extraData: {
        resignation_reason_code: '4',
        resignation_other_reason: '公司经营调整',
        resignation_legal_article: '40',
        resignation_date: '2026-08-07',
      },
    });

    expect(replacements).toMatchObject({
      employeeName: '张三',
      gender: '男',
      jobTitle: '客户经理',
      contractTermText: '劳动合同期限自2025-01-01起为无固定期限',
      resignationReasonCode: '4',
      otherReason: '公司经营调整',
      legalArticleText: '第40条',
    });
  });

  it('generates and persists the formal DOCX when the certificate child completes', async () => {
    const parentOrder = Object.assign(new WorkOrder(), {
      id: 'work-order-1',
      orderNo: 'RS20260807001',
      orderType: OrderType.RESIGNATION,
      status: WorkOrderStatus.PROCESSING,
      customerId: 'customer-1',
      employeeName: '张三',
      employeeIdCard: '330206199001019999',
      extraData: {
        need_resignation_cert: '是',
        need_resignation_share: '否',
        resignation_date: '2026-08-07',
        resignation_reason: '公司经营调整',
      },
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    });
    const order = Object.assign(new DispatchedOrder(), {
      id: 'dispatched-1',
      parentOrderId: parentOrder.id,
      parentOrder,
      moduleCode: DispatchModuleCode.RESIGNATION_CERT,
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
      acceptedAt: new Date('2026-08-07T01:00:00.000Z'),
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    });
    const updateBuilder = {
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn(async () => ({ affected: 1 })),
    };
    [updateBuilder.update, updateBuilder.set, updateBuilder.where, updateBuilder.andWhere]
      .forEach((method) => method.mockReturnValue(updateBuilder));
    const attachmentRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const workOrderTransactionRepository = {
      save: jest.fn(async (value) => value),
    };
    const renewalRepository = {
      find: jest.fn(async () => [Object.assign(new InServiceOrder(), {
        customerId: 'customer-1',
        idCardNo: parentOrder.employeeIdCard,
        extraData: {
          renewal_term_type: '无固定期限',
          renewal_start_date: '2025-01-01',
          renewal_position: '客户经理',
        },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })]),
    };
    const transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === DispatchedOrder) return { createQueryBuilder: jest.fn(() => updateBuilder) };
        if (entity === WorkOrder) return workOrderTransactionRepository;
        if (entity === OrderAttachment) return attachmentRepository;
        if (entity === InServiceOrder) return renewalRepository;
        throw new Error('unexpected repository');
      }),
    };
    const dispatchedOrderRepository = {
      findOne: jest.fn(async () => order),
      manager: {
        getRepository: transactionManager.getRepository,
        transaction: jest.fn(async (callback) => callback(transactionManager)),
      },
    };
    const workOrderRepository = {
      find: jest.fn(async () => []),
    };
    const service = new (await import('src/modules/dispatched-orders/dispatched-order.service')).DispatchedOrderService(
      dispatchedOrderRepository as never,
      workOrderRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const uploadsService = {
      save: jest.fn(async (input) => ({
        fileId: 'file-1',
        fileName: 'stored.docx',
        originalName: input.originalName,
        mimeType: input.mimeType,
        filePath: 'attachments/stored.docx',
        size: input.buffer.length,
        kind: 'attachment',
        ownerId: input.ownerId,
      })),
    };
    Object.defineProperty(service, 'uploadsService', { value: uploadsService });
    jest.spyOn(service as never, 'assertCanHandle' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'checkMainOrderComplete' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'markTodoNotificationsReadForDispatchedOrder' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'writeLog' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: order.id } as never);

    await service.complete(
      order.id,
      {
        remark: '已核对并开具',
        extraData: {
          resignation_reason_code: '4',
          resignation_other_reason: '公司经营调整',
          resignation_legal_article: '40',
        },
      },
      { sub: 'handler-1', username: 'yangchun', roles: ['labor_contract_member'] },
    );

    expect(uploadsService.save).toHaveBeenCalledTimes(1);
    const uploadedBuffer = uploadsService.save.mock.calls[0][0].buffer as Buffer;
    const zip = await JSZip.loadAsync(uploadedBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('劳动合同期限自2025-01-01起为无固定期限');
    expect(documentXml).toContain('公司经营调整');
    expect(documentXml).not.toContain('{{');

    expect(attachmentRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: parentOrder.id,
      dispatchedOrderId: order.id,
      bizPurpose: 'resignation_certificate',
      fileId: 'file-1',
      status: 'generated',
    }));
    expect(workOrderTransactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({
        resignation_cert_status: '已开具',
        resignation_cert_file_id: 'file-1',
        resignation_cert_attachments: ['file-1'],
        resignation_reason_code: '4',
        resignation_other_reason: '公司经营调整',
      }),
    }));
  });
});
