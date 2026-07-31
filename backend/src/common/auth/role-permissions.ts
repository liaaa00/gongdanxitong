export const ADMIN_ROLE = 'admin';

// 新版角色代码
export const BUSINESS_MANAGER_ROLES = ['biz_manager', 'business_owner', 'manager'] as const;
export const BUSINESS_LEADER_ROLES = ['biz_leader', 'business_group_leader'] as const;
export const BUSINESS_MEMBER_ROLES = ['biz_member', 'business_group_member', 'salesperson'] as const;

export const WORK_ORDER_CREATOR_ROLES = [
  ...BUSINESS_LEADER_ROLES,
  ...BUSINESS_MEMBER_ROLES,
  ADMIN_ROLE,
] as const;

export const MANAGEMENT_SCOPE_ROLES = [
  ...BUSINESS_MANAGER_ROLES,
] as const;

export const MODULE_SUPERVISOR_ROLES = [
  'data_entry_leader',
  'shared_leader',
  'shared_team_owner',
  'contract_supervisor',
  'onboarding_supervisor',
  'data_entry_supervisor',
  'social_insurance_supervisor',
  'social_insurance_specialist',
  'social_security_supervisor',
] as const;

export const CONTRACT_MODULE_ROLES = ['contract_specialist', 'labor_contract_member', 'contract_team'] as const;
export const ONBOARDING_RESIGNATION_MODULE_ROLES = ['onboarding_specialist', 'onboarding_resignation_member', 'onboarding_team', 'contract_team'] as const;
export const DATA_ENTRY_MODULE_ROLES = ['data_entry_leader', 'data_entry_team', 'data_entry_supervisor', 'data_entry_specialist'] as const;
export const SOCIAL_INSURANCE_MODULE_ROLES = ['social_insurance_specialist', 'social_insurance_team', 'social_insurance_supervisor', 'social_security_supervisor'] as const;

const RESIGNATION_CERT_HANDLER_USERNAMES = new Set(['yangchun', 'jianglu']);
const RESIGNATION_CERT_HANDLER_REAL_NAMES = new Set(['杨纯', '江璐']);

/** Historical resignation certificate sub-orders are restricted to the two configured handlers. */
export function isResignationCertHandler(user: {
  username?: string | null;
  realName?: string | null;
  real_name?: string | null;
}): boolean {
  const username = String(user.username ?? '').trim().toLowerCase();
  const realName = String(user.realName ?? user.real_name ?? '').trim();
  return RESIGNATION_CERT_HANDLER_USERNAMES.has(username) || RESIGNATION_CERT_HANDLER_REAL_NAMES.has(realName);
}

const MODULE_HANDLER_ROLES: Record<string, readonly string[]> = {
  contract: CONTRACT_MODULE_ROLES,
  contract_signing: CONTRACT_MODULE_ROLES,
  renewal_contract: CONTRACT_MODULE_ROLES,
  onboarding_contact: ONBOARDING_RESIGNATION_MODULE_ROLES,
  resignation_contact: ONBOARDING_RESIGNATION_MODULE_ROLES,
  resignation_cert: ONBOARDING_RESIGNATION_MODULE_ROLES,
  data_entry: DATA_ENTRY_MODULE_ROLES,
  data_entry_resign: DATA_ENTRY_MODULE_ROLES,
  social_insurance: SOCIAL_INSURANCE_MODULE_ROLES,
  social_insurance_change: SOCIAL_INSURANCE_MODULE_ROLES,
  social_insurance_resign: SOCIAL_INSURANCE_MODULE_ROLES,
  resignation_social_insurance: SOCIAL_INSURANCE_MODULE_ROLES,
  benefit: ['shared_leader', 'shared_team_owner'],
  benefit_apply: ['shared_leader', 'shared_team_owner'],
};

export function getRequiredModuleHandlerRoles(moduleCode: string): readonly string[] {
  return MODULE_HANDLER_ROLES[moduleCode] ?? [];
}

export function canHandleModule(moduleCode: string, roles: readonly string[]): boolean {
  const requiredRoles = getRequiredModuleHandlerRoles(moduleCode);
  return requiredRoles.length === 0 || roles.includes(ADMIN_ROLE) || hasAnyRole(roles, requiredRoles);
}

export function hasAnyRole(roles: readonly string[], expectedRoles: readonly string[]): boolean {
  return expectedRoles.some((role) => roles.includes(role));
}

export function isAdminRole(roles: readonly string[]): boolean {
  return roles.includes(ADMIN_ROLE);
}

export function hasManagementScopeRole(roles: readonly string[]): boolean {
  return hasAnyRole(roles, MANAGEMENT_SCOPE_ROLES);
}

export function hasModuleSupervisorRole(roles: readonly string[]): boolean {
  return hasAnyRole(roles, MODULE_SUPERVISOR_ROLES) || roles.some((role) => role.endsWith('_supervisor'));
}
