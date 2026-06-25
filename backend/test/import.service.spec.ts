import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { FieldConfig, FieldType, OrderType } from 'src/entities';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';
import { MappingItemInput } from 'src/modules/imports/types';

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
    placeholder: null,
    helpText: null,
    orderType: input.orderType ?? OrderType.ONBOARDING,
    displayOrder: input.displayOrder ?? 1,
    isActive: true,
    createdAt: new Date(),
  } as FieldConfig;
}

const needsOnboardingContact = { field: 'need_onboarding_contact', op: 'EQ' as const, value: '是' };
const needsOnboardingContactAndCommonTemplate = {
  op: 'AND' as const,
  children: [
    needsOnboardingContact,
    { field: 'is_common_template', op: 'EQ' as const, value: '是' },
  ],
};

const fields = [
  field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true }),
  field({ fieldCode: 'id_card_no', fieldName: '身份证号', isRequired: true, validationRegex: '^[0-9Xx]{15,18}$' }),
  field({ fieldCode: 'gender', fieldName: '性别', fieldType: FieldType.DROPDOWN, dropdownOptions: ['男', '女'] }),
  field({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, isRequired: true, dropdownOptions: ['是', '否'] }),
  field({ fieldCode: 'need_esign', fieldName: '是否电子签', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
  field({ fieldCode: 'esign_platform', fieldName: '电子签平台', fieldType: FieldType.DROPDOWN, dropdownOptions: ['速创', 'E签宝'], conditionalRequired: { field: 'need_esign', op: 'EQ', value: '1.是' } }),
  field({ fieldCode: 'contract_subject', fieldName: '劳动合同主体', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
  field({ fieldCode: 'contract_template', fieldName: '劳动合同模板（标准模板/特殊模板）', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
  field({ fieldCode: 'household_address', fieldName: '户籍地址', isRequired: true, defaultRequired: true }),
  field({ fieldCode: 'household_type', fieldName: '户籍性质', fieldType: FieldType.DROPDOWN, dropdownOptions: ['农业', '非农业'] }),
  field({ fieldCode: 'need_onboarding_contact', fieldName: '入职材料是否需要集约收集', fieldType: FieldType.DROPDOWN, isRequired: true, defaultRequired: true, dropdownOptions: ['是', '否'] }),
  field({ fieldCode: 'feedback_deadline', fieldName: '反馈截止日期', fieldType: FieldType.DATE, conditionalRequired: needsOnboardingContact }),
  field({ fieldCode: 'is_common_template', fieldName: '是否为通用模板', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], conditionalRequired: needsOnboardingContact }),
  field({ fieldCode: 'template_name', fieldName: '模板名称', conditionalRequired: needsOnboardingContactAndCommonTemplate }),
  field({ fieldCode: 'special_remark', fieldName: '特殊备注', fieldType: FieldType.TEXT, isRequired: false, defaultRequired: false }),
];

const mapping: MappingItemInput[] = [
  { header: '姓名', fieldCode: 'employee_name' },
  { header: '身份证号', fieldCode: 'id_card_no' },
  { header: '性别', fieldCode: 'gender' },
  { header: '是否签合同', fieldCode: 'need_company_contract' },
  { header: '合同主体', fieldCode: 'contract_subject' },
  { header: '是否电子签', fieldCode: 'need_esign' },
  { header: '电子签平台', fieldCode: 'esign_platform' },
  { header: '户籍地址', fieldCode: 'household_address' },
  { header: '入职材料是否需要集约收集', fieldCode: 'need_onboarding_contact' },
  { header: '反馈截止日期', fieldCode: 'feedback_deadline' },
  { header: '是否为通用模板', fieldCode: 'is_common_template' },
  { header: '模板名称', fieldCode: 'template_name' },
  { header: '特殊备注', fieldCode: 'special_remark' },
];

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    姓名: '张三',
    身份证号: '330102199001010011',
    性别: '男',
    是否签合同: '否',
    户籍地址: '浙江杭州',
    入职材料是否需要集约收集: '否',
    特殊备注: '无',
    ...overrides,
  };
}

describe('ImportFieldValidationService scenarios', () => {
  const service = new ImportFieldValidationService({} as never, new AstEvaluator());

  it('accepts a standard row when current required fields are mapped and present', async () => {
    const result = await service.validateRow({ rowNo: 1, raw: validRow(), mapping, fields });
    expect(result.ok).toBe(true);
  });

  it('keeps employee_name missing as a strict required error', async () => {
    const result = await service.validateRow({ rowNo: 2, raw: validRow({ 姓名: '' }), mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'employee_name', reason: 'required' }));
  });

  it('keeps id_card_no missing as a strict required error', async () => {
    const result = await service.validateRow({ rowNo: 2, raw: validRow({ 身份证号: '' }), mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'id_card_no', reason: 'required' }));
  });

  it('keeps need_onboarding_contact missing as a strict required error', async () => {
    const result = await service.validateRow({ rowNo: 2, raw: validRow({ 入职材料是否需要集约收集: '' }), mapping, fields });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'need_onboarding_contact', reason: 'required' }));
  });

  it('does not require onboarding contact conditional fields when need_onboarding_contact is no', async () => {
    const result = await service.validateRow({
      rowNo: 3,
      raw: validRow({
        入职材料是否需要集约收集: '否',
        反馈截止日期: '',
        是否为通用模板: '',
        模板名称: '',
      }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('requires feedback_deadline and is_common_template when need_onboarding_contact is yes', async () => {
    const result = await service.validateRow({
      rowNo: 4,
      raw: validRow({
        入职材料是否需要集约收集: '是',
        反馈截止日期: '',
        是否为通用模板: '',
        模板名称: '',
      }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldCode: 'feedback_deadline', reason: 'required' }),
      expect.objectContaining({ fieldCode: 'is_common_template', reason: 'required' }),
    ]));
    expect(result.errors).not.toContainEqual(expect.objectContaining({ fieldCode: 'template_name' }));
  });

  it('does not require template_name when need_onboarding_contact is yes but is_common_template is no', async () => {
    const result = await service.validateRow({
      rowNo: 5,
      raw: validRow({
        入职材料是否需要集约收集: '是',
        反馈截止日期: '2026-06-30',
        是否为通用模板: '否',
        模板名称: '',
      }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('requires template_name only when need_onboarding_contact and is_common_template are both yes', async () => {
    const result = await service.validateRow({
      rowNo: 6,
      raw: validRow({
        入职材料是否需要集约收集: '是',
        反馈截止日期: '2026-06-30',
        是否为通用模板: '是',
        模板名称: '',
      }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'template_name', reason: 'required' }));
  });

  it('accepts onboarding contact yes when all conditional fields are present', async () => {
    const result = await service.validateRow({
      rowNo: 7,
      raw: validRow({
        入职材料是否需要集约收集: '是',
        反馈截止日期: '2026-06-30',
        是否为通用模板: '是',
        模板名称: '通用入职模板',
      }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized).toMatchObject({
      need_onboarding_contact: '是',
      feedback_deadline: '2026-06-30',
      is_common_template: '是',
      template_name: '通用入职模板',
    });
  });

  it('ignores extra columns without failing', async () => {
    const result = await service.validateRow({ rowNo: 8, raw: validRow({ 多余列: 'x' }), mapping, fields });
    expect(result.ok).toBe(true);
  });

  it('reports format errors', async () => {
    const result = await service.validateRow({ rowNo: 9, raw: validRow({ 身份证号: 'bad' }), mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.reason === 'regex')).toBe(true);
  });

  it('supports partial success counting across rows', async () => {
    const rows = [
      validRow({ 姓名: '赵六' }),
      validRow({ 姓名: '', 身份证号: 'bad', 是否签合同: '是' }),
    ];
    const results = await Promise.all(rows.map((raw, index) => service.validateRow({ rowNo: index + 1, raw, mapping, fields })));
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => !item.ok)).toHaveLength(1);
  });

  it('keeps contract_template value during onboarding import validation when company contract is required', async () => {
    const result = await service.validateRow({
      rowNo: 10,
      raw: {
        ...validRow({ 姓名: '钱七', 是否签合同: '是', 合同主体: '北仑', 是否电子签: '2.否' }),
        '劳动合同模板（标准模板/ 特殊模板）': '标准模板',
      },
      mapping: [...mapping, { header: '劳动合同模板', fieldCode: 'contract_template' }],
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.contract_template).toBe('标准模板');
    expect(result.errors).not.toContainEqual(expect.objectContaining({ fieldCode: 'contract_template' }));
  });

  it('requires esign_platform only when need_esign is yes', async () => {
    const result = await service.validateRow({
      rowNo: 11,
      raw: {
        ...validRow({ 姓名: '钱七', 是否签合同: '是', 合同主体: '北仑', 是否电子签: '1.是' }),
        '劳动合同模板（标准模板/ 特殊模板）': '标准模板',
      },
      mapping: [...mapping, { header: '劳动合同模板', fieldCode: 'contract_template' }],
      fields,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'esign_platform', reason: 'required' }));
  });

  it('derives gender, birth date, age and probation end date during validation', async () => {
    const derivedFields = [
      ...fields,
      field({ fieldCode: 'probation_start_date', fieldName: '试用期开始日期', fieldType: FieldType.DATE, isRequired: true }),
      field({ fieldCode: 'probation_months', fieldName: '试用期（月）', isRequired: true }),
      field({ fieldCode: 'probation_end_date', fieldName: '试用期结束日期', fieldType: FieldType.DATE, isRequired: true }),
      field({ fieldCode: 'birth_date', fieldName: '出生日期', fieldType: FieldType.DATE }),
      field({ fieldCode: 'age', fieldName: '年龄', fieldType: FieldType.NUMBER }),
    ];
    const result = await service.validateRow({
      rowNo: 12,
      raw: validRow({
        姓名: '派生字段',
        身份证号: '330106199001011237',
        试用期开始日期: '2026-06-01',
        '试用期（月）': '3',
      }),
      mapping: [
        ...mapping,
        { header: '试用期开始日期', fieldCode: 'probation_start_date' },
        { header: '试用期（月）', fieldCode: 'probation_months' },
        { header: '试用期结束日期', fieldCode: 'probation_end_date' },
        { header: '出生日期', fieldCode: 'birth_date' },
        { header: '年龄', fieldCode: 'age' },
      ],
      fields: derivedFields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized).toMatchObject({
      gender: '男',
      birth_date: '1990-01-01',
      probation_end_date: '2026-08-31',
    });
    expect(typeof result.normalized.age).toBe('number');
  });

  it('keeps contract_template alias matching available outside onboarding import fields', async () => {
    const resignationFields = [
      field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true, orderType: OrderType.RESIGNATION }),
      field({ fieldCode: 'contract_template', fieldName: '劳动合同模板（标准模板/特殊模板）', orderType: OrderType.RESIGNATION }),
    ];
    const result = await service.validateRow({
      rowNo: 11,
      raw: {
        姓名: '钱七',
        '劳动合同模板（标准模板/ 特殊模板）': '标准模板',
      },
      mapping: [
        { header: '姓名', fieldCode: 'employee_name' },
        { header: '劳动合同模板', fieldCode: 'contract_template' },
      ],
      fields: resignationFields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.contract_template).toBe('标准模板');
    expect(result.warnings.some((item) => item.code === 'header_alias' && item.fieldCode === 'contract_template')).toBe(true);
  });

  it('keeps common enum alias text for household type instead of normalizing it', async () => {
    const result = await service.validateRow({
      rowNo: 12,
      raw: validRow({ 姓名: '孙八', 户籍性质: '城镇户口' }),
      mapping: [...mapping, { header: '户籍性质', fieldCode: 'household_type' }],
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.household_type).toBe('城镇户口');
    expect(result.warnings.some((item) => item.code === 'enum_alias' && item.fieldCode === 'household_type')).toBe(false);
  });

  it('does not require the removed social insurance urge field', async () => {
    const result = await service.validateRow({
      rowNo: 13,
      raw: validRow({ 姓名: '周九' }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('requires contract_template when company contract is required', async () => {
    const result = await service.validateRow({
      rowNo: 14,
      raw: validRow({ 姓名: '吴十', 是否签合同: '是', 合同主体: '北仑', 是否电子签: '2.否' }),
      mapping: [...mapping, { header: '劳动合同模板', fieldCode: 'contract_template' }],
      fields,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'contract_template', reason: 'required' }));
  });

  it('keeps other missing required fields as required errors', async () => {
    const result = await service.validateRow({
      rowNo: 15,
      raw: validRow({ 姓名: '郑十一', 户籍地址: '' }),
      mapping,
      fields,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'household_address', reason: 'required' }));
  });

  it('uses import template configuration for candidate fields and row validation', async () => {
    const configuredFields = [
      field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true }),
      field({ fieldCode: 'feedback_deadline', fieldName: '反馈截止日期', fieldType: FieldType.DATE, conditionalRequired: needsOnboardingContact }),
      field({ fieldCode: 'is_common_template', fieldName: '是否为通用模板', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], conditionalRequired: needsOnboardingContact }),
    ].map((item) => {
      if (item.fieldCode === 'feedback_deadline') {
        return { ...item, templateHeader: '回传截止日', templateRequiredOverride: false, isRequired: false, defaultRequired: false } as FieldConfig;
      }
      return item;
    });
    const templateConfigService = {
      resolveFields: jest.fn().mockResolvedValue({ fields: configuredFields, configured: [] }),
    };
    const configuredService = new ImportFieldValidationService({} as never, new AstEvaluator(), templateConfigService as never);

    const candidates = await configuredService.buildCandidateFields(OrderType.ONBOARDING);
    expect(candidates).toContainEqual(expect.objectContaining({ fieldCode: 'feedback_deadline', fieldName: '回传截止日', required: false }));

    const result = await configuredService.validateRow({
      rowNo: 16,
      raw: { 姓名: '王十二', 回传截止日: '', 是否为通用模板: '' },
      mapping: [
        { header: '姓名', fieldCode: 'employee_name' },
        { header: '反馈截止日期', fieldCode: 'feedback_deadline' },
        { header: '是否为通用模板', fieldCode: 'is_common_template' },
      ],
      fields: configuredFields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((item) => item.code === 'header_alias' && item.normalizedValue === '回传截止日')).toBe(true);
  });
});
