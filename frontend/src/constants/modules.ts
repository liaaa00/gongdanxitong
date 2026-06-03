export type OnboardingSubModuleCode = 'data_entry' | 'social_insurance' | 'onboarding_contact' | 'contract' | 'contract_signing';

export interface ModuleMeta {
  code: string;
  label: string;
  shortLabel: string;
  color: string;
  group: 'onboarding' | 'in_service' | 'resignation' | 'other';
  title?: string;
  desc?: string;
  required?: boolean;
}

export const MODULE_META: Record<string, ModuleMeta> = {
  onboarding_contact: {
    code: 'onboarding_contact',
    label: '入职联系',
    shortLabel: '入职联系',
    color: 'cyan',
    group: 'onboarding',
    title: '入职联系子工单',
    desc: '按原条件生成，由共享团队办理员工入职联络、入职通知和资料确认。',
  },
  contract: {
    code: 'contract',
    label: '劳动合同新签',
    shortLabel: '劳动合同新签',
    color: 'green',
    group: 'onboarding',
    title: '劳动合同新签子工单',
    desc: '按原条件生成，由合同组负责签署劳动合同及相关文件。',
  },
  contract_signing: {
    code: 'contract_signing',
    label: '劳动合同新签',
    shortLabel: '劳动合同新签',
    color: 'green',
    group: 'onboarding',
    title: '劳动合同新签子工单',
    desc: '历史模块码兼容展示。',
  },
  data_entry: {
    code: 'data_entry',
    label: '增员报岗录入',
    shortLabel: '增员报岗',
    color: 'blue',
    group: 'onboarding',
    title: '增员报岗录入子工单',
    desc: '所有入职数据自动流转至增员报岗录入岗，由数据录入组长统一处理。',
    required: true,
  },
  social_insurance: {
    code: 'social_insurance',
    label: '社保公积金增员',
    shortLabel: '社保公积金增员',
    color: 'purple',
    group: 'onboarding',
    title: '社保公积金增员子工单',
    desc: '所有入职工单固定生成，用于记录社保、公积金增员和基数办理进度。',
    required: true,
  },
  renewal_contract: { code: 'renewal_contract', label: '劳动合同续签', shortLabel: '劳动合同续签', color: 'geekblue', group: 'in_service', title: '劳动合同续签子工单' },
  benefit: { code: 'benefit', label: '待遇申报', shortLabel: '待遇申报', color: 'magenta', group: 'in_service', title: '待遇申报子工单' },
  benefit_apply: { code: 'benefit_apply', label: '待遇申报', shortLabel: '待遇申报', color: 'magenta', group: 'in_service', title: '待遇申报子工单' },
  social_insurance_change: { code: 'social_insurance_change', label: '社保公积金变更', shortLabel: '社保公积金变更', color: 'purple', group: 'in_service', title: '社保公积金变更子工单' },
  resignation_contact: { code: 'resignation_contact', label: '离职材料收集', shortLabel: '离职材料', color: 'orange', group: 'resignation', title: '离职材料收集子工单' },
  resignation_cert: { code: 'resignation_cert', label: '离职材料收集', shortLabel: '离职材料', color: 'cyan', group: 'resignation', title: '离职材料收集子工单' },
  data_entry_resign: { code: 'data_entry_resign', label: '减员报岗录入', shortLabel: '减员报岗', color: 'red', group: 'resignation', title: '减员报岗录入子工单' },
  social_insurance_resign: { code: 'social_insurance_resign', label: '社保公积金减员', shortLabel: '社保公积金减员', color: 'purple', group: 'resignation', title: '社保公积金减员子工单' },
  resignation_social_insurance: { code: 'resignation_social_insurance', label: '社保公积金减员', shortLabel: '社保公积金减员', color: 'purple', group: 'resignation', title: '社保公积金减员子工单' },
};

export const IN_SERVICE_MODULE_CODES = new Set([
  'renewal_contract',
  'benefit',
  'benefit_apply',
  'social_insurance_change',
]);

