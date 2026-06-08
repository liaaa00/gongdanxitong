import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BasicLayout from './BasicLayout';
import { markNotificationRead } from '@/services/notifications';
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
    ProLayout: ({ children, actionsRender, route, menuProps, menuItemRender }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[]; route?: { children?: TestMenuItem[] }; menuProps?: TestMenuProps; menuItemRender?: TestMenuRender }) => (
      <div>
        <nav data-testid="layout-menu">{renderItems(route?.children || [], menuItemRender)}</nav>
        <div data-testid="selected-keys">{JSON.stringify(menuProps?.selectedKeys || [])}</div>
        <div data-testid="layout-actions">{actionsRender?.()}</div>
        <main>{children}</main>
      </div>
    ),
  };
});

const { notification, mockUserState, mockNavigate } = vi.hoisted(() => {
  const makeUser = (roleCodes: string[]) => ({
    id: 'u-1',
    username: 'tester',
    real_name: '测试用户',
    email: '',
    phone: '',
    avatar_url: null,
    is_active: true,
    permissions: [],
    roles: roleCodes.map((code, index) => ({ id: `r-${index}`, code, name: code, level: 'member' })),
  });

  return {
    mockNavigate: vi.fn(),
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
    useNavigate: () => mockNavigate,
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

const menuText = () => screen.getByTestId('layout-menu').textContent || '';
const selectedKeys = () => JSON.parse(screen.getByTestId('selected-keys').textContent || '[]') as string[];

describe('BasicLayout menu visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['labor_contract_member']);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it('navigates menu items to their last legal recorded detail path', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
    const first = renderLayout(['/my-work/initiated']);
    first.unmount();

    renderLayout(['/my-dispatched/d-1?tab=logs']);

    fireEvent.click(screen.getByRole('button', { name: '我的退回' }));
    fireEvent.click(screen.getByRole('button', { name: '我发起的' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/my-dispatched/d-1?tab=logs');
  });

  it('does not let temporary action pages overwrite a menu last path', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1?tab=detail' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/import?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1?tab=detail');
  });

  it('falls back to menu default path when last path is illegal or forbidden for current role', () => {
    mockUserState.user = mockUserState.makeUser(['business_owner']);
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'my-work-team': '/work-orders/wo-1' }));

    renderLayout(['/dashboard']);

    fireEvent.click(screen.getByRole('button', { name: '团队工单' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/my-work/team');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['my-work-team']).toBeUndefined();
  });

  it('keeps business owner menu to dashboard, team work and history only', () => {
    mockUserState.user = mockUserState.makeUser(['business_owner']);
    mockUserState.user.permissions = ['*', 'work_order.*', 'data_scope.all'];

    renderLayout();

    const text = menuText();
    expect(text).toContain('仪表盘');
    expect(text).toContain('我的工单');
    expect(text).toContain('团队工单');
    expect(text).toContain('历史工单');
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('我的已办');
    expect(text).not.toContain('入职管理');
    expect(text).not.toContain('在职管理');
    expect(text).not.toContain('离职管理');
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
    expect(text).not.toContain('入职导入');
    expect(text).not.toContain('离职导入');
    expect(text).toContain('我发起的');
    expect(text).toContain('我的退回');
    expect(text).toContain('历史工单');
    expect(text).not.toContain('我的待办');
    expect(text).toContain('我的已办');
    expect(text).not.toContain('团队工单');
    expect(text).not.toContain('在职管理');
    expect(text).not.toContain('劳动合同续签子工单');
    expect(text).not.toContain('待遇申报子工单');
  });

  it('keeps business group leader module entries plus team view without independent import menu', () => {
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
    expect(text).toContain('我发起的');
    expect(text).toContain('我的退回');
    expect(text).toContain('历史工单');
    expect(text).toContain('团队工单');
    expect(text).not.toContain('我的待办');
    expect(text).toContain('我的已办');
    expect(text).not.toContain('在职管理');
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
    expect(text).not.toContain('在职管理');
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
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/403']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    // /403 must not be recorded — existing recent path survives
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-1');
  });

  it('does not record /404 as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-2' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/404']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-2');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-2');
  });

  it('does not record /login as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/login']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-1');
  });

  it('does not record /change-password as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/change-password']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-1');
  });

  it('does not record /work-orders/new as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/new?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-1');
  });

  it('does not record /work-orders/import as a menu recent path', () => {
    window.localStorage.setItem('menu_recent_paths_v1', JSON.stringify({ 'work-orders-main': '/work-orders/wo-1' }));
    window.localStorage.setItem('menu_active_leaf_key_v1', 'work-orders-main');

    renderLayout(['/work-orders/import?orderType=onboarding']);

    fireEvent.click(screen.getByRole('button', { name: '入职主工单列表' }));

    expect(mockNavigate).toHaveBeenLastCalledWith('/work-orders/wo-1');
    const recentPaths = JSON.parse(window.localStorage.getItem('menu_recent_paths_v1') || '{}') as Record<string, string>;
    expect(recentPaths['work-orders-main']).toBe('/work-orders/wo-1');
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
