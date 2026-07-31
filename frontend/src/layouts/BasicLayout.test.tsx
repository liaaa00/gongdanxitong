import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate as useRouterNavigate } from 'react-router-dom';
import BasicLayout from './BasicLayout';
import { markNotificationRead } from '@/services/notifications';
import { KEEP_ALIVE_ROUTE_ACTIVATED_EVENT } from '@/utils/listPageState';
// Role codes are kept as literals in hoisted mocks.

type TestMenuItem = { name?: string; path?: string; key?: string; children?: TestMenuItem[] };
type TestMenuProps = { selectedKeys?: string[]; openKeys?: string[] };
type TestMenuRender = (item: TestMenuItem, dom: React.ReactNode) => React.ReactNode;

vi.mock('@ant-design/pro-components', () => {
  const renderItems = (items: TestMenuItem[] = [], menuItemRender?: TestMenuRender) => (
    <ul>
      {items.map((item) => {
        const dom = <span>{item.name}</span>;
        return (
          <li key={item.key || item.path || item.name} data-path={item.path}>
            {menuItemRender ? menuItemRender(item, dom) : dom}
            {item.children?.length ? renderItems(item.children, menuItemRender) : null}
          </li>
        );
      })}
    </ul>
  );

  return {
    ProLayout: ({ children, actionsRender, menuExtraRender, route, menuProps, menuItemRender }: { children?: React.ReactNode; actionsRender?: (props: { collapsed?: boolean }) => React.ReactNode[]; menuExtraRender?: (props: { collapsed?: boolean }) => React.ReactNode; route?: { children?: TestMenuItem[] }; menuProps?: TestMenuProps; menuItemRender?: TestMenuRender }) => (
      <div>
        <div data-testid="layout-extra">{menuExtraRender?.({ collapsed: false })}</div>
        <nav data-testid="layout-menu">{renderItems(route?.children || [], menuItemRender)}</nav>
        <div data-testid="selected-keys">{JSON.stringify(menuProps?.selectedKeys || [])}</div>
        <div data-testid="layout-actions">{actionsRender?.({ collapsed: false })}</div>
        <main>{children}</main>
      </div>
    ),
  };
});

const { notification, mockUserState, mockNavigate, mockRouterState } = vi.hoisted(() => {
  const makeUser = (roleCodes: string[], businessScope: 'beilun' | 'out_of_province' = 'beilun') => ({
    id: 'u-1',
    username: 'tester',
    real_name: '测试用户',
    business_scope: businessScope,
    businessScope,
    email: '',
    phone: '',
    avatar_url: null,
    is_active: true,
    permissions: [],
    roles: roleCodes.map((code, index) => ({ id: `r-${index}`, code, name: code, level: 'member' })),
  });

  return {
    mockNavigate: vi.fn(),
    mockRouterState: { useRealNavigate: false },
    mockUserState: {
      makeUser,
      user: makeUser(['labor_contract_member']),
    },
    notification: {
      id: 'n-layout-1',
      type: 'field_changed',
      biz_type: 'field_changed',
      priority: 'normal' as const,
      title: 'contract_feedback 更新',
      content: '杨纯 修改了 contract_feedback',
      entity_type: 'dispatched_order',
      entity_id: 'd-1',
      link: '/my-dispatched/d-1',
      is_read: false,
      created_at: new Date('2026-05-25T08:00:00.000Z').toISOString(),
      actorName: '杨纯',
      action: 'update',
      diff_fields: [
        { field_code: 'contract_feedback', old_value: '待确认', new_value: '已完成签订' },
      ],
    },
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      return mockRouterState.useRealNavigate ? navigate : mockNavigate;
    },
  };
});

vi.mock('@/services/notifications', async () => {
  const actual = await vi.importActual<typeof import('@/services/notifications')>('@/services/notifications');
  return {
    ...actual,
    getNotifications: vi.fn().mockResolvedValue({
      list: [notification],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
      success: true,
    }),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    getUnreadCountByBucket: vi.fn().mockResolvedValue({
      total: 1,
      salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
      backend: { todo: 0, creator_modified: 1, withdraw_void_request: 0, system: 0 },
      system: 0,
    }),
  };
});

