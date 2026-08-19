import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import * as JSZip from 'jszip';
import { businessException } from 'src/common/exceptions/business-exception';
import { BusinessScope, FieldConfig, FieldType, OrderType } from 'src/entities';
import {
  ContractSubjectItem,
  ContractSubjectsService,
  getAllowedFundRatios,
} from 'src/modules/contract-subjects/contract-subjects.service';
import { ImportTemplateConfigService, ImportTemplateFieldView } from './import-template-config.service';

export interface ImportTemplateResult {
  buffer: Buffer;
  fieldCount: number;
  fileName: string;
}

type TemplateField = FieldConfig & {
  templateHeader?: string | null;
  templateRequiredOverride?: boolean | null;
};

const MAIN_SHEET_NAME = '当前字段配置';
const OPTIONS_SHEET_NAME = '__options';

const ONBOARDING_CUSTOMER_FIELD_COUNT = 31;
const ONBOARDING_ASSISTED_FIELD_COUNT = 10;
const SPECIAL_OPTIONS_BASE_COLUMN = 80;
const ONBOARDING_COLUMN_WIDTHS: Partial<Record<string, number>> = {
  other_salary: 21.7272727272727,
  bank_name: 18.5454545454545,
  bank_account: 18.4545454545455,
  contract_subject: 18.3636363636364,
  company_address: 20.6363636363636,
  project_name: 27.7272727272727,
  work_arrangement: 26.8181818181818,
};
const LABEL_COLUMN_WIDTH = 12;
const DATA_VALIDATION_ROWS = 500;
const FONT_ELEMENT_ORDER = [
  'b', 'i', 'u', 'strike', 'outline', 'shadow', 'condense', 'extend',
  'sz', 'color', 'name', 'family', 'charset', 'vertAlign', 'scheme',
];

@Injectable()
export class ImportTemplateService {
  constructor(
    private readonly templateConfigService: ImportTemplateConfigService,
    @Optional() private readonly contractSubjectsService?: ContractSubjectsService,
  ) {}

  async generate(orderType: OrderType, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<ImportTemplateResult> {
    const configuredFields = await this.templateConfigService.list(orderType, businessScope);
    const fields = configuredFields.map((item) => this.toTemplateField(item));
    const subjects = orderType === OrderType.ONBOARDING && this.contractSubjectsService
      ? await this.contractSubjectsService.list()
      : [];
    if (fields.length === 0) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'NO_FIELDS');
    }

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(MAIN_SHEET_NAME);
    const optionsSheet = workbook.addWorksheet(OPTIONS_SHEET_NAME);
    optionsSheet.state = 'veryHidden';

    this.writeHeaderAndMetaRows(sheet, fields, orderType);
    if (orderType === OrderType.RESIGNATION) {
      this.writeAttachmentHintColumn(sheet, fields.length);
    }
    this.applyColumnWidths(sheet, fields);
    this.applyDropdownValidations(sheet, optionsSheet, fields, orderType, subjects);

