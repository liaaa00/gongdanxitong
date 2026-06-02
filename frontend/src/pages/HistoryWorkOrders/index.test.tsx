import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryWorkOrders from './index';

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrdersSafe: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
}));

describe('HistoryWorkOrders dispatched order list fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0, success: false });
  });

  it('resolves an empty table result when dispatched-orders list fallback returns empty data', async () => {
    render(<HistoryWorkOrders />);

    await expect(mocks.latestProTableProps.request({ current: 1, pageSize: 20, sort: 'dispatched_at', order: 'descend' })).resolves.toMatchObject({
      data: [],
      success: true,
      total: 0,
    });

    expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      includeReturned: true,
      orderMonth: expect.any(String),
      sort: 'dispatched_at',
      order: 'descend',
    }));
  });
});
