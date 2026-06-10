import { Workbook } from 'exceljs';
import { FieldConfig, FieldType, OrderType } from 'src/entities';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';
import { ImportTemplateConfigService, ImportTemplateFieldView } from 'src/modules/imports/import-template-config.service';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';

function makeField(overrides: Partial<FieldConfig>): FieldConfig {
  return {
    id: overrides.fieldCode ?? 'id',
    fieldCode: 'field_code',
    fieldName: '字段',
    fieldType: FieldType.TEXT,
    isRequired: false,
    defaultRequired: false,
    conditionalRequired: null,
    validationRegex: null,
    validationMsg: null,
    dropdownOptions: null,
    collectionGroup: null,
    placeholder: null,
    helpText: null,
    orderType: OrderType.ONBOARDING,
    businessContext: null,
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  } as FieldConfig;
}

function toView(field: FieldConfig, index: number, overrides: Partial<ImportTemplateFieldView> = {}): ImportTemplateFieldView {
  const required = field.isRequired || field.defaultRequired;
  return {
    orderType: field.orderType ?? OrderType.ONBOARDING,
    order_type: field.orderType ?? OrderType.ONBOARDING,
    fieldCode: field.fieldCode,
    field_code: field.fieldCode,
    fieldName: field.fieldName,
    field_name: field.fieldName,
    fieldType: field.fieldType,
    field_type: field.fieldType,
    displayOrder: field.displayOrder || index + 1,
    display_order: field.displayOrder || index + 1,
    headerAlias: null,
    header_alias: null,
    isRequiredOverride: null,
    is_required_override: null,
    isActive: field.isActive,
    is_active: field.isActive,
    source: 'configured',
    dropdownOptions: field.dropdownOptions,
    dropdown_options: field.dropdownOptions,
    helpText: field.helpText,
    help_text: field.helpText,
    placeholder: field.placeholder,
    isRequired: required,
    is_required: required,
    defaultRequired: field.defaultRequired,
    default_required: field.defaultRequired,
    conditionalRequired: field.conditionalRequired,
    conditional_required: field.conditionalRequired,
    ...overrides,
  };
}

function buildService(fields: FieldConfig[], overrides: Record<string, Partial<ImportTemplateFieldView>> = {}): ImportTemplateService {
  const views = fields.map((field, index) => toView(field, index, overrides[field.fieldCode]));
  const templateConfigService = {
    list: jest.fn().mockResolvedValue(views),
  } as unknown as ImportTemplateConfigService;
  return new ImportTemplateService(templateConfigService);
}

