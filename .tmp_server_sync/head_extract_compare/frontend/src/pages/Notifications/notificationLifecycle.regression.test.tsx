import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './index';
// User store is mocked below.
// Role codes are kept as literals in hoisted mocks.
import { getNotifications, markNotificationRead } from '@/services/notifications';

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns = [], request, actionRef, onRow }: { columns?: Array<{ title?: string; dataIndex?: string; valueType?: string; render?: (...args: unknown[]) => React.ReactNode }>; request?: (params?: Record<string, unknown>) => Promise<{ data: unknown[] }>; actionRef?: { current?: unknown }; onRow?: (record: unknown) => Record<string, unknown> }) => {
    const [rows, setRows] = React.useState<unknown[]>([]);
    const reload = React.useCallback(() => {
      request?.({ current: 1, pageSize: 20 }).then((res) => setRows(res.data || []));
    }, [request]);
    React.useEffect(() => {
      actionRef && (actionRef.current = { reload });
      reload();
    }, [actionRef, reload]);
    return (
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} onClick={() => onRow?.(row)?.onClick?.({} as never)}>
              {columns.map((column, colIndex) => (
                <td key={colIndex}>
                  {column.render ? column.render((row as Record<string, unknown>)[column.dataIndex || ''], row, rowIndex) : String((row as Record<string, unknown>)[column.dataIndex || ''] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
  ProLayout: ({ children, actionsRender }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[] }) => <div><div data-testid="layout-actions">{actionsRender?.()}</div><main>{children}</main></div>,
}));

const { notification } = vi.hoisted(() => ({
  notification: {
    id: 'n-lifecycle-1',
    type: 'void_request',
    biz_type: 'creator_void_request',
    priority: 'urgent' as const,
    title: 'Void approval needed',
    content: 'Please process',
    entity_type: 'dispatched_order',
    entity_id: 'do-1',
    link: '/my-dispatched/do-1',
    is_read: false,
    created_at: new Date('2026-05-29T00:00:00.000Z').toISOString(),
    ref_order_id: 'do-1',
    ref_order_no: 'WO-001',
  },
}));

vi.mock('@/services/notifications', async () => {
  const actual = await vi.importActual<typeof import('@/services/notifications')>('@/services/notifications');
  return {
    ...actual,
    getNotifications: vi.fn().mockResolvedValue({
      list: [notification],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      success: true,
    }),
    markNotificationRead: vi.fn().mockResolvedValue({ success: true, unread_count: 0 }),
    markAllRead: vi.fn().mockResolvedValue({ success: true, unread_count: 0 }),
    markNotificationsReadByQuery: vi.fn().mockResolvedValue({ success: true, affected: 1, unread_count: 0 }),
    getUnreadCountByBucket: vi.fn().mockResolvedValue({
      total: 1,
      salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
      backend: { todo: 0, creator_modified: 0, withdraw_void_request: 1, system: 0 },
      system: 0,
    }),
  };
});

vi.mock('@/services/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  getMe: vi.fn().mockResolvedValue({
    id: 'handler-1',
    username: 'handler',
    real_name: 'Handler',
    email: '',
    phone: '',
    avatar_url: null,
    is_active: true,
    permissions: [],
    roles: [{ id: 'r-1', code: 'data_entry_leader', name: 'Data leader', level: 'supervisor' }],
  }),
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    user: {
      id: 'handler-1',
      username: 'handler',
      real_name: 'Handler',
      email: '',
      phone: '',
      avatar_url: null,
      is_active: true,
      permissions: [],
      roles: [{ id: 'r-1', code: 'data_entry_leader', name: 'Data leader', level: 'supervisor' }],
    },
    logout: vi.fn(),
    fetchUser: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: true,
    loading: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasRole: () => false, hasAnyRole: () => true }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('notification lifecycle regression', () => {
  it('defaults to all messages so processed read notifications can remain in the all list', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    await screen.findByText('Void approval needed');
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ includeDispatch: true })));
    expect(getNotifications).not.toHaveBeenCalledWith(expect.objectContaining({ unread: true }));
    expect(screen.getByText('全部')).toBeTruthy();
    expect(screen.getAllByText('未读').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已读').length).toBeGreaterThan(0);
  });

  it('keeps exactly the two row actions: read clears reminder, process does not mark read', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    const row = (await screen.findByText('Void approval needed')).closest('tr');
    expect(row).toBeTruthy();
    const rowButtons = within(row as HTMLElement).getAllByRole('button');
    const readButton = rowButtons.find((button) => button.textContent?.trim() === '已读');
    const processButton = rowButtons.find((button) => button.textContent?.includes('处理'));
    expect(readButton).toBeTruthy();
    expect(processButton).toBeTruthy();

    fireEvent.click(readButton);
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n-lifecycle-1'));

    vi.mocked(markNotificationRead).mockClear();
    fireEvent.click(processButton);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markNotificationRead).not.toHaveBeenCalled();
  });
});
