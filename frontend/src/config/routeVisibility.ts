import { matchPath } from 'react-router-dom';
import { ROLE, canonicalRoleCode, canonicalRoleCodes, userHasAnyCanonicalRole, type CanonicalRole } from '@/constants/roles';
import type { PermissionConfig } from '@/services/permissionCenter';

/**
 * @deprecated Static route visibility is retained only as a client-side
 * bootstrap/availability fallback. Runtime authority is the active permission
 * center configuration loaded through `setDynamicPermissionConfig`; backend
 * `RolesGuard` and `RbacEngineService` remain authoritative for enforcement.
 */
// Dynamic permissions are optional. Until the permission center has loaded (or
// when its API is unavailable), all callers continue to use the static matrix.
let dynamicPermissionConfig: PermissionConfig | null = null;

export function setDynamicPermissionConfig(config: PermissionConfig | null): void {
  dynamicPermissionConfig = config;
}

export function getDynamicPermissionConfig(): PermissionConfig | null {
  return dynamicPermissionConfig;
}

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

const WORK_ORDER_CREATE_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
] as const satisfies readonly CanonicalRole[];

const OUT_OF_PROVINCE_ROLES = BUSINESS_ORDER_ROLES;

const ONBOARDING_ROLES = [
  ROLE.ADMIN,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const satisfies readonly CanonicalRole[];

// 阶段2开放在职单项业务：业务侧可发起/审批，实际接单人可能来自任一现有后道角色。
// TeamRole.IN_SERVICE 只是派单语义标签，不新增数据库角色；数据范围仍由后端 createdBy/handlerId 兜底。
const IN_SERVICE_ROLES = [
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

const RESIGNATION_CERTIFICATE_LIST_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
] as const satisfies readonly CanonicalRole[];

const OFFBOARDING_ROLES = [
  ROLE.ADMIN,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
] as const satisfies readonly CanonicalRole[];

// 我的工单入口整体仅管理员可见；普通角色通过入职/离职模块入口处理自己的子工单。
const MY_WORK_ADMIN_ONLY_ROLES = [ROLE.ADMIN] as const satisfies readonly CanonicalRole[];

const INITIATED_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;
const RETURNED_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;
const PENDING_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;
const DONE_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;

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

const TEAM_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;
const HISTORY_WORK_ROLES = MY_WORK_ADMIN_ONLY_ROLES;

const DISPATCHED_DETAIL_ROLES = [
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

export const ROUTE_VISIBILITY = {
  '/dashboard': ALL_ROLES,
  '/notifications': NOTIFICATION_ROLES,
  '/profile': ALL_ROLES,

  // 主工单列表/创建入口：菜单中只保留 /work-orders，创建页由列表 toolBar 进入。
  '/work-orders': BUSINESS_ORDER_ROLES,
  // 新建/导入是否真正允许，由”角色管理 → 分配权限”和后端业务权限统一控制。
  '/work-orders/create': WORK_ORDER_CREATE_ROLES,
  '/work-orders/import': WORK_ORDER_CREATE_ROLES,
  '/work-orders/:id': BUSINESS_ORDER_ROLES,

  // 省外增减员主单：使用专用 API 路径隔离，不进入前端全局 store。
  '/out-of-province': OUT_OF_PROVINCE_ROLES,
  '/out-of-province/import': WORK_ORDER_CREATE_ROLES,
  '/out-of-province/new': WORK_ORDER_CREATE_ROLES,
  '/out-of-province/increase': OUT_OF_PROVINCE_ROLES,
  '/out-of-province/increase/new': WORK_ORDER_CREATE_ROLES,
  '/out-of-province/decrease': OUT_OF_PROVINCE_ROLES,
  '/out-of-province/decrease/new': WORK_ORDER_CREATE_ROLES,
  '/out-of-province/single-business': OUT_OF_PROVINCE_ROLES,
  '/out-of-province/single-business/new': WORK_ORDER_CREATE_ROLES,

  '/my-field-permissions': [ROLE.ADMIN],

  // 我的工单 6 视图：业务侧保留发起/退回/已办/历史，后道保留待办/已办/历史，业务负责人保留团队/历史。
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
  '/onboarding/onboarding_contact': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/contract': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.LABOR_CONTRACT_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/data_entry': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER],
  '/onboarding/social_insurance': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SOCIAL_INSURANCE_SPECIALIST],
  '/onboarding/renewal_contract': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.LABOR_CONTRACT_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/benefit_apply': IN_SERVICE_ROLES,
  '/onboarding/resignation_contact': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/onboarding/resignation_cert': [],
  '/onboarding/data_entry_resign': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER],
  '/onboarding/social_insurance_resign': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SOCIAL_INSURANCE_SPECIALIST],

  // 在职管理：开放续签、证明和单项业务直单页；仅历史占位路径继续冻结。
  '/in-service': IN_SERVICE_ROLES,
  '/in-service/new': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/in-service/certificates': IN_SERVICE_ROLES,
  '/in-service/certificates/new': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/renewal': IN_SERVICE_ROLES,
  '/renewal/new': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/renewal/:id': IN_SERVICE_ROLES,
  '/resignation-certificates': RESIGNATION_CERTIFICATE_LIST_ROLES,
  '/resignation-certificates/new': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/in-service/contract-renewal': IN_SERVICE_ROLES,
  '/in-service/benefit-claim': IN_SERVICE_ROLES,
  '/in-service/:id/audit': [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER],
  '/in-service/:id': IN_SERVICE_ROLES,

  // 省外派单：阶段3开放增减员列表/创建/详情/导入。
  '/out-of-province/orders': OUT_OF_PROVINCE_ROLES,
  '/out-of-province/orders/new': [ROLE.ADMIN, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER],
  '/out-of-province/orders/:id': OUT_OF_PROVINCE_ROLES,

  // 离职管理：离职材料收集由入离职岗负责，减员报岗录入由报岗录入岗负责。
  '/offboarding': OFFBOARDING_ROLES,
  '/offboarding/contact-pool': [ROLE.ADMIN, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SHARED_TEAM_OWNER],
  '/offboarding/proof-pool': [],
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
  '/admin/import-templates': [ROLE.ADMIN],
  '/admin/field-permissions': [ROLE.ADMIN],
  '/admin/permission-center': [ROLE.ADMIN],
  '/admin/dispatch-config': [ROLE.ADMIN],
  '/admin/flow-config': [ROLE.ADMIN],
  '/admin/workflow-config': [ROLE.ADMIN],
  '/admin/workflows': [ROLE.ADMIN],
  '/admin/workflows/:id': [ROLE.ADMIN],
  '/admin/export-templates': [ROLE.ADMIN],
  '/admin/detail-view-templates': [ROLE.ADMIN],
  '/admin/notifications': [ROLE.ADMIN],
  '/admin/approval-flows': [ROLE.ADMIN],
  '/admin/audit-log': [ROLE.ADMIN],
  '/admin/logs': [ROLE.ADMIN],
  '/admin/ai-settings': [ROLE.ADMIN],
  '/admin/login-debug': [ROLE.ADMIN],
  '/admin/system-settings': [ROLE.ADMIN],
  '/admin/certificate-types': [ROLE.ADMIN],
} as const satisfies Record<string, readonly CanonicalRole[]>;