vi.mock('@/services/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  getMe: vi.fn().mockImplementation(() => Promise.resolve(mockUserState.user)),
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    user: mockUserState.user,
    logout: vi.fn(),
    fetchUser: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: true,
    loading: false,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: () => false,
    hasAnyRole: () => true,
  }),
}));

const renderLayout = (initialEntries: string[] = ['/']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <BasicLayout />
  </MemoryRouter>,
);

const CacheNavigationProbe: React.FC<{ label: string; target: string }> = ({ label, target }) => {
  const navigate = useRouterNavigate();
  return <button onClick={() => navigate(target)}>{label}</button>;
};

const renderLayoutWithNavigation = () => render(
  <MemoryRouter initialEntries={['/onboarding/contract']}>
    <Routes>
      <Route element={<BasicLayout />}>
        <Route path="/onboarding/contract" element={<CacheNavigationProbe label="打开测试详情" target="/my-dispatched/d-1" />} />
        <Route path="/my-dispatched/:id" element={<CacheNavigationProbe label="返回测试列表" target="/onboarding/contract" />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

const menuText = () => screen.getByTestId('layout-menu').textContent || '';
const menuPaths = () => Array.from(screen.getByTestId('layout-menu').querySelectorAll('[data-path]'))
  .map((node) => node.getAttribute('data-path'))
  .filter(Boolean);
const selectedKeys = () => JSON.parse(screen.getByTestId('selected-keys').textContent || '[]') as string[];

describe('BasicLayout menu visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['labor_contract_member']);
    mockRouterState.useRealNavigate = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the admin field and template configuration center with import templates only to admin', () => {
    mockUserState.user = mockUserState.makeUser(['admin']);
    const adminView = renderLayout(['/admin/fields']);

    expect(menuPaths()).toEqual(expect.arrayContaining([
      '/admin/field-template-group',
      '/admin/fields',
      '/admin/import-templates',
      '/admin/module-config',
      '/admin/field-permissions',
      '/admin/export-templates',
      '/admin/dispatch-flow-group',
      '/admin/dispatch-config',
      '/admin/workflows',
    ]));
    adminView.unmount();

    mockUserState.user = mockUserState.makeUser(['business_group_member']);
    renderLayout(['/dashboard']);
    expect(menuPaths()).not.toContain('/admin/import-templates');
  });

  it('locks business-front accounts to their assigned scope and lets admins switch', () => {
    window.localStorage.setItem('business_scope_v1', 'beilun');
    mockUserState.user = mockUserState.makeUser(['business_group_member'], 'out_of_province');

    const businessView = renderLayout(['/out-of-province']);
    expect(menuText()).toContain('浙江自签业务');
    expect(menuText()).toContain('省外增员');
    expect(menuText()).toContain('省外减员');
    expect(menuText()).toContain('单项业务办理');
    expect(menuText()).not.toContain('入职管理');
    expect(screen.getByText('浙江自签')).toBeInTheDocument();
    expect(screen.queryByText('北仑')).not.toBeInTheDocument();
    expect(screen.queryByText('省外')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('business_scope_v1')).toBe('out_of_province');
    businessView.unmount();

    window.localStorage.setItem('business_scope_v1', 'beilun');
    mockUserState.user = mockUserState.makeUser(['admin']);
    renderLayout(['/dashboard']);

    const scopeAreaText = screen.getByTestId('layout-extra').textContent || '';
    expect(scopeAreaText).toContain('业务范围');
    expect(scopeAreaText).toContain('北仑');
    expect(scopeAreaText).toContain('省外');
    expect(screen.getByTestId('layout-actions').textContent).not.toContain('北仑');
    expect(screen.getByTestId('layout-actions').textContent).not.toContain('省外');

    fireEvent.click(screen.getByText('省外'));

    expect(window.localStorage.getItem('business_scope_v1')).toBe('out_of_province');
    expect(mockNavigate).toHaveBeenLastCalledWith('/out-of-province');
    expect(menuText()).toContain('浙江自签业务');
  });

  it('selects onboarding and offboarding main work-order menu entries by orderType query', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    const first = renderLayout(['/work-orders?orderType=onboarding']);
    expect(selectedKeys()).toContain('work-orders-main');
    expect(selectedKeys()).toContain('/work-orders?orderType=onboarding');
    expect(selectedKeys()).not.toContain('resignation-list');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=resignation');
    first.unmount();

    renderLayout(['/work-orders?orderType=resignation']);
    expect(selectedKeys()).toContain('resignation-list');
    expect(selectedKeys()).toContain('/work-orders?orderType=resignation');
    expect(selectedKeys()).not.toContain('work-orders-main');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=onboarding');
  });

  it('keeps work-order orderType menu selection when list state adds extra query params', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    renderLayout(['/work-orders?orderType=onboarding&page=2&customerName=ACME']);

    expect(selectedKeys()).toContain('work-orders-main');
    expect(selectedKeys()).toContain('/work-orders?orderType=onboarding');
    expect(selectedKeys()).not.toContain('resignation-list');
  });

  it('does not record detail pages as a menu recent path', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
    const first = renderLayout(['/my-work/initiated']);
    first.unmount();

    renderLayout(['/my-dispatched/d-1?tab=logs']);

    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['my-work-initiated']).not.toBe('/my-dispatched/d-1?tab=logs');
    expect(Object.values(recentPaths)).not.toContain('/my-dispatched/d-1?tab=logs');
  });

  it('clicking a menu returns to its list default path even when a stale detail path is cached', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1?tab=detail' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/import?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding');
  });

  it('notifies once when a cached list route is reactivated', async () => {
    mockRouterState.useRealNavigate = true;
    const activations = vi.fn();
    const listener = (event: Event) => activations((event as CustomEvent).detail);
    window.addEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, listener);

    try {
      renderLayoutWithNavigation();
      expect(activations).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '打开测试详情' }));
      await screen.findByRole('button', { name: '返回测试列表' });
      expect(activations).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '返回测试列表' }));
      await screen.findByRole('button', { name: '打开测试详情' });

      await waitFor(() => expect(activations).toHaveBeenCalledTimes(1));
      expect(activations).toHaveBeenCalledWith({ pathname: '/onboarding/contract', search: '' });
    } finally {
      window.removeEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, listener);
    }
  });

  it('falls back to menu default path when last path is illegal or forbidden for current role', () => {
    mockUserState.user = mockUserState.makeUser(['admin']);
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'my-work-team': '/work-orders/wo-1' }));

    renderLayout(['/dashboard']);

    fireEvent.click(screen.getByRole('button', { name: '团队工单' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/my-work/team');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['my-work-team']).toBeUndefined();
  });

  it('does not render a duplicate standalone change-password button in top actions', () => {
    renderLayout(['/dashboard']);

    const actions = screen.getByTestId('layout-actions');
    const duplicateButton = Array.from(actions.querySelectorAll('button')).find((button) => /修改密码/.test(button.textContent || ''));

    expect(duplicateButton).toBeUndefined();
  });

  it('keeps business owner menu to dashboard without my-work pages', () => {
    mockUserState.user = mockUserState.makeUser(['business_owner']);
    mockUserState.user.permissions = ['*', 'work_order.*', 'data_scope.all'];

    renderLayout();

    const text = menuText();
    expect(text).toContain('仪表盘');
    expect(text).not.toContain('我的工单');
    expect(text).not.toContain('团队工单');
    expect(text).not.toContain('历史工单');
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('我的已办');
    expect(text).not.toContain('入职管理');
    expect(text).toContain('在职管理');
    expect(text).toContain('单项业务办理');
    expect(text).toContain('离职管理');
    expect(text).toContain('离职证明');
    expect(text).not.toContain('消息通知');
  });

  it('keeps salesperson onboarding/resignation main and sub-work-order entries without independent import menu', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    renderLayout();

    const text = menuText();
    expect(text).toContain('入职管理');
    expect(text).toContain('入职主工单列表');
    expect(text).toContain('入职联系子工单');
    expect(text).toContain('劳动合同新签子工单');
    expect(text).toContain('增员报岗录入子工单');
    expect(text).toContain('社保公积金增员子工单');
    expect(text).toContain('离职管理');
    expect(text).toContain('离职主工单列表');
    expect(text).toContain('离职材料收集子工单');
    expect(text).toContain('减员报岗录入子工单');
    expect(text).toContain('社保公积金减员子工单');
    expect(text).toContain('离职证明');
    expect(text).not.toContain('入职导入');
    expect(text).not.toContain('离职导入');
    expect(text).not.toContain('我的工单');
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).not.toContain('历史工单');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('我的已办');
    expect(text).not.toContain('团队工单');
    expect(text).toContain('在职管理');
    expect(text).toContain('单项业务办理');
    expect(text).not.toContain('劳动合同续签子工单');
    expect(text).not.toContain('待遇申报子工单');
  });

  it('keeps business group leader module entries without my-work pages', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_leader']);
    mockUserState.user.permissions = ['*', 'work_order.*', 'data_scope.all'];

    renderLayout();

    const text = menuText();
    expect(text).toContain('入职管理');
    expect(text).toContain('入职主工单列表');
    expect(text).toContain('入职联系子工单');
    expect(text).toContain('劳动合同新签子工单');
    expect(text).toContain('增员报岗录入子工单');
    expect(text).toContain('社保公积金增员子工单');
    expect(text).toContain('离职管理');
    expect(text).toContain('离职主工单列表');
    expect(text).toContain('离职材料收集子工单');
    expect(text).toContain('减员报岗录入子工单');
    expect(text).toContain('社保公积金减员子工单');
    expect(text).not.toContain('入职导入');
    expect(text).not.toContain('离职导入');
    expect(text).not.toContain('我的工单');
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).not.toContain('历史工单');
    expect(text).not.toContain('团队工单');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('我的已办');
    expect(text).toContain('在职管理');
    expect(text).toContain('单项业务办理');
  });

  it('keeps shared team owner on Yang Chun plus Mao Yani phase-1 modules only', () => {
    mockUserState.user = mockUserState.makeUser(['shared_team_owner']);
    mockUserState.user.permissions = ['*', 'work_order.*', 'data_scope.all'];

    renderLayout();

    const text = menuText();
    expect(text).toContain('劳动合同新签子工单');
    expect(text).toContain('入职联系子工单');
    expect(text).toContain('离职材料收集子工单');
    expect(text).not.toContain('劳动合同续签子工单');
    expect(text).not.toContain('增员报岗录入子工单');
    expect(text).not.toContain('减员报岗录入子工单');
    expect(text).not.toContain('待遇申报子工单');
    expect(text).not.toContain('社保公积金增员子工单');
    expect(text).not.toContain('社保公积金减员子工单');
    expect(text).toContain('在职管理');
    expect(text).toContain('单项业务办理');
  });

  it('keeps social insurance specialist menu to social insurance increase/decrease only', () => {
    mockUserState.user = mockUserState.makeUser(['social_insurance_specialist']);

    renderLayout();

    const text = menuText();
    expect(text).toContain('社保公积金增员子工单');
    expect(text).toContain('社保公积金减员子工单');
    expect(text).not.toContain('入职联系子工单');
    expect(text).not.toContain('劳动合同新签子工单');
    expect(text).not.toContain('增员报岗录入子工单');
    expect(text).not.toContain('减员报岗录入子工单');
    expect(text).not.toContain('离职证明');
    expect(text).toContain('在职管理');
    expect(text).toContain('单项业务办理');
  });
});

