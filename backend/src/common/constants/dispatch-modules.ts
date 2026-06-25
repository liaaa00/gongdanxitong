export const DISPATCH_MODULE_LABELS: Record<string, string> = {
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  renewal_contract: '劳动合同续签',
  benefit_apply: '待遇申报',
  social_insurance_change: '社保公积金变更',
  resignation_contact: '离职材料收集',
  resignation_cert: '离职材料收集',
  data_entry_resign: '减员报岗录入',
  resignation_social_insurance: '社保公积金减员',
};

export const PHASE1_VISIBLE_DISPATCH_MODULE_CODES = [
  'onboarding_contact',
  'contract',
  'data_entry',
  'social_insurance',
  'resignation_contact',
  'data_entry_resign',
  'resignation_social_insurance',
] as const;

export const PHASE1_VISIBLE_ORDER_TYPES = ['onboarding', 'resignation'] as const;

const PHASE1_VISIBLE_DISPATCH_MODULE_SET = new Set<string>(PHASE1_VISIBLE_DISPATCH_MODULE_CODES);
const PHASE1_VISIBLE_ORDER_TYPE_SET = new Set<string>(PHASE1_VISIBLE_ORDER_TYPES);

const SOCIAL_INSURANCE_DISPATCH_MODULES = new Set<string>([
  'social_insurance',
  'resignation_social_insurance',
]);

const MODULE_CODE_ALIASES: Record<string, string> = {
  contract_signing: 'contract',
  benefit: 'benefit_apply',
  social_insurance_resign: 'resignation_social_insurance',
  social_insurance_reduce: 'resignation_social_insurance',
  social_security_reduce: 'resignation_social_insurance',
  social_fund_reduce: 'resignation_social_insurance',
  social_fund_change: 'social_insurance_change',
};

const MODULE_NAME_ALIASES: Record<string, string> = {
  入职联系: 'onboarding_contact',
  劳动合同新签: 'contract',
  劳动合同签订: 'contract',
  增员报岗录入: 'data_entry',
  数据录入: 'data_entry',
  社保公积金增员: 'social_insurance',
  社保公积金办理: 'social_insurance',
  劳动合同续签: 'renewal_contract',
  合同续签: 'renewal_contract',
  待遇申报: 'benefit_apply',
  社保公积金变更: 'social_insurance_change',
  离职材料收集: 'resignation_contact',
  离职联系: 'resignation_contact',
  离职证明: 'resignation_cert',
  减员报岗录入: 'data_entry_resign',
  社保停保: 'data_entry_resign',
  社保公积金减员: 'resignation_social_insurance',
};

export const DISPATCH_MODULE_NAME_TO_CODE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DISPATCH_MODULE_LABELS).map(([code, label]) => [label, code])),
  ...MODULE_NAME_ALIASES,
};

export function normalizeDispatchModuleCode(input: string | undefined | null): string {
  const value = input?.trim();
  if (!value) return '';
  return MODULE_CODE_ALIASES[value] ?? value;
}

export function resolveDispatchModuleCode(input: string | undefined | null): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  const normalized = normalizeDispatchModuleCode(value);
  if (DISPATCH_MODULE_LABELS[normalized]) return normalized;
  return DISPATCH_MODULE_NAME_TO_CODE[value] ?? normalized;
}

export function isPhase1VisibleDispatchModule(moduleCode: string | undefined | null): boolean {
  const normalized = normalizeDispatchModuleCode(moduleCode);
  return Boolean(normalized) && PHASE1_VISIBLE_DISPATCH_MODULE_SET.has(normalized);
}

export function isPhase1VisibleOrderType(orderType: string | undefined | null): boolean {
  const normalized: string = orderType?.trim() ?? '';
  return normalized.length > 0 && PHASE1_VISIBLE_ORDER_TYPE_SET.has(normalized);
}

export function filterPhase1VisibleDispatchModules(moduleCodes: readonly string[]): string[] {
  return Array.from(new Set(moduleCodes.map(normalizeDispatchModuleCode).filter(isPhase1VisibleDispatchModule)));
}

export function isSocialInsuranceDispatchModule(moduleCode: string | undefined | null): boolean {
  return SOCIAL_INSURANCE_DISPATCH_MODULES.has(normalizeDispatchModuleCode(moduleCode));
}

export function getDispatchModuleLabel(moduleCode: string | undefined | null): string {
  const normalized = normalizeDispatchModuleCode(moduleCode);
  return DISPATCH_MODULE_LABELS[normalized] ?? normalized ?? '未知子工单';
}
