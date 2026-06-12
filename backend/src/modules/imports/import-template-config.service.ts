import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { FieldConfig, ImportTemplateField, OrderType } from 'src/entities';

export interface ImportTemplateFieldInput {
  fieldCode: string;
  displayOrder?: number;
  headerAlias?: string | null;
  isRequiredOverride?: boolean | null;
  isActive?: boolean;
}

export interface ImportTemplateFieldView {
  id?: string;
  orderType: OrderType;
  order_type: OrderType;
  fieldCode: string;
  field_code: string;
  fieldName: string;
  field_name: string;
  fieldType: FieldConfig['fieldType'];
  field_type: FieldConfig['fieldType'];
  displayOrder: number;
  display_order: number;
  headerAlias: string | null;
  header_alias: string | null;
  isRequiredOverride: boolean | null;
  is_required_override: boolean | null;
  isActive: boolean;
  is_active: boolean;
  source: 'configured' | 'fallback';
  dropdownOptions: FieldConfig['dropdownOptions'];
  dropdown_options: FieldConfig['dropdownOptions'];
  helpText: string | null;
  help_text: string | null;
  placeholder: string | null;
  isRequired: boolean;
  is_required: boolean;
  defaultRequired: boolean;
  default_required: boolean;
  conditionalRequired: FieldConfig['conditionalRequired'];
  conditional_required: FieldConfig['conditionalRequired'];
}

// 入职导入模板排除：办理岗在子单完成时填写的反馈字段，不进业务员发起的导入表。
// 注意：contract_template（劳动合同模板）是业务员发起阶段字段，必须保留在导入模板与导入校验中。
const ONBOARDING_IMPORT_EXCLUDED_FIELDS = new Set([
  'contract_feedback',
  'onboarding_feedback',
  'data_entry_feedback',
]);

const RESIGNATION_IMPORT_TEMPLATE_FIELDS = [
  'employee_name',
  'id_card_no',
  'social_pay_region',
  'social_stop_month',
  'resignation_reason',
  'resignation_date',
  'need_resignation_share',
  'feedback_deadline',
  'is_common_template',
  'template_name',
];

@Injectable()
export class ImportTemplateConfigService {
  constructor(
    @InjectRepository(FieldConfig)
    private readonly fieldRepository: Repository<FieldConfig>,
    @InjectRepository(ImportTemplateField)
    private readonly templateFieldRepository: Repository<ImportTemplateField>,
  ) {}

  async list(orderType: OrderType): Promise<ImportTemplateFieldView[]> {
    const { fields, configured } = await this.resolveFields(orderType);
    const configuredByCode = new Map(configured.map((item) => [item.fieldCode, item]));
    return fields.map((field, index) => this.toView(orderType, field, configuredByCode.get(field.fieldCode), index));
  }

  async replace(orderType: OrderType, fields: ImportTemplateFieldInput[]): Promise<{ affected: number }> {
    const unique = this.normalizeInputs(fields);
    const fieldCodes = unique.map((item) => item.fieldCode);
    if (fieldCodes.length > 0) {
      const available = await this.listAvailableFields(orderType);
      const availableCodes = new Set(available.map((field) => field.fieldCode));
      const missing = fieldCodes.filter((code) => !availableCodes.has(code));
      if (missing.length > 0) {
        throw businessException(4400, HttpStatus.BAD_REQUEST, `导入模板字段不存在、已停用或不属于当前导入类型：${missing.join('、')}`);
      }
    }

    const existing = await this.templateFieldRepository.find({ where: { orderType } });
    const keep = new Set(fieldCodes);
    for (const row of existing) {
      if (!keep.has(row.fieldCode)) {
        row.isActive = false;
        await this.templateFieldRepository.save(row);
      }
    }

    let affected = 0;
    for (let index = 0; index < unique.length; index += 1) {
      const input = unique[index];
      const row = existing.find((item) => item.fieldCode === input.fieldCode);
      const payload = {
        orderType,
        fieldCode: input.fieldCode,
        displayOrder: input.displayOrder ?? index + 1,
        headerAlias: this.normalizeNullableString(input.headerAlias),
        isRequiredOverride: input.isRequiredOverride ?? null,
        isActive: input.isActive ?? true,
      };
      if (row) {
        Object.assign(row, payload);
        await this.templateFieldRepository.save(row);
      } else {
        await this.templateFieldRepository.save(this.templateFieldRepository.create(payload));
      }
      affected += 1;
    }
    return { affected };
  }

