import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './index';
import { getNotifications, markNotificationsReadByQuery } from '@/services/notifications';

const { notification } = vi.hoisted(() => ({
  notification: {
    id: 'n-1',
    type: 'field_changed',
    biz_type: 'field_changed',
    priority: 'normal' as const,
    title: 'Test Notification',
    content: '杨纯 修改了 contract_feedback',
    diff_fields: [
      { field_code: 'contract_feedback', old_value: '待确认', new_value: '已完成签订' },
    ],
    actorName: '杨纯',
    entity_type: 'dispatched_order',
    action: 'update',
    entity_type: 'work_order',
    entity_id: 'wo-1',
    link: '/work-orders/wo-1',
    is_read: false,
    created_at: new Date().toISOString(),
    ref_order_id: 'wo-1',
    ref_order_no: 'WO-TEST-001',
  },
}));

vi.mock('@/services/notifications', () => ({
  getNotifications: vi.fn().mockResolvedValue({
    list: [notification],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
    success: true,
  }),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  markAllRead: vi.fn().mockResolvedValue(undefined),
  markNotificationsReadByQuery: vi.fn().mockResolvedValue({ success: true, affected: 1, unread_count: 0 }),
  deleteNotification: vi.fn().mockResolvedValue(undefined),
  getUnreadCountByBucket: vi.fn().mockResolvedValue({
    total: 2,
    salesperson: { field_changed: 1, returned: 0, urge_feedback: 0, withdraw_void_result: 0 },
    backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 1, withdraw_void_request: 0 },
    system: 0,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: (role: string) => role === 'admin',
    hasAnyRole: () => true,
  }),
}));

describe('Notifications Page', () => {
  it('renders page title', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('消息通知')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders mark all read button', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('全部已读')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders tab filters', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('全部消息')).toBeTruthy();
      expect(screen.getByText('后道数据修改')).toBeTruthy();
      expect(screen.getByText('业务员数据修改')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders table container', async () => {
    const { container } = render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('消息通知');
    }, { timeout: 5000 });
  });

  it('shows notification list after loading', async () => {
    const { container } = render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Test Notification')).toBeTruthy();
    }, { timeout: 5000 });
    await waitFor(() => {
      expect(container.textContent).toContain('劳动合同签订反馈');
      expect(container.textContent).toContain('待确认');
      expect(container.textContent).toContain('已完成签订');
      expect(container.textContent).not.toContain('contract_feedback');
    }, { timeout: 5000 });
  });

  it('uses field_changed bucket when opening the backend data modification tab', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('后道数据修改'));
    await waitFor(() => {
      expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'field_changed' }));
    }, { timeout: 5000 });
  });

  it('marks the current category read with the active bucket', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('后道数据修改'));
    fireEvent.click(await screen.findByText('当前分类已读'));
    await waitFor(() => {
      expect(markNotificationsReadByQuery).toHaveBeenCalledWith({ bucket: 'field_changed' });
    }, { timeout: 5000 });
  });
});
