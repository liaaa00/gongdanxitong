import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BasicLayout from './BasicLayout';
// Role codes are kept as literals in hoisted mocks.

type TestMenuItem = { name?: string; path?: string; children?: TestMenuItem[] };

vi.mock('@ant-design/pro-components', () => {
  const renderItems = (items: TestMenuItem[] = []) => (
    <ul>
      {items.map((item) => (
        <li key={item.path || item.name} data-path={item.path}>
          <span>{item.name}</span>
          {item.children?.length ? renderItems(item.children) : null}
        </li>
      ))}
    </ul>
  );

  return {
    ProLayout: ({ children, actionsRender, route }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[]; route?: { children?: TestMenuItem[] } }) => (
      <div>
        <nav data-testid="layout-menu">{renderItems(route?.children || [])}</nav>
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

const renderLayout = () => render(
  <MemoryRouter>
    <BasicLayout />
  </MemoryRouter>,
);

const menuText = () => screen.getByTestId('layout-menu').textContent || '';

describe('BasicLayout menu visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUserState.user = mockUserState.makeUser(['labor_contract_member']);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps business owner menu to dashboard, team work and history only', () => {
    mockUserState.user = mockUserState.makeUser(['business_owner']);

    renderLayout();

    const text = menuText();
    expect(text).toContain('仪表盘');
    expect(text).toContain('我的工单');
    expect(text).toContain('团队工单');
    expect(text).toContain('历史工单');
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).not.toContain('入职管理');
    expect(text).not.toContain('在职管理');
    expect(text).not.toContain('离职管理');
    expect(text).not.toContain('消息通知');
  });

  it('keeps salesperson initiated, returned and history without team switch', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_member']);

    renderLayout();

    const text = menuText();
    expect(text).toContain('我发起的');
    expect(text).toContain('我的退回');
    expect(text).toContain('历史工单');
    expect(text).not.toContain('团队工单');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('入职管理');
  });

  it('keeps business group leader on team and history work only', () => {
    mockUserState.user = mockUserState.makeUser(['business_group_leader']);

    renderLayout();

    const text = menuText();
    expect(text).not.toContain('我发起的');
    expect(text).not.toContain('我的退回');
    expect(text).toContain('历史工单');
    expect(text).toContain('团队工单');
    expect(text).not.toContain('我的待办');
    expect(text).not.toContain('入职管理');
  });

  it('keeps shared team owner on Yang Chun plus Mao Yani modules only', () => {
    mockUserState.user = mockUserState.makeUser(['shared_team_owner']);

    renderLayout();

    const text = menuText();
    expect(text).toContain('劳动合同签订子工单');
    expect(text).toContain('劳动合同续签子工单');
    expect(text).toContain('入职联系子工单');
    expect(text).toContain('离职材料收集子工单');
    expect(text).toContain('离职证明子工单');
    expect(text).not.toContain('入职数据录入子工单');
    expect(text).not.toContain('离职数据录入子工单');
    expect(text).not.toContain('待遇申报子工单');
    expect(text).not.toContain('入职社保公积金办理子工单');
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
      expect(screen.getByText('劳动合同签订反馈 更新')).toBeTruthy();
      expect(document.body.textContent).toContain('杨纯 修改了【子工单】：【劳动合同签订反馈】由【待确认】改为【已完成签订】');
    });
    expect(document.body.textContent).not.toContain('contract_feedback');
  });
});
