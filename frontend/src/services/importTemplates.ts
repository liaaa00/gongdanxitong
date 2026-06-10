import request from './request';
import { isMockMode, mockDelay } from './mock';
import { getFallbackFields, type FieldConfigItem } from './fields';

export interface ImportTemplateFieldItem extends FieldConfigItem {
  order_type: string;
  field_code: string;
  field_name: string;
  field_type: FieldConfigItem['field_type'];
  display_order: number;
  header_alias: string | null;
  is_required_override: boolean | null;
  source?: 'configured' | 'fallback';
}

export interface SaveImportTemplateFieldItem {
  fieldCode: string;
  displayOrder: number;
  headerAlias?: string | null;
  isRequiredOverride?: boolean | null;
  isActive?: boolean;
}

const ONBOARDING_EXCLUDED = new Set([
  'contract_feedback',
  'onboarding_feedback',
  'data_entry_feedback',
  'contract_template',
]);

const RESIGNATION_DEFAULT_FIELDS = [
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

const mockConfig = new Map<string, ImportTemplateFieldItem[]>();

function normalizeField(raw: any, orderType: string): ImportTemplateFieldItem {
  return {
    id: String(raw.id ?? raw.field_code ?? raw.fieldCode ?? ''),
    field_code: raw.field_code ?? raw.fieldCode ?? '',
    field_name: raw.field_name ?? raw.fieldName ?? '',
    field_type: raw.field_type ?? raw.fieldType ?? 'text',
    is_required: raw.is_required ?? raw.isRequired ?? false,
    default_required: raw.default_required ?? raw.defaultRequired ?? false,
    conditional_required: raw.conditional_required ?? raw.conditionalRequired ?? null,
    validation_regex: raw.validation_regex ?? raw.validationRegex ?? null,
    validation_msg: raw.validation_msg ?? raw.validationMsg ?? null,
    dropdown_options: normalizeOptions(raw.dropdown_options ?? raw.dropdownOptions),
    placeholder: raw.placeholder ?? null,
    help_text: raw.help_text ?? raw.helpText ?? null,
    order_type: raw.order_type ?? raw.orderType ?? orderType,
    source_category: raw.source_category ?? raw.sourceCategory ?? null,
    sub_ticket_scope: raw.sub_ticket_scope ?? raw.subTicketScope ?? null,
    collection_group: raw.collection_group ?? raw.collectionGroup ?? null,
    business_context: Array.isArray(raw.business_context) ? raw.business_context : (Array.isArray(raw.businessContext) ? raw.businessContext : null),
    display_order: raw.display_order ?? raw.displayOrder ?? 99,
    is_active: raw.is_active ?? raw.isActive ?? true,
    header_alias: raw.header_alias ?? raw.headerAlias ?? null,
    is_required_override: raw.is_required_override ?? raw.isRequiredOverride ?? null,
    source: raw.source ?? 'configured',
  };
}

function normalizeOptions(options: unknown): FieldConfigItem['dropdown_options'] {
  if (!Array.isArray(options)) return null;
  return options.map((item) => {
    if (typeof item === 'string') return { label: item, value: item };
    const obj = item as Record<string, unknown>;
    const label = String(obj.label ?? obj.name ?? obj.value ?? '');
    const value = String(obj.value ?? obj.label ?? obj.name ?? '');
    return { label, value };
  }).filter((item) => item.label && item.value);
}

function toMockTemplateField(field: FieldConfigItem, orderType: string, index: number): ImportTemplateFieldItem {
  return normalizeField({
    ...field,
    order_type: orderType,
    display_order: index + 1,
    header_alias: null,
    is_required_override: null,
    source: 'fallback',
  }, orderType);
}

function buildMockConfig(orderType: string): ImportTemplateFieldItem[] {
  const available = getMockAvailable(orderType);
  if (orderType === 'resignation') {
    const byCode = new Map(available.map((field) => [field.field_code, field]));
    return RESIGNATION_DEFAULT_FIELDS
      .map((code) => byCode.get(code))
      .filter((field): field is ImportTemplateFieldItem => Boolean(field))
      .map((field, index) => ({ ...field, display_order: index + 1, source: 'fallback' }));
  }
  return available.map((field, index) => ({ ...field, display_order: index + 1, source: 'fallback' }));
}

function getMockAvailable(orderType: string): ImportTemplateFieldItem[] {
  return getFallbackFields(orderType)
    .filter((field) => orderType !== 'onboarding' || !ONBOARDING_EXCLUDED.has(field.field_code))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    .map((field, index) => toMockTemplateField(field, orderType, index));
}

export async function getImportTemplateConfig(orderType: string): Promise<ImportTemplateFieldItem[]> {
  if (isMockMode) {
    if (!mockConfig.has(orderType)) mockConfig.set(orderType, buildMockConfig(orderType));
    return mockDelay([...(mockConfig.get(orderType) || [])]);
  }
  const result = await request.get('/work-orders/import/template-config', { params: { orderType } }) as any;
  const list = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
  return (Array.isArray(list) ? list : []).map((item) => normalizeField(item, orderType));
}

export async function getAvailableImportTemplateFields(orderType: string): Promise<ImportTemplateFieldItem[]> {
  if (isMockMode) return mockDelay(getMockAvailable(orderType));
  const result = await request.get('/work-orders/import/template-config/available-fields', { params: { orderType } }) as any;
  const list = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
  return (Array.isArray(list) ? list : []).map((item) => normalizeField(item, orderType));
}

export async function replaceImportTemplateConfig(orderType: string, fields: SaveImportTemplateFieldItem[]): Promise<ImportTemplateFieldItem[]> {
  if (isMockMode) {
    const available = getMockAvailable(orderType);
    const byCode = new Map(available.map((field) => [field.field_code, field]));
    const next: ImportTemplateFieldItem[] = [];
    fields.forEach((item, index) => {
      const field = byCode.get(item.fieldCode);
      if (!field) return;
      next.push({
        ...field,
        display_order: item.displayOrder ?? index + 1,
        header_alias: item.headerAlias ?? null,
        is_required_override: item.isRequiredOverride ?? null,
        source: 'configured',
      });
    });
    mockConfig.set(orderType, next);
    return mockDelay(next);
  }
  const result = await request.put('/work-orders/import/template-config', { fields }, { params: { orderType } }) as any;
  const list = Array.isArray(result) ? result : (result?.fields || result?.list || result?.items || result?.data || []);
  return (Array.isArray(list) ? list : []).map((item) => normalizeField(item, orderType));
}
