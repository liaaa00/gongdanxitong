import { HttpStatus, Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { businessException } from 'src/common/exceptions/business-exception';
import { FieldConfig, FieldType, OrderType } from 'src/entities';
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
const LABEL_COLUMN_WIDTH = 12;
const DATA_VALIDATION_ROWS = 500;

@Injectable()
export class ImportTemplateService {
  constructor(private readonly templateConfigService: ImportTemplateConfigService) {}

  async generate(orderType: OrderType): Promise<ImportTemplateResult> {
    const configuredFields = await this.templateConfigService.list(orderType);
    const fields = configuredFields.map((item) => this.toTemplateField(item));
    if (fields.length === 0) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'NO_FIELDS');
    }

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(MAIN_SHEET_NAME);
    const optionsSheet = workbook.addWorksheet(OPTIONS_SHEET_NAME);
    optionsSheet.state = 'veryHidden';

    this.writeHeaderAndMetaRows(sheet, fields);
    this.applyColumnWidths(sheet, fields);
    this.applyDropdownValidations(sheet, optionsSheet, fields);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
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

  // 列 A 放说明标签（字段名/是否必填/填写要求/填写示例），字段从列 B 起。
  // 解析器以「行首单元格命中 TEMPLATE_META_ROW_LABELS」跳过第 2~4 行说明行，
  // 第 1 行作为表头（header=field_name/header_alias 用于往返匹配），数据从第 5 行开始。
  private writeHeaderAndMetaRows(sheet: Worksheet, fields: TemplateField[]): void {
    const headerRow = sheet.getRow(1);
    const requiredRow = sheet.getRow(2);
    const requirementRow = sheet.getRow(3);
    const exampleRow = sheet.getRow(4);

    headerRow.getCell(1).value = '字段名';
    requiredRow.getCell(1).value = '是否必填';
    requirementRow.getCell(1).value = '填写要求';
    exampleRow.getCell(1).value = '填写示例';

    fields.forEach((field, index) => {
      const col = index + 2;
      headerRow.getCell(col).value = this.headerName(field);
      requiredRow.getCell(col).value = this.isRequired(field) ? '必填' : '非必填';
      requirementRow.getCell(col).value = this.buildRequirement(field);
      exampleRow.getCell(col).value = this.buildExample(field);
    });

    headerRow.font = { bold: true };
    requiredRow.font = { color: { argb: 'FFB00020' } };
    requirementRow.font = { italic: true, color: { argb: 'FF666666' } };
    exampleRow.font = { color: { argb: 'FF999999' } };
  }

  private headerName(field: TemplateField): string {
    return field.templateHeader || field.fieldName || field.fieldCode;
  }

  private isRequired(field: TemplateField): boolean {
    return field.templateRequiredOverride ?? (field.isRequired || field.defaultRequired);
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
    if (parts.length === 0 && field.helpText) {
      parts.push(field.helpText);
    }
    return parts.join('；');
  }

  private buildExample(field: TemplateField): string | number {
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
    if (normalized.startsWith('need_')) return '是';
    if (field.fieldType === FieldType.NUMBER) return 1000;
    return '';
  }

  private applyColumnWidths(sheet: Worksheet, fields: TemplateField[]): void {
    sheet.getColumn(1).width = LABEL_COLUMN_WIDTH;
    fields.forEach((field, index) => {
      const header = this.headerName(field);
      sheet.getColumn(index + 2).width = Math.max(12, Math.min(28, header.length + 4));
    });
  }

  // 每个下拉字段在隐藏 sheet 写一列选项，主表数据区(第5行起)用列表校验引用该区域。
  private applyDropdownValidations(sheet: Worksheet, optionsSheet: Worksheet, fields: TemplateField[]): void {
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
      for (let rowNo = 5; rowNo < 5 + DATA_VALIDATION_ROWS; rowNo += 1) {
        sheet.getCell(`${dataColLetter}${rowNo}`).dataValidation = {
          type: 'list',
          allowBlank: !this.isRequired(field),
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: 'warning',
          error: `请选择：${field.dropdownOptions.join('/')}`,
        };
      }
    });
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
