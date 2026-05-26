import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BasicLayout from './BasicLayout';
import { useUserStore } from '@/stores/userStore';
import { ROLE } from '@/constants/roles';

vi.mock('@ant-design/pro-components', () => ({
  ProLayout: ({ children, actionsRender }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[] }) => (
    <div>
      <div data-testid="layout-actions">{actionsRender?.()}</div>
      <main>{children}</main>
    </div>
  ),
}));

const { notification } = vi.hoisted(() => ({
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
}));

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
      salesperson: { field_changed: 0, returned: 0, urge_feedback: 0, withdraw_void_result: 0 },
      backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 1, withdraw_void_request: 0 },
      system: 0,
    }),
  };
});

vi.mock('@/services/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));

describe('BasicLayout notification dropdown', () => {
  beforeEach(() => {
    useUserStore.setState({
      user: {
        id: 'u-1',
        username: 'tester',
        real_name: '测试用户',
        email: '',
        phone: '',
        avatar_url: null,
        is_active: true,
        permissions: [],
        roles: [{ id: 'r-1', code: ROLE.LABOR_CONTRACT_MEMBER, name: '合同专员', level: 'member' }],
      },
      isLoggedIn: true,
      token: 'token',
      refreshToken: null,
    });
  });

  afterEach(() => {
    useUserStore.getState().logout();
  });

  it('uses localized display content instead of raw backend content in top dropdown', async () => {
    const { container } = render(
      <MemoryRouter>
        <BasicLayout />
      </MemoryRouter>,
    );

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
