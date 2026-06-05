import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BasicLayout from './BasicLayout';
import { markNotificationRead } from '@/services/notifications';
// Role codes are kept as literals in hoisted mocks.

type TestMenuItem = { name?: string; path?: string; key?: string; children?: TestMenuItem[] };
type TestMenuProps = { selectedKeys?: string[]; openKeys?: string[] };

vi.mock('@ant-design/pro-components', () => {
  const renderItems = (items: TestMenuItem[] = []) => (
    <ul>
      {items.map((item) => (
        <li key={item.key || item.path || item.name} data-path={item.path}>
          <span>{item.name}</span>
          {item.children?.length ? renderItems(item.children) : null}
        </li>
      ))}
    </ul>
  );

  return {
    ProLayout: ({ children, actionsRender, route, menuProps }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[]; route?: { children?: TestMenuItem[] }; menuProps?: TestMenuProps }) => (
      <div>
        <nav data-testid="layout-menu">{renderItems(route?.children || [])}</nav>
        <div data-testid="selected-keys">{JSON.stringify(menuProps?.selectedKeys || [])}</div>
        <div data-testid="layout-actions">{actionsRender?.()}</div>
        <main>{children}</main>
      </div>
    ),
  };
});

const { notification, mockUserState } = vi.hoisted(() => {
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

  it('keeps business owner menu to dashboard, team work and history only', () => {
    mockUserState.user = mockUserState.makeUser(['business_owner']);
    mockUserState.user.permissions = ['*', 'work_order.*', 'data_scope.all'];

    renderLayout();

    const text = menuText();
    expect(text).toContain('仪表盘');
    expect(text).toContain('我的工单');
    expect(text).toContain('团队工单');
    expect(text).toContain('历史工单');
    expect(text).toContain('我发起的');
    expect(text).toContain('我的退回');
    expect(text).toContain('我的待办');
    expect(text).toContain('我的已办');
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
    expect(text).toContain('我的待办');
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
    expect(text).toContain('离职管理');
    expect(text).toContain('离职主工单列表');
    expect(text).not.toContain('入职导入');
    expect(text).not.toContain('离职导入');
    expect(text).toContain('我发起的');
    expect(text).toContain('我的退回');
    expect(text).toContain('历史工单');
    expect(text).toContain('团队工单');
    expect(text).toContain('我的待办');
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