export type VisibilityRoute = keyof typeof ROUTE_VISIBILITY;

const ROUTE_ACTION_PERMISSIONS: Partial<Record<VisibilityRoute, readonly string[]>> = {
  '/dashboard': ['route.dashboard'],
  '/notifications': ['route.notifications'],
  '/work-orders': ['route.work_orders'],
  '/work-orders/create': ['route.work_order_create'],
  '/work-orders/import': ['route.work_order_import'],
  '/work-orders/:id': ['route.work_order_detail'],
  '/out-of-province': ['route.work_orders'],
  '/out-of-province/import': ['route.work_order_import'],
  '/out-of-province/new': ['route.work_order_create'],
  '/out-of-province/orders': ['route.work_orders'],
  '/out-of-province/orders/new': ['route.work_order_create'],
  '/out-of-province/orders/:id': ['route.work_order_detail'],
  '/my-dispatched/:id': ['route.dispatched_detail'],
  '/onboarding': ['route.onboarding'],
  '/onboarding/contract': ['route.onboarding_contract', 'module.contract.manage'],
  '/onboarding/onboarding_contact': ['route.onboarding_contact', 'module.onboarding_contact.manage'],
  '/onboarding/data_entry': ['route.onboarding_data_entry', 'module.data_entry.manage'],
  '/onboarding/social_insurance': ['route.onboarding_social_insurance', 'module.social_insurance.manage'],
  '/onboarding/resignation_contact': ['route.resignation_contact', 'module.resignation_contact.manage'],
  '/onboarding/data_entry_resign': ['route.data_entry_resign', 'module.data_entry_resign.manage'],
  '/onboarding/social_insurance_resign': ['route.social_insurance_resign', 'module.social_insurance_resign.manage'],
  '/offboarding': ['route.offboarding'],
  '/offboarding/contact-pool': ['route.offboarding_contact_pool', 'module.resignation_contact.manage'],
  '/offboarding/social-suspend-pool': ['route.offboarding_social_suspend_pool', 'module.data_entry_resign.manage'],
  '/dashboards/leader': ['route.leader_dashboard'],
  '/export-templates': ['system.admin'],
  '/admin': ['system.admin'],
  '/admin/users': ['system.admin'],
  '/admin/roles': ['system.admin'],
  '/admin/departments': ['system.admin'],
  '/admin/branches': ['system.admin'],
  '/admin/customers': ['system.admin'],
  '/admin/customer-assignees': ['system.admin'],
  '/admin/module-config': ['system.admin'],
  '/admin/fields': ['system.admin'],
  '/admin/import-templates': ['system.admin'],
  '/admin/field-permissions': ['system.admin'],
  '/admin/permission-center': ['system.admin'],
  '/admin/dispatch-config': ['system.admin'],
  '/admin/flow-config': ['system.admin'],
  '/admin/workflow-config': ['system.admin'],
  '/admin/workflows': ['system.admin'],
  '/admin/workflows/:id': ['system.admin'],
  '/admin/export-templates': ['system.admin'],
  '/admin/detail-view-templates': ['system.admin'],
  '/admin/notifications': ['system.admin'],
  '/admin/approval-flows': ['system.admin'],
  '/admin/audit-log': ['system.admin'],
  '/admin/logs': ['system.admin'],
  '/admin/ai-settings': ['system.admin'],
  '/admin/login-debug': ['system.admin'],
  '/admin/system-settings': ['system.admin'],
};

