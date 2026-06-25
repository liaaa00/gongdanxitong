import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './index';
import { getNotifications, markNotificationRead, markNotificationsReadByQuery } from '@/services/notifications';

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
    entity_type: 'work_order',
    action: 'update',
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
    salesperson: { field_changed: 1, returned: 0, withdraw_void_result: 0, system: 0 },
    backend: { todo: 0, creator_modified: 1, withdraw_void_request: 0, system: 0 },
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders simplified tabs and read filter', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('消息通知')).toBeTruthy();
      expect(screen.getByText('全部消息')).toBeTruthy();
      expect(screen.getByText('待处理')).toBeTruthy();
      expect(screen.getByText('字段变更')).toBeTruthy();
      expect(screen.queryByText('催办')).toBeNull();
      expect(screen.queryByText('即将超时')).toBeNull();
      expect(screen.getByText('未读')).toBeTruthy();
      expect(screen.getByText('已读')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows notification list after loading', async () => {
    const { container } = render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('Test Notification')).toBeTruthy();
      expect(container.textContent).toContain('劳动合同新签反馈');
      expect(container.textContent).toContain('待确认');
      expect(container.textContent).toContain('已完成签订');
      expect(container.textContent).not.toContain('contract_feedback');
    }, { timeout: 5000 });
  });

  it('uses read/unread filters and defaults to all messages', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ includeDispatch: true })));
    expect(getNotifications).not.toHaveBeenCalledWith(expect.objectContaining({ unread: true }));

    const readFilter = screen.getByRole('radiogroup');
    fireEvent.click(within(readFilter).getByText('未读'));
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ unread: true, includeDispatch: true })));

    fireEvent.click(within(readFilter).getByText('已读'));
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ isRead: true, includeDispatch: true })));
  });

  it('uses both field_changed and creator_modified buckets for the simplified field-change tab', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('字段变更'));
    await waitFor(() => {
      expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'field_changed,creator_modified' }));
    }, { timeout: 5000 });
  });

  it('has only single-message read action and process action', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '已读' }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n-1'));
    expect(screen.queryByText('全部已读')).toBeNull();
    expect(screen.queryByText('当前分类已读')).toBeNull();
    expect(markNotificationsReadByQuery).not.toHaveBeenCalled();
  });
});