describe('BasicLayout notification dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['labor_contract_member']);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses localized display content instead of raw backend content in top dropdown', async () => {
    const { container } = renderLayout();

    await waitFor(() => {
      expect(container.querySelector('.anticon-bell')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('.anticon-bell') as Element);

    await waitFor(() => {
      expect(screen.getByText('劳动合同新签反馈 更新')).toBeTruthy();
      expect(document.body.textContent).toContain('杨纯 修改了【子工单】：【劳动合同新签反馈】由【待确认】改为【已完成签订】');
    });
    expect(document.body.textContent).not.toContain('contract_feedback');
  });

  it('keeps read and process as separate notification actions in top dropdown', async () => {
    const { container } = renderLayout();

    await waitFor(() => {
      expect(container.querySelector('.anticon-bell')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('.anticon-bell') as Element);

    await screen.findByText('劳动合同新签反馈 更新');
    const normalize = (value: string | null | undefined) => String(value || '').replace(/\s+/g, '');
    await waitFor(() => {
      expect(normalize(document.body.textContent)).toContain('已读');
      expect(normalize(document.body.textContent)).toContain('处理');
    });
    const buttons = screen.getAllByRole('button');
    const readButton = buttons.find((button) => normalize(button.textContent) === '已读');
    expect(readButton).toBeTruthy();
    fireEvent.click(readButton as HTMLButtonElement);
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n-layout-1'));

    vi.mocked(markNotificationRead).mockClear();
    const processButton = screen.getAllByRole('button').find((button) => normalize(button.textContent) === '处理');
    expect(processButton).toBeTruthy();
    fireEvent.click(processButton as HTMLButtonElement);

    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('mounts the notification popup outside the sidebar account actions', async () => {
    const { container } = renderLayout();

    await waitFor(() => {
      expect(container.querySelector('.anticon-bell')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('.anticon-bell') as Element);

    await screen.findByText('劳动合同新签反馈 更新');
    const popup = document.querySelector('.ant-popover:not(.ant-popover-hidden)');

    expect(popup).toBeTruthy();
    expect(popup?.parentElement).toBe(document.body);
    expect(popup?.closest('[data-testid="layout-actions"]')).toBeNull();
  });

  it('keeps the unread badge outside the bell button visible', () => {
    const { container } = renderLayout();
    const accountActions = container.querySelector('[data-testid="layout-actions"] .ant-space') as HTMLElement | null;

    expect(accountActions).toBeTruthy();
    expect(accountActions?.style.overflow).toBe('visible');
  });
});

// ─── 菜单最近路径临时动作页排除 ──────────────────────────────────────

describe('BasicLayout menu recent path temporary action exclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('does not record /403 as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/403']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    // /403 must not be recorded — existing recent path survives
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=2');
  });

  it('does not record /404 as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=3' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/404']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=3');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=3');
  });

  it('does not record /login as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/login']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=2');
  });

  it('does not record /change-password as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/change-password']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=2');
  });

  it('does not record /work-orders/new as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/new?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=2');
  });

  it('does not record /work-orders/import as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders?orderType=onboarding&page=2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/import?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders?orderType=onboarding&page=2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders?orderType=onboarding&page=2');
  });
});

