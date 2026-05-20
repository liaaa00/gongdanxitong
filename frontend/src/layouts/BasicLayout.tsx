import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { Dropdown, App, Badge, Popover, List, Button, Empty, Tabs, Tag, Space } from 'antd';
import {
  DashboardOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined,
  UserOutlined, TeamOutlined, SafetyOutlined, ApartmentOutlined, IdcardOutlined,
  FieldStringOutlined, LockOutlined, BranchesOutlined, UserSwitchOutlined,
  AuditOutlined, CheckSquareOutlined,
  BarChartOutlined, BellOutlined, SoundOutlined, AlertOutlined, InfoCircleOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useUserStore } from '@/stores/userStore';
import { logout as logoutApi } from '@/services/auth';
import { canAccessPath } from '@/config/routeVisibility';
import { ROLE, userHasAnyCanonicalRole, type CanonicalRole } from '@/constants/roles';
import { getNotifications, markNotificationRead, markAllRead, getUnreadCount } from '@/services/notifications';
import type { NotificationItem } from '@/services/notifications';

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
      { path: '/onboarding/social_insurance', name: '社保公积金办理子工单', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
    ],
  },
  {
    path: '/renewal',
    name: '在职管理',
    icon: <FileTextOutlined />,
    roles: [...IN_SERVICE_ROLES],
    children: [
      { path: '/renewal', name: '续签合同', key: 'renewal-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER] },
      { path: '/benefit', name: '待遇申报', key: 'benefit-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.DATA_ENTRY_LEADER, ROLE.SHARED_TEAM_OWNER, ROLE.SOCIAL_INSURANCE_SPECIALIST] },
    ],
  },
  {
    path: '/resignation',
    name: '离职管理',
    icon: <FileTextOutlined />,
    roles: [...OFFBOARDING_ROLES],
    children: [
      { path: '/resignation', name: '离职办理', key: 'resignation-list', roles: [ROLE.ADMIN, ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER, ROLE.SHARED_TEAM_OWNER, ROLE.ONBOARDING_RESIGNATION_MEMBER] },
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
      { path: '/admin/export-templates', name: '导出模板配置', key: 'admin-export-templates' },
      { path: '/admin/system-settings', name: '门户配置', icon: <SettingOutlined />, key: 'admin-portal-config' },
      { path: '/admin/ai-settings', name: '智能字段映射', icon: <ExperimentOutlined /> },
      { path: '/admin/logs', name: '操作日志', icon: <AuditOutlined /> },
      { path: '/admin/login-debug', name: '登录诊断', icon: <SafetyCertificateOutlined /> },
    ],
  },
];

function filterMenuByRoles(items: MenuItem[], userRoles: { code?: string }[] | undefined): MenuItem[] {
  const next: MenuItem[] = [];
  for (const it of items) {
    if (it.menuVisible === false) continue;
    const filteredChildren = it.children?.length ? filterMenuByRoles(it.children, userRoles) : undefined;
    const roleAllowed = !it.roles?.length || userHasAnyCanonicalRole(userRoles, it.roles);
    const pathAllowed = canAccessPath(it.path, userRoles);
    const selfAllowed = roleAllowed && pathAllowed;
    if (!selfAllowed && (!filteredChildren || filteredChildren.length === 0)) continue;
    next.push({ ...it, children: filteredChildren });
  }
  return next;
}

const OPEN_KEYS_STORAGE = 'menu_open_keys_v1';

const POLL_INTERVAL = 30000;
const BIZ_TYPE_COLOR: Record<string, string> = { sla: 'red', task: 'blue', system: 'default' };
const BIZ_TYPE_ICON: Record<string, React.ReactNode> = {
  sla: <AlertOutlined style={{ color: '#ff4d4f' }} />,
  task: <SoundOutlined style={{ color: '#1677ff' }} />,
  system: <InfoCircleOutlined style={{ color: '#999' }} />,
};

const BasicLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: storeLogout } = useUserStore();
  const { message } = App.useApp();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByType, setUnreadByType] = useState({ sla: 0, task: 0, system: 0 });
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 按角色过滤菜单（用户没有权限的页面，菜单直接不渲染）
  const filteredMenu = useMemo(
    () => filterMenuByRoles(RAW_MENU, user?.roles),
    [user?.roles],
  );

  const rootSubmenuKeys = useMemo(
    () => filteredMenu.filter((item) => item.children?.length).map((item) => item.path),
    [filteredMenu],
  );

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
      const count = await getUnreadCount();
      setUnreadCount(count);
      const result = await getNotifications({ unread: true, page: 1, pageSize: 50 });
      const list = Array.isArray(result?.list) ? result.list : [];
      setAllNotifications(list);
      const sla = list.filter((n) => n.biz_type === 'sla' && !n.is_read).length;
      const task = list.filter((n) => n.biz_type === 'task' && !n.is_read).length;
      const system = list.filter((n) => n.biz_type === 'system' && !n.is_read).length;
      setUnreadByType({ sla, task, system });
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
      setUnreadByType({ sla: 0, task: 0, system: 0 });
      setAllNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  };

  const handleNotifClick = (item: NotificationItem) => {
    handleMarkRead(item);
    if (item.link) navigate(item.link);
  };

  const filteredNotifications = activeTab === 'all'
    ? allNotifications
    : allNotifications.filter((n) => n.biz_type === activeTab);

  const notifContent = (
    <div style={{ width: 360, maxHeight: 520 }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} size="small"
        items={[
          { key: 'all', label: <Badge count={unreadCount} size="small" offset={[6, -2]}>全部</Badge> },
          { key: 'sla', label: <Badge count={unreadByType.sla} size="small" offset={[6, -2]}><Space size={2}>{BIZ_TYPE_ICON.sla}服务时限</Space></Badge> },
          { key: 'task', label: <Badge count={unreadByType.task} size="small" offset={[6, -2]}>任务</Badge> },
          { key: 'system', label: <Badge count={unreadByType.system} size="small" offset={[6, -2]}>系统</Badge> },
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
              style={{ cursor: 'pointer', padding: '8px 12px', background: item.is_read ? 'transparent' : '#f6ffed' }}
              onClick={() => handleNotifClick(item)}
            >
              <List.Item.Meta
                avatar={BIZ_TYPE_ICON[item.biz_type] || BIZ_TYPE_ICON.system}
                title={
                  <Space size={4}>
                    <Tag color={item.priority === 'urgent' ? 'red' : item.priority === 'normal' ? 'blue' : 'default'} style={{ fontSize: 10, lineHeight: '16px' }}>
                      {item.priority === 'urgent' ? '紧急' : item.priority === 'normal' ? '普通' : '低'}
                    </Tag>
                    {!item.is_read && <Badge status="processing" />}
                    <span style={{ fontWeight: item.is_read ? 'normal' : 'bold', fontSize: 13 }}>{item.title}</span>
                  </Space>
                }
                description={
                  <>
                    <div style={{ fontSize: 12 }}>{item.content}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {new Date(item.created_at).toLocaleString('zh-CN')}
                    </div>
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

  const avatarMenu = {
    items: [
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, onClick: handleLogout },
    ],
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
        <a onClick={() => item.path && handleMenuClick(item.path)}>{dom}</a>
      )}
      avatarProps={{
        icon: <UserOutlined />,
        title: user?.real_name || user?.username,
        render: (_props, dom) => {
          const displayName = user?.real_name || user?.username || '用户';
          return (
            <Space size={6} align="center" style={{ maxWidth: 180, overflow: 'hidden' }}>
              {dom}
              <span
                title={displayName}
                style={{
                  display: 'inline-block',
                  maxWidth: 96,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'middle',
                }}
              >
                {displayName}
              </span>
              <Dropdown menu={avatarMenu} trigger={['click']} placement="topRight">
                <DownOutlined style={{ fontSize: 12, cursor: 'pointer', color: 'rgba(0, 0, 0, 0.45)' }} />
              </Dropdown>
            </Space>
          );
        },
      }}
      actionsRender={() => [
        <Popover key="notif" content={notifContent} title={null} trigger="click"
          open={notifOpen} onOpenChange={setNotifOpen} placement="bottomRight">
          <Badge count={unreadCount} size="small" offset={[-2, 4]}>
            <BellOutlined style={{ fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}
              onClick={() => { fetchAll(); setNotifOpen(!notifOpen); }} />
          </Badge>
        </Popover>,
      ]}
      menuHeaderRender={undefined}
    >
      <Outlet />
    </ProLayout>
  );
};

export default BasicLayout;