  async resolveFields(orderType: OrderType): Promise<{ fields: FieldConfig[]; configured: ImportTemplateField[] }> {
    const configured = await this.templateFieldRepository.find({
      where: { orderType, isActive: true },
      order: { displayOrder: 'ASC', fieldCode: 'ASC' },
    });
    if (configured.length > 0) {
      const byCode = await this.loadActiveFieldMap(orderType, configured.map((item) => item.fieldCode));
      const fields = configured
        .map((item) => {
          const field = byCode.get(item.fieldCode);
          return field ? this.applyConfiguredRules(orderType, field, item) : null;
        })
        .filter((field): field is FieldConfig => Boolean(field));
      return { fields, configured };
    }
    return { fields: await this.resolveFallbackFields(orderType), configured: [] };
  }

  async listAvailableFields(orderType: OrderType): Promise<FieldConfig[]> {
    const fields = await this.loadActiveFields(orderType);
    return this.filterAllowedImportFields(orderType, fields)
      .map((field) => this.applyTemplateRules(orderType, field));
  }

  private normalizeInputs(fields: ImportTemplateFieldInput[]): ImportTemplateFieldInput[] {
    const seen = new Set<string>();
    const result: ImportTemplateFieldInput[] = [];
    for (const item of fields) {
      const fieldCode = String(item.fieldCode || '').trim();
      if (!fieldCode || seen.has(fieldCode)) continue;
      seen.add(fieldCode);
      result.push({ ...item, fieldCode });
    }
    return result;
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
  }

  private async resolveFallbackFields(orderType: OrderType): Promise<FieldConfig[]> {
    const fields = await this.loadActiveFields(orderType);
    if (orderType === OrderType.RESIGNATION) {
      const byCode = new Map(fields.map((field) => [field.fieldCode, field]));
      return RESIGNATION_IMPORT_TEMPLATE_FIELDS
        .map((code) => byCode.get(code))
        .filter((field): field is FieldConfig => Boolean(field))
        .map((field) => this.applyTemplateRules(orderType, field));
    }
    if (orderType !== OrderType.ONBOARDING) {
      return fields.map((field) => this.applyTemplateRules(orderType, field));
    }
    return this.filterAllowedImportFields(orderType, fields)
      .map((field) => this.applyTemplateRules(orderType, field));
  }

  private filterAllowedImportFields(orderType: OrderType, fields: FieldConfig[]): FieldConfig[] {
    if (orderType !== OrderType.ONBOARDING) return fields;
    return fields.filter((field) => !ONBOARDING_IMPORT_EXCLUDED_FIELDS.has(field.fieldCode));
  }

  private async loadActiveFieldMap(orderType: OrderType, fieldCodes: string[]): Promise<Map<string, FieldConfig>> {
    if (fieldCodes.length === 0) return new Map();
    const fields = await this.fieldRepository
      .createQueryBuilder('field')
      .where('field.is_active = true')
      .andWhere('field.field_code IN (:...fieldCodes)', { fieldCodes })
      .andWhere(
        '(field.order_type IS NULL OR field.order_type = :orderType OR field.business_context @> :businessContext)',
        { orderType, businessContext: JSON.stringify([orderType]) },
      )
      .getMany();
    return new Map(fields.map((field) => [field.fieldCode, field]));
  }

