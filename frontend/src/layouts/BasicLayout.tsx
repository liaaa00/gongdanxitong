import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  UNSAFE_LocationContext,
  useLocation,
  useNavigate,
  useNavigationType,
  useOutlet,
} from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { App, Badge, Popover, List, Button, Empty, Tabs, Tag, Space, Dropdown, Segmented } from 'antd';
import {
  DashboardOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined,
  TeamOutlined, SafetyOutlined, ApartmentOutlined, IdcardOutlined,
  FieldStringOutlined, LockOutlined, BranchesOutlined, UserSwitchOutlined,
  AuditOutlined, CheckSquareOutlined,
  BarChartOutlined, BellOutlined, AlertOutlined, InfoCircleOutlined, SoundOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import { useUserStore } from '@/stores/userStore';
import { logout as logoutApi } from '@/services/auth';
import { canAccessPath } from '@/config/routeVisibility';
import { ROLE, userHasAnyCanonicalRole, type CanonicalRole } from '@/constants/roles';
import { getNotifications, getUnreadCountByBucket, getNotificationBucket, markNotificationRead } from '@/services/notifications';
import type { NotificationBucketKey, NotificationItem, UnreadCountByBucket } from '@/services/notifications';
import { getNotificationDisplayContent, getNotificationDisplayTitle } from '@/utils/notificationDisplay';
import { notifyKeepAliveRouteActivated } from '@/utils/listPageState';
import {
  BUSINESS_SCOPE,
  getBusinessScopeLandingPath,
  readBusinessScope,
  writeBusinessScope,
  type BusinessScope,
} from '@/utils/businessScope';

const MAX_KEEP_ALIVE_PAGES = 12;

function isKeepAlivePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/change-password' || pathname === '/403' || pathname === '/404') return false;
  // 批量导入页保活：操作到一半切走再回来不清空（页面内提供「重新开始」入口手动清空）
  if (pathname === '/work-orders/import') return true;
  if (/^\/work-orders\/(new|import|[^/]+)$/.test(pathname)) return false;
  if (/^\/renewal\/(new|[^/]+)$/.test(pathname)) return false;
  if (/^\/in-service\/(new|[^/]+)(\/audit)?$/.test(pathname)) return false;
  if (/^\/resignation\/(new|[^/]+)(\/cert)?$/.test(pathname)) return false;
  if (/^\/benefit\/(new|[^/]+)$/.test(pathname)) return false;
  if (/^\/my-dispatched\/[^/]+$/.test(pathname)) return false;
  if (/^\/admin\/workflows\/[^/]+$/.test(pathname)) return false;
  return true;
}

const KeepAliveOutlet: React.FC = () => {
  const outlet = useOutlet();
  const location = useLocation();
  const navigationType = useNavigationType();
  const cacheKey = `${location.pathname}${location.search}`;
  const shouldKeepAlive = isKeepAlivePath(location.pathname);
  const [cacheKeys, setCacheKeys] = useState<string[]>(() => (shouldKeepAlive ? [cacheKey] : []));
  const cacheRef = useRef<Record<string, { outlet: React.ReactElement; location: typeof location }>>({});
  const visitedCacheKeysRef = useRef(new Set(shouldKeepAlive ? [cacheKey] : []));
  const lastRouteKeyRef = useRef(cacheKey);

  if (shouldKeepAlive && outlet && !cacheRef.current[cacheKey]) {
    cacheRef.current[cacheKey] = { outlet, location };
  }

  useEffect(() => {
    const routeChanged = lastRouteKeyRef.current !== cacheKey;
    if (routeChanged && shouldKeepAlive) {
      if (visitedCacheKeysRef.current.has(cacheKey)) {
        notifyKeepAliveRouteActivated({ pathname: location.pathname, search: location.search });
      } else {
        visitedCacheKeysRef.current.add(cacheKey);
      }
    }
    lastRouteKeyRef.current = cacheKey;
  }, [cacheKey, location.pathname, location.search, shouldKeepAlive]);

  useEffect(() => {
    if (!shouldKeepAlive) return;
    setCacheKeys((prev) => {
      const next = prev.includes(cacheKey) ? [...prev.filter((key) => key !== cacheKey), cacheKey] : [...prev, cacheKey];
      const overflow = next.length - MAX_KEEP_ALIVE_PAGES;
      if (overflow > 0) {
        next.slice(0, overflow).forEach((key) => {
          delete cacheRef.current[key];
          visitedCacheKeysRef.current.delete(key);
        });
        return next.slice(overflow);
      }
      return next;
    });
  }, [cacheKey, shouldKeepAlive]);

  const renderKeys = shouldKeepAlive && !cacheKeys.includes(cacheKey) ? [...cacheKeys, cacheKey] : cacheKeys;

  return (
    <>
      {renderKeys.map((key) => {
        const cached = cacheRef.current[key];
        if (!cached) return null;
        const active = shouldKeepAlive && key === cacheKey;
        return (
          <div key={key} style={{ display: active ? 'block' : 'none' }} aria-hidden={!active}>
            <UNSAFE_LocationContext.Provider value={{ location: cached.location, navigationType }}>
              {cached.outlet}
            </UNSAFE_LocationContext.Provider>
          </div>
        );
      })}
      {!shouldKeepAlive ? outlet : null}
    </>
  );
};

