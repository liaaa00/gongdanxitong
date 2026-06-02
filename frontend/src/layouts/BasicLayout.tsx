import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { App, Badge, Popover, List, Button, Empty, Tabs, Tag, Space } from 'antd';
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
import { getNotifications, getUnreadCountByBucket, getNotificationBucket } from '@/services/notifications';
import type { NotificationBucketKey, NotificationItem, UnreadCountByBucket } from '@/services/notifications';
import { getNotificationDisplayContent, getNotificationDisplayTitle } from '@/utils/notificationDisplay';

// 菜单项只描述展示结构；可见性统一由 routeVisibility.ts 判定。
type MenuItem = {
  path: string;
  name: string;
  icon?: React.ReactNode;
  key?: string;
  menuVisible?: boolean;
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
    name: '入职管理',
    icon: <FileTextOutlined />,
    // 子菜单由 routeVisibility.ts 决定是否显示。
    children: [
      { path: '/work-orders', name: '主工单列表', key: 'work-orders-main' },
      { path: '/onboarding/contract', name: '劳动合同签订子工单' },
      { path: '/onboarding/onboarding_contact', name: '入职联系子工单' },
      { path: '/onboarding/data_entry', name: '入职数据录入子工单' },
      { path: '/onboarding/social_insurance', name: '入职社保公积金办理子工单' },
    ],
  },
  {
    path: '/in-service-group',
    name: '在职管理',
    icon: <FileTextOutlined />,
    children: [
      { path: '/renewal', name: '续签主工单列表', key: 'renewal-list' },
      { path: '/onboarding/renewal_contract', name: '劳动合同续签子工单', key: 'renewal-contract-sub-list' },
      { path: '/benefit', name: '待遇申报主工单列表', key: 'benefit-list' },
      { path: '/onboarding/benefit_apply', name: '待遇申报子工单', key: 'benefit-apply-sub-list' },
    ],
  },
  {
    path: '/offboarding-group',
    name: '离职管理',
    icon: <FileTextOutlined />,
    children: [
      { path: '/resignation', name: '离职主工单列表', key: 'resignation-list' },
      { path: '/onboarding/resignation_contact', name: '离职材料收集子工单', key: 'resignation-contact-sub-list' },
      { path: '/onboarding/resignation_cert', name: '离职证明子工单', key: 'resignation-cert-sub-list' },
      { path: '/onboarding/data_entry_resign', name: '离职数据录入子工单', key: 'data-entry-resign-sub-list' },
      { path: '/resignation/:id/cert', name: '离职证明', key: 'resignation-cert', menuVisible: false },
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
        ],
      },
      {
        path: '/admin/workflow-group',
        name: '工单配置',
        key: 'admin-workflow',
        icon: <NodeIndexOutlined />,
        children: [
          { path: '/admin/module-config', name: '模块化配置', icon: <BranchesOutlined /> },
          { path: '/admin/fields', name: '表单字段管理', icon: <FieldStringOutlined /> },
          { path: '/admin/field-permissions', name: '字段填写权限', icon: <LockOutlined /> },
          { path: '/admin/dispatch-config', name: '派发配置', icon: <UserSwitchOutlined /> },
          { path: '/admin/workflows', name: '工单流程配置', key: 'admin-workflows' },
          { path: '/admin/export-templates', name: '导出模板配置', key: 'admin-export-templates' },
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

function filterMenuByRoles(items: MenuItem[], userRoles: { code?: string }[] | undefined, permissions?: string[]): MenuItem[] {
  const next: MenuItem[] = [];
  for (const it of items) {
    if (it.menuVisible === false) continue;
    const filteredChildren = it.children?.length ? filterMenuByRoles(it.children, userRoles, permissions) : undefined;
    // 菜单可见性的唯一入口是 routeVisibility.ts；RAW_MENU 中仅保留展示结构。
    const selfAllowed = canAccessPath(it.path, userRoles, permissions);
    if (!selfAllowed && (!filteredChildren || filteredChildren.length === 0)) continue;
    next.push({ ...it, children: filteredChildren });
  }
  return next;
}

const OPEN_KEYS_STORAGE = 'menu_open_keys_v1';

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
  const { user, logout: storeLogout, fetchUser, isLoggedIn, loading: userLoading } = useUserStore();
  const { message } = App.useApp();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBuckets, setUnreadBuckets] = useState<UnreadCountByBucket>(EMPTY_UNREAD_BUCKETS);
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
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

  // 按最新 /auth/me 返回的角色 + permissions 过滤菜单（权限变更后路由跳转/刷新会即时生效）
  const filteredMenu = useMemo(
    () => filterMenuByRoles(RAW_MENU, user?.roles, user?.permissions),
    [user?.permissions, user?.roles],
  );

  const rootSubmenuKeys = useMemo(() => {
    const collect = (items: MenuItem[]): string[] => items.flatMap((item) => (
      item.children?.length ? [item.path, ...collect(item.children)] : []
    ));
    return collect(filteredMenu);
  }, [filteredMenu]);

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

  // ★ 计算当前路径应有的父级菜单 keys
  const computeParentKeys = useCallback((menu: MenuItem[], pathname: string): string[] => {
    const visit = (items: MenuItem[], ancestors: string[]): string[] | null => {
      for (const item of items) {
        const nextAncestors = item.children?.length ? [...ancestors, item.path] : ancestors;
        if (pathname === item.path || pathname.startsWith(item.path + '/')) return ancestors;
        if (item.children?.length) {
          const matched = visit(item.children, nextAncestors);
          if (matched) return matched;
        }
      }
      return null;
    };
    return visit(menu, []) || [];
  }, []);

  // ★ 每次路径变化时，只保留当前路由所属父菜单，避免点其他父菜单后旧父菜单还展开。
  useEffect(() => {
    const parents = computeParentKeys(filteredMenu, location.pathname);
    if (parents.length === 0) return;
    setOpenKeys((prev) => {
      const next = parents;
      return prev.length === next.length && prev.every((key, index) => key === next[index]) ? prev : next;
    });
  }, [location.pathname, filteredMenu, computeParentKeys]);

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

  // 通知红点与办结生命周期绑定：顶部铃铛不再提供手动已读入口。

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
    <div style={{ width: 360, maxHeight: 520 }}>
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
          style={{ maxHeight: 360, overflow: 'auto' }}
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
    const parents = computeParentKeys(filteredMenu, item.path);
    if (parents.length > 0) {
      setOpenKeys(parents);
    }
    navigate(item.path);
  };

  return (
    <ProLayout
      title="工单管理系统" logo={null} location={location}
      route={{ children: filteredMenu }}
  menuProps={{
        openKeys,
        onOpenChange: (keys) => {
          const incoming = keys as string[];
          setOpenKeys(incoming);
        },
      }}
      menuItemRender={(item, dom) => (
        <button
          type="button"
          onClick={() => handleMenuClick(item as MenuItem)}
          style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
        >
          {dom}
        </button>
      )}
      actionsRender={() => [
        <Space key="top-actions" size={8} align="center" style={{ flexWrap: 'nowrap', marginRight: 8 }}>
          <span
            title={user?.real_name || user?.username || '当前用户'}
            style={{
              display: 'inline-block',
              maxWidth: 96,
              padding: '2px 8px',
              borderRadius: 12,
              background: '#f5f5f5',
              color: 'rgba(0, 0, 0, 0.65)',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'middle',
            }}
          >
            {user?.real_name || user?.username || '用户'}
          </span>
          {canViewNotifications ? (
            <Popover content={notifContent} title={null} trigger="click"
              open={notifOpen} onOpenChange={setNotifOpen} placement="bottomRight">
              <Badge count={unreadCount} size="small" offset={[-2, 4]}>
                <BellOutlined style={{ fontSize: 18, cursor: 'pointer', padding: '4px 6px' }}
                  onClick={() => { fetchAll(); setNotifOpen(!notifOpen); }} />
              </Badge>
            </Popover>
          ) : null}
          <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出</Button>
        </Space>,
      ]}
      menuHeaderRender={undefined}
    >
      <Outlet />
    </ProLayout>
  );
};

export default BasicLayout;
