import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyDispatched from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
  ProTable: (props: any) => {
    mocks.latestProTableProps = props;
    return null;
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ pathname: '/my-work/pending' }),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasAnyRole: () => false }),
}));

vi.mock('@/components/DispatchedBatchImportModal', () => ({
  default: () => null,
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrdersSafe: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  acceptDispatchedOrder: vi.fn(),
  batchExportDispatchedOrders: vi.fn(),
  batchCompleteDispatchedOrders: vi.fn(),
  batchReturnDispatchedOrders: vi.fn(),
  batchUrgeDispatchedOrders: vi.fn(),
  reassignDispatchedOrder: vi.fn(),
  downloadDispatchedExport: vi.fn(),
}));

vi.mock('@/services/users', () => ({
  getUsersByTeam: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}));

describe('MyDispatched processing status filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
  });

  function getStatusColumn() {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === 'status');
  }

  it('shows one processing option that sends pending plus processing', async () => {
    render(<MyDispatched mode="pending" />);

    const statusColumn = getStatusColumn();
    expect(statusColumn.fieldProps.options).toEqual([{ label: '未办结', value: 'pending,processing' }]);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: 'pending,processing', moduleCode: 'contract' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      statuses: 'pending,processing',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
  });

  it('clears status search without reusing stale statuses and keeps default pending plus processing', async () => {
    render(<MyDispatched mode="pending" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: '', statuses: 'pending,processing' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      statuses: 'pending,processing',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
  });

  it('resolves with an empty table result when dispatched-orders list fallback returns empty data', async () => {
    mocks.getDispatchedOrders.mockResolvedValueOnce({ list: [], total: 0, success: false });
    render(<MyDispatched mode="pending" />);

    await expect(mocks.latestProTableProps.request({ current: 1, pageSize: 20, moduleCode: 'contract', sort: 'dispatched_at', order: 'descend' })).resolves.toMatchObject({
      data: [],
      success: true,
      total: 0,
    });

    expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      statuses: 'pending,processing',
      sort: 'dispatched_at',
    }));
  });
});