export const PHASE_ONE_VISIBLE_MODULE_CODES = new Set([
  'onboarding_contact',
  'contract',
  'contract_signing',
  'data_entry',
  'social_insurance',
  'resignation_contact',
  'resignation_cert',
  'data_entry_resign',
  'social_insurance_resign',
  'resignation_social_insurance',
]);

export const ONBOARDING_SPLIT_MODULES: ModuleMeta[] = [
  MODULE_META.onboarding_contact,
  MODULE_META.contract,
  MODULE_META.data_entry,
  MODULE_META.social_insurance,
];

export const MODULE_GROUPS: Array<{
  label: string;
  value: 'onboarding' | 'resignation';
  options: Array<{ label: string; value: string }>;
}> = [
  {
    label: '入职管理',
    value: 'onboarding',
    options: [
      { label: MODULE_META.onboarding_contact.label, value: 'onboarding_contact' },
      { label: MODULE_META.contract.label, value: 'contract' },
      { label: MODULE_META.data_entry.label, value: 'data_entry' },
      { label: MODULE_META.social_insurance.label, value: 'social_insurance' },
    ],
  },
  {
    label: '离职管理',
    value: 'resignation',
    options: [
      { label: MODULE_META.resignation_contact.label, value: 'resignation_contact' },
      { label: MODULE_META.data_entry_resign.label, value: 'data_entry_resign' },
      { label: MODULE_META.social_insurance_resign.label, value: 'social_insurance_resign' },
      { label: MODULE_META.resignation_cert.label, value: 'resignation_cert' },
    ],
  },
];

export const ALL_MODULE_OPTIONS: Array<{ label: string; value: string }> = MODULE_GROUPS.flatMap((g) => g.options);
export const PHASE_ONE_MODULE_OPTIONS: Array<{ label: string; value: string }> = ALL_MODULE_OPTIONS;

const RESIGNATION_ORDER_TYPES = new Set(['resignation', 'offboarding', 'leave']);
const CHANGE_ORDER_TYPES = new Set(['renewal', 'benefit', 'in_service', 'change']);

function normalizeCode(code?: string | null): string {
  return String(code || '').trim();
}

export function isInServiceModule(code?: string | null): boolean {
  return IN_SERVICE_MODULE_CODES.has(normalizeCode(code));
}

export function isPhaseOneVisibleModule(code?: string | null): boolean {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  return PHASE_ONE_VISIBLE_MODULE_CODES.has(normalized);
}

export function isSocialInsuranceModule(code?: string | null): boolean {
  const normalized = normalizeCode(code);
  return normalized === 'social_insurance' || normalized === 'social_insurance_resign' || normalized === 'resignation_social_insurance' || normalized === 'social_insurance_change';
}

export function getPhaseOneModuleOptions(): Array<{ label: string; value: string }> {
  return PHASE_ONE_MODULE_OPTIONS;
}

export function getModuleLabel(code?: string | null, orderType?: string | null): string {
  const normalized = normalizeCode(code);
  if (!normalized) return '未知子工单';
  const normalizedOrderType = String(orderType || '').trim();
  if (normalized === 'social_insurance') {
    if (RESIGNATION_ORDER_TYPES.has(normalizedOrderType)) return '社保公积金减员';
    if (CHANGE_ORDER_TYPES.has(normalizedOrderType)) return '社保公积金变更';
    return MODULE_META.social_insurance.label;
  }
  return MODULE_META[normalized]?.label || '未知子工单';
}

export function getModuleTitle(code?: string | null, orderType?: string | null): string {
  const normalized = normalizeCode(code);
  if (!normalized) return '未知子工单';
  if (normalized === 'social_insurance' && orderType) return `${getModuleLabel(normalized, orderType)}子工单`;
  return MODULE_META[normalized]?.title || `${getModuleLabel(normalized, orderType)}子工单`;
}

export function getModuleColor(code?: string | null): string {
  const normalized = normalizeCode(code);
  if (!normalized) return 'default';
  return MODULE_META[normalized]?.color || 'default';
}
