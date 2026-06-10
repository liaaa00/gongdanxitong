export interface FieldMeta {
  code: string;
  name: string;
  group?: string | null;
  order?: number;
  order_type?: string | null;
  business_context?: string[] | null;
  sub_ticket_scope?: string | null;
  virtual?: boolean;
}

export interface ExportTemplateFieldListItem {
  field_code?: string;
  fieldCode?: string;
  code?: string;
  alias?: string;
  title?: string;
  order?: number;
  const?: unknown;
  sameAs?: string;
  formula?: string;
  numFmt?: string;
  header?: string | string[];
  options?: string[];
  dropdownOptions?: string[];
  [key: string]: unknown;
}

export type SelectedFieldKind = 'field' | 'empty' | 'default';

export interface SelectedField {
  id: string;
  kind: SelectedFieldKind;
  field_code?: string;
  alias: string;
  order: number;
  const_value?: string;
  original_alias?: string;
  raw?: ExportTemplateFieldListItem;
}

export interface SystemFieldForExport {
  field_code?: string;
  fieldCode?: string;
  field_name?: string;
  fieldName?: string;
  order_type?: string | null;
  orderType?: string | null;
  business_context?: string[] | null;
  businessContext?: string[] | null;
  sub_ticket_scope?: string | null;
  subTicketScope?: string | null;
  collection_group?: string | null;
  collectionGroup?: string | null;
  display_order?: number | null;
  displayOrder?: number | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
}

export interface FieldOptionGroup {
  group: string;
  fields: FieldMeta[];
}

const EXPORT_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  employee_name: '员工姓名',
  id_card_no: '证件号码',
  mobile: '移动电话',
  email: '电子邮件',
};

const EXPORT_VIRTUAL_FIELDS: FieldMeta[] = [
  {
    code: 'created_by_name',
    name: '发起人',
    group: '基础信息',
    order: 6.5,
    virtual: true,
  },
];

const MODULE_ORDER_TYPE: Record<string, string> = {
  onboarding_contact: 'onboarding',
  contract: 'onboarding',
  data_entry: 'onboarding',
  social_insurance: 'onboarding',
  renewal_contract: 'renewal',
  benefit: 'benefit',
  resignation_contact: 'resignation',
  data_entry_resign: 'resignation',
  resignation_social_insurance: 'resignation',
};

const MODULE_SCOPE_ALIASES: Record<string, string[]> = {
  onboarding_contact: ['onboarding_contact'],
  contract: ['contract'],
  data_entry: ['data_entry'],
  social_insurance: ['social_insurance'],
  renewal_contract: ['renewal_contract'],
  benefit: ['benefit', 'benefit_apply'],
  resignation_contact: ['resignation_contact'],
  data_entry_resign: ['data_entry_resign'],
  resignation_social_insurance: ['resignation_social_insurance', 'social_insurance_resign'],
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  onboarding: '入职字段',
  renewal: '续签字段',
  resignation: '离职字段',
  benefit: '待遇申报字段',
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : null;
}

function splitScope(value: string | null | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGroupName(field: FieldMeta): string {
  return field.group || (field.order_type ? ORDER_TYPE_LABEL[field.order_type] : '') || '未分组字段';
}

function sortFields(fields: FieldMeta[]): FieldMeta[] {
  return [...fields].sort((left, right) => {
    const orderDiff = (left.order ?? 9999) - (right.order ?? 9999);
    if (orderDiff !== 0) return orderDiff;
    return left.name.localeCompare(right.name, 'zh-Hans-CN');
  });
}

function groupFields(fields: FieldMeta[], prefix = ''): FieldOptionGroup[] {
  const map = new Map<string, FieldMeta[]>();
  for (const field of fields) {
    const group = `${prefix}${normalizeGroupName(field)}`;
    const list = map.get(group) || [];
    list.push(field);
    map.set(group, list);
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, fields: sortFields(items) }));
}

function isFieldRelevantToModule(field: FieldMeta, moduleCode?: string): boolean {
  if (!moduleCode || field.virtual) return true;

  const orderType = MODULE_ORDER_TYPE[moduleCode];
  const aliases = MODULE_SCOPE_ALIASES[moduleCode] || [moduleCode];
  const orderMatched = !orderType
    || !field.order_type
    || field.order_type === orderType
    || (field.business_context || []).includes(orderType);
  if (!orderMatched) return false;

  const scopes = splitScope(field.sub_ticket_scope);
  if (scopes.length === 0 || scopes.includes('all')) return true;
  return scopes.some((scope) => aliases.includes(scope));
}

function dedupeFields(fields: FieldMeta[]): FieldMeta[] {
  const map = new Map<string, FieldMeta>();
  for (const field of fields) {
    if (!field.code) continue;
    if (!map.has(field.code)) map.set(field.code, field);
  }
  return Array.from(map.values());
}

