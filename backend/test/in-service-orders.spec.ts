import * as JSZip from 'jszip';
import { Repository } from 'typeorm';
import {
  BusinessScope,
  BusinessType,
  DispatchModuleCode,
  DispatchStrategy,
  IN_SERVICE_BUSINESS_TYPE_MAPPING,
  IN_SERVICE_PROCESS_TYPE_MAPPING,
  InServiceHandleChannel,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  OrderType,
  ProcessType,
  RequirementType,
} from 'src/entities';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import {
  IN_SERVICE_ORDER_STATUS_TRANSITIONS,
  assertInServiceOrderTransition,
} from 'src/modules/dispatched-orders/dispatched-order.service';
import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';

const creator = { sub: 'creator-1', username: 'creator', roles: ['biz_member'] } as JwtUserPayload;
const handler = { sub: 'handler-1', username: 'handler', roles: [] } as JwtUserPayload;

function makeOrder(status = InServiceOrderStatus.DISPATCHED): InServiceOrder {
  return Object.assign(new InServiceOrder(), {
    id: '11111111-1111-4111-8111-111111111111',
    orderNo: 'IS-20260729-TEST',
    orderType: OrderType.IN_SERVICE,
    orderKind: InServiceOrderKind.SINGLE_BUSINESS,
    businessScope: BusinessScope.BEILUN,
    employeeName: null,
    idCardNo: null,
    extraData: {},
    customerId: '22222222-2222-4222-8222-222222222222',
    departmentId: '33333333-3333-4333-8333-333333333333',
    expectedCompletionDate: '2026-08-05',
    businessReason: '社保补缴',
    businessType: BusinessType.REGISTRATION,
    processType: ProcessType.SUPPLEMENTARY_PAYMENT,
    requirementType: RequirementType.UNPAID_SUPPLEMENT,
    province: '江苏',
    city: '南京市',
    district: '建邺区',
    contactPhone: null,
    businessDescription: '补缴 2026 年 6 月社保',
    serviceFee: 100,
    handleChannel: InServiceHandleChannel.ONLINE,
    attachments: [],
    status,
    pendingReturnStatus: null,
    transferHistory: [],
    handlerId: 'handler-1',
    createdBy: 'creator-1',
    approvedBy: null,
    rejectedBy: null,
    closedBy: null,
    rejectionReason: null,
    pendingInfoReason: null,
    completionRemark: null,
    closeReason: null,
    approvedAt: null,
    rejectedAt: null,
    dispatchedAt: new Date(),
    acceptedAt: null,
    confirmedAt: null,
    processingAt: null,
    pendingInfoAt: null,
    completedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    version: 1,
  });
}

