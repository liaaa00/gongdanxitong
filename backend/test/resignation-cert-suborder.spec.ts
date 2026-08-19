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

  it('downloads a legacy free-text reason without requiring a legal article', async () => {
    const parentOrder = Object.assign(new WorkOrder(), {
      id: 'legacy-work-order',
      orderNo: 'RS20260809001',
      orderType: OrderType.RESIGNATION,
      status: WorkOrderStatus.PROCESSING,
      employeeName: '张三',
      employeeIdCard: '330206199001019999',
      extraData: {
        resignation_reason: '公司经营调整',
        resignation_date: '2026-08-09',
      },
    });
    const order = Object.assign(new DispatchedOrder(), {
      id: 'legacy-certificate',
      parentOrderId: parentOrder.id,
      parentOrder,
      moduleCode: DispatchModuleCode.RESIGNATION_CERT,
      status: DispatchedOrderStatus.PROCESSING,
    });
    const service = new (await import('src/modules/dispatched-orders/dispatched-order.service')).DispatchedOrderService(
      {} as never,
      {} as never,
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
    jest.spyOn(service as never, 'loadLatestEmploymentData' as never).mockResolvedValue({} as never);

    const result = await (service as any).createResignationCertificateDocument(order);

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.replacements).toMatchObject({
      resignationReasonCode: '4',
      otherReason: '公司经营调整',
      legalArticleText: '相关规定',
    });
  });

  it('accepts a resignation certificate order without silent-sign parameters', async () => {
    const parentOrder = Object.assign(new WorkOrder(), {
      id: 'work-order-accept',
      orderType: OrderType.RESIGNATION,
      status: WorkOrderStatus.PROCESSING,
      extraData: { need_resignation_share: '否' },
    });
    const order = Object.assign(new DispatchedOrder(), {
      id: 'dispatched-accept',
      parentOrderId: parentOrder.id,
      parentOrder,
      moduleCode: DispatchModuleCode.RESIGNATION_CERT,
      status: DispatchedOrderStatus.PENDING,
      handlerId: 'handler-1',
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
    const repository = {
      findOne: jest.fn(async () => order),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    const service = new (await import('src/modules/dispatched-orders/dispatched-order.service')).DispatchedOrderService(
      repository as never,
      { save: jest.fn() } as never,
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
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: order.id } as never);
    jest.spyOn(service as never, 'writeLog' as never).mockResolvedValue(undefined as never);

    await expect(service.accept(
      order.id,
      { signPlatform: '历史参数', templateName: '历史模板' } as never,
      { sub: 'handler-1', username: 'yangchun', roles: ['labor_contract_member'] },
    )).resolves.toEqual({ id: order.id });
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
    }));
  });

  it('does not add a signed-file requirement to the generated certificate result', () => {
    const patch = buildResignationCertificateResultPatch(
      DispatchModuleCode.RESIGNATION_CERT,
      new Date('2026-08-07T10:00:00.000Z'),
      '已开具',
    );

    expect(patch).toEqual(expect.objectContaining({
      resignation_cert_status: '已开具',
      resignation_cert_result: '已开具',
    }));
    expect(patch).not.toHaveProperty('resignation_cert_file_id');
    expect(patch).not.toHaveProperty('resignation_cert_file_name');
  });

  it('completes without a signed attachment and generates the certificate for export', async () => {
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
      find: jest.fn(async () => []),
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

    expect(uploadsService.save).not.toHaveBeenCalled();
    expect(attachmentRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workOrderId: parentOrder.id,
        dispatchedOrderId: order.id,
        bizPurpose: 'resignation_cert',
      }),
    }));
    expect(attachmentRepository.save).not.toHaveBeenCalled();
    expect(workOrderTransactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      extraData: expect.objectContaining({
        resignation_cert_status: '已开具',
        resignation_cert_result: '已核对并开具',
        resignation_reason_code: '4',
        resignation_other_reason: '公司经营调整',
        resignation_legal_article: '40',
      }),
    }));
    expect(workOrderTransactionRepository.save.mock.calls[0][0].extraData).not.toHaveProperty('resignation_cert_file_id');
  });
});
