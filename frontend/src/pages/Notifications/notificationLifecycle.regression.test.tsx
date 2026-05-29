import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './index';
// User store is mocked below.
// Role codes are kept as literals in hoisted mocks.
import { markNotificationRead } from '@/services/notifications';

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns = [], request, actionRef, onRow }: { columns?: Array<{ title?: string; dataIndex?: string; valueType?: string; render?: (...args: unknown[]) => React.ReactNode }>; request?: () => Promise<{ data: unknown[] }>; actionRef?: { current?: unknown }; onRow?: (record: unknown) => Record<string, unknown> }) => {
    const [rows, setRows] = React.useState<unknown[]>([]);
    React.useEffect(() => {
      actionRef && (actionRef.current = { reload: vi.fn() });
      request?.().then((res) => setRows(res.data || []));
    }, []);
    return <table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} onClick={() => onRow?.(row)?.onClick?.({} as never)}>{columns.map((column, colIndex) => <td key={colIndex}>{column.render ? column.render((row as Record<string, unknown>)[column.dataIndex || ''], row, rowIndex) : String((row as Record<string, unknown>)[column.dataIndex || ''] ?? '')}</td>)}</tr>)}</tbody></table>;
  },
  ProLayout: ({ children, actionsRender }: { children?: React.ReactNode; actionsRender?: () => React.ReactNode[] }) => <div><div data-testid="layout-actions">{actionsRender?.()}</div><main>{children}</main></div>,
}));

const { notification } = vi.hoisted(() => ({
  notification: {
    id: 'n-lifecycle-1',
    type: 'field_changed',
    biz_type: 'field_changed',
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
      list: [{
        id: 'n-lifecycle-1',
        type: 'field_changed',
        biz_type: 'field_changed',
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
      }],
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
      salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0 },
      backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 0, withdraw_void_request: 1 },
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

// Navigation is exercised through button click; read state must remain unchanged until workflow completion.

describe('notification lifecycle regression', () => {
  it('processing a notification from the page does not mark it read before business completion', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('处理'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('top bell source exposes no manual read shortcut', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/layouts/BasicLayout.tsx'), 'utf8');

    expect(source).not.toContain('handleMarkRead');
    expect(source).not.toContain('>已读</Button>');
    expect(source).toContain('handleNotifProcess');
  });
});
