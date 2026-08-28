import { DataSource, Repository } from 'typeorm';
import { BusinessScope, FieldConfig, FieldType, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { ContractSubjectsService } from 'src/modules/contract-subjects/contract-subjects.service';

function field(input: Partial<FieldConfig>): FieldConfig {
  return {
    id: input.id ?? input.fieldCode ?? 'id',
    fieldCode: input.fieldCode ?? 'employee_name',
    fieldName: input.fieldName ?? '姓名',
    fieldType: input.fieldType ?? FieldType.TEXT,
    isRequired: input.isRequired ?? false,
    defaultRequired: input.defaultRequired ?? false,
    conditionalRequired: input.conditionalRequired ?? null,
    validationRegex: input.validationRegex ?? null,
    validationMsg: input.validationMsg ?? null,
    dropdownOptions: input.dropdownOptions ?? null,
    collectionGroup: null,
    placeholder: null,
    helpText: null,
    orderType: input.orderType ?? OrderType.ONBOARDING,
    businessContext: input.businessContext ?? null,
    displayOrder: input.displayOrder ?? 1,
    isActive: true,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
  } as FieldConfig;
}

function makeWorkOrder(extraData: Record<string, unknown>): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'wo-1',
    orderNo: 'ON20260518001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.DRAFT,
    createdBy: 'user-1',
    departmentId: 'dep-1',
    customerId: 'customer-1',
    employeeName: String(extraData.employee_name ?? ''),
    employeeIdCard: String(extraData.id_card_no ?? ''),
    extraData,
    submittedAt: null,
    completedAt: null,
    lastModifiedAt: null,
    lastModifiedBy: null,
    modificationRound: 0,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    updatedAt: new Date('2026-05-18T00:00:00.000Z'),
  });
}

