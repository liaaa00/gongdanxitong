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

const fields = [
  field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true }),
  field({ fieldCode: 'id_card_no', fieldName: '身份证号', isRequired: true, validationRegex: '^[0-9Xx]{15,18}$' }),
  field({ fieldCode: 'gender', fieldName: '性别', fieldType: FieldType.DROPDOWN, dropdownOptions: ['男', '女'] }),
  field({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, isRequired: true, dropdownOptions: ['是', '否'] }),
  field({ fieldCode: 'contract_subject', fieldName: '劳动合同主体', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
  field({ fieldCode: 'contract_template', fieldName: '劳动合同模板（标准模板/特殊模板）', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
  field({ fieldCode: 'household_address', fieldName: '户籍地址', isRequired: true, defaultRequired: true }),
  field({ fieldCode: 'household_type', fieldName: '户籍性质', fieldType: FieldType.DROPDOWN, dropdownOptions: ['农业', '非农业'] }),
  field({ fieldCode: 'social_urge', fieldName: '社保公积金未办是否需要催办', fieldType: FieldType.DROPDOWN, isRequired: true, defaultRequired: true, dropdownOptions: ['是', '否'] }),
];

const mapping: MappingItemInput[] = [
  { header: '姓名', fieldCode: 'employee_name' },
  { header: '身份证号', fieldCode: 'id_card_no' },
  { header: '性别', fieldCode: 'gender' },
  { header: '是否签合同', fieldCode: 'need_company_contract' },
  { header: '合同主体', fieldCode: 'contract_subject' },
];

describe('ImportFieldValidationService scenarios', () => {
  const service = new ImportFieldValidationService({} as never, new AstEvaluator());

  it('accepts a standard row', async () => {
    const result = await service.validateRow({ rowNo: 1, raw: { 姓名: '张三', 身份证号: '330102199001010011', 性别: '男', 是否签合同: '否' }, mapping, fields });
    expect(result.ok).toBe(true);
  });

  it('keeps employee_name missing as a strict required error', async () => {
    const result = await service.validateRow({ rowNo: 2, raw: { 身份证号: '330102199001010011', 是否签合同: '否' }, mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'employee_name', reason: 'required' }));
  });

  it('keeps id_card_no missing as a strict required error', async () => {
    const result = await service.validateRow({ rowNo: 2, raw: { 姓名: '张三', 是否签合同: '否' }, mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldCode: 'id_card_no', reason: 'required' }));
  });

  it('ignores extra columns without failing', async () => {
    const result = await service.validateRow({ rowNo: 3, raw: { 姓名: '李四', 身份证号: '330102199001010011', 是否签合同: '否', 多余列: 'x' }, mapping, fields });
    expect(result.ok).toBe(true);
  });

  it('reports format errors', async () => {
    const result = await service.validateRow({ rowNo: 4, raw: { 姓名: '王五', 身份证号: 'bad', 是否签合同: '否' }, mapping, fields });
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.reason === 'regex')).toBe(true);
  });

  it('supports partial success counting across rows', async () => {
    const rows = [
      { 姓名: '赵六', 身份证号: '330102199001010011', 是否签合同: '否' },
      { 姓名: '', 身份证号: 'bad', 是否签合同: '是' },
    ];
    const results = await Promise.all(rows.map((raw, index) => service.validateRow({ rowNo: index + 1, raw, mapping, fields })));
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => !item.ok)).toHaveLength(1);
  });

  it('matches real Excel header aliases with spaces, slashes and parentheses', async () => {
    const result = await service.validateRow({
      rowNo: 5,
      raw: {
        姓名: '钱七',
        身份证号: '330102199001010011',
        是否签合同: '否',
        '劳动合同模板（标准模板 / 特殊模板）': '标准模板',
      },
      mapping: [...mapping, { header: '劳动合同模板', fieldCode: 'contract_template' }],
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.contract_template).toBe('标准模板');
    expect(result.warnings.some((item) => item.code === 'header_alias' && item.fieldCode === 'contract_template')).toBe(true);
  });

  it('keeps common enum alias text for household type instead of normalizing it', async () => {
    const result = await service.validateRow({
      rowNo: 6,
      raw: { 姓名: '孙八', 身份证号: '330102199001010011', 是否签合同: '否', 户籍性质: '城镇户口' },
      mapping: [...mapping, { header: '户籍性质', fieldCode: 'household_type' }],
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.household_type).toBe('城镇户口');
    expect(result.warnings.some((item) => item.code === 'enum_alias' && item.fieldCode === 'household_type')).toBe(false);
  });

  it('leaves missing social_urge blank with a warning without failing the row', async () => {
    const result = await service.validateRow({
      rowNo: 7,
      raw: { 姓名: '周九', 身份证号: '330102199001010011', 是否签合同: '否' },
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.normalized.social_urge).toBeUndefined();
    expect(result.warnings).toContainEqual(expect.objectContaining({
      fieldCode: 'social_urge',
      code: 'left_blank',
      normalizedValue: null,
    }));
    expect(result.warnings.some((item) => item.code === 'safe_default' && item.fieldCode === 'social_urge')).toBe(false);
  });

  it('leaves missing contract_template blank when company contract is required', async () => {
    const result = await service.validateRow({
      rowNo: 8,
      raw: { 姓名: '吴十', 身份证号: '330102199001010011', 是否签合同: '是', 合同主体: '北仑' },
      mapping: [...mapping, { header: '劳动合同模板', fieldCode: 'contract_template' }],
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalized.contract_template).toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({
      fieldCode: 'contract_template',
      code: 'left_blank',
      normalizedValue: null,
    }));
    expect(result.warnings.some((item) => item.code === 'safe_default' && item.fieldCode === 'contract_template')).toBe(false);
  });

  it('downgrades other missing required fields to left_blank warnings', async () => {
    const result = await service.validateRow({
      rowNo: 9,
      raw: { 姓名: '郑十一', 身份证号: '330102199001010011', 是否签合同: '否' },
      mapping,
      fields,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      fieldCode: 'household_address',
      code: 'left_blank',
      normalizedValue: null,
    }));
  });
});
