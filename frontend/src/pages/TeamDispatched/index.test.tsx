import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamDispatched from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrdersSafe: vi.fn(),
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

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrdersSafe: (...args: unknown[]) => mocks.getDispatchedOrdersSafe(...args),
}));

describe('TeamDispatched readonly child-order view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrdersSafe.mockResolvedValue({ list: [], total: 0 });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('uses child-order columns and the dispatched-order API with team scope', async () => {
    render(<TeamDispatched />);

    expect(getColumn('order_no')?.title).toBe('子工单编号');
    expect(getColumn('employee_name')?.title).toBe('员工姓名');
    expect(getColumn('order_type')?.title).toBe('工单类型');
    expect(getColumn('created_by_name')?.title).toBe('发起人');

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, order_no: 'WO-001', customer_name: '客户A' });

    await waitFor(() => expect(mocks.getDispatchedOrdersSafe).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      orderNo: 'WO-001',
      customerName: '客户A',
      scope: 'team',
    })));
  });

  it('opens readonly dispatched detail instead of an actionable main detail', () => {
    render(<TeamDispatched />);

    const actions = getColumn('actions');
    actions?.render?.(null, { id: 'd-1' });
    const link = actions?.render?.(null, { id: 'd-1' }) as React.ReactElement;
    link.props.onClick();

    expect(mocks.navigate).toHaveBeenCalledWith('/my-dispatched/d-1?readonly=1&from=team');
  });
});
