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
export const DATA_ENTRY_MODULE_ROLES = ['data_entry_leader', 'data_entry_team'] as const;

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