// 菜单项只描述展示结构；可见性统一由 routeVisibility.ts 判定。
type MenuItem = {
  path: string;
  name: string;
  icon?: React.ReactNode;
  key?: string;
  menuVisible?: boolean;
  scope?: BusinessScope;
  children?: MenuItem[];
};

// 菜单权限角色矩阵集中维护在 routeVisibility.ts。

const NOTIFICATION_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
] as const;

const RAW_MENU: MenuItem[] = [
  { path: '/dashboard', name: '仪表盘', icon: <DashboardOutlined /> },
  {
    path: '/work-orders-group',
    scope: BUSINESS_SCOPE.BEILUN,
    name: '入职管理',
    icon: <FileTextOutlined />,
    // 子菜单由 routeVisibility.ts 决定是否显示。
    children: [
      { path: '/work-orders?orderType=onboarding', name: '入职主工单列表', key: 'work-orders-main' },
      { path: '/onboarding/onboarding_contact', name: '入职联系子工单' },
      { path: '/onboarding/contract', name: '劳动合同新签子工单' },
      { path: '/onboarding/data_entry', name: '增员报岗录入子工单' },
      { path: '/onboarding/social_insurance', name: '社保公积金增员子工单' },
    ],
  },
  {
    path: '/in-service-group',
    scope: BUSINESS_SCOPE.BEILUN,
    name: '在职管理',
    icon: <FileTextOutlined />,
    children: [
      { path: '/renewal', name: '劳动合同续签', key: 'renewal-list' },
      { path: '/in-service/certificates', name: '证明开具', key: 'certificate-list' },
      { path: '/in-service', name: '单项业务办理', key: 'in-service-list' },
    ],
  },
  {
    path: '/offboarding-group',
    scope: BUSINESS_SCOPE.BEILUN,
    name: '离职管理',
    icon: <FileTextOutlined />,
    children: [
      { path: '/work-orders?orderType=resignation', name: '离职主工单列表', key: 'resignation-list' },
      { path: '/onboarding/resignation_contact', name: '离职材料收集子工单', key: 'resignation-contact-sub-list' },
      { path: '/onboarding/resignation_cert', name: '离职材料收集子工单', key: 'resignation-cert-sub-list', menuVisible: false },
      { path: '/onboarding/data_entry_resign', name: '减员报岗录入子工单', key: 'data-entry-resign-sub-list' },
      { path: '/onboarding/social_insurance_resign', name: '社保公积金减员子工单', key: 'social-insurance-resign-sub-list' },
      { path: '/resignation-certificates', name: '离职证明', key: 'resignation-certificate-list' },
      { path: '/resignation/:id/cert', name: '离职材料收集', key: 'resignation-cert', menuVisible: false },
    ],
  },
  {
    path: '/out-of-province-group',
    name: '浙江自签业务',
    icon: <ApartmentOutlined />,
    scope: BUSINESS_SCOPE.OUT_OF_PROVINCE,
    children: [
      { path: '/out-of-province/increase', name: '省外增员', key: 'out-of-province-increase' },
      { path: '/out-of-province/decrease', name: '省外减员', key: 'out-of-province-decrease' },
      { path: '/out-of-province/single-business', name: '单项业务办理', key: 'out-of-province-single-business' },
      { path: '/out-of-province/import', name: '增减员批量导入', key: 'out-of-province-import' },
    ],
  },
  {
    path: '/my-work-group',
    name: '我的工单',
    icon: <CheckSquareOutlined />,
    children: [
      { path: '/my-work/initiated', name: '我发起的', key: 'my-work-initiated' },
      { path: '/my-work/returned', name: '我的退回', key: 'my-work-returned' },
      { path: '/my-work/pending', name: '我的待办', key: 'my-work-pending' },
      { path: '/my-work/done', name: '我的已办', key: 'my-work-done' },
      { path: '/my-work/team', name: '团队工单', key: 'my-work-team', icon: <BarChartOutlined /> },
      { path: '/my-work/history', name: '历史工单', key: 'my-work-history' },
    ],
  },
  { path: '/notifications', name: '消息通知', icon: <BellOutlined /> },
  { path: '/admin', name: '管理后台', icon: <SettingOutlined />,
    children: [
      {
        path: '/admin/base-group',
        name: '基础配置',
        key: 'admin-base',
        icon: <SettingOutlined />,
        children: [
          { path: '/admin/users', name: '用户管理', icon: <TeamOutlined /> },
          { path: '/admin/roles', name: '角色管理', icon: <SafetyOutlined /> },
          { path: '/admin/departments', name: '部门管理', icon: <ApartmentOutlined /> },
          { path: '/admin/customers', name: '客户管理', icon: <IdcardOutlined /> },
          { path: '/admin/system-settings', name: '门户配置', icon: <SettingOutlined />, key: 'admin-portal-config' },
          { path: '/admin/certificate-types', name: '证明类型管理', icon: <FileTextOutlined /> },
        ],
      },
      {
        path: '/admin/field-template-group',
        name: '字段与模板配置',
        key: 'admin-field-template',
        icon: <FieldStringOutlined />,
        children: [
          { path: '/admin/fields', name: '系统字段库', icon: <FieldStringOutlined /> },
          { path: '/admin/import-templates', name: '导入模板配置', icon: <FileTextOutlined />, key: 'admin-import-templates' },
          { path: '/admin/module-config', name: '子工单字段配置', icon: <BranchesOutlined /> },
          { path: '/admin/field-permissions', name: '字段权限配置', icon: <LockOutlined /> },
          { path: '/admin/permission-center', name: '权限配置中心', icon: <SafetyCertificateOutlined /> },
          { path: '/admin/export-templates', name: '导出模板配置', key: 'admin-export-templates' },
          { path: '/admin/detail-view-templates', name: '详情页字段配置', key: 'admin-detail-view-templates' },
        ],
      },
      {
        path: '/admin/dispatch-flow-group',
        name: '流程与派发配置',
        key: 'admin-dispatch-flow',
        icon: <NodeIndexOutlined />,
        children: [
          { path: '/admin/dispatch-config', name: '负责人派发设置', icon: <UserSwitchOutlined /> },
          { path: '/admin/workflows', name: '流程版本配置', key: 'admin-workflows' },
        ],
      },
      {
        path: '/admin/advanced-group',
        name: '高级配置',
        key: 'admin-advanced',
        icon: <ExperimentOutlined />,
        children: [
          { path: '/admin/ai-settings', name: '智能字段映射', icon: <ExperimentOutlined /> },
          { path: '/admin/logs', name: '操作日志', icon: <AuditOutlined /> },
          { path: '/admin/login-debug', name: '登录诊断', icon: <SafetyCertificateOutlined /> },
        ],
      },
    ],
  },
];