describe('WorkOrderValidationService submit validation', () => {
  const fields = [
    field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true }),
    field({ fieldCode: 'id_card_no', fieldName: '身份证号', isRequired: true, validationRegex: '^[0-9Xx]{15,18}$' }),
    field({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'] }),
    field({ fieldCode: 'contract_template', fieldName: '劳动合同模板', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
    field({ fieldCode: 'need_onboarding_contact', fieldName: '入职材料是否需要集约收集', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'] }),
    field({ fieldCode: 'current_address', fieldName: '现住地址', conditionalRequired: { field: 'need_onboarding_contact', op: 'EQ', value: '否' } }),
    field({ fieldCode: 'probation_start_date', fieldName: '试用期开始日期', fieldType: FieldType.DATE }),
    field({ fieldCode: 'probation_months', fieldName: '试用期（月）', conditionalRequired: { field: 'probation_start_date', op: 'EXISTS' } }),
    field({ fieldCode: 'probation_end_date', fieldName: '试用期结束日期', fieldType: FieldType.DATE, conditionalRequired: { field: 'probation_start_date', op: 'EXISTS' } }),
    field({ fieldCode: 'probation_salary', fieldName: '试用期工资', fieldType: FieldType.TEXT, conditionalRequired: { field: 'probation_start_date', op: 'EXISTS' } }),
    field({ fieldCode: 'household_type', fieldName: '户籍性质', fieldType: FieldType.DROPDOWN, dropdownOptions: ['农业', '非农业'] }),
  ];

  const fieldConfigRepository = {
    find: jest.fn(async () => fields),
  } as unknown as Repository<FieldConfig>;

  const service = new WorkOrderValidationService(
    fieldConfigRepository,
    { count: jest.fn() } as unknown as Repository<WorkOrder>,
    { query: jest.fn() } as unknown as DataSource,
    new AstEvaluator(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows submit with raw household_type text outside dropdown options', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '孙八',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      household_type: '城镇户口',
    }))).resolves.toBeUndefined();
  });

  it('allows submit without the removed social insurance urge field', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '周九',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
    }))).resolves.toBeUndefined();
  });

  it('allows submit when contract_template is blank even if company contract is required', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '吴十',
      id_card_no: '330102199001010011',
      need_company_contract: '是',
      contract_template: null,
    }))).resolves.toBeUndefined();
  });

  it('requires current_address when onboarding materials are not collected centrally', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '地址缺失',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_onboarding_contact: '否',
      current_address: '',
      bank_name: '测试银行',
      bank_account: '62220001',
      bank_location: '宁波',
      payroll_location: '北仑',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ missing: ['current_address'] }),
      }),
    });
  });

  it('requires all payroll bank fields without centralized collection regardless of payroll-slip choice', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '工资卡缺失',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_payroll_slip: '否',
      need_onboarding_contact: '否',
      current_address: '浙江杭州文一路1号',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: ['bank_name', 'bank_account', 'bank_location', 'payroll_location'],
        }),
      }),
    });
  });

  it('allows missing payroll bank fields when centralized collection is enabled', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '集约收集',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_payroll_slip: '是',
      need_onboarding_contact: '是',
    }))).resolves.toBeUndefined();
  });

  it('does not block an unrelated patch because of historical payroll bank gaps', async () => {
    const baselineExtraData = {
      employee_name: '历史缺失',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_payroll_slip: '是',
      need_onboarding_contact: '2.否',
      current_address: '浙江杭州文一路1号',
      household_type: '',
    };
    await expect(service.validateWorkOrder(
      makeWorkOrder({ ...baselineExtraData, household_type: '城镇户口' }),
      { baselineExtraData, changedFieldCodes: ['household_type'] },
    )).resolves.toBeUndefined();
  });

  it('validates every payroll bank field when a patch activates creator collection', async () => {
    const baselineExtraData = {
      employee_name: '条件切换',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_payroll_slip: '1.是',
      need_onboarding_contact: '是',
      current_address: '浙江杭州文一路1号',
    };
    await expect(service.validateWorkOrder(
      makeWorkOrder({ ...baselineExtraData, need_onboarding_contact: '2.否' }),
      { baselineExtraData, changedFieldCodes: ['need_onboarding_contact'] },
    )).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: ['bank_name', 'bank_account', 'bank_location', 'payroll_location'],
        }),
      }),
    });
  });

  it('requires probation month, end date and salary when probation start date exists', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '试用期缺失',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      probation_start_date: '2026-08-01',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: ['probation_months', 'probation_end_date', 'probation_salary'],
        }),
      }),
    });
  });

  it('accepts complete probation conditional fields', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '试用期完整',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      probation_start_date: '2026-08-01',
      probation_months: '3',
      probation_end_date: '2026-10-31',
      probation_salary: '按基本工资80%',
    }))).resolves.toBeUndefined();
  });

  it('allows patching one field when an old strict required field was already missing', async () => {
    const baselineExtraData = {
      employee_name: '',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      household_type: '',
    };
    await expect(service.validateWorkOrder(
      makeWorkOrder({ ...baselineExtraData, household_type: '城镇户口' }),
      {
        baselineExtraData,
        changedFieldCodes: ['household_type'],
      },
    )).resolves.toBeUndefined();
  });

  it('still blocks clearing a strict required field in patch mode', async () => {
    const baselineExtraData = {
      employee_name: '原姓名',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
    };
    await expect(service.validateWorkOrder(
      makeWorkOrder({ ...baselineExtraData, employee_name: '' }),
      {
        baselineExtraData,
        changedFieldCodes: ['employee_name'],
      },
    )).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ missing: ['employee_name'] }),
      }),
    });
  });

  it('validates a conditional field when the patch newly activates its requirement', async () => {
    const baselineExtraData = {
      employee_name: '条件测试',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      need_onboarding_contact: '是',
      current_address: '',
      bank_name: '测试银行',
      bank_account: '62220001',
      bank_location: '宁波',
      payroll_location: '北仑',
    };
    await expect(service.validateWorkOrder(
      makeWorkOrder({ ...baselineExtraData, need_onboarding_contact: '否' }),
      {
        baselineExtraData,
        changedFieldCodes: ['need_onboarding_contact'],
      },
    )).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ missing: ['current_address'] }),
      }),
    });
  });

  it('still blocks strict required fields during submit', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('姓名'),
        details: expect.objectContaining({ missing: ['employee_name'] }),
      }),
    });
  });

  it('validates province fields shared through businessContext for province decrease', async () => {
    const provinceField = field({
      fieldCode: 'province',
      fieldName: '省份',
      orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
      businessContext: [
        OrderType.OUT_OF_PROVINCE_INCREASE,
        OrderType.OUT_OF_PROVINCE_DECREASE,
      ],
      isRequired: true,
      defaultRequired: true,
      fieldType: FieldType.DROPDOWN,
      dropdownOptions: ['福建', '广东'],
    });
    (fieldConfigRepository.find as jest.Mock).mockResolvedValueOnce([provinceField]);
    const missingProvince = makeWorkOrder({ province: '' });
    missingProvince.orderType = OrderType.OUT_OF_PROVINCE_DECREASE;
    await expect(service.validateWorkOrder(missingProvince)).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ missing: ['province'] }),
      }),
    });

    (fieldConfigRepository.find as jest.Mock).mockResolvedValueOnce([provinceField]);
    const validProvince = makeWorkOrder({ province: '福建' });
    validProvince.orderType = OrderType.OUT_OF_PROVINCE_DECREASE;
    await expect(service.validateWorkOrder(validProvince)).resolves.toBeUndefined();
  });

  it('resolves branches only inside the selected business scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'branch-out' }]);
    const scopedService = new WorkOrderValidationService(
      fieldConfigRepository,
      { count: jest.fn() } as unknown as Repository<WorkOrder>,
      { query } as unknown as DataSource,
      new AstEvaluator(),
    );

    await expect(scopedService.resolveBranchId(
      undefined,
      'customer-out',
      { branch_code: 'BR-001' },
      BusinessScope.OUT_OF_PROVINCE,
    )).resolves.toBe('branch-out');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('business_scope = $2'),
      ['BR-001', BusinessScope.OUT_OF_PROVINCE],
    );
  });

  it('creates customers against the business-scope composite unique key', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'customer-new' }]);
    const scopedService = new WorkOrderValidationService(
      fieldConfigRepository,
      { count: jest.fn() } as unknown as Repository<WorkOrder>,
      { query } as unknown as DataSource,
      new AstEvaluator(),
    );

    await expect(scopedService.resolveCustomerId(
      undefined,
      { customer_code: 'C-NEW', customer_name: '新客户' },
      BusinessScope.OUT_OF_PROVINCE,
    )).resolves.toBe('customer-new');
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('ON CONFLICT (customer_code, business_scope)'),
      ['C-NEW', '新客户', BusinessScope.OUT_OF_PROVINCE],
    );
  });

  it('rejects an onboarding order whose payment location has no fund rule', async () => {
    const contractSubjectsService = {
      findByName: jest.fn().mockResolvedValue(null),
      findFundRuleByLocation: jest.fn().mockResolvedValue(null),
    } as unknown as ContractSubjectsService;
    const scopedService = new WorkOrderValidationService(
      { find: jest.fn().mockResolvedValue([]) } as unknown as Repository<FieldConfig>,
      { count: jest.fn() } as unknown as Repository<WorkOrder>,
      { query: jest.fn() } as unknown as DataSource,
      new AstEvaluator(),
      contractSubjectsService,
    );

    await expect(scopedService.validateWorkOrder(makeWorkOrder({ social_location: '' }))).resolves.toBeUndefined();
    await expect(scopedService.validateWorkOrder(makeWorkOrder({ social_location: '不存在的地区', fund_ratio: '5%+5%' }))).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          invalid: expect.arrayContaining([
            expect.objectContaining({ fieldCode: 'social_location' }),
          ]),
        }),
      }),
    });
  });

  it('reports the chinese field name when requireText fails', () => {
    expect(() => service.requireText('', 'employee_name')).toThrow('必填字段缺失：姓名');
  });
});
