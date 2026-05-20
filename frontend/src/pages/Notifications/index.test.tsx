import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './index';

vi.mock('@/services/notifications', () => ({
  getNotifications: vi.fn().mockResolvedValue({
    list: [
      { id: 'n-1', type: 'task', biz_type: 'task', priority: 'normal', title: 'Test Notification', content: 'Test content', is_read: false, created_at: new Date().toISOString() },
    ],
    page: 1, pageSize: 20, total: 1, totalPages: 1, success: true,
  }),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  markAllRead: vi.fn().mockResolvedValue(undefined),
  deleteNotification: vi.fn().mockResolvedValue(undefined),
  getUnreadCount: vi.fn().mockResolvedValue(5),
  getUnreadCountByType: vi.fn().mockResolvedValue({ sla: 2, task: 2, system: 1 }),
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
      expect(screen.getByText('全部')).toBeTruthy();
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
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Test Notification')).toBeTruthy();
    }, { timeout: 5000 });
  });
});
