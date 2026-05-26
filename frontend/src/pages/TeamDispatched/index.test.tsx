import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamDispatched from './index';

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
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasRole: () => false }),
}));

vi.mock('@/components/DispatchedBatchImportModal', () => ({
  default: () => null,
}));

vi.mock('@/services/moduleConfigs', () => ({
  getModuleConfigs: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrders: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  batchCompleteDispatchedOrders: vi.fn(),
  batchDeleteDispatchedOrders: vi.fn(),
  batchExportDispatchedOrders: vi.fn(),
  batchReturnDispatchedOrders: vi.fn(),
  deleteDispatchedOrder: vi.fn(),
  downloadDispatchedExport: vi.fn(),
}));

describe('TeamDispatched processing status filter', () => {
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
    render(<TeamDispatched />);

    const statusColumn = getStatusColumn();
    expect(statusColumn.fieldProps.options.filter((option: { label: string }) => option.label === '处理中')).toEqual([
      { label: '处理中', value: 'pending,processing' },
    ]);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: 'pending,processing', module_code: 'contract' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'contract',
      statuses: 'pending,processing',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
  });

  it('clears status search without reusing stale statuses', async () => {
    render(<TeamDispatched />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: '', statuses: 'pending,processing', keyword: 'abc' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      keyword: 'abc',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
    expect(params.statuses).toBeUndefined();
  });

  it('keeps other statuses as single status filters', async () => {
    render(<TeamDispatched />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: 'completed', statuses: 'pending,processing' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      status: 'completed',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.statuses).toBeUndefined();
  });
});
