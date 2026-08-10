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
  WorkOrderStatus,
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
import { InServiceCancelAction } from 'src/modules/in-service-orders/dto/in-service-order-action.dto';
import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';
import { WorkflowDefinition, WorkflowDefinitionStatus } from 'src/modules/workflows/workflow.entity';

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

function makeService(
  initial = makeOrder(),
  mappedHandler: string | null = 'handler-1',
  workflow?: Partial<WorkflowDefinition>,
) {
  let current = initial;
  const repository = {
    create: jest.fn((input: Partial<InServiceOrder>) => Object.assign(makeOrder(), input)),
    save: jest.fn(async (input: InServiceOrder) => {
      current = input;
      return input;
    }),
    findOne: jest.fn(async () => current),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    softRemove: jest.fn(async (input: InServiceOrder) => input),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<InServiceOrder>;
  const workOrderRepository = {
    find: jest.fn(async () => []),
  } as unknown as Repository<import('src/entities').WorkOrder>;
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
  const workflowRepository = {
    findOne: jest.fn(async () => workflow ?? null),
  } as unknown as Repository<WorkflowDefinition>;
  return {
    service: new InServiceOrdersService(repository, workOrderRepository, picker, exporter, workflowRepository),
    picker: picker as unknown as { pick: jest.Mock },
    exporter: exporter as unknown as { exportContractRenewal: jest.Mock },
    repository: repository as unknown as {
      count: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
      find: jest.Mock;
    },
    workOrderRepository: workOrderRepository as unknown as { find: jest.Mock },
    workflowRepository: workflowRepository as unknown as { findOne: jest.Mock },
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

describe('renewal closure actions', () => {
  it.each([
    InServiceCancelAction.WITHDRAW,
    InServiceCancelAction.VOID,
  ])('records %s while reusing the existing cancelled terminal state', async (action) => {
    const order = Object.assign(makeOrder(InServiceOrderStatus.DISPATCHED), {
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
    });
    const { service, current } = makeService(order);

    await service.cancel(order.id, { reason: '业务员操作', action }, creator);

    expect(current().status).toBe(InServiceOrderStatus.CANCELLED);
    expect(current().closeReason).toBe('业务员操作');
    expect(current().extraData).toMatchObject({ __closureAction: action });
    expect(current().extraData.__closureAt).toEqual(expect.any(String));
  });
});

describe('published in-service flow runtime contract', () => {
  it('rejects an action allowed only by the unpublished editing draft', async () => {
    const workflow = {
      flowKey: 'single_business',
      businessScope: BusinessScope.BEILUN,
      status: WorkflowDefinitionStatus.PUBLISHED,
      definitionJson: {
        status_transitions: {
          [InServiceOrderStatus.DISPATCHED]: [InServiceOrderStatus.ACCEPTED],
        },
      },
      publishedDefinitionJson: {
        status_transitions: {
          [InServiceOrderStatus.DISPATCHED]: [],
        },
      },
    } as Partial<WorkflowDefinition>;
    const { service, repository } = makeService(makeOrder(), 'handler-1', workflow);

    await expect(service.accept(makeOrder().id, handler)).rejects.toThrow('不允许状态');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('uses the Beilun single-business workflow for out-of-province single business', async () => {
    const order = Object.assign(makeOrder(), { businessScope: BusinessScope.OUT_OF_PROVINCE });
    const { service, workflowRepository } = makeService(order);

    await service.accept(order.id, handler);

    expect(workflowRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        flowKey: 'single_business',
        businessScope: BusinessScope.BEILUN,
        status: WorkflowDefinitionStatus.PUBLISHED,
      }),
    }));
  });

  it('does not let a legacy renewal workflow snapshot override the Beilun contract-child flow', async () => {
    const order = Object.assign(makeOrder(), { orderKind: InServiceOrderKind.CONTRACT_RENEWAL });
    const { service, current, workflowRepository } = makeService(order, 'handler-1', {
      flowKey: 'contract_renewal',
      businessScope: BusinessScope.BEILUN,
      status: WorkflowDefinitionStatus.PUBLISHED,
      publishedDefinitionJson: {
        status_transitions: {
          [InServiceOrderStatus.DISPATCHED]: [],
        },
      },
    });

    await service.accept(order.id, handler);

    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(workflowRepository.findOne).not.toHaveBeenCalled();
  });
});

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
      BusinessScope.BEILUN,
    );
  });

  it('starts certificate issuing directly without the generic initial-review states', async () => {
    const certificate = makeOrder();
    certificate.orderKind = InServiceOrderKind.CERTIFICATE;
    certificate.employeeName = '张三';
    certificate.idCardNo = '330206199001011234';
    certificate.extraData = { certificateType: 'employment' };
    const { service, current } = makeService(certificate);

    await service.accept(current().id, handler);

    expect(current().status).toBe(InServiceOrderStatus.PROCESSING);
    expect(current().acceptedAt).toBeInstanceOf(Date);
    expect(current().processingAt).toEqual(current().acceptedAt);
  });

  it('returns initial-review supplement to the accepted handler', async () => {
    const { service, current } = makeService(makeOrder());
    await service.accept(current().id, handler);
    await service.requestInfo(current().id, { reason: '缺少身份证复印件' }, handler);

    expect(current().status).toBe(InServiceOrderStatus.PENDING_INFO);
    expect(current().pendingReturnStatus).toBe(InServiceOrderStatus.ACCEPTED);

    await service.resubmit(current().id, { attachments: ['attachment-1'], resubmitReason: '补齐身份证附件' }, creator);
    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(current().handlerId).toBe('handler-1');
    expect(current().extraData.__resubmitHistory).toEqual([
      expect.objectContaining({ reason: '补齐身份证附件', submittedBy: creator.sub }),
    ]);
  });

  it('requires a reason when resubmitting an in-service order', async () => {
    const { service, current } = makeService(makeOrder(InServiceOrderStatus.PENDING_INFO));
    await expect(service.resubmit(current().id, {}, creator)).rejects.toThrow('重新提交原因不能为空');
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

    await service.resubmit(current().id, { resubmitReason: '补齐盖章材料' }, creator);
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
        base_salary: 12000,
      },
    }, creator);

    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.RENEWAL_CONTRACT,
    );
  });

  it('loads local onboarding and renewal history and flags the open-ended contract risk', async () => {
    const { service, workOrderRepository, repository } = makeService();
    workOrderRepository.find.mockResolvedValue([{
      id: 'onboarding-1',
      orderNo: 'WO-1',
      status: WorkOrderStatus.COMPLETED,
      employeeName: '张三',
      employeeIdCard: '330206199001011234',
      extraData: { contract_term_type: '固定期限', position: '顾问' },
      createdAt: new Date('2026-01-01'),
    }]);
    repository.find.mockResolvedValue([{
      id: 'renewal-1',
      orderNo: 'RN-1',
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: { contract_term_type: '固定期限', base_salary: 12000 },
      createdAt: new Date('2026-06-01'),
    }]);

    await expect(service.getRenewalHistory(
      '22222222-2222-4222-8222-222222222222',
      '330206199001011234',
    )).resolves.toMatchObject({
      found: true,
      source: 'renewal',
      orderNo: 'RN-1',
      employeeName: '张三',
      fixedTermCount: 2,
      fixedTermRisk: true,
      warning: expect.stringContaining('无固定期限'),
    });
  });

  it('rejects a renewal salary below the latest local contract salary', async () => {
    const { service, workOrderRepository } = makeService();
    workOrderRepository.find.mockResolvedValue([{
      id: 'onboarding-salary-1',
      orderNo: 'WO-SALARY-1',
      status: WorkOrderStatus.COMPLETED,
      employeeName: '张三',
      employeeIdCard: '330206199001011234',
      extraData: { contract_term_type: '固定期限', base_salary: '￥12000' },
      createdAt: new Date('2026-01-01'),
    }]);

    await expect(service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        contract_term_type: '固定期限',
        contract_start_date: '2026-08-01',
        contract_end_date: '2028-07-31',
        base_salary: 10000,
      },
    }, creator)).resolves.toEqual(expect.objectContaining({ orderKind: InServiceOrderKind.CONTRACT_RENEWAL }));
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
        base_salary: 12000,
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

  it('generates the formal resignation certificate from the child order and latest contract history', async () => {
    const order = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), {
      orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: {
        resignationDate: '2026-08-06',
        resignationReason: '个人原因',
      },
    });
    const { service, workOrderRepository } = makeService(order);
    workOrderRepository.find.mockResolvedValue([{
      id: 'onboarding-1',
      orderNo: 'ON20230101001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
      customerId: order.customerId,
      employeeName: order.employeeName,
      employeeIdCard: order.idCardNo,
      extraData: {
        position: '招商主管',
        contract_start_date: '2023-01-01',
        contract_end_date: '2026-07-31',
      },
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
    }]);

    const result = await service.generateCertificate(order.id, handler);
    const zip = await JSZip.loadAsync(result.buffer);
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(result.fileName).toBe(`resignation-certificate-${order.orderNo}.docx`);
    expect(xml).toContain('解除（或终止）劳动合同证明书');
    expect(xml).toContain('张三');
    expect(xml).toContain('男');
    expect(xml).toContain('330206199001011234');
    expect(xml).toContain('招商主管');
    expect(xml).toContain('2023-01-01');
    expect(xml).toContain('2026-07-31');
    expect(xml).toContain('2026-08-06');
    expect(xml).toContain('<w:t>2</w:t>');
    expect(xml).not.toContain('{{');
  });

  it('rejects direct resignation certificate creation because it belongs to the resignation parent work order', async () => {
    const { service, picker } = makeService();
    await expect(service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: { resignationDate: '2026-07-31' },
    }, creator)).rejects.toThrow('离职证明必须从离职管理的离职证明子工单办理');

    expect(picker.pick).not.toHaveBeenCalled();
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
        insured_unit: '南京一盘',
        social_pay_region: '江苏/南京市',
        start_month: '2026-08',
        social_base: 12000,
        fund_start_month: '2026-08',
        fund_base: 12000,
      },
    }, creator);

    expect(current().businessScope).toBe(BusinessScope.OUT_OF_PROVINCE);
    expect(picker.pick).toHaveBeenCalledWith(
      DispatchStrategy.FIXED,
      DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
      undefined,
      { province: '江苏', mappingSource: 'sheet5' },
      BusinessScope.OUT_OF_PROVINCE,
    );
  });


  it('rejects out-of-province increase when fund start fields are missing', async () => {
    const { service, picker } = makeService();
    await expect(service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      province: '江苏',
      city: '南京市',
      extraData: {
        insured_unit: '南京一盘',
        social_pay_region: '江苏/南京市',
        start_month: '2026-08',
        social_base: 12000,
        fund_base: 12000,
      },
    }, creator)).rejects.toThrow('省外增员需填写社保、公积金起缴月和缴费工资');

    expect(picker.pick).not.toHaveBeenCalled();
  });

  it('rejects out-of-province decrease when fund stop month is missing', async () => {
    const { service, picker } = makeService();
    await expect(service.create({
      customerId: createDto.customerId,
      departmentId: createDto.departmentId,
      orderKind: InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      province: '江苏',
      city: '南京市',
      extraData: {
        insured_unit: '南京一盘',
        social_pay_region: '江苏/南京市',
        social_stop_month: '2026-08',
        last_work_date: '2026-08-08',
      },
    }, creator)).rejects.toThrow('省外减员需填写社保停缴月、公积金停缴月和最后工作日');

    expect(picker.pick).not.toHaveBeenCalled();
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

  it('accepts and completes contract renewal like the Beilun contract child order', async () => {
    const order = Object.assign(makeOrder(), { orderKind: InServiceOrderKind.CONTRACT_RENEWAL });
    const { service, current } = makeService(order);

    await service.accept(order.id, handler);
    expect(current().status).toBe(InServiceOrderStatus.ACCEPTED);
    await expect(service.confirm(order.id, handler)).rejects.toThrow();
    await expect(service.startProcessing(
      order.id,
      { handleChannel: InServiceHandleChannel.ONLINE },
      handler,
    )).rejects.toThrow();

    await service.complete(order.id, { remark: '已完成' }, handler);
    expect(current().status).toBe(InServiceOrderStatus.COMPLETED);
  });

  it.each([
    InServiceOrderKind.CONTRACT_RENEWAL,
    InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
    InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
  ])('allows %s to return before acceptance and forbids transfer', async (orderKind) => {
    const pending = Object.assign(makeOrder(), { orderKind });
    const pendingService = makeService(pending);

    await pendingService.service.requestInfo(pending.id, { reason: '资料需要补充' }, handler);
    expect(pendingService.current().status).toBe(InServiceOrderStatus.PENDING_INFO);
    expect(pendingService.current().pendingReturnStatus).toBe(InServiceOrderStatus.DISPATCHED);

    const accepted = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), { orderKind });
    const acceptedService = makeService(accepted);
    await expect(acceptedService.service.transfer(
      accepted.id,
      { handlerId: '44444444-4444-4444-8444-444444444444', reason: '不应允许转派' },
      handler,
    )).rejects.toThrow('不支持转派');
  });

  it.each([
    InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
    InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
  ])('completes %s only after all Beilun social-fund feedback items are finished', async (orderKind) => {
    const incomplete = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), { orderKind });
    const incompleteService = makeService(incomplete);
    await incompleteService.service.complete(
      incomplete.id,
      { extraData: { social_insurance_result: '是', medical_insurance_result: '否' } },
      handler,
    );
    expect(incompleteService.current().status).toBe(InServiceOrderStatus.ACCEPTED);
    expect(incompleteService.current().extraData).toMatchObject({
      social_insurance_result: '是',
      medical_insurance_result: '否',
    });

    const complete = Object.assign(makeOrder(InServiceOrderStatus.ACCEPTED), { orderKind });
    const completeService = makeService(complete);
    await completeService.service.complete(
      complete.id,
      {
        remark: '已完成',
        extraData: {
          social_insurance_result: '是',
          medical_insurance_result: '是',
          housing_fund_result: '是',
          social_insurance_remark: '均已办理',
        },
      },
      handler,
    );
    expect(completeService.current().status).toBe(InServiceOrderStatus.COMPLETED);
    expect(completeService.current().extraData).toMatchObject({
      social_insurance_result: '是',
      medical_insurance_result: '是',
      housing_fund_result: '是',
      social_insurance_remark: '均已办理',
    });
  });

  it('opens and completes certificates without single-business review or failure actions', async () => {
    const order = Object.assign(makeOrder(), {
      orderKind: InServiceOrderKind.CERTIFICATE,
      employeeName: '张三',
      idCardNo: '330206199001011234',
      extraData: { certificateType: 'employment' },
    });
    const { service, current } = makeService(order);

    await service.accept(order.id, handler);
    expect(current().status).toBe(InServiceOrderStatus.PROCESSING);
    await expect(service.fail(order.id, { remark: '不应提供失败动作' }, handler)).rejects.toThrow();

    await service.complete(order.id, { remark: '已开具' }, handler);
    expect(current().status).toBe(InServiceOrderStatus.COMPLETED);
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
