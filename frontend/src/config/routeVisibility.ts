import { matchPath } from 'react-router-dom';
import { ROLE, canonicalRoleCodes, userHasAnyCanonicalRole, type CanonicalRole } from '@/constants/roles';

/**
 * 路由×角色可见性表。
 *
 * 权限口径：docs/REMEDIATION_PLAN_0518.md P2.1/P2.2/P2.3 + FE-02 任务卡。
 * - 表中未列出的路径默认拒绝。
 * - LEGACY_ROUTE_ALIASES 只做旧 URL 到权威权限路径的兼容，不放宽权限。
 */
const ALL_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const BUSINESS_ORDER_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const ONBOARDING_ROLES = [
  ...BUSINESS_ORDER_ROLES,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const IN_SERVICE_ROLES = [
  ...BUSINESS_ORDER_ROLES,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const OFFBOARDING_ROLES = [
  ...BUSINESS_ORDER_ROLES,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const INITIATED_WORK_ROLES = [
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const PENDING_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const DONE_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

const TEAM_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
] as const satisfies readonly CanonicalRole[];

export const ROUTE_VISIBILITY = {
  '/dashboard': ALL_ROLES,
  '/notifications': ALL_ROLES,
  '/profile': ALL_ROLES,

  // 主工单列表/创建入口：菜单中只保留 /work-orders，创建页由列表 toolBar 进入。
  '/work-orders': BUSINESS_ORDER_ROLES,
  '/work-orders/create': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/work-orders/import': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/work-orders/:id': ALL_ROLES,

  '/my-field-permissions': [ROLE.ADMIN, ROLE.BUSINESS_OWNER],

  // 我的工单 4 视图（FE-08 会承接页面/路由实现；本文件先统一权限口径）。
  '/my-work/initiated': INITIATED_WORK_ROLES,
  '/my-work/pending': PENDING_WORK_ROLES,
  '/my-work/done': DONE_WORK_ROLES,
  '/my-work/team': TEAM_WORK_ROLES,

  // 兼容旧子工单列表权限权威路径。
  '/dispatched-orders': PENDING_WORK_ROLES,

  // 入职管理：业务侧看主列表；后道只看授权子模块。
  '/onboarding': ONBOARDING_ROLES,
  '/onboarding/contact-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER],
  '/onboarding/contract-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER],
  '/onboarding/data-entry-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/social-insurance-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST],

  // 在职管理：续签 + 待遇申报，按 P2.1 角色矩阵收紧。
  '/in-service': IN_SERVICE_ROLES,
  '/in-service/contract-renewal': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER],
  '/in-service/benefit-claim': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST],

  // 离职管理：离职办理 + 离职证明 + 社保停保。
  '/offboarding': OFFBOARDING_ROLES,
  '/offboarding/contact-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER],
  '/offboarding/proof-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER],
  '/offboarding/social-suspend-pool': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST],

  '/dashboards/leader': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER],

  // P2.2：导出模板、门户配置等管理入口仅 admin 可见。
  '/export-templates': [ROLE.ADMIN],
  '/admin': [ROLE.ADMIN],
  '/admin/users': [ROLE.ADMIN],
  '/admin/roles': [ROLE.ADMIN],
  '/admin/departments': [ROLE.ADMIN],
  '/admin/branches': [ROLE.ADMIN],
  '/admin/customers': [ROLE.ADMIN],
  '/admin/customer-assignees': [ROLE.ADMIN],
  '/admin/module-config': [ROLE.ADMIN],
  '/admin/fields': [ROLE.ADMIN],
  '/admin/field-permissions': [ROLE.ADMIN],
  '/admin/dispatch-config': [ROLE.ADMIN],
  '/admin/flow-config': [ROLE.ADMIN],
  '/admin/export-templates': [ROLE.ADMIN],
  '/admin/notifications': [ROLE.ADMIN],
  '/admin/approval-flows': [ROLE.ADMIN],
  '/admin/audit-log': [ROLE.ADMIN],
  '/admin/system-settings': [ROLE.ADMIN],
} as const satisfies Record<string, readonly CanonicalRole[]>;

export type VisibilityRoute = keyof typeof ROUTE_VISIBILITY;

const LEGACY_ROUTE_ALIASES: Record<string, VisibilityRoute> = {
  '/work-orders/new': '/work-orders/create',
  '/my-dispatched': '/my-work/pending',
  '/my-dispatched/:id': '/my-work/pending',
  '/team-dispatched': '/my-work/team',
  '/export-templates': '/export-templates',
  '/renewal': '/in-service/contract-renewal',
  '/renewal/new': '/work-orders/create',
  '/renewal/:id': '/in-service/contract-renewal',
  '/resignation': '/offboarding',
  '/resignation/new': '/work-orders/create',
  '/resignation/:id': '/offboarding',
  '/resignation/:id/cert': '/offboarding/proof-pool',
  '/benefit': '/in-service/benefit-claim',
  '/benefit/new': '/work-orders/create',
  '/benefit/:id': '/in-service/benefit-claim',
  '/onboarding/contract': '/onboarding/contract-pool',
  '/onboarding/onboarding_contact': '/onboarding/contact-pool',
  '/onboarding/data_entry': '/onboarding/data-entry-pool',
  '/onboarding/social_insurance': '/onboarding/social-insurance-pool',
  '/work-order-pool': '/my-work/team',
  '/admin/logs': '/admin/audit-log',
  '/admin/ai-settings': '/admin',
  '/admin/login-debug': '/admin',
};

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/dashboard';
  const pure = pathname.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return pure;
}

export function resolveVisibilityRoute(pathname: string): VisibilityRoute | null {
  const path = normalizePath(pathname);

  for (const [pattern, target] of Object.entries(LEGACY_ROUTE_ALIASES)) {
    if (matchPath({ path: pattern, end: true }, path)) return target;
  }

  for (const route of Object.keys(ROUTE_VISIBILITY) as VisibilityRoute[]) {
    if (matchPath({ path: route, end: true }, path)) return route;
  }

  return null;
}

export function getRequiredRolesForPath(pathname: string): readonly CanonicalRole[] {
  const route = resolveVisibilityRoute(pathname);
  return route ? ROUTE_VISIBILITY[route] : [];
}

export function canAccessPath(pathname: string, userRoles: { code?: string }[] | undefined): boolean {
  const requiredRoles = getRequiredRolesForPath(pathname);
  if (!requiredRoles.length) return false;
  return userHasAnyCanonicalRole(userRoles, [...requiredRoles]);
}

export function canonicalRoleList(userRoles: { code?: string }[] | undefined): string[] {
  return canonicalRoleCodes(userRoles);
}
