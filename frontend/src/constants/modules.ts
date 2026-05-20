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
  data_entry: {
    code: 'data_entry',
    label: '数据录入',
    shortLabel: '数据录入',
    color: 'blue',
    group: 'onboarding',
    title: '数据录入子工单',
    desc: '所有入职数据自动流转至数据录入岗，由数据录入组长统一处理。',
    required: true,
  },
  social_insurance: {
    code: 'social_insurance',
    label: '社保公积金办理',
    shortLabel: '社保公积金',
    color: 'purple',
    group: 'onboarding',
    title: '社保公积金办理子工单',
    desc: '所有入职工单固定生成，用于记录社保、公积金增员和基数办理进度。',
    required: true,
  },
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
    label: '劳动合同签订',
    shortLabel: '劳动合同',
    color: 'green',
    group: 'onboarding',
    title: '劳动合同签订子工单',
    desc: '按原条件生成，由合同组负责签署劳动合同及相关文件。',
  },
  contract_signing: {
    code: 'contract_signing',
    label: '劳动合同签订',
    shortLabel: '劳动合同',
    color: 'green',
    group: 'onboarding',
    title: '劳动合同签订子工单',
    desc: '历史模块码兼容展示。',
  },
  renewal_contract: { code: 'renewal_contract', label: '续签合同', shortLabel: '续签合同', color: 'geekblue', group: 'in_service', title: '续签合同子工单' },
  benefit: { code: 'benefit', label: '待遇申报', shortLabel: '待遇申报', color: 'magenta', group: 'in_service', title: '待遇申报子工单' },
  benefit_apply: { code: 'benefit_apply', label: '待遇申报', shortLabel: '待遇申报', color: 'magenta', group: 'in_service', title: '待遇申报子工单' },
  resignation_contact: { code: 'resignation_contact', label: '离职联系', shortLabel: '离职联系', color: 'orange', group: 'resignation', title: '离职联系子工单' },
  resignation_cert: { code: 'resignation_cert', label: '离职证明', shortLabel: '离职证明', color: 'cyan', group: 'resignation', title: '离职证明子工单' },
  data_entry_resign: { code: 'data_entry_resign', label: '社保停保', shortLabel: '社保停保', color: 'red', group: 'resignation', title: '社保停保子工单' },
};

export const ONBOARDING_SPLIT_MODULES: ModuleMeta[] = [
  MODULE_META.data_entry,
  MODULE_META.social_insurance,
  MODULE_META.onboarding_contact,
  MODULE_META.contract,
];

export const MODULE_GROUPS = [
  {
    label: '入职管理',
    value: 'onboarding',
    options: [
      { label: MODULE_META.data_entry.label, value: 'data_entry' },
      { label: MODULE_META.social_insurance.label, value: 'social_insurance' },
      { label: MODULE_META.onboarding_contact.label, value: 'onboarding_contact' },
      { label: MODULE_META.contract.label, value: 'contract' },
    ],
  },
  {
    label: '在职管理',
    value: 'in_service',
    options: [
      { label: MODULE_META.renewal_contract.label, value: 'renewal_contract' },
      { label: MODULE_META.benefit.label, value: 'benefit' },
    ],
  },
  {
    label: '离职管理',
    value: 'resignation',
    options: [
      { label: MODULE_META.resignation_contact.label, value: 'resignation_contact' },
      { label: MODULE_META.resignation_cert.label, value: 'resignation_cert' },
      { label: MODULE_META.data_entry_resign.label, value: 'data_entry_resign' },
    ],
  },
];

export const ALL_MODULE_OPTIONS = MODULE_GROUPS.flatMap((g) => g.options);

export function getModuleLabel(code?: string | null): string {
  if (!code) return '未知子工单';
  return MODULE_META[code]?.label || '未知子工单';
}

export function getModuleTitle(code?: string | null): string {
  if (!code) return '未知子工单';
  return MODULE_META[code]?.title || `${getModuleLabel(code)}子工单`;
}

export function getModuleColor(code?: string | null): string {
  if (!code) return 'default';
  return MODULE_META[code]?.color || 'default';
}
