import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamDispatched from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getWorkOrders: vi.fn(),
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

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: (...args: unknown[]) => mocks.getWorkOrders(...args),
}));

describe('TeamDispatched team work-order view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getWorkOrders.mockResolvedValue({ list: [], total: 0 });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('uses main work-order columns and the main work-order API', async () => {
    render(<TeamDispatched />);

    expect(getColumn('order_no')?.title).toBe('主工单编号');
    expect(getColumn('created_at')?.sorter).toBe(true);
    expect(getColumn('dispatched_status')?.title).toBe('子工单进度');

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, order_no: 'WO-001', customer_name: '客户A' });

    await waitFor(() => expect(mocks.getWorkOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      orderNo: 'WO-001',
      customerName: '客户A',
    })));
  });

  it('keeps created time sort params visible to the request layer', async () => {
    render(<TeamDispatched />);

    await mocks.latestProTableProps.request({ current: 2, pageSize: 10, sort: 'created_at:desc' });

    await waitFor(() => expect(mocks.getWorkOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      pageSize: 10,
      sort: 'created_at:desc',
    })));
  });
});