function filterMenuByRoles(
  items: MenuItem[],
  userRoles: { code?: string }[] | undefined,
  permissions?: string[],
  businessScope?: BusinessScope,
): MenuItem[] {
  const next: MenuItem[] = [];
  for (const it of items) {
    if (it.menuVisible === false || (it.scope && businessScope && it.scope !== businessScope)) continue;
    const filteredChildren = it.children?.length
      ? filterMenuByRoles(it.children, userRoles, permissions, businessScope)
      : undefined;
    // 菜单可见性的唯一入口是 routeVisibility.ts；RAW_MENU 中仅保留展示结构。
    const selfAllowed = canAccessPath(it.path, userRoles, permissions);
    if (!selfAllowed && (!filteredChildren || filteredChildren.length === 0)) continue;
    next.push({ ...it, children: filteredChildren });
  }
  return next;
}

function getMenuItemKey(item: MenuItem): string {
  return item.key || item.path;
}

function normalizeMenuUrl(value: string): { fullPath: string; pathname: string; hasQuery: boolean } {
  const fullPath = value.split('#')[0].replace(/\/$/, '') || '/';
  const pathname = fullPath.split('?')[0] || '/';
  return { fullPath, pathname, hasQuery: fullPath.includes('?') };
}

function menuPathMatchesLocation(itemPath: string, currentPath: string, nested = false): boolean {
  const item = normalizeMenuUrl(itemPath);
  const current = normalizeMenuUrl(currentPath);
  if (item.hasQuery) {
    if (current.pathname !== item.pathname) return false;
    const itemQuery = new URLSearchParams(item.fullPath.split('?')[1] || '');
    const currentQuery = new URLSearchParams(current.fullPath.split('?')[1] || '');
    for (const [key, value] of itemQuery.entries()) {
      if (currentQuery.get(key) !== value) return false;
    }
    return true;
  }
  if (current.pathname === item.pathname) return true;
  return nested && current.pathname.startsWith(`${item.pathname}/`);
}

const OPEN_KEYS_STORAGE = 'menu_open_keys_v1';
const RECENT_MENU_PATHS_STORAGE = 'menu_recent_paths_v1';
const ACTIVE_MENU_KEY_STORAGE = 'menu_active_leaf_key_v1';

type RecentMenuPathMap = Record<string, string>;

function sanitizeInternalPath(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(raw)) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return null;
  }
}

function readRecentMenuPaths(): RecentMenuPathMap {
  try {
    const raw = localStorage.getItem(RECENT_MENU_PATHS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, sanitizeInternalPath(String(value || ''))])
        .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
    );
  } catch {
    return {};
  }
}

function writeRecentMenuPath(menuKey: string, path: string | null): void {
  if (!menuKey) return;
  try {
    const recentPaths = readRecentMenuPaths();
    if (path) recentPaths[menuKey] = path;
    else delete recentPaths[menuKey];
    localStorage.setItem(RECENT_MENU_PATHS_STORAGE, JSON.stringify(recentPaths));
  } catch { /* ignore */ }
}

function readRecentMenuPath(menuKey: string): string | null {
  return readRecentMenuPaths()[menuKey] || null;
}

function isTemporaryActionPath(pathname: string): boolean {
  const normalized = normalizeMenuUrl(pathname).pathname;
  if (['/', '/login', '/change-password', '/403', '/404'].includes(normalized)) return true;
  if (/^\/work-orders\/(new|create|import)$/.test(normalized)) return true;
  if (/^\/out-of-province\/(new|import)$/.test(normalized)) return true;
  if (/^\/renewal\/new$/.test(normalized)) return true;
  if (/^\/in-service\/new$/.test(normalized)) return true;
  if (/^\/resignation\/new$/.test(normalized)) return true;
  if (/^\/benefit\/new$/.test(normalized)) return true;
  if (/^\/admin\/workflows\/[^/]+$/.test(normalized)) return true;
  return false;
}