// ─── 菜单点击回到详情页 ──────────────────────────────────────────────

describe('BasicLayout menu returns to last detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('keeps onboarding menu selection distinct from resignation orderType', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    // Visit onboarding list to set active menu context
    const first = renderLayout(['/work-orders?orderType=onboarding']);
    expect(selectedKeys()).toContain('work-orders-main');
    expect(selectedKeys()).toContain('/work-orders?orderType=onboarding');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=resignation');
    first.unmount();

    // Now visit resignation list — orderType switches, onboarding keys gone
    const second = renderLayout(['/work-orders?orderType=resignation']);
    expect(selectedKeys()).toContain('resignation-list');
    expect(selectedKeys()).toContain('/work-orders?orderType=resignation');
    expect(selectedKeys()).not.toContain('work-orders-main');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=onboarding');
    second.unmount();

    // Back to onboarding — should restore onboarding keys
    renderLayout(['/work-orders?orderType=onboarding']);
    expect(selectedKeys()).toContain('work-orders-main');
    expect(selectedKeys()).toContain('/work-orders?orderType=onboarding');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=resignation');
  });

  it('keeps resignation menu selection distinct from onboarding orderType', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    // Visit resignation first
    const first = renderLayout(['/work-orders?orderType=resignation']);
    expect(selectedKeys()).toContain('resignation-list');
    expect(selectedKeys()).toContain('/work-orders?orderType=resignation');
    first.unmount();

    // Visit onboarding
    const second = renderLayout(['/work-orders?orderType=onboarding']);
    expect(selectedKeys()).toContain('work-orders-main');
    expect(selectedKeys()).toContain('/work-orders?orderType=onboarding');
    expect(selectedKeys()).not.toContain('/work-orders?orderType=resignation');
    second.unmount();

    // Back to resignation
    renderLayout(['/work-orders?orderType=resignation']);
    expect(selectedKeys()).toContain('resignation-list');
    expect(selectedKeys()).toContain('/work-orders?orderType=resignation');
  });
});
