import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { App, Badge, Popover, List, Button, Empty, Tabs, Tag, Space } from 'antd';
import {
  DashboardOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined,
  TeamOutlined, SafetyOutlined, ApartmentOutlined, IdcardOutlined,
  FieldStringOutlined, LockOutlined, BranchesOutlined, UserSwitchOutlined,
  AuditOutlined, CheckSquareOutlined,
  BarChartOutlined, BellOutlined, SoundOutlined, AlertOutlined, InfoCircleOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import { useUserStore } from '@/stores/userStore';
import { logout as logoutApi } from '@/services/auth';
import { canAccessPath } from '@/config/routeVisibility';
import { ROLE, userHasAnyCanonicalRole, type CanonicalRole } from '@/constants/roles';
import { getNotifications, markNotificationRead, markAllRead, getUnreadCountByBucket, getNotificationBucket } from '@/services/notifications';
import type { NotificationBucketKey, NotificationItem, UnreadCountByBucket } from '@/services/notifications';
import { getNotificationDisplayContent, getNotificationDisplayTitle } from '@/utils/notificationDisplay';

// 菜单项类型：roles 字段未声明 = 所有登录用户可见；声明 = 仅这些规范角色可见
type MenuItem = {
  path: string;
  name: string;
  icon?: React.ReactNode;
  key?: string;
  roles?: string[];
  menuVisible?: boolean;
  children?: MenuItem[];
};

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
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
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

const TEAM_WORK_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
] as const satisfies readonly CanonicalRole[];