export function toExportFieldMeta(field: SystemFieldForExport): FieldMeta | null {
  const code = readString(field.field_code) ?? readString(field.fieldCode);
  if (!code) return null;
  const rawName = readString(field.field_name) ?? readString(field.fieldName) ?? code;
  return {
    code,
    name: EXPORT_FIELD_LABEL_OVERRIDES[code] || rawName,
    group: readString(field.collection_group) ?? readString(field.collectionGroup) ?? null,
    order: readNumber(field.display_order) ?? readNumber(field.displayOrder) ?? 9999,
    order_type: readString(field.order_type) ?? readString(field.orderType) ?? null,
    business_context: readStringArray(field.business_context) ?? readStringArray(field.businessContext),
    sub_ticket_scope: readString(field.sub_ticket_scope) ?? readString(field.subTicketScope) ?? null,
    virtual: false,
  };
}

export function buildExportFieldOptions(
  systemFields: SystemFieldForExport[] = [],
  moduleCode?: string,
): FieldOptionGroup[] {
  const activeSystemFields = systemFields
    .filter((field) => field.is_active !== false && field.isActive !== false)
    .map(toExportFieldMeta)
    .filter((field): field is FieldMeta => Boolean(field));
  const allFields = dedupeFields([...EXPORT_VIRTUAL_FIELDS, ...activeSystemFields]);

  if (!moduleCode) {
    return groupFields(allFields);
  }

  const matched = allFields.filter((field) => isFieldRelevantToModule(field, moduleCode));
  const unmatched = allFields.filter((field) => !isFieldRelevantToModule(field, moduleCode));
  return [
    ...groupFields(matched),
    ...groupFields(unmatched, '其他字段 / '),
  ];
}

export function getTemplateFieldCode(item: ExportTemplateFieldListItem): string | undefined {
  return readString(item.field_code) ?? readString(item.fieldCode) ?? readString(item.code);
}

function readHeaderTitle(header: unknown): string | undefined {
  if (Array.isArray(header)) {
    const first = header.map((item) => (item === null || item === undefined ? '' : String(item).trim())).find(Boolean);
    return first;
  }
  return readString(header);
}

export function getTemplateFieldTitle(item: ExportTemplateFieldListItem, allFields: FieldMeta[]): string {
  const fieldCode = getTemplateFieldCode(item);
  return readString(item.alias)
    ?? readString(item.title)
    ?? readHeaderTitle(item.header)
    ?? (fieldCode ? allFields.find((field) => field.code === fieldCode)?.name : undefined)
    ?? readString(item.sameAs)
    ?? fieldCode
    ?? '模板字段';
}

export function normalizeTemplateFields(
  fieldList: ExportTemplateFieldListItem[] = [],
  allFields: FieldMeta[] = [],
): SelectedField[] {
  return fieldList.map((item, index) => {
    const hasConst = Object.prototype.hasOwnProperty.call(item, 'const');
    const constValue = hasConst && item.const !== null && item.const !== undefined ? String(item.const) : '';
    const alias = getTemplateFieldTitle(item, allFields);
    const fieldCode = getTemplateFieldCode(item);
    const kind: SelectedFieldKind = hasConst ? (constValue.length > 0 ? 'default' : 'empty') : 'field';
    return {
      id: `${kind}-${fieldCode ?? 'const'}-${index}`,
      kind,
      field_code: fieldCode,
      alias,
      order: readNumber(item.order) ?? index + 1,
      const_value: hasConst ? constValue : undefined,
      original_alias: alias,
      raw: item,
    };
  });
}

function shouldDropHeaderForAliasChange(field: SelectedField): boolean {
  return Boolean(field.raw?.header) && Boolean(field.original_alias) && field.alias !== field.original_alias;
}

export function buildTemplateFieldPayload(fields: SelectedField[]): Array<Record<string, unknown>> {
  return fields.map((field, index) => {
    const raw = { ...(field.raw ?? {}) } as Record<string, unknown>;
    if (shouldDropHeaderForAliasChange(field)) delete raw.header;
    delete raw.fieldCode;
    delete raw.code;
    delete raw.field_code;
    delete raw.const;

    const base: Record<string, unknown> = {
      ...raw,
      alias: field.alias,
      order: index + 1,
    };

    if (field.kind === 'empty') {
      return { ...base, const: '' };
    }
    if (field.kind === 'default') {
      return { ...base, const: field.const_value ?? '' };
    }
    return { ...base, field_code: field.field_code };
  });
}

export function createTemplateField(kind: SelectedFieldKind, order: number): SelectedField {
  const isDefault = kind === 'default';
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    alias: isDefault ? '默认值字段' : '空值字段',
    const_value: '',
    order,
  };
}
