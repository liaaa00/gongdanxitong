/**
 * 角色代码字典 + 归一化助手。
 *
 * 后端旧种子代码（biz_manager/biz_leader/biz_member/shared_leader/
 * contract_specialist/onboarding_specialist/social_security_team）会被归一为前端规范代码
 * （business_owner / business_group_leader / business_group_member /
 * shared_team_owner / labor_contract_member / onboarding_resignation_member /
 * social_insurance_specialist）。
 *
 * 业务规则、菜单可见性、字段权限规则统一基于规范代码判断。
 */

export const ROLE = {
  ADMIN: 'admin',
  BUSINESS_OWNER: 'business_owner',
  BUSINESS_GROUP_LEADER: 'business_group_leader',
  BUSINESS_GROUP_MEMBER: 'business_group_member',
  DATA_ENTRY_LEADER: 'data_entry_leader',
  SHARED_TEAM_OWNER: 'shared_team_owner',
  LABOR_CONTRACT_MEMBER: 'labor_contract_member',
  ONBOARDING_RESIGNATION_MEMBER: 'onboarding_resignation_member',
  SOCIAL_INSURANCE_SPECIALIST: 'social_insurance_specialist',
} as const;

export type CanonicalRole = (typeof ROLE)[keyof typeof ROLE];

const BACKEND_TO_CANONICAL: Record<string, CanonicalRole> = {
  admin: ROLE.ADMIN,
  data_entry_leader: ROLE.DATA_ENTRY_LEADER,
  data_entry_team: ROLE.DATA_ENTRY_LEADER,
  social_security_team: ROLE.SOCIAL_INSURANCE_SPECIALIST,
  social_security_supervisor: ROLE.SOCIAL_INSURANCE_SPECIALIST,

  biz_manager: ROLE.BUSINESS_OWNER,
  biz_leader: ROLE.BUSINESS_GROUP_LEADER,
  biz_member: ROLE.BUSINESS_GROUP_MEMBER,
  shared_leader: ROLE.SHARED_TEAM_OWNER,
  contract_specialist: ROLE.LABOR_CONTRACT_MEMBER,
  onboarding_specialist: ROLE.ONBOARDING_RESIGNATION_MEMBER,

  business_owner: ROLE.BUSINESS_OWNER,
  business_group_leader: ROLE.BUSINESS_GROUP_LEADER,
  business_group_member: ROLE.BUSINESS_GROUP_MEMBER,
  salesperson: ROLE.BUSINESS_GROUP_MEMBER,
  shared_team_owner: ROLE.SHARED_TEAM_OWNER,
  labor_contract_member: ROLE.LABOR_CONTRACT_MEMBER,
  onboarding_resignation_member: ROLE.ONBOARDING_RESIGNATION_MEMBER,
  social_insurance_specialist: ROLE.SOCIAL_INSURANCE_SPECIALIST,
};

export function canonicalRoleCode(raw: string | undefined | null): string {
  if (!raw) return '';
  return BACKEND_TO_CANONICAL[raw] || raw;
}

export function canonicalRoleCodes(roles: { code?: string }[] | undefined): string[] {
  if (!roles?.length) return [];
  return roles.map((r) => canonicalRoleCode(r.code)).filter(Boolean);
}

export function userHasAnyCanonicalRole(
  userRoles: { code?: string }[] | undefined,
  requiredCanonicals: string[],
): boolean {
  if (!requiredCanonicals?.length) return true;
  const userSet = new Set(canonicalRoleCodes(userRoles));
  return requiredCanonicals.some((c) => userSet.has(c));
}