const RAW_MENU: MenuItem[] = [
  { path: '/dashboard', name: '仪表盘', icon: <DashboardOutlined /> },
  {
    path: '/work-orders',
    name: '入职管理',
    icon: <FileTextOutlined />,
    roles: [...ONBOARDING_ROLES],
    children: [
      { path: '/work-orders', name: '主工单列表', key: 'work-orders-main', roles: [...BUSINESS_ORDER_ROLES] },
      { path: '/onboarding/contract', name: '合同签订子工单', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER] },
      { path: '/onboarding/onboarding_contact', name: '入职联系子工单', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
      { path: '/onboarding/data_entry', name: '数据录入子工单', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER] },
      { path: '/onboarding/social_insurance', name: '社保公积金办理子工单', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
    ],
  },
  {
    path: '/renewal',
    name: '在职管理',
    icon: <FileTextOutlined />,
    roles: [...IN_SERVICE_ROLES],
    children: [
      { path: '/renewal', name: '续签主工单列表', key: 'renewal-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER] },
      { path: '/onboarding/renewal_contract', name: '续签合同子工单', key: 'renewal-contract-sub-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER] },
      { path: '/benefit', name: '待遇申报主工单列表', key: 'benefit-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
      { path: '/onboarding/benefit_apply', name: '待遇申报子工单', key: 'benefit-apply-sub-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
    ],
  },
  {
    path: '/resignation',
    name: '离职管理',
    icon: <FileTextOutlined />,
    roles: [...OFFBOARDING_ROLES],
    children: [
      { path: '/resignation', name: '离职主工单列表', key: 'resignation-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
      { path: '/onboarding/resignation_contact', name: '离职联系子工单', key: 'resignation-contact-sub-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
      { path: '/onboarding/resignation_cert', name: '离职证明子工单', key: 'resignation-cert-sub-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
      { path: '/onboarding/data_entry_resign', name: '社保停保子工单', key: 'data-entry-resign-sub-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
      { path: '/resignation/:id/cert', name: '离职证明', key: 'resignation-cert', menuVisible: false, roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
    ],
  },
  {
    path: '/my-work/pending',
    name: '我的工单',
    icon: <CheckSquareOutlined />,
    children: [
      { path: '/my-work/initiated', name: '我发起的', key: 'my-work-initiated', roles: [...INITIATED_WORK_ROLES] },
      { path: '/my-work/pending', name: '我的待办', key: 'my-work-pending', roles: [...PENDING_WORK_ROLES] },
      { path: '/my-work/done', name: '我的已办', key: 'my-work-done', roles: [...DONE_WORK_ROLES] },
      { path: '/my-work/team', name: '团队工单', key: 'my-work-team', icon: <BarChartOutlined />, roles: [...TEAM_WORK_ROLES] },
      { path: '/my-work/history', name: '历史工单', key: 'my-work-history', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER, ROLE.ONBOARDING_RESIGNATION_MEMBER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
    ],
  },
  { path: '/notifications', name: '消息通知', icon: <BellOutlined /> },
  { path: '/admin', name: '管理后台', icon: <SettingOutlined />,
    roles: [ROLE.ADMIN],
    children: [
      { path: '/admin/users', name: '用户管理', icon: <TeamOutlined /> },
      { path: '/admin/roles', name: '角色管理', icon: <SafetyOutlined /> },
      { path: '/admin/departments', name: '部门管理', icon: <ApartmentOutlined /> },
      { path: '/admin/customers', name: '客户管理', icon: <IdcardOutlined /> },
      { path: '/admin/module-config', name: '模块化配置', icon: <BranchesOutlined /> },
      { path: '/admin/fields', name: '字段配置', icon: <FieldStringOutlined /> },
      { path: '/admin/field-permissions', name: '字段权限', icon: <LockOutlined /> },
      { path: '/admin/dispatch-config', name: '派发配置', icon: <UserSwitchOutlined /> },
      { path: '/admin/workflows', name: '工单流程配置', icon: <NodeIndexOutlined />, key: 'admin-workflows' },
      { path: '/admin/export-templates', name: '导出模板配置', key: 'admin-export-templates' },
      { path: '/admin/system-settings', name: '门户配置', icon: <SettingOutlined />, key: 'admin-portal-config' },
      { path: '/admin/ai-settings', name: '智能字段映射', icon: <ExperimentOutlined /> },
      { path: '/admin/logs', name: '操作日志', icon: <AuditOutlined /> },
      { path: '/admin/login-debug', name: '登录诊断', icon: <SafetyCertificateOutlined /> },
    ],
  },
];

function filterMenuByRoles(items: MenuItem[], userRoles: { code?: string }[] | undefined, userPermissions: string[] = []): MenuItem[] {
  const next: MenuItem[] = [];
  for (const it of items) {
    if (it.menuVisible === false) continue;
    const filteredChildren = it.children?.length ? filterMenuByRoles(it.children, userRoles, userPermissions) : undefined;
    const roleAllowed = !it.roles?.length || userHasAnyCanonicalRole(userRoles, it.roles);
    const pathAllowed = canAccessPath(it.path, userRoles, userPermissions);
    const selfAllowed = roleAllowed && pathAllowed;
    if (!selfAllowed && (!filteredChildren || filteredChildren.length === 0)) continue;
    next.push({ ...it, children: filteredChildren });
  }
  return next;
}

const OPEN_KEYS_STORAGE = 'menu_open_keys_v1';

const POLL_INTERVAL = 30000;
const EMPTY_UNREAD_BUCKETS: UnreadCountByBucket = {
  total: 0,
  salesperson: { field_changed: 0, returned: 0, urge_feedback: 0, withdraw_void_result: 0 },
  backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 0, withdraw_void_request: 0 },
  system: 0,
};

const SALESPERSON_NOTIFICATION_TABS: Array<{ key: NotificationBucketKey; label: string; icon?: React.ReactNode }> = [
  { key: 'field_changed', label: '后道数据修改', icon: <InfoCircleOutlined style={{ color: '#1677ff' }} /> },
  { key: 'returned', label: '退回', icon: <RollbackIcon /> },
  { key: 'urge_feedback', label: '催办反馈', icon: <SoundOutlined style={{ color: '#1677ff' }} /> },
  { key: 'withdraw_void_result', label: '撤回/作废结果', icon: <InfoCircleOutlined style={{ color: '#722ed1' }} /> },
  { key: 'system', label: '系统', icon: <InfoCircleOutlined style={{ color: '#999' }} /> },
];

const BACKEND_NOTIFICATION_TABS: Array<{ key: NotificationBucketKey; label: string; icon?: React.ReactNode }> = [
  { key: 'todo', label: '待办', icon: <CheckSquareOutlined style={{ color: '#1677ff' }} /> },
  { key: 'urge', label: '催办', icon: <SoundOutlined style={{ color: '#1677ff' }} /> },
  { key: 'sla_warning', label: '即将超时', icon: <AlertOutlined style={{ color: '#faad14' }} /> },
  { key: 'sla_breached', label: '已超时', icon: <AlertOutlined style={{ color: '#ff4d4f' }} /> },
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
  const { user, logout: storeLogout } = useUserStore();
  const { message } = App.useApp();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBuckets, setUnreadBuckets] = useState<UnreadCountByBucket>(EMPTY_UNREAD_BUCKETS);
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 按角色过滤菜单（用户没有权限的页面，菜单直接不渲染）
  const filteredMenu = useMemo(
    () => filterMenuByRoles(RAW_MENU, user?.roles, user?.permissions || []),
    [user?.roles, user?.permissions],
  );

  const rootSubmenuKeys = useMemo(
    () => filteredMenu.filter((item) => item.children?.length).map((item) => item.path),
    [filteredMenu],
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
    const parents: string[] = [];
    for (const it of menu) {
      if (!it.children?.length) continue;
      for (const c of it.children) {
        if (pathname === c.path || pathname.startsWith(c.path + '/')) {
          parents.push(it.path);
          break;
        }
      }
    }
    return parents;
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
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  const handleMarkRead = async (item: NotificationItem) => {
    try {
      await markNotificationRead(item.id);
      setUnreadCount((c) => Math.max(0, c - 1));
      setAllNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      fetchAll();
    } catch { /* ignore */ }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      setUnreadCount(0);
      setUnreadBuckets(EMPTY_UNREAD_BUCKETS);
      setAllNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  };

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
        tabBarExtraContent={
          unreadCount > 0 ? <Button type="link" size="small" onClick={handleMarkAll}>全部已读</Button> : null
        }
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
                      <Button size="small" type="link" disabled={item.is_read} onClick={() => handleMarkRead(item)}>已读</Button>
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

  const handleMenuClick = (path: string) => {
    const parents = computeParentKeys(filteredMenu, path);
    if (parents.length > 0) {
      setOpenKeys(parents);
    }
    navigate(path);
  };

  return (
    <ProLayout
      title="工单管理系统" logo={null} location={location}
      route={{ children: filteredMenu }}
      menuProps={{
        openKeys,
        onOpenChange: (keys) => {
          const incoming = keys as string[];
          const latestOpenKey = incoming.find((key) => !openKeys.includes(key));
          if (!latestOpenKey) {
            // 关闭当前父菜单时尊重用户操作；若是点击叶子项触发空数组，保留当前路由父级，避免跳转瞬间折叠。
            const parents = computeParentKeys(filteredMenu, location.pathname);
            setOpenKeys(incoming.length === 0 && parents.length > 0 ? parents : incoming);
            return;
          }
          setOpenKeys(rootSubmenuKeys.includes(latestOpenKey) ? [latestOpenKey] : incoming);
        },
      }}
      menuItemRender={(item, dom) => (
        <button
          type="button"
          onClick={() => item.path && handleMenuClick(item.path)}
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
          <Popover content={notifContent} title={null} trigger="click"
            open={notifOpen} onOpenChange={setNotifOpen} placement="bottomRight">
            <Badge count={unreadCount} size="small" offset={[-2, 4]}>
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer', padding: '4px 6px' }}
                onClick={() => { fetchAll(); setNotifOpen(!notifOpen); }} />
            </Badge>
          </Popover>
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