    const rawBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const buffer = await this.normalizeFontElementOrder(rawBuffer);
    return { buffer, fieldCount: fields.length, fileName: this.buildFileName(orderType) };
  }

  private toTemplateField(item: ImportTemplateFieldView): TemplateField {
    const rawItem = item as ImportTemplateFieldView & { templateHeader?: string | null; templateRequiredOverride?: boolean | null };
    return {
      id: item.id ?? item.fieldCode,
      fieldCode: item.fieldCode,
      fieldName: item.fieldName,
      fieldType: item.fieldType,
      isRequired: item.isRequired,
      defaultRequired: item.defaultRequired,
      conditionalRequired: item.conditionalRequired,
      validationRegex: null,
      validationMsg: null,
      dropdownOptions: item.dropdownOptions,
      collectionGroup: null,
      placeholder: item.placeholder,
      helpText: item.helpText,
      orderType: item.orderType,
      businessContext: null,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
      createdAt: new Date(),
      templateHeader: item.headerAlias ?? rawItem.templateHeader ?? null,
      templateRequiredOverride: item.isRequiredOverride ?? rawItem.templateRequiredOverride ?? null,
    } as TemplateField;
  }

  private writeHeaderAndMetaRows(sheet: Worksheet, fields: TemplateField[], orderType: OrderType): void {
    const isOnboarding = orderType === OrderType.ONBOARDING;
    const headerRow = sheet.getRow(isOnboarding ? 2 : 1);
    const requiredRow = sheet.getRow(isOnboarding ? 3 : 2);
    const requirementRow = sheet.getRow(isOnboarding ? 4 : 3);
    const exampleRow = sheet.getRow(isOnboarding ? 5 : 4);

    if (isOnboarding) {
      this.writeOnboardingInstructionRow(sheet);
    }
    headerRow.getCell(1).value = '字段名';
    requiredRow.getCell(1).value = '是否必填';
    requirementRow.getCell(1).value = '填写要求';
    exampleRow.getCell(1).value = '填写示例';

    fields.forEach((field, index) => {
      const col = index + 2;
      const headerCell = headerRow.getCell(col);
      headerCell.value = this.headerName(field);
      if (isOnboarding && index < ONBOARDING_CUSTOMER_FIELD_COUNT) {
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      } else if (
        isOnboarding
        && index < ONBOARDING_CUSTOMER_FIELD_COUNT + ONBOARDING_ASSISTED_FIELD_COUNT
      ) {
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { theme: 9, tint: 0.6 } as unknown as { theme: number },
        };
      }
      requiredRow.getCell(col).value = this.requiredText(field);
      requirementRow.getCell(col).value = this.buildRequirement(field);
      exampleRow.getCell(col).value = this.buildExample(field);
    });

    headerRow.font = { bold: true, size: 11, name: '宋体', charset: 134, scheme: 'minor' };
    requiredRow.font = { size: 11, name: '宋体', charset: 134, scheme: 'minor', color: { argb: 'FFB00020' } };
    requirementRow.font = { italic: true, size: 11, name: '宋体', charset: 134, scheme: 'minor', color: { argb: 'FF666666' } };
    exampleRow.font = { size: 11, name: '宋体', charset: 134, scheme: 'minor', color: { argb: 'FF999999' } };
  }

  private writeOnboardingInstructionRow(sheet: Worksheet): void {
    const instructionFont = { bold: true, italic: true, size: 11, name: '宋体', charset: 134, scheme: 'minor' as const };
    sheet.getCell('A1').value = '填表说明：';
    sheet.getCell('B1').value = 'B-AF列为客户必须填写';
    sheet.getCell('AG1').value = 'AG-AP列为客户填写或外服入职联系收集';
    sheet.getCell('AQ1').value = 'AQ-BJ列为外服客户经理填写';
    for (const address of ['A1', 'B1', 'AG1', 'AQ1']) {
      sheet.getCell(address).font = instructionFont;
    }
  }

  // 离职模板追加一列「附件」提示：字段占 2..fieldCount+1，提示列落在 fieldCount+2。
  // 该列不参与字段映射/写库，仅引导用户在数据行任意单元格插入附件；附件按物理行号关联。
  private writeAttachmentHintColumn(sheet: Worksheet, fieldCount: number): void {
    const col = fieldCount + 2;
    sheet.getRow(1).getCell(col).value = '附件';
    sheet.getRow(2).getCell(col).value = '非必填';
    sheet.getRow(3).getCell(col).value = '在本行任意单元格插入附件文件（图片/Word/PDF），系统按行自动关联';
    sheet.getRow(4).getCell(col).value = '（在此行插入附件）';
    sheet.getColumn(col).width = 40;
  }

  private headerName(field: TemplateField): string {
    return field.templateHeader || field.fieldName || field.fieldCode;
  }

  private isRequired(field: TemplateField): boolean {
    return field.templateRequiredOverride ?? (field.isRequired || field.defaultRequired);
  }

  private isConditionallyRequired(field: TemplateField): boolean {
    return !this.isRequired(field) && Boolean(field.conditionalRequired);
  }

  private requiredText(field: TemplateField): string {
    if (this.isRequired(field)) return '必填';
    if (this.isConditionallyRequired(field)) return '条件必填';
    return '非必填';
  }


  private buildRequirement(field: TemplateField): string {
    const parts: string[] = [];
    if (field.conditionalRequired) {
      parts.push('满足条件时必填');
    }
    if (field.fieldType === FieldType.DROPDOWN && field.dropdownOptions?.length) {
      parts.push(`可选：${field.dropdownOptions.join('/')}`);
    } else if (field.fieldType === FieldType.DATE) {
      parts.push('格式：YYYY-MM-DD');
    } else if (field.fieldType === FieldType.NUMBER) {
      parts.push('请填写数字');
    }
    if (field.helpText && !parts.includes(field.helpText)) {
      parts.push(field.helpText);
    }
    return parts.join('；');
  }

  private buildExample(field: TemplateField): string | number {
    if (field.fieldCode === 'base_salary' || field.fieldCode === 'probation_salary') return 1000;
    if (field.fieldCode === 'other_salary') return '绩效工资5000+岗位津贴2000';
    if (field.fieldType === FieldType.DROPDOWN && field.dropdownOptions?.length) {
      return field.dropdownOptions[0];
    }
    const normalized = field.fieldCode.toLowerCase();
    if (normalized.includes('customer_name')) return '示例客户';
    if (normalized.includes('customer_code')) return 'CUST001';
    if (normalized.includes('employee_name')) return '张三';
    if (normalized.includes('id_card') || normalized.includes('identity')) return '330106199001011234';
    if (normalized.includes('mobile') || normalized.includes('phone')) return '13800138000';
    if (normalized.includes('email')) return 'demo@example.com';
    if (normalized.includes('date') || field.fieldType === FieldType.DATE) return '2026-06-01';
    if (normalized.startsWith('need_')) return field.dropdownOptions?.[0] ?? '是';
    if (field.fieldType === FieldType.NUMBER) return 1000;
    return '';
  }

  private applyColumnWidths(sheet: Worksheet, fields: TemplateField[]): void {
    sheet.getColumn(1).width = LABEL_COLUMN_WIDTH;
    fields.forEach((field, index) => {
      const header = this.headerName(field);
      sheet.getColumn(index + 2).width = ONBOARDING_COLUMN_WIDTHS[field.fieldCode]
        ?? Math.max(12, Math.min(28, header.length + 4));
    });
  }

  private applyDropdownValidations(
    sheet: Worksheet,
    optionsSheet: Worksheet,
    fields: TemplateField[],
    orderType: OrderType,
    subjects: ContractSubjectItem[] = [],
  ): void {
    const dataStartRow = orderType === OrderType.ONBOARDING ? 6 : 5;
    const validations = (sheet as Worksheet & {
      dataValidations: { add: (address: string, validation: NonNullable<ReturnType<Worksheet['getCell']>['dataValidation']>) => void };
    }).dataValidations;
    let optionColIndex = 0;
    fields.forEach((field, index) => {
      if (field.fieldType !== FieldType.DROPDOWN || !field.dropdownOptions?.length) {
        return;
      }
      optionColIndex += 1;
      const optionColLetter = this.columnLetter(optionColIndex);
      field.dropdownOptions.forEach((option, rowIndex) => {
        optionsSheet.getCell(`${optionColLetter}${rowIndex + 1}`).value = option;
      });
      const range = `$${optionColLetter}$1:$${optionColLetter}$${field.dropdownOptions.length}`;
      const formula = `=${OPTIONS_SHEET_NAME}!${range}`;
      const dataColLetter = this.columnLetter(index + 2);
      const validationRange = `${dataColLetter}${dataStartRow}:${dataColLetter}${dataStartRow + DATA_VALIDATION_ROWS - 1}`;
      validations.add(validationRange, {
        type: 'list',
        allowBlank: !this.isRequired(field),
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: `请选择：${field.dropdownOptions.join('/')}`,
      });
    });

    if (orderType !== OrderType.ONBOARDING || subjects.length === 0) return;
    const subjectFieldIndex = fields.findIndex((field) => field.fieldCode === 'contract_subject');
    if (subjectFieldIndex < 0) return;
    const subjectColumn = this.columnLetter(subjectFieldIndex + 2);
    const addressFieldIndex = fields.findIndex((field) => field.fieldCode === 'company_address');
    const ratioFieldIndex = fields.findIndex((field) => field.fieldCode === 'fund_ratio');
    const supplementaryFieldIndex = fields.findIndex((field) => field.fieldCode === 'supplementary_fund_ratio');
    const subjectColumnLetter = this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN);
    const addressColumnLetter = this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN + 1);
    const ratioColumnLetter = this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN + 2);
    const supplementaryColumnLetter = this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN + 66);
    subjects.forEach((subject, rowIndex) => {
      const row = rowIndex + 1;
      optionsSheet.getCell(`${subjectColumnLetter}${row}`).value = subject.subjectName;
      optionsSheet.getCell(`${addressColumnLetter}${row}`).value = subject.registeredAddress;
      const ratios = getAllowedFundRatios(subject);
      ratios.forEach((ratio, optionIndex) => {
        optionsSheet.getCell(`${this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN + 2 + optionIndex)}${row}`).value = ratio;
      });
      (subject.supplementaryFundRatioOptions ?? []).forEach((ratio, optionIndex) => {
        optionsSheet.getCell(`${this.columnLetter(SPECIAL_OPTIONS_BASE_COLUMN + 66 + optionIndex)}${row}`).value = ratio;
      });
    });

    const lastSubjectRow = subjects.length;
    const subjectList = `=${OPTIONS_SHEET_NAME}!$${subjectColumnLetter}$1:$${subjectColumnLetter}$${lastSubjectRow}`;
    const subjectRange = `${subjectColumn}${dataStartRow}:${subjectColumn}${dataStartRow + DATA_VALIDATION_ROWS - 1}`;
    validations.add(subjectRange, {
      type: 'list', allowBlank: true, formulae: [subjectList], showErrorMessage: true,
      errorStyle: 'warning', error: '请选择有效的劳动合同主体',
    });
    for (let row = dataStartRow; row < dataStartRow + DATA_VALIDATION_ROWS; row += 1) {
      const matchOffset = `MATCH(${subjectColumn}${row},${OPTIONS_SHEET_NAME}!$${subjectColumnLetter}$1:$${subjectColumnLetter}$${lastSubjectRow},0)-1`;
      if (addressFieldIndex >= 0) {
        const addressColumn = this.columnLetter(addressFieldIndex + 2);
        validations.add(`${addressColumn}${row}`, {
          type: 'list', allowBlank: true,
          formulae: [`=OFFSET(${OPTIONS_SHEET_NAME}!$${addressColumnLetter}$1,${matchOffset},0,1,1)`],
          showErrorMessage: true, errorStyle: 'warning', error: '请选择与劳动合同主体对应的注册地址',
        });
      }
      if (ratioFieldIndex >= 0) {
        const ratioColumn = this.columnLetter(ratioFieldIndex + 2);
        validations.add(`${ratioColumn}${row}`, {
          type: 'list', allowBlank: true,
          formulae: [`=OFFSET(${OPTIONS_SHEET_NAME}!$${ratioColumnLetter}$1,${matchOffset},0,1,MAX(1,COUNTA(OFFSET(${OPTIONS_SHEET_NAME}!$${ratioColumnLetter}$1,${matchOffset},0,1,64))))`],
          showErrorMessage: true, errorStyle: 'warning', error: '请选择该劳动合同主体允许的公积金比例',
        });
      }
      if (supplementaryFieldIndex >= 0) {
        const supplementaryColumn = this.columnLetter(supplementaryFieldIndex + 2);
        validations.add(`${supplementaryColumn}${row}`, {
          type: 'list', allowBlank: true,
          formulae: [`=OFFSET(${OPTIONS_SHEET_NAME}!$${supplementaryColumnLetter}$1,${matchOffset},0,1,MAX(1,COUNTA(OFFSET(${OPTIONS_SHEET_NAME}!$${supplementaryColumnLetter}$1,${matchOffset},0,1,2))))`],
          showErrorMessage: true, errorStyle: 'warning', error: '请选择该上海主体允许的补充公积金比例',
        });
      }
    }
  }


  private async normalizeFontElementOrder(buffer: Buffer): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buffer);
    const stylesFile = zip.file('xl/styles.xml');
    if (!stylesFile) return buffer;

    const stylesXml = await stylesFile.async('string');
    const normalizedXml = stylesXml.replace(/<font>([\s\S]*?)<\/font>/g, (fontXml, content: string) => {
      const children = Array.from(content.matchAll(/<([A-Za-z]+)\b[^>]*\/>/g));
      const unmatched = content.replace(/<([A-Za-z]+)\b[^>]*\/>/g, '').trim();
      if (unmatched || children.length === 0) return fontXml;

      const sorted = children
        .map((match, index) => ({
          xml: match[0],
          index,
          order: FONT_ELEMENT_ORDER.indexOf(match[1]),
        }))
        .sort((left, right) => {
          const leftOrder = left.order < 0 ? FONT_ELEMENT_ORDER.length : left.order;
          const rightOrder = right.order < 0 ? FONT_ELEMENT_ORDER.length : right.order;
          return leftOrder - rightOrder || left.index - right.index;
        })
        .map((item) => item.xml)
        .join('');
      return `<font>${sorted}</font>`;
    });
    if (normalizedXml === stylesXml) return buffer;

    zip.file('xl/styles.xml', normalizedXml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  private columnLetter(index: number): string {
    let result = '';
    let n = index;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  private buildFileName(orderType: OrderType): string {
    const label = orderType === OrderType.RESIGNATION ? '离职' : '入职';
    return `工单管理系统-${label}导入模板.xlsx`;
  }
}