const PHASE1_HIDDEN_ROUTES = new Set<VisibilityRoute>([
  '/onboarding/renewal_contract',
  '/onboarding/benefit_apply',
  '/in-service/contract-renewal',
  '/in-service/benefit-claim',
]);

const LEGACY_ROUTE_ALIASES: Record<string, VisibilityRoute> = {
  '/work-orders/new': '/work-orders/create',
  '/my-dispatched': '/my-work/pending',
  '/team-dispatched': '/my-work/team',
  '/export-templates': '/export-templates',
  '/renewal': '/in-service',
  '/renewal/new': '/in-service/new',
  '/renewal/:id': '/in-service/:id',
  '/resignation': '/work-orders',
  '/resignation/new': '/work-orders/create',
  '/resignation/:id': '/work-orders/:id',
  '/resignation/:id/cert': '/work-orders/:id',
  '/benefit': '/in-service/benefit-claim',
  '/benefit/new': '/in-service/benefit-claim',
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

function resolveDynamicRoute(pathname: string): PermissionConfig['routePermissions'][number] | null {
  const config = dynamicPermissionConfig;
  if (!config) return null;
  const path = normalizePath(pathname);
  return config.routePermissions.find((route) => matchPath({ path: route.path, end: true }, path)) || null;
}

export function getRequiredRolesForPath(pathname: string): readonly CanonicalRole[] {
  const route = resolveVisibilityRoute(pathname);
  return route ? ROUTE_VISIBILITY[route] : [];
}

function normalizePermissions(permissions?: string[]): Set<string> {
  return new Set((permissions || []).map((item) => String(item || '').trim()).filter(Boolean));
}

const BUSINESS_OWNER_DYNAMIC_ROUTES: readonly VisibilityRoute[] = ['/dashboard', '/my-dispatched/:id'];
const BUSINESS_MEMBER_DYNAMIC_ROUTES: readonly VisibilityRoute[] = ['/my-dispatched/:id'];
const BACKEND_DYNAMIC_ROUTES: readonly VisibilityRoute[] = ['/my-dispatched/:id'];

const RESTRICTED_DYNAMIC_PERMISSION_ROUTES: Partial<Record<CanonicalRole, readonly VisibilityRoute[]>> = {
  [ROLE.BUSINESS_OWNER]: BUSINESS_OWNER_DYNAMIC_ROUTES,
  [ROLE.BUSINESS_GROUP_LEADER]: [
    '/dashboard', '/work-orders', '/work-orders/create', '/work-orders/import', '/work-orders/:id',
    '/out-of-province', '/out-of-province/import', '/out-of-province/new', '/my-dispatched/:id',
    '/onboarding', '/onboarding/onboarding_contact', '/onboarding/contract', '/onboarding/data_entry', '/onboarding/social_insurance',
    '/offboarding', '/onboarding/resignation_contact', '/onboarding/data_entry_resign', '/onboarding/social_insurance_resign',
  ],
  [ROLE.BUSINESS_GROUP_MEMBER]: BUSINESS_MEMBER_DYNAMIC_ROUTES,
  [ROLE.DATA_ENTRY_LEADER]: BACKEND_DYNAMIC_ROUTES,
  [ROLE.LABOR_CONTRACT_MEMBER]: BACKEND_DYNAMIC_ROUTES,
  [ROLE.ONBOARDING_RESIGNATION_MEMBER]: BACKEND_DYNAMIC_ROUTES,
  [ROLE.SOCIAL_INSURANCE_SPECIALIST]: BACKEND_DYNAMIC_ROUTES,
  [ROLE.SHARED_TEAM_OWNER]: [
    '/dashboard', '/notifications', ...BACKEND_DYNAMIC_ROUTES, '/dispatched-orders',
    '/onboarding', '/onboarding/onboarding_contact', '/onboarding/contract',
    '/onboarding/resignation_contact',
    '/offboarding', '/offboarding/contact-pool',
  ],
};

function allowsDynamicPermissionWithinRoleScope(route: VisibilityRoute, userRoles: { code?: string }[] | undefined): boolean {
  const roleCodes = new Set(canonicalRoleCodes(userRoles));
  if (roleCodes.has(ROLE.ADMIN)) return true;
  const restrictedRoles = (Object.keys(RESTRICTED_DYNAMIC_PERMISSION_ROUTES) as CanonicalRole[])
    .filter((role) => roleCodes.has(role));
  if (restrictedRoles.length === 0) return true;
  return restrictedRoles.some((role) => (
    RESTRICTED_DYNAMIC_PERMISSION_ROUTES[role] || []
  ).includes(route));
}

function hasStructuredActionPermissions(permissionSet: Set<string>): boolean {
  return Array.from(permissionSet).some((permission) => (
    permission.startsWith('route.')
    || permission.startsWith('module.')
    || permission.startsWith('dispatched_order.')
    || permission === 'system.admin'
  ));
}

function hasDynamicPermissionForPath(pathname: string, permissions?: string[], userRoles?: { code?: string }[]): boolean {
  const route = resolveVisibilityRoute(pathname);
  const permissionSet = normalizePermissions(permissions);
  if (!route || PHASE1_HIDDEN_ROUTES.has(route) || permissionSet.size === 0 || !allowsDynamicPermissionWithinRoleScope(route, userRoles)) return false;
  if (String(route).startsWith('/my-work/')) return false;
  const routeActions = ROUTE_ACTION_PERMISSIONS[route] || [];
  if (routeActions.some((action) => permissionSet.has(action))) return true;
  if (permissionSet.has('*') || permissionSet.has('all') || permissionSet.has('work_order.*')) return true;
  return false;
}

export function canAccessPath(pathname: string, userRoles: { code?: string }[] | undefined, permissions?: string[]): boolean {
  const dynamicRoute = resolveDynamicRoute(pathname);
  if (dynamicRoute) {
    // Frozen phase-one routes remain inaccessible even if an accidental dynamic
    // config entry contains them; this preserves the established business rule.
    const staticRoute = resolveVisibilityRoute(pathname);
    if (staticRoute && PHASE1_HIDDEN_ROUTES.has(staticRoute)) return false;
    return userHasAnyCanonicalRole(userRoles, dynamicRoute.allowedRoles.map((role) => canonicalRoleCode(String(role))));
  }
  const route = resolveVisibilityRoute(pathname);
  const requiredRoles = getRequiredRolesForPath(pathname);
  if (!route || !requiredRoles.length || PHASE1_HIDDEN_ROUTES.has(route)) return false;
  const permissionSet = normalizePermissions(permissions);
  const routeActions = ROUTE_ACTION_PERMISSIONS[route] || [];
  if (routeActions.length > 0 && hasStructuredActionPermissions(permissionSet) && allowsDynamicPermissionWithinRoleScope(route, userRoles)) {
    return routeActions.some((action) => permissionSet.has(action)) || permissionSet.has('*') || permissionSet.has('all');
  }
  return userHasAnyCanonicalRole(userRoles, [...requiredRoles]) || hasDynamicPermissionForPath(pathname, permissions, userRoles);
}

export function canonicalRoleList(userRoles: { code?: string }[] | undefined): string[] {
  return canonicalRoleCodes(userRoles);
}