  private loadActiveFields(orderType: OrderType): Promise<FieldConfig[]> {
    return this.fieldRepository
      .createQueryBuilder('field')
      .where('field.is_active = true')
      .andWhere(
        '(field.order_type IS NULL OR field.order_type = :orderType OR field.business_context @> :businessContext)',
        { orderType, businessContext: JSON.stringify([orderType]) },
      )
      .orderBy('field.display_order', 'ASC')
      .addOrderBy('field.created_at', 'ASC')
      .getMany();
  }

  private applyConfiguredRules(orderType: OrderType, field: FieldConfig, configured: ImportTemplateField): FieldConfig {
    const withTemplateRules = this.applyTemplateRules(orderType, field) as FieldConfig & {
      templateHeader?: string | null;
      templateRequiredOverride?: boolean | null;
      importTemplateConfigured?: boolean;
    };
    withTemplateRules.importTemplateConfigured = true;
    withTemplateRules.templateHeader = configured.headerAlias ?? null;
    withTemplateRules.templateRequiredOverride = configured.isRequiredOverride ?? null;
    if (configured.isRequiredOverride !== null && configured.isRequiredOverride !== undefined) {
      withTemplateRules.isRequired = configured.isRequiredOverride;
      withTemplateRules.defaultRequired = false;
    }
    return withTemplateRules;
  }

  private applyTemplateRules(orderType: OrderType, field: FieldConfig): FieldConfig {
    if (orderType !== OrderType.ONBOARDING) return field;
    if (field.fieldCode === 'contract_template') {
      // 劳动合同模板进入导入模板，但导入阶段不作必填（业务规则清单 17）。
      return { ...field, isRequired: false, defaultRequired: false, conditionalRequired: null } as FieldConfig;
    }
    if (field.fieldCode === 'feedback_deadline' || field.fieldCode === 'is_common_template') {
      return {
        ...field,
        isRequired: false,
        defaultRequired: false,
        conditionalRequired: this.needOnboardingContactCondition(),
      } as FieldConfig;
    }
    if (field.fieldCode === 'template_name') {
      return {
        ...field,
        isRequired: false,
        defaultRequired: false,
        conditionalRequired: this.commonOnboardingTemplateCondition(),
      } as FieldConfig;
    }
    return field;
  }

  private needOnboardingContactCondition(): Record<string, unknown> {
    return { field: 'need_onboarding_contact', op: 'EQ', value: '是' };
  }

  private commonOnboardingTemplateCondition(): Record<string, unknown> {
    return {
      op: 'AND',
      children: [
        this.needOnboardingContactCondition(),
        { field: 'is_common_template', op: 'EQ', value: '是' },
      ],
    };
  }

  private toView(orderType: OrderType, field: FieldConfig, configured: ImportTemplateField | undefined, index: number): ImportTemplateFieldView {
    const requiredOverride = configured?.isRequiredOverride ?? null;
    const isRequired = requiredOverride ?? (field.isRequired || field.defaultRequired);
    return {
      id: configured?.id,
      orderType,
      order_type: orderType,
      fieldCode: field.fieldCode,
      field_code: field.fieldCode,
      fieldName: field.fieldName,
      field_name: field.fieldName,
      fieldType: field.fieldType,
      field_type: field.fieldType,
      displayOrder: configured?.displayOrder ?? index + 1,
      display_order: configured?.displayOrder ?? index + 1,
      headerAlias: configured?.headerAlias ?? null,
      header_alias: configured?.headerAlias ?? null,
      isRequiredOverride: requiredOverride,
      is_required_override: requiredOverride,
      isActive: configured?.isActive ?? true,
      is_active: configured?.isActive ?? true,
      source: configured ? 'configured' : 'fallback',
      dropdownOptions: field.dropdownOptions,
      dropdown_options: field.dropdownOptions,
      helpText: field.helpText,
      help_text: field.helpText,
      placeholder: field.placeholder,
      isRequired,
      is_required: isRequired,
      defaultRequired: field.defaultRequired,
      default_required: field.defaultRequired,
      conditionalRequired: field.conditionalRequired,
      conditional_required: field.conditionalRequired,
    };
  }
}
