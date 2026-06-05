import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryWorkOrders from './index';

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

describe('HistoryWorkOrders editable unfinished rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrdersSafe.mockResolvedValue({ list: [], total: 0 });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey || column.title === dataIndexOrKey);
  }

  it('opens history child orders in actionable detail for every status', () => {
    render(<HistoryWorkOrders />);

    const actionColumn = getColumn('操作');
    const pendingAction = actionColumn?.render?.(null, { id: 'd-pending', status: 'processing' }) as React.ReactElement;
    pendingAction.props.onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/my-dispatched/d-pending');

    const completedAction = actionColumn?.render?.(null, { id: 'd-completed', status: 'completed' }) as React.ReactElement;
    completedAction.props.onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/my-dispatched/d-completed');
  });

  it('merges header filters into request params and uses default page size 50', async () => {
    render(<HistoryWorkOrders />);

    expect(mocks.latestProTableProps.pagination.defaultPageSize).toBe(50);
    expect(getColumn('createdByName')?.title).toBe('发起人');

    await mocks.latestProTableProps.request(
      { current: 1 },
      {},
      { employee_id_card: ['3301'], status: ['processing'], createdByName: ['张三'] },
    );

    await waitFor(() => expect(mocks.getDispatchedOrdersSafe).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 50,
      idCardNo: '3301',
      createdByName: '张三',
      status: 'processing',
      includeReturned: true,
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
    })));
  });
});