function makeService(initial = makeOrder(), mappedHandler: string | null = 'handler-1') {
  let current = initial;
  const repository = {
    create: jest.fn((input: Partial<InServiceOrder>) => Object.assign(makeOrder(), input)),
    save: jest.fn(async (input: InServiceOrder) => {
      current = input;
      return input;
    }),
    findOne: jest.fn(async () => current),
    count: jest.fn(async () => 0),
    softRemove: jest.fn(async (input: InServiceOrder) => input),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<InServiceOrder>;
  const picker = {
    pick: jest.fn(async () => mappedHandler),
  } as unknown as HandlerPickerService;
  const exporter = {
    exportContractRenewal: jest.fn(async () => ({
      templateId: 'renewal-template',
      templateName: '劳动合同续签模板',
      moduleCode: 'contract',
      columns: [],
      rows: [],
      rowCount: 1,
    })),
  } as unknown as ExportTemplatesService;
  return {
    service: new InServiceOrdersService(repository, picker, exporter),
    picker: picker as unknown as { pick: jest.Mock },
    exporter: exporter as unknown as { exportContractRenewal: jest.Mock },
    repository: repository as unknown as {
      count: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    },
    current: () => current,
  };
}

const createDto = {
  customerId: '22222222-2222-4222-8222-222222222222',
  departmentId: '33333333-3333-4333-8333-333333333333',
  expectedCompletionDate: '2026-08-05',
  businessReason: '社保补缴',
  businessType: BusinessType.REGISTRATION,
  processType: ProcessType.SUPPLEMENTARY_PAYMENT,
  requirementType: RequirementType.UNPAID_SUPPLEMENT,
  province: '江苏',
  city: '南京市',
  district: '建邺区',
  businessDescription: '补缴 2026 年 6 月社保',
  serviceFee: 100,
};

describe('single-business category contract', () => {
  it('matches the Excel 4/19/6 category tree and allows empty level 3', () => {
    expect(Object.values(BusinessType)).toHaveLength(4);
    expect(Object.values(ProcessType)).toHaveLength(19);
    expect(Object.values(RequirementType)).toHaveLength(6);
    expect(IN_SERVICE_BUSINESS_TYPE_MAPPING[BusinessType.REGISTRATION]).toHaveLength(6);
    expect(IN_SERVICE_PROCESS_TYPE_MAPPING[ProcessType.ENTERPRISE_ACCOUNT]).toEqual([]);
    expect(IN_SERVICE_PROCESS_TYPE_MAPPING[ProcessType.SUPPLEMENTARY_PAYMENT]).toEqual([
      RequirementType.UNPAID_SUPPLEMENT,
      RequirementType.BASE_DIFFERENCE_SUPPLEMENT,
    ]);
  });
});

describe('single-business state machine', () => {
  it('covers acceptance, both supplement loops and terminal outcomes', () => {
    expect(IN_SERVICE_ORDER_STATUS_TRANSITIONS[InServiceOrderStatus.DISPATCHED])
      .toContain(InServiceOrderStatus.ACCEPTED);
    expect(IN_SERVICE_ORDER_STATUS_TRANSITIONS[InServiceOrderStatus.ACCEPTED])
      .toEqual(expect.arrayContaining([
        InServiceOrderStatus.READY,
        InServiceOrderStatus.PENDING_INFO,
        InServiceOrderStatus.DISPATCHED,
      ]));
    expect(IN_SERVICE_ORDER_STATUS_TRANSITIONS[InServiceOrderStatus.PENDING_INFO])
      .toEqual(expect.arrayContaining([
        InServiceOrderStatus.DISPATCHED,
        InServiceOrderStatus.ACCEPTED,
        InServiceOrderStatus.PROCESSING,
      ]));
    expect(IN_SERVICE_ORDER_STATUS_TRANSITIONS[InServiceOrderStatus.PROCESSING])
      .toEqual(expect.arrayContaining([
        InServiceOrderStatus.COMPLETED,
        InServiceOrderStatus.FAILED,
      ]));
  });

  it('rejects illegal transitions', () => {
    expect(() => assertInServiceOrderTransition(
      InServiceOrderStatus.DISPATCHED,
      InServiceOrderStatus.COMPLETED,
    )).toThrow('非法在职工单状态流转');
  });
});

describe('InServiceOrdersService', () => {
  it('creates and auto-dispatches directly to pending acceptance', async () => {
    const { service, picker } = makeService();
    const result = await service.create(createDto, creator);

    expect(result.status).toBe(InServiceOrderStatus.DISPATCHED);
    expect(result.handlerId).toBe('handler-1');
    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
      undefined,
      { province: '江苏', mappingSource: 'sheet4' },
    );
  });

  it('returns initial-review supplement to the accepted handler', async () => {
    const { service, current } = makeService(makeOrder());
    await service.accept(current().id, handler);
    await service.requestInfo(current().id, { reason: '缺少身份证复印件' }, handler);

    expect(current().status).toBe(InServiceOrderStatus.PENDING_INFO);
    expect(current().pendingReturnStatus).toBe(InServiceOrderStatus.ACCEPTED);

    await service.resubmit(current().id, { attachments: ['attachment-1'] }, creator);
    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(current().handlerId).toBe('handler-1');
  });

  it('returns processing supplement directly to processing', async () => {
    const order = makeOrder(InServiceOrderStatus.READY);
    const { service, current } = makeService(order);

    await service.startProcessing(
      current().id,
      { handleChannel: InServiceHandleChannel.OFFLINE },
      handler,
    );
    await service.requestInfo(current().id, { reason: '补充盖章材料' }, handler);
    expect(current().pendingReturnStatus).toBe(InServiceOrderStatus.PROCESSING);

    await service.resubmit(current().id, {}, creator);
    expect(current().status).toBe(InServiceOrderStatus.PROCESSING);
    expect(current().handleChannel).toBe(InServiceHandleChannel.OFFLINE);
  });

  it('transfers back to pending acceptance and records the change', async () => {
    const order = makeOrder(InServiceOrderStatus.ACCEPTED);
    const { service, current } = makeService(order);

    await service.transfer(
      current().id,
      { handlerId: '44444444-4444-4444-8444-444444444444', reason: '省份分派调整' },
      handler,
    );

    expect(current().status).toBe(InServiceOrderStatus.DISPATCHED);
    expect(current().handlerId).toBe('44444444-4444-4444-8444-444444444444');
    expect(current().transferHistory).toHaveLength(1);
  });

  it('supports success and failure terminal outcomes', async () => {
    const success = makeService(makeOrder(InServiceOrderStatus.PROCESSING));
    await success.service.complete(success.current().id, { remark: '办理完成' }, handler);
    expect(success.current().status).toBe(InServiceOrderStatus.COMPLETED);

    const failed = makeService(makeOrder(InServiceOrderStatus.PROCESSING));
    await failed.service.fail(failed.current().id, { remark: '政策不允许办理' }, handler);
    expect(failed.current().status).toBe(InServiceOrderStatus.FAILED);
  });

  it('routes contract renewal directly to the renewal handler pool', async () => {
    const { service, picker } = makeService();
    await service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        contractStartDate: '2026-08-01',
        contractEndDate: '2028-07-31',
      },
    }, creator);

    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.RENEWAL_CONTRACT,
    );
  });

  it('allows an open-ended renewal without a contract end date', async () => {
    const { service } = makeService();
    await expect(service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        contract_term_type: '无固定期限',
        contract_start_date: '2026-08-01',
      },
    }, creator)).resolves.toMatchObject({
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      status: InServiceOrderStatus.DISPATCHED,
    });
  });

  it('exports renewal from the direct order without creating main or child orders', async () => {
    const order = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), {
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      extraData: {
        esign_platform: '速创',
        contract_start_date: '2026-08-01',
        contract_end_date: '2028-07-31',
      },
    });
    const { service, exporter, repository } = makeService(order);

    await expect(service.exportRenewalTemplate(order.id, handler)).resolves.toMatchObject({
      moduleCode: 'contract',
      rowCount: 1,
    });
    expect(exporter.exportContractRenewal).toHaveBeenCalledWith(order, handler);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('routes supported certificates and keeps social-insurance certificates disabled', async () => {
    const employment = makeService();
    await employment.service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        certificateType: 'employment',
        hireDate: '2023-01-01',
        jobTitle: '招商主管',
        purpose: '购房',
      },
    }, creator);
    expect(employment.picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.IN_SERVICE_CERTIFICATE,
    );

    await expect(employment.service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        certificateType: 'social_insurance',
        hireDate: '2023-01-01',
        jobTitle: '招商主管',
        purpose: '办事',
      },
    }, creator)).rejects.toThrow('社保证明模板尚未配置');
  });

  it('generates a standard certificate DOCX with escaped template values', async () => {
    const order = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), {
      orderKind: InServiceOrderKind.CERTIFICATE,
      employeeName: '张<&三',
      idCardNo: '330206199001011234',
      extraData: {
        certificateType: 'employment',
        hireDate: '2023-01-01',
        jobTitle: '招商主管',
        purpose: '购房',
      },
    });
    const { service } = makeService(order);

    const result = await service.generateCertificate(order.id, handler);
    const zip = await JSZip.loadAsync(result.buffer);
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(result.fileName).toContain(order.orderNo);
    expect(xml).toContain('张&lt;&amp;三');
    expect(xml).toContain('330206199001011234');
    expect(xml).toContain('招商主管');
    expect(xml).not.toContain('{{');
  });

  it('routes resignation certificates independently from resignation main orders', async () => {
    const { service, picker } = makeService();
    await service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: { resignationDate: '2026-07-31' },
    }, creator);

    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.RESIGNATION_CERT,
    );
  });

  it('warns resignation for any injury application record regardless of status', async () => {
    const { service, repository } = makeService(makeOrder(InServiceOrderStatus.FAILED));
    repository.count.mockResolvedValue(1);

    await expect(service.getInjuryWarning('330206199001011234')).resolves.toEqual({
      hasInjuryRecord: true,
      message: '该员工存在工伤申请记录，减员时需同步办理一次性医疗补助金申请',
    });
    expect(repository.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        idCardNo: '330206199001011234',
        orderKind: InServiceOrderKind.SINGLE_BUSINESS,
        processType: expect.anything(),
      }),
    });
  });

  it('routes each out-of-province import row through the Sheet5 province mapping', async () => {
    const { service, picker, current } = makeService();
    await service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      province: '江苏',
      city: '南京市',
      extraData: {
        paymentInstitution: '南京一盘',
        contractStartDate: '2026-08-01',
        contractEndDate: '2028-07-31',
      },
    }, creator);

    expect(current().businessScope).toBe(BusinessScope.OUT_OF_PROVINCE);
    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      undefined,
      { province: '江苏', mappingSource: 'sheet5' },
    );
  });


  it('applies creator material changes only after the original handler approves', async () => {
    const order = makeOrder(InServiceOrderStatus.ACCEPTED);
    const { service, current } = makeService(order);

    await service.requestMaterialChange(
      order.id,
      {
        reason: '客户补充了办理说明',
        changes: {
          businessDescription: '更新后的办理说明',
          attachments: ['new-material'],
        },
      },
      creator,
    );

    expect(current().businessDescription).toBe('补缴 2026 年 6 月社保');
    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(current().extraData.__materialChangeRequest).toMatchObject({
      requestedBy: creator.sub,
      reason: '客户补充了办理说明',
    });
    await expect(service.confirm(order.id, handler)).rejects.toThrow('请先审批');

    await service.reviewMaterialChange(order.id, { approved: true }, handler);
    expect(current().businessDescription).toBe('更新后的办理说明');
    expect(current().attachments).toEqual(['new-material']);
    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(current().handlerId).toBe('handler-1');
    expect(current().extraData.__materialChangeRequest).toBeUndefined();
    expect(current().extraData.__materialChangeHistory).toHaveLength(1);
  });

  it('rejects a material change without altering processing data or handler', async () => {
    const order = makeOrder(InServiceOrderStatus.PROCESSING);
    const { service, current } = makeService(order);

    await service.requestMaterialChange(
      order.id,
      { changes: { businessDescription: '不应生效的内容' } },
      creator,
    );
    await service.reviewMaterialChange(
      order.id,
      { approved: false, reason: '材料内容不符合要求' },
      handler,
    );

    expect(current().businessDescription).toBe('补缴 2026 年 6 月社保');
    expect(current().status).toBe(InServiceOrderStatus.PROCESSING);
    expect(current().handlerId).toBe('handler-1');
    expect(current().extraData.__materialChangeHistory).toEqual([
      expect.objectContaining({ approved: false, reviewReason: '材料内容不符合要求' }),
    ]);
  });

  it('requires level 3 only when the selected level 2 has children', async () => {
    const { service } = makeService();
    await expect(service.create({
      ...createDto,
      processType: ProcessType.ENTERPRISE_ACCOUNT,
      requirementType: undefined,
    }, creator)).resolves.toMatchObject({ status: InServiceOrderStatus.DISPATCHED });

    await expect(service.create({
      ...createDto,
      requirementType: undefined,
    }, creator)).rejects.toThrow('请选择有效的三级分类');
  });
});