function isRecordableRecentPath(value: string): boolean {
  const safePath = sanitizeInternalPath(value);
  if (!safePath) return false;
  const pathname = normalizeMenuUrl(safePath).pathname;
  return !isTemporaryActionPath(pathname) && !isDetailOrEditPath(pathname);
}

// 详情/编辑页（工单详情、派发详情、离职详情等）不作为菜单最近路径：点菜单回列表页，不进入详情。
function isDetailOrEditPath(pathname: string): boolean {
  const normalized = normalizeMenuUrl(pathname).pathname;
  if (/^\/work-orders\/[^/]+$/.test(normalized)) return true;
  if (/^\/my-dispatched\/[^/]+$/.test(normalized)) return true;
  if (/^\/in-service\/[^/]+(\/audit)?$/.test(normalized)) return true;
  if (/^\/resignation\/[^/]+(\/cert)?$/.test(normalized)) return true;
  return false;
}

function isDispatchedDetailPath(pathname: string): boolean {
  return /^\/my-dispatched\/[^/]+$/.test(pathname);
}

function pathCanBeOwnedByMenu(menuPath: string, currentPath: string): boolean {
  const menu = normalizeMenuUrl(menuPath);
  const current = normalizeMenuUrl(currentPath);
  if (menuPathMatchesLocation(menuPath, currentPath, true)) return true;
  if (isTemporaryActionPath(current.pathname)) return false;

  if (menu.pathname === '/work-orders') {
    if (/^\/work-orders\/[^/]+$/.test(current.pathname)) return true;
    return menu.fullPath.includes('orderType=resignation') && /^\/resignation\/[^/]+(\/cert)?$/.test(current.pathname);
  }

  if (isDispatchedDetailPath(current.pathname)) {
    return /^\/my-work\/(initiated|returned|pending|done|team|history)$/.test(menu.pathname)
      || /^\/onboarding\/[^/]+$/.test(menu.pathname);
  }

  return !menu.hasQuery && current.pathname.startsWith(`${menu.pathname}/`);
}

function findMenuItemByKey(items: MenuItem[], menuKey: string): MenuItem | null {
  for (const item of items) {
    if (getMenuItemKey(item) === menuKey) return item;
    if (item.children?.length) {
      const matched = findMenuItemByKey(item.children, menuKey);
      if (matched) return matched;
    }
  }
  return null;
}

function findMenuItemForLocation(items: MenuItem[], currentPath: string): MenuItem | null {
  for (const item of items) {
    if (item.children?.length) {
      const matched = findMenuItemForLocation(item.children, currentPath);
      if (matched) return matched;
    }
    if (menuPathMatchesLocation(item.path, currentPath, true)) return item;
  }
  return null;
}

function findMenuOwnerForPath(items: MenuItem[], currentPath: string, fallbackMenuKey?: string): MenuItem | null {
  const direct = findMenuItemForLocation(items, currentPath);
  if (direct) return direct;
  const fallback = fallbackMenuKey ? findMenuItemByKey(items, fallbackMenuKey) : null;
  return fallback && pathCanBeOwnedByMenu(fallback.path, currentPath) ? fallback : null;
}

function getMenuNavigationTarget(item: MenuItem, userRoles: { code?: string }[] | undefined, permissions?: string[]): string | null {
  const defaultPath = sanitizeInternalPath(item.path);
  if (!defaultPath || !canAccessPath(defaultPath, userRoles, permissions)) return null;

  const menuKey = getMenuItemKey(item);
  const recentPath = readRecentMenuPath(menuKey);
  if (!recentPath) return defaultPath;

  const safeRecentPath = sanitizeInternalPath(recentPath);
  if (
    !safeRecentPath
    || !isRecordableRecentPath(safeRecentPath)
    || !pathCanBeOwnedByMenu(item.path, safeRecentPath)
    || !canAccessPath(safeRecentPath, userRoles, permissions)
  ) {
    writeRecentMenuPath(menuKey, null);
    return defaultPath;
  }

  return safeRecentPath;
}

const POLL_INTERVAL = 30000;
const EMPTY_UNREAD_BUCKETS: UnreadCountByBucket = {
  total: 0,
  salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
  backend: { todo: 0, creator_modified: 0, withdraw_void_request: 0, system: 0 },
  system: 0,
};

const SALESPERSON_NOTIFICATION_TABS: Array<{ key: NotificationBucketKey; label: string; icon?: React.ReactNode }> = [
  { key: 'field_changed', label: '后道数据修改', icon: <InfoCircleOutlined style={{ color: '#1677ff' }} /> },
  { key: 'returned', label: '退回', icon: <RollbackIcon /> },
  { key: 'withdraw_void_result', label: '撤回/作废结果', icon: <InfoCircleOutlined style={{ color: '#722ed1' }} /> },
  { key: 'system', label: '系统', icon: <InfoCircleOutlined style={{ color: '#999' }} /> },
];

const BACKEND_NOTIFICATION_TABS: Array<{ key: NotificationBucketKey; label: string; icon?: React.ReactNode }> = [
  { key: 'todo', label: '待处理', icon: <CheckSquareOutlined style={{ color: '#1677ff' }} /> },
  { key: 'creator_modified', label: '业务员数据修改', icon: <InfoCircleOutlined style={{ color: '#faad14' }} /> },
  { key: 'withdraw_void_request', label: '撤回/作废申请', icon: <AlertOutlined style={{ color: '#fa541c' }} /> },
  { key: 'system', label: '系统', icon: <InfoCircleOutlined style={{ color: '#999' }} /> },
];

