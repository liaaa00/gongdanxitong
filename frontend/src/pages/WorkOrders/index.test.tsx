import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkOrders from './index';

const mocks = vi.hoisted(() => ({
  latestTableProps: undefined as any,
  getWorkOrders: vi.fn(),
  deleteWorkOrder: vi.fn(),
  batchDeleteWorkOrders: vi.fn(),
  getMyRoleActions: vi.fn(),
  navigate: vi.fn(),
  pathname: '/my-work/initiated',
  search: '?employeeName=张三',
  roles: new Set<string>(['admin']),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: string } }) => (
    <section>
      {header?.title && <h1>{header.title}</h1>}
      {children}
    </section>
  ),
}));

vi.mock('@/components/MultiViewTable', () => ({
  default: (props: any) => {
    mocks.latestTableProps = props;
    const toolbar = props.toolBarRender?.() ?? [];
    const batchActions = props.batchActions?.(['wo-1'], vi.fn());
    const actionColumn = props.columns?.find((column: Record<string, unknown>) => column.key === 'actions');
    return (
      <div data-testid="multi-view-table" data-view-id={props.viewId} data-has-batch-actions={String(Boolean(props.batchActions))}>
        <div data-testid="toolbar">{toolbar}</div>
        {batchActions && <div data-testid="batch-actions">{batchActions}</div>}
        {actionColumn?.render?.(null, { id: 'wo-1' })}
      </div>
    );
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ pathname: mocks.pathname, search: mocks.search }),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: (role: string) => mocks.roles.has(role),
  }),
}));

vi.mock('@/services/roleActionPermissions', () => ({
  getMyRoleActions: (...args: unknown[]) => mocks.getMyRoleActions(...args),
}));

vi.mock('@/services/workOrders', () => ({
  getWorkOrders: (...args: unknown[]) => mocks.getWorkOrders(...args),
  deleteWorkOrder: (...args: unknown[]) => mocks.deleteWorkOrder(...args),
  batchDeleteWorkOrders: (...args: unknown[]) => mocks.batchDeleteWorkOrders(...args),
}));

describe('WorkOrders initiated read-only view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestTableProps = undefined;
    mocks.pathname = '/my-work/initiated';
    mocks.search = '?employeeName=张三';
    mocks.roles = new Set<string>(['admin']);
    mocks.getMyRoleActions.mockResolvedValue(['work_order.create', 'work_order.import']);
    mocks.getWorkOrders.mockResolvedValue({ list: [], total: 0 });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('renders my initiated work orders as a read-only query list with detail viewing only', async () => {
    const user = userEvent.setup();
    render(<WorkOrders />);

    expect(screen.getByRole('heading', { name: '我发起的工单' })).toBeInTheDocument();
    expect(screen.getByTestId('multi-view-table')).toHaveAttribute('data-view-id', 'my-work-initiated-readonly');
    expect(screen.getByTestId('multi-view-table')).toHaveAttribute('data-has-batch-actions', 'false');
    expect(mocks.latestTableProps.toolBarRender).toBeUndefined();
    expect(mocks.latestTableProps.batchActions).toBeUndefined();
    expect(getColumn('actions')).toBeDefined();

    expect(screen.getByRole('button', { name: /详情/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新建工单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /批量导入/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /批量导出/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /批量删除/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /取消选择/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^删除$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /详情/ }));
    expect(mocks.navigate).toHaveBeenCalledWith('/work-orders/wo-1');

    await mocks.latestTableProps.request({ current: 1, pageSize: 20, customer_name: '客户A', order_type: 'onboarding' });

    await waitFor(() => expect(mocks.getWorkOrders).toHaveBeenCalledWith(expect.objectContaining({
      employeeName: '张三',
      customerName: '客户A',
      orderType: 'onboarding',
    })));
  });

  it('keeps main work-order list operations outside the initiated route', async () => {
    mocks.pathname = '/work-orders';
    mocks.search = '';

    render(<WorkOrders />);

    await waitFor(() => expect(mocks.getMyRoleActions).toHaveBeenCalled());

    expect(screen.getByRole('heading', { name: '主工单列表' })).toBeInTheDocument();
    expect(screen.getByTestId('multi-view-table')).toHaveAttribute('data-view-id', 'work-orders-main');
    expect(mocks.latestTableProps.toolBarRender).toBeTypeOf('function');
    expect(mocks.latestTableProps.batchActions).toBeTypeOf('function');
    expect(getColumn('actions')).toBeDefined();

    await waitFor(() => expect(screen.getByRole('button', { name: /新建工单/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /批量导入/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /批量导出/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /详情/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^删除$/ })).toBeInTheDocument();
  });
});
