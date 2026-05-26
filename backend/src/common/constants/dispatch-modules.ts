export const DISPATCH_MODULE_LABELS: Record<string, string> = {
  onboarding_contact: '入职联系',
  contract: '劳动合同签订',
  data_entry: '数据录入',
  social_insurance: '社保公积金办理',
  renewal_contract: '合同续签',
  benefit_apply: '待遇申报',
  resignation_contact: '离职联系',
  resignation_cert: '离职证明',
};

export const DISPATCH_MODULE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(DISPATCH_MODULE_LABELS).map(([code, label]) => [label, code]),
);

export function resolveDispatchModuleCode(input: string | undefined | null): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  return DISPATCH_MODULE_LABELS[value] ? value : DISPATCH_MODULE_NAME_TO_CODE[value] ?? value;
}