const NOTIFICATION_BUCKET_ICON: Partial<Record<NotificationBucketKey, React.ReactNode>> = Object.fromEntries(
  [...SALESPERSON_NOTIFICATION_TABS, ...BACKEND_NOTIFICATION_TABS].map((item) => [item.key, item.icon]),
) as Partial<Record<NotificationBucketKey, React.ReactNode>>;

function RollbackIcon() {
  return <AlertOutlined style={{ color: '#faad14' }} />;
}

const BasicLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, permissionConfig, logout: storeLogout, fetchUser, isLoggedIn, loading: userLoading } = useUserStore();
  const { message } = App.useApp();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBuckets, setUnreadBuckets] = useState<UnreadCountByBucket>(EMPTY_UNREAD_BUCKETS);
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [businessScope, setBusinessScope] = useState<BusinessScope>(() => readBusinessScope());
  const isBusinessFrontAccount = useMemo(
    () => userHasAnyCanonicalRole(user?.roles, [
      ROLE.BUSINESS_OWNER,
      ROLE.BUSINESS_GROUP_LEADER,
      ROLE.BUSINESS_GROUP_MEMBER,
    ]),
    [user?.roles],
  );
  const accountBusinessScope = user?.business_scope ?? user?.businessScope ?? BUSINESS_SCOPE.BEILUN;
  const canSwitchBusinessScope = !isBusinessFrontAccount;
  // The value is intentionally read here so menu filtering re-renders after a
  // permission-center activation; routeVisibility keeps the static fallback.
  void permissionConfig;
  const effectiveBusinessScope = canSwitchBusinessScope ? businessScope : accountBusinessScope;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastAuthRefreshRef = useRef(0);

  const refreshCurrentUser = useCallback(() => {
    if (!isLoggedIn || userLoading) return;
    const now = Date.now();
    if (now - lastAuthRefreshRef.current < 1000) return;
    lastAuthRefreshRef.current = now;
    void fetchUser();
  }, [fetchUser, isLoggedIn, userLoading]);

  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (lastPathRef.current === location.pathname && user) return;
    lastPathRef.current = location.pathname;
    refreshCurrentUser();
  }, [location.pathname, refreshCurrentUser, user]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || ['token', 'refreshToken', 'mock_session_user_v1'].includes(event.key)) refreshCurrentUser();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshCurrentUser();
    };
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshCurrentUser]);

  useEffect(() => {
    if (canSwitchBusinessScope) return;
    setBusinessScope(accountBusinessScope);
    writeBusinessScope(accountBusinessScope);
  }, [accountBusinessScope, canSwitchBusinessScope]);

  // 按最新 /auth/me 返回的角色、权限和账号业务线过滤菜单。
  const filteredMenu = useMemo(
    () => filterMenuByRoles(RAW_MENU, user?.roles, user?.permissions, effectiveBusinessScope),
    [effectiveBusinessScope, user?.permissions, user?.roles],
  );

  const rootSubmenuKeys = useMemo(() => {
    const collect = (items: MenuItem[]): string[] => items.flatMap((item) => (
      item.children?.length ? [item.path, ...collect(item.children)] : []
    ));
    return collect(filteredMenu);
  }, [filteredMenu]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let title = '工单管理系统';

    if (location.pathname === '/dashboard') title = '仪表盘 - 工单管理系统';
    if (location.pathname === '/notifications') title = '消息通知 - 工单管理系统';
    if (location.pathname === '/in-service') title = '单项业务办理 - 工单管理系统';
    else if (location.pathname === '/in-service/new') title = '新建单项业务 - 工单管理系统';
    else if (/^\/in-service\/[^/]+$/.test(location.pathname)) title = '单项业务详情 - 工单管理系统';
    if (location.pathname === '/out-of-province') title = '省外增减员列表 - 工单管理系统';
    if (location.pathname === '/out-of-province/import') title = '省外增减员导入 - 工单管理系统';
    if (location.pathname === '/admin/users') title = '用户管理 - 工单管理系统';
    if (location.pathname === '/admin/module-config') title = '子工单字段配置 - 工单管理系统';
    if (location.pathname === '/admin/fields') title = '系统字段库 - 工单管理系统';
    if (location.pathname === '/admin/import-templates') title = '导入模板配置 - 工单管理系统';
    if (location.pathname === '/admin/dispatch-config') title = '负责人派发设置 - 工单管理系统';
    if (location.pathname === '/work-orders') {
      const orderType = params.get('orderType');
      if (orderType === 'onboarding') title = '入职主工单列表 - 工单管理系统';
      else if (orderType === 'resignation') title = '离职主工单列表 - 工单管理系统';
      else title = '主工单列表 - 工单管理系统';
    }

    document.title = title;
  }, [location.pathname, location.search]);

  const canViewNotifications = useMemo(
    () => userHasAnyCanonicalRole(user?.roles, [...NOTIFICATION_ROLES]),
    [user?.roles],
  );

  const isSalespersonNotificationView = useMemo(
    () => userHasAnyCanonicalRole(user?.roles, [ROLE.BUSINESS_GROUP_MEMBER, ROLE.BUSINESS_GROUP_LEADER]),
    [user?.roles],
  );

  const notificationTabs = isSalespersonNotificationView ? SALESPERSON_NOTIFICATION_TABS : BACKEND_NOTIFICATION_TABS;

  const getBucketCount = useCallback((key: NotificationBucketKey): number => {
    if (key === 'system') return unreadBuckets.system;
    if (key in unreadBuckets.salesperson) return unreadBuckets.salesperson[key as keyof typeof unreadBuckets.salesperson];
    if (key in unreadBuckets.backend) return unreadBuckets.backend[key as keyof typeof unreadBuckets.backend];
    return 0;
  }, [unreadBuckets]);

  useEffect(() => {
    if (activeTab === 'all') return;
    if (!notificationTabs.some((tab) => tab.key === activeTab)) setActiveTab('all');
  }, [activeTab, notificationTabs]);

  // 受控的菜单展开状态 + localStorage 持久化（解决「点子工单后父级收起」「刷新后丢失展开态」）
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEYS_STORAGE);
      if (raw) return JSON.parse(raw) as string[];
    } catch { /* ignore */ }
    return [];
  });

  // ★ 计算当前路径应有的父级菜单 keys。
  // 入职/离职主列表共用 /work-orders，必须用完整 pathname + search 区分 orderType。
  const computeParentKeys = useCallback((menu: MenuItem[], currentPath: string, ownerKey?: string): string[] => {
    const visit = (items: MenuItem[], ancestors: string[]): string[] | null => {
      for (const item of items) {
        const nextAncestors = item.children?.length ? [...ancestors, item.path] : ancestors;
        if (item.children?.length) {
          const matched = visit(item.children, nextAncestors);
          if (matched) return matched;
        }
        if (menuPathMatchesLocation(item.path, currentPath, true) || (ownerKey && getMenuItemKey(item) === ownerKey)) return ancestors;
      }
      return null;
    };
    return visit(menu, []) || [];
  }, []);

  const selectedKeys = useMemo(() => {
    const currentPath = `${location.pathname}${location.search}`;
    let fallbackMenuKey: string | undefined;
    try { fallbackMenuKey = localStorage.getItem(ACTIVE_MENU_KEY_STORAGE) || undefined; } catch { /* ignore */ }
    const selected = findMenuOwnerForPath(filteredMenu, currentPath, fallbackMenuKey);
    return selected ? Array.from(new Set([getMenuItemKey(selected), selected.path])) : [];
  }, [filteredMenu, location.pathname, location.search]);

  // ★ 每次路径变化时，只保留当前路由所属父菜单，避免点其他父菜单后旧父菜单还展开。
  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    let fallbackMenuKey: string | undefined;
    try { fallbackMenuKey = localStorage.getItem(ACTIVE_MENU_KEY_STORAGE) || undefined; } catch { /* ignore */ }
    const owner = findMenuOwnerForPath(filteredMenu, currentPath, fallbackMenuKey);
    const parents = computeParentKeys(filteredMenu, currentPath, owner ? getMenuItemKey(owner) : undefined);
    if (parents.length === 0) return;
    setOpenKeys((prev) => {
      const next = parents;
      return prev.length === next.length && prev.every((key, index) => key === next[index]) ? prev : next;
    });
  }, [location.pathname, location.search, filteredMenu, computeParentKeys]);

  // 记录每个叶子菜单的最近合法停留路径。详情页等无菜单前缀页面沿用上一个叶子菜单上下文。
  useEffect(() => {
    const currentPath = sanitizeInternalPath(`${location.pathname}${location.search}`);
    if (!currentPath || !isRecordableRecentPath(currentPath)) return;
    if (!canAccessPath(currentPath, user?.roles, user?.permissions)) return;

    let fallbackMenuKey: string | undefined;
    try { fallbackMenuKey = localStorage.getItem(ACTIVE_MENU_KEY_STORAGE) || undefined; } catch { /* ignore */ }
    const owner = findMenuOwnerForPath(filteredMenu, currentPath, fallbackMenuKey);
    if (!owner || owner.children?.length || !pathCanBeOwnedByMenu(owner.path, currentPath)) return;

    const ownerKey = getMenuItemKey(owner);
    writeRecentMenuPath(ownerKey, currentPath);
    try { localStorage.setItem(ACTIVE_MENU_KEY_STORAGE, ownerKey); } catch { /* ignore */ }
  }, [location.pathname, location.search, filteredMenu, user?.permissions, user?.roles]);

  // ★ openKeys 变化时同步到 localStorage
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEYS_STORAGE, JSON.stringify(openKeys)); } catch { /* ignore */ }
  }, [openKeys]);

  const fetchAll = useCallback(async () => {
    if (!canViewNotifications) {
      setUnreadCount(0);
      setUnreadBuckets(EMPTY_UNREAD_BUCKETS);
      setAllNotifications([]);
      return;
    }
    try {
      const [bucketCounts, result] = await Promise.all([
        getUnreadCountByBucket(),
        getNotifications({ unread: true, page: 1, pageSize: 50 }),
      ]);
      const list = Array.isArray(result?.list) ? result.list : [];
      setAllNotifications(list);
      setUnreadBuckets(bucketCounts);
      setUnreadCount(bucketCounts.total);
    } catch { /* ignore */ }
  }, [canViewNotifications]);

  useEffect(() => {
    fetchAll();
    if (!canViewNotifications) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [canViewNotifications, fetchAll]);

  // 已读按钮可手动消除提醒；处理按钮仅跳转，提醒仍由办结/作废/删除等生命周期清理。

  const buildNotificationLink = (item: NotificationItem): string | null => {
    const query = new URLSearchParams();
    const rawType = `${item.biz_type || ''} ${item.type || ''}`.toLowerCase();
    const shouldOpenEdit = rawType.includes('returned') || rawType.includes('return') || rawType.includes('withdraw_approved') || rawType.includes('dispatched_returned');
    query.set('fromNotification', item.id);
    if (shouldOpenEdit) query.set('action', 'edit');
    if (item.ref_order_no || item.order_no) query.set('highlightOrderNo', item.ref_order_no || item.order_no || '');
    if (Array.isArray(item.diff_fields) && item.diff_fields.length > 0) {
      const fields = item.diff_fields.map((field) => field.field_code).filter(Boolean);
      query.set('highlightFields', fields.join(','));
      if (fields[0]) query.set('focus', fields[0]);
    }
    const suffix = query.toString();

    if (item.entity_type === 'dispatched_order' && item.entity_id) {
      return `/my-dispatched/${item.entity_id}?${suffix}`;
    }
    if (item.ref_order_id) return `/work-orders/${item.ref_order_id}?${suffix}`;
    if (item.link) {
      const normalized = item.link.replace(/^\/dispatched\//, '/my-dispatched/');
      return `${normalized}${normalized.includes('?') ? '&' : '?'}${suffix}`;
    }
    return null;
  };

  const handleNotifRead = async (item: NotificationItem) => {
    if (item.is_read) return;
    try {
      await markNotificationRead(item.id);
      message.success('已读已确认，提醒已消除');
      await fetchAll();
    } catch {
      message.error('标记已读失败');
    }
  };

  const handleNotifProcess = (item: NotificationItem) => {
    const link = buildNotificationLink(item);
    if (link) {
      setNotifOpen(false);
      navigate(link);
    } else {
      message.info('该消息暂无可处理的关联工单');
    }
  };

  const filteredNotifications = activeTab === 'all'
    ? allNotifications
    : allNotifications.filter((n) => getNotificationBucket(n) === activeTab);

  const notifContent = (
    <div style={{ width: 360, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} size="small"
        items={[
          { key: 'all', label: <Badge count={unreadCount} size="small" offset={[6, -2]}>全部</Badge> },
          ...notificationTabs.map((tab) => ({
            key: tab.key,
            label: (
              <Badge count={getBucketCount(tab.key)} size="small" offset={[6, -2]}>
                <Space size={2}>{tab.icon}{tab.label}</Space>
              </Badge>
            ),
          })),
        ]}

      />
      {filteredNotifications.length > 0 ? (
        <List
          dataSource={filteredNotifications.slice(0, 20)}
          style={{ maxHeight: 'min(360px, calc(100vh - 170px))', overflow: 'auto' }}
          renderItem={(item) => (
            <List.Item
              style={{ padding: '8px 12px', background: item.is_read ? 'transparent' : '#f6ffed' }}
            >
              <List.Item.Meta
                avatar={NOTIFICATION_BUCKET_ICON[getNotificationBucket(item)] || <InfoCircleOutlined style={{ color: '#999' }} />}
                title={
                  <Space size={4}>
                    <Tag color={item.priority === 'urgent' ? 'red' : item.priority === 'normal' ? 'blue' : 'default'} style={{ fontSize: 10, lineHeight: '16px' }}>
                      {item.priority === 'urgent' ? '紧急' : item.priority === 'normal' ? '普通' : '低'}
                    </Tag>
                    {!item.is_read && <Badge status="processing" />}
                    <span style={{ fontWeight: item.is_read ? 'normal' : 'bold', fontSize: 13 }}>{getNotificationDisplayTitle(item)}</span>
                  </Space>
                }
                description={
                  <>
                    <div style={{ fontSize: 12 }}>{getNotificationDisplayContent(item)}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {new Date(item.created_at).toLocaleString('zh-CN')}
                    </div>
                    <Space size={8} style={{ marginTop: 6 }}>
                      <Button size="small" disabled={item.is_read} onClick={() => handleNotifRead(item)}>已读</Button>
                      <Button size="small" type="primary" onClick={() => handleNotifProcess(item)}>处理</Button>
                    </Space>
                  </>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );

  const handleBusinessScopeChange = (value: string | number) => {
    if (!canSwitchBusinessScope) return;
    const nextScope = value === BUSINESS_SCOPE.OUT_OF_PROVINCE
      ? BUSINESS_SCOPE.OUT_OF_PROVINCE
      : BUSINESS_SCOPE.BEILUN;
    if (nextScope === businessScope) return;
    setBusinessScope(nextScope);
    writeBusinessScope(nextScope);
    navigate(getBusinessScopeLandingPath(nextScope));
  };

  const handleLogout = async () => {
    try { await logoutApi(); } catch { /* ignore */ }
    storeLogout();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.children?.length) {
      const isOpen = openKeys.includes(item.path);
      setOpenKeys((prev) => (isOpen ? prev.filter((key) => key !== item.path) : Array.from(new Set([...prev, item.path]))));
      return;
    }
    if (!item.path) return;
    const targetPath = getMenuNavigationTarget(item, user?.roles, user?.permissions);
    if (!targetPath) return;
    const menuKey = getMenuItemKey(item);
    try { localStorage.setItem(ACTIVE_MENU_KEY_STORAGE, menuKey); } catch { /* ignore */ }
    const parents = computeParentKeys(filteredMenu, item.path);
    if (parents.length > 0) {
      setOpenKeys(parents);
    }
    navigate(targetPath);
  };

  return (
    <ProLayout
      title="工单管理系统" logo={null} location={location}
      route={{ children: filteredMenu }}
      pageTitleRender={false}
  menuProps={{
        openKeys,
        selectedKeys,
        onOpenChange: (keys) => {
          const incoming = keys as string[];
          setOpenKeys(incoming);
        },
      }}
      menuItemRender={(item, dom) => (
        <button
          type="button"
          data-menu-path={item.path}
          data-menu-name={item.name}
          aria-label={item.name}
          onClick={() => handleMenuClick(item as MenuItem)}
          style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
        >
          {dom}
        </button>
      )}
      menuExtraRender={(layoutProps) => {
        const collapsed = Boolean(layoutProps.collapsed);
        const isOutOfProvince = effectiveBusinessScope === BUSINESS_SCOPE.OUT_OF_PROVINCE;
        const scopeLabel = isOutOfProvince ? '浙江自签' : '北仑本地';
        if (collapsed) {
          const nextScope = isOutOfProvince ? BUSINESS_SCOPE.BEILUN : BUSINESS_SCOPE.OUT_OF_PROVINCE;
          return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <Button
                type="text"
                size="small"
                icon={<ApartmentOutlined />}
                title={canSwitchBusinessScope ? `当前${scopeLabel}，点击切换业务范围` : `当前业务范围：${scopeLabel}`}
                aria-label={canSwitchBusinessScope ? `当前${scopeLabel}，切换业务范围` : `当前业务范围：${scopeLabel}`}
                onClick={canSwitchBusinessScope ? () => handleBusinessScopeChange(nextScope) : undefined}
              />
            </div>
          );
        }
        return (
          <div style={{ padding: '4px 16px 12px' }}>
            <div style={{ marginBottom: 6, color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>业务范围</div>
            {canSwitchBusinessScope ? (
              <Segmented
                block
                aria-label="业务范围"
                size="small"
                value={effectiveBusinessScope}
                options={[
                  { label: '北仑', value: BUSINESS_SCOPE.BEILUN },
                  { label: '省外', value: BUSINESS_SCOPE.OUT_OF_PROVINCE },
                ]}
                onChange={handleBusinessScopeChange}
              />
            ) : (
              <Tag
                color={isOutOfProvince ? 'cyan' : 'blue'}
                style={{ display: 'block', margin: 0, textAlign: 'center' }}
              >
                {scopeLabel}
              </Tag>
            )}
          </div>
        );
      }}
      actionsRender={(layoutProps) => {
        const collapsed = Boolean(layoutProps.collapsed);
        return [
          <Space
            key="account-actions"
            direction={collapsed ? 'vertical' : 'horizontal'}
            size={collapsed ? 4 : 6}
            align="center"
            style={collapsed
              ? { width: '100%' }
              : {
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                justifyContent: 'space-between',
                overflow: 'visible',
                padding: '0 8px',
              }}
          >
            <Dropdown
              placement="bottomRight"
              getPopupContainer={() => document.body}
              menu={{
                items: [
                  {
                    key: 'change-password',
                    icon: <LockOutlined />,
                    label: '修改密码',
                    onClick: () => navigate('/change-password'),
                  },
                ],
              }}
            >
              {collapsed ? (
                <Button
                  type="text"
                  size="small"
                  icon={<IdcardOutlined />}
                  title={user?.real_name || user?.username || '当前用户'}
                  aria-label={user?.real_name || user?.username || '当前用户'}
                />
              ) : (
                <span
                  title={user?.real_name || user?.username || '当前用户'}
                  style={{
                    display: 'inline-block',
                    maxWidth: 80,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: '#f5f5f5',
                    color: 'rgba(0, 0, 0, 0.65)',
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                    cursor: 'pointer',
                  }}
                >
                  {user?.real_name || user?.username || '用户'}
                </span>
              )}
            </Dropdown>
            {canViewNotifications ? (
              <Popover content={notifContent} title={null} trigger="click"
                open={notifOpen} onOpenChange={setNotifOpen} placement="bottomRight"
                getPopupContainer={() => document.body}>
                <Badge count={unreadCount} size="small" offset={[-2, 4]}>
                  <Button
                    type="text"
                    size="small"
                    icon={<BellOutlined />}
                    title="消息通知"
                    aria-label="消息通知"
                    onClick={() => { fetchAll(); setNotifOpen(!notifOpen); }}
                  />
                </Badge>
              </Popover>
            ) : null}
            <Button
              type="text"
              size="small"
              icon={<LogoutOutlined />}
              title="退出登录"
              aria-label="退出登录"
              onClick={handleLogout}
            >
              {collapsed ? null : '退出'}
            </Button>
          </Space>,
        ];
      }}
      menuHeaderRender={undefined}
    >
      <KeepAliveOutlet />
    </ProLayout>
  );
};

export default BasicLayout;
