import { ROLE, canonicalRoleCodes } from '@/constants/roles';

export const PHASE1_ENABLED_MODULE_CODES = [
  'onboarding_contact',
  'contract',
  'data_entry',
  'social_insurance',
  'resignation_contact',
  'data_entry_resign',
  'social_insurance_resign',
] as const;

export const PHASE1_ENABLED_ORDER_TYPES = ['onboarding', 'resignation', 'offboarding', 'leave'] as const;

export const HIDDEN_PHASE1_MODULE_CODES = new Set([
  'renewal_contract',
  'benefit',
  'benefit_apply',
  'social_insurance_change',
  'social_fund_change',
]);

export const PHASE1_ENABLED_MODULE_SET = new Set<string>(PHASE1_ENABLED_MODULE_CODES);
export const PHASE1_ENABLED_ORDER_TYPE_SET = new Set<string>(PHASE1_ENABLED_ORDER_TYPES);

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  contract_signing: '劳动合同新签',
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  renewal_contract: '劳动合同续签',
  benefit: '待遇申报',
  benefit_apply: '待遇申报',
  social_insurance_change: '社保公积金变更',
  social_fund_change: '社保公积金变更',
  resignation_contact: '离职材料收集',
  resignation_cert: '离职材料收集',
  data_entry_resign: '减员报岗录入',
  social_insurance_resign: '社保公积金减员',
  resignation_social_insurance: '社保公积金减员',
  social_insurance_reduce: '社保公积金减员',
  social_security_reduce: '社保公积金减员',
  social_fund_reduce: '社保公积金减员',
};

const MODULE_PERMISSION_PATTERNS = [
  /^module[:.](.+)$/, 
  /^module:(.+):view$/, 
  /^module:(.+):manage$/, 
  /^dispatched[:.](.+)$/, 
  /^dispatched:(.+):view$/, 
  /^dispatched:(.+):manage$/, 
  /^dashboard[:.]module[:.](.+)$/, 
  /^work_order[:.]module[:.](.+)$/, 
];

const SOCIAL_REDUCTION_ALIASES = new Set([
  'social_insurance_resign',
  'resignation_social_insurance',
  'social_insurance_reduce',
  'social_security_reduce',
  'social_fund_reduce',
]);

const SOCIAL_CHANGE_ALIASES = new Set([
  'social_insurance_change',
  'social_fund_change',
]);

export function normalizeModuleCode(code?: string | null): string {
  const value = String(code || '').trim();
  if (!value) return '';
  if (value === 'contract_signing') return 'contract';
  if (value === 'benefit') return 'benefit_apply';
  if (SOCIAL_REDUCTION_ALIASES.has(value)) return 'social_insurance_resign';
  if (SOCIAL_CHANGE_ALIASES.has(value)) return 'social_insurance_change';
  return value;
}

export function getPhase1ModuleDisplayName(code?: string | null): string {
  const raw = String(code || '').trim();
  const normalized = normalizeModuleCode(raw);
  return MODULE_DISPLAY_NAMES[raw] || MODULE_DISPLAY_NAMES[normalized] || raw || '未知子工单';
}

export function isPhase1VisibleModule(code?: string | null): boolean {
  const normalized = normalizeModuleCode(code);
  if (!normalized) return false;
  if (HIDDEN_PHASE1_MODULE_CODES.has(normalized)) return false;
  return PHASE1_ENABLED_MODULE_SET.has(normalized);
}

export function isPhase1VisibleOrderType(orderType?: string | null): boolean {
  const value = String(orderType || '').trim();
  return PHASE1_ENABLED_ORDER_TYPE_SET.has(value);
}

function moduleCodesFromPermissions(permissions?: string[]): Set<string> {
  const result = new Set<string>();
  for (const permission of permissions || []) {
    const value = String(permission || '').trim();
    if (!value || value === '*' || value === 'all' || value === 'work_order.*') continue;
    for (const pattern of MODULE_PERMISSION_PATTERNS) {
      const matched = value.match(pattern);
      if (matched?.[1]) {
        const code = normalizeModuleCode(matched[1]);
        if (code) result.add(code);
      }
    }
  }
  return result;
}

export function getDefaultAccessibleModuleCodesByRoles(userRoles: { code?: string }[] | undefined): Set<string> | null {
  const roles = new Set(canonicalRoleCodes(userRoles));
  if (roles.has(ROLE.ADMIN)) return new Set(PHASE1_ENABLED_MODULE_SET);
  if (roles.has(ROLE.BUSINESS_OWNER) || roles.has(ROLE.BUSINESS_GROUP_LEADER) || roles.has(ROLE.BUSINESS_GROUP_MEMBER)) {
    return new Set(PHASE1_ENABLED_MODULE_SET);
  }

  const modules = new Set<string>();
  if (roles.has(ROLE.SHARED_TEAM_OWNER)) {
    modules.add('contract');
    modules.add('onboarding_contact');
    modules.add('resignation_contact');
  }
  if (roles.has(ROLE.LABOR_CONTRACT_MEMBER)) modules.add('contract');
  if (roles.has(ROLE.ONBOARDING_RESIGNATION_MEMBER)) {
    modules.add('onboarding_contact');
    modules.add('resignation_contact');
  }
  if (roles.has(ROLE.DATA_ENTRY_LEADER)) {
    modules.add('data_entry');
    modules.add('data_entry_resign');
  }
  if (roles.has(ROLE.SOCIAL_INSURANCE_SPECIALIST)) {
    modules.add('social_insurance');
    modules.add('social_insurance_resign');
  }

  return modules.size > 0 ? modules : null;
}

export function getAccessibleModuleCodes(userRoles: { code?: string }[] | undefined, permissions?: string[]): Set<string> | null {
  const permissionModules = moduleCodesFromPermissions(permissions);
  const defaultModules = getDefaultAccessibleModuleCodesByRoles(userRoles);
  const roles = new Set(canonicalRoleCodes(userRoles));
  const isBusinessOrAdmin = roles.has(ROLE.ADMIN)
    || roles.has(ROLE.BUSINESS_OWNER)
    || roles.has(ROLE.BUSINESS_GROUP_LEADER)
    || roles.has(ROLE.BUSINESS_GROUP_MEMBER);

  if (permissionModules.size > 0 && !isBusinessOrAdmin) {
    return new Set([...permissionModules].filter(isPhase1VisibleModule));
  }
  if (!defaultModules) return null;
  return new Set([...defaultModules].filter(isPhase1VisibleModule));
}

export function canAccessModuleCode(code: string | undefined | null, userRoles: { code?: string }[] | undefined, permissions?: string[]): boolean {
  const normalized = normalizeModuleCode(code);
  if (!isPhase1VisibleModule(normalized)) return false;
  const accessible = getAccessibleModuleCodes(userRoles, permissions);
  if (!accessible) return false;
  return accessible.has(normalized);
}