describe('Imports ImportTemplateService round-trip', () => {
  const fields = [
    makeField({ fieldCode: 'customer_name', fieldName: '客户名称', fieldType: FieldType.TEXT, isRequired: true, displayOrder: 1 }),
    makeField({ fieldCode: 'gender', fieldName: '性别', fieldType: FieldType.DROPDOWN, dropdownOptions: ['男', '女'], isRequired: true, displayOrder: 2 }),
    makeField({ fieldCode: 'birth_date', fieldName: '出生日期', fieldType: FieldType.DATE, displayOrder: 3 }),
    makeField({ fieldCode: 'base_salary', fieldName: '基本工资', fieldType: FieldType.NUMBER, displayOrder: 4 }),
    makeField({ fieldCode: 'probation', fieldName: '试用期', fieldType: FieldType.TEXT, conditionalRequired: { when: 'x' }, displayOrder: 5 }),
  ];

  it('generates a template whose headers parse back to configured field names', async () => {
    const service = buildService(fields);
    const result = await service.generate(OrderType.ONBOARDING);

    expect(result.fieldCount).toBe(fields.length);
    expect(result.fileName).toContain('入职');

    const parsed = await new ExcelParserService().parseBuffer(result.buffer);

    for (const field of fields) {
      expect(parsed.headers).toContain(field.fieldName);
    }
    // 第 2~4 行是说明行（是否必填/填写要求/填写示例），解析时跳过，数据区为空
    expect(parsed.headers).not.toContain('是否必填');
    expect(parsed.rows).toHaveLength(0);
  });

  it('uses configured header alias and required override when generating template', async () => {
    const service = buildService(fields, {
      customer_name: { headerAlias: '客户简称', header_alias: '客户简称' },
      birth_date: { isRequiredOverride: true, is_required_override: true, isRequired: true, is_required: true },
      gender: { isRequiredOverride: false, is_required_override: false, isRequired: false, is_required: false },
    });

    const result = await service.generate(OrderType.ONBOARDING);
    const parsed = await new ExcelParserService().parseBuffer(result.buffer);
    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.worksheets[0];
    const requiredRow = sheet.getRow(2);

    expect(parsed.headers).toContain('客户简称');
    expect(parsed.headers).not.toContain('客户名称');
    expect(requiredRow.getCell(parsed.headers.indexOf('客户简称') + 1).value).toBe('必填');
    expect(requiredRow.getCell(parsed.headers.indexOf('出生日期') + 1).value).toBe('必填');
    expect(requiredRow.getCell(parsed.headers.indexOf('性别') + 1).value).toBe('非必填');
  });

  it('keeps onboarding import template business input fields while excluding downstream feedback fields in configured list', async () => {
    const onboardingFields = [
      makeField({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true, displayOrder: 1 }),
      makeField({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], isRequired: true, displayOrder: 2 }),
      makeField({ fieldCode: 'contract_subject', fieldName: '劳动合同主体', displayOrder: 3 }),
      makeField({ fieldCode: 'need_contract_urge', fieldName: '劳动合同签署是否需要催办员工', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], displayOrder: 4 }),
      makeField({ fieldCode: 'need_onboarding_contact', fieldName: '入职材料是否需要集约收集', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], isRequired: true, displayOrder: 5 }),
      makeField({ fieldCode: 'feedback_deadline', fieldName: '反馈截止日期', fieldType: FieldType.DATE, displayOrder: 6 }),
      makeField({ fieldCode: 'is_common_template', fieldName: '是否为通用模板', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], displayOrder: 7 }),
      makeField({ fieldCode: 'template_name', fieldName: '模板名称', displayOrder: 8 }),
      makeField({ fieldCode: 'need_company_payroll', fieldName: '是否企服发薪', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'], displayOrder: 9 }),
      makeField({ fieldCode: 'special_remark', fieldName: '特殊备注', displayOrder: 10 }),
    ];
    const service = buildService(onboardingFields);
    const result = await service.generate(OrderType.ONBOARDING);
    const parsed = await new ExcelParserService().parseBuffer(result.buffer);

    expect(parsed.headers).toEqual(expect.arrayContaining([
      '姓名',
      '是否企服发起劳动合同',
      '劳动合同主体',
      '劳动合同签署是否需要催办员工',
      '入职材料是否需要集约收集',
      '反馈截止日期',
      '是否为通用模板',
      '模板名称',
      '是否企服发薪',
      '特殊备注',
    ]));
    expect(result.fieldCount).toBe(onboardingFields.length);
  });

  it('does not globally remove downstream feedback fields for non-onboarding templates', async () => {
    const resignationFields = [
      makeField({ fieldCode: 'employee_name', fieldName: '姓名', orderType: OrderType.RESIGNATION, displayOrder: 1 }),
      makeField({ fieldCode: 'contract_template', fieldName: '劳动合同模板（标准模板/特殊模板）', orderType: OrderType.RESIGNATION, displayOrder: 2 }),
      makeField({ fieldCode: 'contract_feedback', fieldName: '劳动合同新签反馈', orderType: OrderType.RESIGNATION, displayOrder: 3 }),
      makeField({ fieldCode: 'onboarding_feedback', fieldName: '入职联系反馈', orderType: OrderType.RESIGNATION, displayOrder: 4 }),
      makeField({ fieldCode: 'data_entry_feedback', fieldName: '增员报岗录入反馈', orderType: OrderType.RESIGNATION, displayOrder: 5 }),
    ];
    const service = buildService(resignationFields);
    const result = await service.generate(OrderType.RESIGNATION);
    const parsed = await new ExcelParserService().parseBuffer(result.buffer);

    expect(parsed.headers).toEqual(expect.arrayContaining([
      '劳动合同模板（标准模板/特殊模板）',
      '劳动合同新签反馈',
      '入职联系反馈',
      '增员报岗录入反馈',
    ]));
    expect(result.fieldCount).toBe(resignationFields.length);
  });

  it('ignores the hidden __options sheet and reads only the main sheet', async () => {
    const service = buildService(fields);
    const result = await service.generate(OrderType.ONBOARDING);

    const parsed = await new ExcelParserService().parseBuffer(result.buffer);
    expect(parsed.meta.sheetName).toBe('当前字段配置');
  });

  it('throws NO_FIELDS when there are no configured fields', async () => {
    const service = buildService([]);
    await expect(service.generate(OrderType.ONBOARDING)).rejects.toBeDefined();
  });
});
