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
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const WORK_ORDER_CREATE_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const ONBOARDING_ROLES = [
  ROLE.ADMIN,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

// 第一阶段只开放入职、离职；在职模块保留后台配置但前端路由和菜单不可见。
const IN_SERVICE_ROLES = [] as const satisfies readonly CanonicalRole[];

const OFFBOARDING_ROLES = [
  ROLE.ADMIN,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
] as const satisfies readonly CanonicalRole[];

const INITIATED_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const RETURNED_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const PENDING_WORK_ROLES = [
  ROLE.ADMIN,
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

const NOTIFICATION_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
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
] as const satisfies readonly CanonicalRole[];

const HISTORY_WORK_ROLES = [
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

const DISPATCHED_DETAIL_ROLES = [
  ...INITIATED_WORK_ROLES,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

export const ROUTE_VISIBILITY = {
  '/dashboard': ALL_ROLES,
  '/notifications': NOTIFICATION_ROLES,
  '/profile': ALL_ROLES,

  // 主工单列表/创建入口：菜单中只保留 /work-orders，创建页由列表 toolBar 进入。
  '/work-orders': BUSINESS_ORDER_ROLES,
  // 新建/导入是否真正允许，由“角色管理 → 分配权限”和后端业务权限统一控制。
  '/work-orders/create': WORK_ORDER_CREATE_ROLES,
  '/work-orders/import': WORK_ORDER_CREATE_ROLES,
  '/work-orders/:id': WORK_ORDER_CREATE_ROLES,

  '/my-field-permissions': [ROLE.ADMIN],

  // 我的工单 4 视图（FE-08 会承接页面/路由实现；本文件先统一权限口径）。
  '/my-work/initiated': INITIATED_WORK_ROLES,
  '/my-work/returned': RETURNED_WORK_ROLES,
  '/my-work/pending': PENDING_WORK_ROLES,
  '/my-work/done': DONE_WORK_ROLES,
  '/my-work/team': TEAM_WORK_ROLES,
  '/my-work/history': HISTORY_WORK_ROLES,

  // 兼容旧子工单列表权限权威路径；列表只给后道/管理员，详情允许业务员从消息进入处理退回。
  '/dispatched-orders': PENDING_WORK_ROLES,
  '/my-dispatched/:id': DISPATCHED_DETAIL_ROLES,

  // 入职管理：业务侧看主列表；后道只看授权子模块。
  '/onboarding': ONBOARDING_ROLES,
  '/onboarding/onboarding_contact': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/contract': [ROLE.ADMIN, ROLE.LABOR_CONTRACT_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/data_entry': [ROLE.ADMIN, ROLE.DATA_ENTRY_LEADER],
  '/onboarding/social_insurance': [ROLE.ADMIN, ROLE.SOCIAL_INSURANCE_SPECIALIST],
  '/onboarding/renewal_contract': IN_SERVICE_ROLES,
  '/onboarding/benefit_apply': IN_SERVICE_ROLES,
  '/onboarding/resignation_contact': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/resignation_cert': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/data_entry_resign': [ROLE.ADMIN, ROLE.DATA_ENTRY_LEADER],
  '/onboarding/social_insurance_resign': [ROLE.ADMIN, ROLE.SOCIAL_INSURANCE_SPECIALIST],

  // 在职管理：第一阶段暂不开放，后台配置可保留但界面不可见。
  '/in-service': IN_SERVICE_ROLES,
  '/in-service/contract-renewal': IN_SERVICE_ROLES,
  '/in-service/benefit-claim': IN_SERVICE_ROLES,

  // 离职管理：离职联系/证明由入离职岗负责，离职数据录入由数据录入岗负责。
  '/offboarding': OFFBOARDING_ROLES,
  '/offboarding/contact-pool': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/offboarding/proof-pool': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/offboarding/social-suspend-pool': [ROLE.ADMIN, ROLE.DATA_ENTRY_LEADER],

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
  '/admin/workflow-config': [ROLE.ADMIN],
  '/admin/workflows': [ROLE.ADMIN],
  '/admin/workflows/:id': [ROLE.ADMIN],
  '/admin/export-templates': [ROLE.ADMIN],
  '/admin/notifications': [ROLE.ADMIN],
  '/admin/approval-flows': [ROLE.ADMIN],
  '/admin/audit-log': [ROLE.ADMIN],
  '/admin/logs': [ROLE.ADMIN],
  '/admin/ai-settings': [ROLE.ADMIN],
  '/admin/login-debug': [ROLE.ADMIN],
  '/admin/system-settings': [ROLE.ADMIN],
} as const satisfies Record<string, readonly CanonicalRole[]>;

export type VisibilityRoute = keyof typeof ROUTE_VISIBILITY;

const PHASE1_HIDDEN_ROUTES = new Set<VisibilityRoute>([
  '/onboarding/renewal_contract',
  '/onboarding/benefit_apply',
  '/in-service',
  '/in-service/contract-renewal',
  '/in-service/benefit-claim',
]);

const LEGACY_ROUTE_ALIASES: Record<string, VisibilityRoute> = {
  '/work-orders/new': '/work-orders/create',
  '/my-dispatched': '/my-work/pending',
  '/team-dispatched': '/my-work/team',
  '/export-templates': '/export-templates',
  '/renewal': '/in-service',
  '/renewal/new': '/in-service',
  '/renewal/:id': '/in-service/contract-renewal',
  '/resignation': '/work-orders',
  '/resignation/new': '/work-orders/create',
  '/resignation/:id': '/offboarding',
  '/resignation/:id/cert': '/offboarding/proof-pool',
  '/benefit': '/in-service',
  '/benefit/new': '/in-service',
  '/benefit/:id': '/in-service/benefit-claim',
  '/onboarding/contact-pool': '/onboarding/onboarding_contact',
  '/onboarding/contract-pool': '/onboarding/contract',
  '/onboarding/data-entry-pool': '/onboarding/data_entry',
  '/onboarding/social-insurance-pool': '/onboarding/social_insurance',
  '/offboarding/social-insurance-resign-pool': '/onboarding/social_insurance_resign',
  '/offboarding/social-suspend-pool': '/onboarding/data_entry_resign',
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

function normalizePermissions(permissions?: string[]): Set<string> {
  return new Set((permissions || []).map((item) => String(item || '').trim()).filter(Boolean));
}

const RESTRICTED_DYNAMIC_PERMISSION_ROUTES: Partial<Record<CanonicalRole, readonly VisibilityRoute[]>> = {
  [ROLE.BUSINESS_OWNER]: ['/dashboard', '/my-work/team', '/my-work/history', '/my-dispatched/:id'],
  [ROLE.BUSINESS_GROUP_LEADER]: ['/dashboard', '/work-orders', '/work-orders/create', '/work-orders/import', '/work-orders/:id', '/my-work/initiated', '/my-work/returned', '/my-work/team', '/my-work/history', '/my-dispatched/:id'],
  [ROLE.SHARED_TEAM_OWNER]: [
    '/dashboard', '/notifications', '/my-work/pending', '/my-work/done', '/my-work/history', '/dispatched-orders', '/my-dispatched/:id',
    '/onboarding', '/onboarding/onboarding_contact', '/onboarding/contract',
    '/onboarding/resignation_contact', '/onboarding/resignation_cert',
    '/offboarding', '/offboarding/contact-pool', '/offboarding/proof-pool',
  ],
};

function allowsDynamicPermissionWithinRoleScope(route: VisibilityRoute, userRoles: { code?: string }[] | undefined): boolean {
  const roleCodes = new Set(canonicalRoleCodes(userRoles));
  if (roleCodes.has(ROLE.ADMIN)) return true;
  const restrictedRole = [ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.SHARED_TEAM_OWNER]
    .find((role) => roleCodes.has(role));
  if (!restrictedRole) return true;
  return (RESTRICTED_DYNAMIC_PERMISSION_ROUTES[restrictedRole] || []).includes(route);
}

function hasDynamicPermissionForPath(pathname: string, permissions?: string[], userRoles?: { code?: string }[]): boolean {
  const route = resolveVisibilityRoute(pathname);
  const permissionSet = normalizePermissions(permissions);
  if (!route || PHASE1_HIDDEN_ROUTES.has(route) || permissionSet.size === 0 || !allowsDynamicPermissionWithinRoleScope(route, userRoles)) return false;
  if (permissionSet.has('*') || permissionSet.has('all') || permissionSet.has('work_order.*')) return true;
  if (route === '/my-work/team') {
    return permissionSet.has('work_order.view_team')
      || permissionSet.has('work_order.view_all')
      || permissionSet.has('data_scope.team')
      || permissionSet.has('data_scope.all');
  }
  if (route === '/my-work/history') {
    return permissionSet.has('work_order.view_history')
      || permissionSet.has('work_order.view_all')
      || permissionSet.has('data_scope.all');
  }
  return false;
}

export function canAccessPath(pathname: string, userRoles: { code?: string }[] | undefined, permissions?: string[]): boolean {
  const requiredRoles = getRequiredRolesForPath(pathname);
  if (!requiredRoles.length) return false;
  return userHasAnyCanonicalRole(userRoles, [...requiredRoles]) || hasDynamicPermissionForPath(pathname, permissions, userRoles);
}

export function canonicalRoleList(userRoles: { code?: string }[] | undefined): string[] {
  return canonicalRoleCodes(userRoles);
}
