import { Workbook } from 'exceljs';
import * as JSZip from 'jszip';
import { ONBOARDING_TEMPLATE_ORDER } from 'src/database/seeds/seed-import-template-fields';
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
    makeField({ fieldCode: 'base_salary', fieldName: '基本工资', fieldType: FieldType.TEXT, displayOrder: 4 }),
    makeField({ fieldCode: 'probation', fieldName: '试用期', fieldType: FieldType.TEXT, conditionalRequired: { when: 'x' }, displayOrder: 5 }),
  ];

  it('writes all work hour system options into Excel validation', async () => {
    const service = buildService([
      makeField({
        fieldCode: 'work_hour_system',
        fieldName: '工时制',
        fieldType: FieldType.DROPDOWN,
        dropdownOptions: ['标准工时制', '综合工时制', '不定时工时制'],
        isRequired: true,
        displayOrder: 1,
      }),
    ]);

    const result = await service.generate(OrderType.ONBOARDING);
    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.worksheets[0];
    const optionsSheet = workbook.getWorksheet('__options')!;

    expect(['A1', 'A2', 'A3'].map((cell) => optionsSheet.getCell(cell).value)).toEqual([
      '标准工时制',
      '综合工时制',
      '不定时工时制',
    ]);
    expect(sheet.getCell('B6').dataValidation).toMatchObject({ type: 'list' });
    expect(sheet.getCell('B6').dataValidation?.allowBlank).not.toBe(true);
    expect(sheet.getCell('B6').dataValidation?.formulae?.[0]).toContain('$A$1:$A$3');
  });

  it('matches the confirmed 0724 onboarding template layout and rules', async () => {
    const referenceHeaders = [
      '客户名称', '姓名', '证件类型', '证件号码', '移动电话', '电子邮件', '岗位', '岗位类型',
      '合同期限形式', '合同期限', '合同开始日期', '合同终止日期', '试用期开始日期', '试用期（月）',
      '试用期结束日期', '工作城市', '工时制', '工资形式', '基本工资', '其他工资', '试用期工资',
      '试用期其他工资', '发薪周期', '发薪日期', '参保机构名称', '参保起始月', '社保基数', '公积金基数',
      '公积金比例', '备注', '户籍性质', '民族', '学历', '婚姻状况', '现住地址', '户籍地址',
      '开户地', '开户银行信息', '银行借记卡帐号', '客户代码', '外包类型', '业务模式', '人员类型',
      '是否企服发起劳动合同', '是否电子签', '电子签平台', '劳动合同主体', '劳动合同主体注册地',
      '项目名称', '安排或调整工作的情况', '劳动合同模板（标准模板/特殊模板）',
      '劳动合同签署是否需要催办员工', '入职材料是否需要集约收集', '反馈截止日期',
      '是否为通用模板', '模板名称', '是否企服发薪', '发薪地', '社保公积金未办是否需要催办', '特殊备注',
    ];
    const fieldOverrides: Record<string, Partial<FieldConfig>> = {
      contract_term: { isRequired: true, defaultRequired: true },
      contract_end_date: {
        fieldType: FieldType.DATE,
        isRequired: true,
        defaultRequired: true,
        helpText: '标准格式：年-月-日。',
      },
      work_hour_system: {
        fieldType: FieldType.DROPDOWN,
        dropdownOptions: ['标准工时制', '综合工时制', '不定时工时制'],
        isRequired: true,
      },
      salary_form: {
        fieldType: FieldType.DROPDOWN,
        dropdownOptions: ['按月'],
        isRequired: true,
      },
      base_salary: {
        fieldType: FieldType.NUMBER,
        isRequired: true,
        helpText: '数字格式：保留小数点后两位。',
      },
      other_salary: {
        helpText: '可填写文字说明，如可填写数字加文字。',
      },
      probation_salary: {
        fieldType: FieldType.NUMBER,
        conditionalRequired: { field: 'probation_start_date', op: 'EXISTS' },
        helpText: '数字格式：保留小数点后两位。',
      },
      bank_location: {
        helpText: '城市的名字（待确认）',
      },
      feedback_deadline: {
        fieldType: FieldType.DATE,
        isRequired: false,
        defaultRequired: false,
        conditionalRequired: null,
        helpText: '标准格式：年-月-日。',
      },
    };
    const referenceFields = ONBOARDING_TEMPLATE_ORDER.map((fieldCode, index) => makeField({
      fieldCode,
      fieldName: referenceHeaders[index],
      displayOrder: index + 1,
      ...fieldOverrides[fieldCode],
    }));
    const result = await buildService(referenceFields).generate(OrderType.ONBOARDING);
    const zip = await JSZip.loadAsync(result.buffer);
    const stylesXml = await zip.file('xl/styles.xml')!.async('string');
    const fontOrder = [
      'b', 'i', 'u', 'strike', 'outline', 'shadow', 'condense', 'extend',
      'sz', 'color', 'name', 'family', 'charset', 'vertAlign', 'scheme',
    ];
    for (const font of stylesXml.matchAll(/<font>([\s\S]*?)<\/font>/g)) {
      const positions = Array.from(font[1].matchAll(/<([A-Za-z]+)\b/g))
        .map((match) => fontOrder.indexOf(match[1]))
        .filter((position) => position >= 0);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }

    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet('当前字段配置')!;

    expect(result.fieldCount).toBe(60);
    expect(sheet.rowCount).toBe(5);
    expect((sheet.getRow(2).values as unknown[]).slice(2)).toEqual(referenceHeaders);
    expect(sheet.getCell('A1').value).toBe('填表说明：');
    expect(sheet.getCell('B1').value).toBe('B-AE列为客户必须填写');
    expect(sheet.getCell('AF1').value).toBe('AF-AN列为客户填写或外服入职联系收集');
    expect(sheet.getCell('AL1').value).toBeNull();
    expect(sheet.getCell('AO1').value).toBe('AO-BI列为外服客户经理填写');

    const headerFills = referenceHeaders.map((_, index) => (
      sheet.getRow(2).getCell(index + 2).fill as { fgColor?: { argb?: string; theme?: number; tint?: number } }
    ).fgColor);
    expect(headerFills.filter((color) => color?.argb === 'FFFFFF00')).toHaveLength(30);
    expect(headerFills[30]).toMatchObject({ theme: 9, tint: 0.6 });
    expect(headerFills[38]).toMatchObject({ theme: 9, tint: 0.6 });
    expect(headerFills[39]).toBeUndefined();

    expect(sheet.getCell('K3').value).toBe('必填');
    expect(sheet.getCell('K4').value).toBe('');
    expect(sheet.getCell('M3').value).toBe('必填');
    expect(sheet.getCell('M4').value).toBe('格式：YYYY-MM-DD；标准格式：年-月-日。');
    expect(sheet.getCell('T4').value).toBe('请填写数字；数字格式：保留小数点后两位。');
    expect(sheet.getCell('V4').value).toBe('满足条件时必填；请填写数字；数字格式：保留小数点后两位。');
    expect(sheet.getCell('AL4').value).toBe('城市的名字（待确认）');
    expect(sheet.getCell('BC3').value).toBe('非必填');
    expect(sheet.getCell('BC4').value).toBe('格式：YYYY-MM-DD；标准格式：年-月-日。');
    expect(sheet.getCell('T5').value).toBe(1000);
    expect(sheet.getCell('U5').value).toBe('绩效工资5000+岗位津贴2000');
    expect(sheet.getCell('V5').value).toBe(1000);

    const expectedWidths: Record<string, number> = {
      U: 21.7272727272727,
      AM: 18.5454545454545,
      AN: 18.4545454545455,
      AV: 18.3636363636364,
      AW: 20.6363636363636,
      AX: 27.7272727272727,
      AY: 26.8181818181818,
    };
    for (const [column, width] of Object.entries(expectedWidths)) {
      expect(sheet.getColumn(column).width).toBeCloseTo(width, 10);
    }

    expect(sheet.getCell('R6').dataValidation?.formulae?.[0]).toContain('$A$1:$A$3');
    expect(sheet.getCell('S6').dataValidation?.formulae?.[0]).toContain('$B$1:$B$1');
  });

  it('generates a template whose headers parse back to configured field names', async () => {
    const service = buildService(fields);
    const result = await service.generate(OrderType.ONBOARDING);

    expect(result.fieldCount).toBe(fields.length);
    expect(result.fileName).toContain('入职');

    const parsed = await new ExcelParserService().parseBuffer(result.buffer);

    for (const field of fields) {
      expect(parsed.headers).toContain(field.fieldName);
    }
    // 第 1 行是填表说明，第 3~5 行是元数据，解析时均跳过。
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
    const requiredRow = sheet.getRow(3);

    expect(parsed.headers).toContain('客户简称');
    expect(parsed.headers).not.toContain('客户名称');
    expect(requiredRow.getCell(parsed.headers.indexOf('客户简称') + 1).value).toBe('必填');
    expect(requiredRow.getCell(parsed.headers.indexOf('出生日期') + 1).value).toBe('必填');
    expect(requiredRow.getCell(parsed.headers.indexOf('性别') + 1).value).toBe('非必填');
  });

  it('keeps onboarding import template business input fields while excluding downstream feedback fields in configured list', async () => {
    const onboardingFields = [
      makeField({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true, displayOrder: 1 }),
      makeField({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], isRequired: true, displayOrder: 2 }),
      makeField({ fieldCode: 'contract_subject', fieldName: '劳动合同主体', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '1.是' }, displayOrder: 3 }),
      makeField({ fieldCode: 'need_contract_urge', fieldName: '劳动合同签署是否需要催办员工', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], displayOrder: 4 }),
      makeField({ fieldCode: 'need_onboarding_contact', fieldName: '入职材料是否需要集约收集', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], isRequired: true, displayOrder: 5 }),
      makeField({ fieldCode: 'feedback_deadline', fieldName: '反馈截止日期', fieldType: FieldType.DATE, displayOrder: 6 }),
      makeField({ fieldCode: 'is_common_template', fieldName: '是否为通用模板', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], displayOrder: 7 }),
      makeField({ fieldCode: 'template_name', fieldName: '模板名称', displayOrder: 8 }),
      makeField({ fieldCode: 'need_company_payroll', fieldName: '是否企服发薪', fieldType: FieldType.DROPDOWN, dropdownOptions: ['1.是', '2.否'], displayOrder: 9 }),
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

    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet('当前字段配置')!;
    const optionsSheet = workbook.getWorksheet('__options')!;
    const contractSubjectCol = parsed.headers.indexOf('劳动合同主体') + 1;
    const needCompanyContractCol = parsed.headers.indexOf('是否企服发起劳动合同') + 1;
    const employeeNameCol = parsed.headers.indexOf('姓名') + 1;
    expect(sheet.getRow(3).getCell(contractSubjectCol).value).toBe('条件必填');
    expect(String(sheet.getRow(4).getCell(contractSubjectCol).value)).toContain('满足条件时必填');
    expect(sheet.getRow(2).getCell(needCompanyContractCol).fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(sheet.getRow(2).getCell(employeeNameCol).fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(optionsSheet.state).toBe('veryHidden');
    expect(optionsSheet.getCell('A1').value).toBe('1.是');
    expect(optionsSheet.getCell('A2').value).toBe('2.否');
    expect(sheet.getCell(`${String.fromCharCode(64 + needCompanyContractCol)}6`).dataValidation?.formulae?.[0]).toContain('__options');
  });

  it('renders 0724 salary hints and company address esign condition in import template', async () => {
    const onboardingFields = [
      makeField({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true, displayOrder: 1 }),
      makeField({ fieldCode: 'base_salary', fieldName: '基本工资', fieldType: FieldType.NUMBER, helpText: '数字格式：保留小数点后两位。', displayOrder: 2 }),
      makeField({ fieldCode: 'other_salary', fieldName: '其他工资', fieldType: FieldType.TEXT, helpText: '可填写文字说明，如可填写数字加文字。', displayOrder: 3 }),
      makeField({ fieldCode: 'probation_salary', fieldName: '试用期工资', fieldType: FieldType.NUMBER, helpText: '数字格式：保留小数点后两位。', conditionalRequired: { field: 'probation_start_date', op: 'EXISTS' }, displayOrder: 4 }),
      makeField({ fieldCode: 'probation_other_salary', fieldName: '试用期其他工资', fieldType: FieldType.TEXT, helpText: '可填写文字说明，如可填写数字加文字。', displayOrder: 5 }),
      makeField({ fieldCode: 'esign_platform', fieldName: '电子签平台', fieldType: FieldType.DROPDOWN, dropdownOptions: ['速创', 'E签宝'], displayOrder: 6 }),
      makeField({
        fieldCode: 'company_address',
        fieldName: '甲方住所',
        fieldType: FieldType.TEXT,
        conditionalRequired: { field: 'esign_platform', op: 'EQ', value: 'E签宝' },
        helpText: '电子签平台为速创时非必填；电子签平台为E签宝时必填。',
        displayOrder: 7,
      }),
    ];
    const service = buildService(onboardingFields, {
      company_address: {
        headerAlias: '劳动合同主体注册地',
        header_alias: '劳动合同主体注册地',
      },
    });
    const result = await service.generate(OrderType.ONBOARDING);
    const parsed = await new ExcelParserService().parseBuffer(result.buffer);
    const workbook = new Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet('当前字段配置')!;

    const baseSalaryCol = parsed.headers.indexOf('基本工资') + 1;
    const otherSalaryCol = parsed.headers.indexOf('其他工资') + 1;
    const probationSalaryCol = parsed.headers.indexOf('试用期工资') + 1;
    const probationOtherSalaryCol = parsed.headers.indexOf('试用期其他工资') + 1;
    const companyAddressCol = parsed.headers.indexOf('劳动合同主体注册地') + 1;

    expect(sheet.getRow(4).getCell(baseSalaryCol).value).toBe('请填写数字；数字格式：保留小数点后两位。');
    expect(sheet.getRow(4).getCell(probationSalaryCol).value).toBe('满足条件时必填；请填写数字；数字格式：保留小数点后两位。');
    expect(sheet.getRow(4).getCell(otherSalaryCol).value).toBe('可填写文字说明，如可填写数字加文字。');
    expect(sheet.getRow(4).getCell(probationOtherSalaryCol).value).toBe('可填写文字说明，如可填写数字加文字。');
    expect(sheet.getRow(5).getCell(baseSalaryCol).value).toBe(1000);
    expect(sheet.getRow(5).getCell(otherSalaryCol).value).toBe('绩效工资5000+岗位津贴2000');
    expect(sheet.getRow(5).getCell(probationSalaryCol).value).toBe(1000);
    expect(sheet.getRow(3).getCell(companyAddressCol).value).toBe('条件必填');
    expect(String(sheet.getRow(4).getCell(companyAddressCol).value)).toContain('满足条件时必填');
    expect(String(sheet.getRow(4).getCell(companyAddressCol).value)).toContain('电子签平台为速创时非必填；电子签平台为E签宝时必填。');
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
