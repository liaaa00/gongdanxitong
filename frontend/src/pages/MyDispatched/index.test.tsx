import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyDispatched from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  batchAcceptDispatchedOrders: vi.fn(),
  navigate: vi.fn(),
  currentRoles: [] as string[],
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
  useAuth: () => ({
    hasAnyRole: (roles: string[]) => roles.some((role) => mocks.currentRoles.includes(role)),
  }),
}));

vi.mock('@/components/DispatchedBatchImportModal', () => ({
  default: () => null,
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrders: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  getDispatchedOrdersSafe: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  acceptDispatchedOrder: vi.fn(),
  batchAcceptDispatchedOrders: (...args: unknown[]) => mocks.batchAcceptDispatchedOrders(...args),
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

describe('MyDispatched processing status filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.currentRoles = [];
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
    mocks.batchAcceptDispatchedOrders.mockResolvedValue({ success: true, accepted: 1, skipped: [] });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('shows one processing option that sends pending plus processing', async () => {
    render(<MyDispatched mode="pending" />);

    const statusColumn = getColumn('status');
    expect(statusColumn.fieldProps.options).toEqual([{ label: '未接单/已接单', value: 'pending,processing' }]);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: 'pending,processing', moduleCode: 'contract' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
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
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      statuses: 'pending,processing',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
  });

  it('merges table header filters into my-work request params', async () => {
    render(<MyDispatched mode="pending" />);

    await mocks.latestProTableProps.request(
      { current: 1, pageSize: 20 },
      {},
      { employee_id_card: ['3301'], moduleCode: ['contract'] },
    );

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      idCardNo: '3301',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      statuses: 'pending,processing',
    })));
  });

  it('opens pending my-work detail in editable mode and keeps row selection available', () => {
    render(<MyDispatched mode="pending" />);

    expect(mocks.latestProTableProps.rowSelection).toEqual(expect.objectContaining({ preserveSelectedRowKeys: true }));
    expect(mocks.latestProTableProps.tableAlertRender).not.toBe(false);
    const actionColumn = getColumn('actions');
    const actionCell = actionColumn?.render?.(null, { id: 'd-pending', status: 'pending' }) as React.ReactElement;
    const detailButton = Array.isArray(actionCell.props.children) ? actionCell.props.children[0] : actionCell.props.children;
    detailButton.props.onClick();

    expect(mocks.navigate).toHaveBeenCalledWith('/my-dispatched/d-pending');
  });

  it('uses new phase-one child module names and hides in-service module filters', () => {
    render(<MyDispatched mode="pending" />);

    const moduleColumn = getColumn('moduleCode');
    const labels = moduleColumn.fieldProps.options.map((item: { label: string }) => item.label);
    expect(labels).toContain('入职联系子工单');
    expect(labels).toContain('劳动合同新签子工单');
    expect(labels).toContain('增员报岗录入子工单');
    expect(labels).toContain('社保公积金增员子工单');
    expect(labels).toContain('离职材料收集子工单');
    expect(labels).toContain('减员报岗录入子工单');
    expect(labels).toContain('社保公积金减员子工单');
    expect(labels).not.toContain('劳动合同续签子工单');
    expect(labels).not.toContain('待遇申报子工单');
  });

  it('does not front-end filter editable my-work rows by backend owner modules and keeps backend total', async () => {
    mocks.currentRoles = ['social_insurance_specialist'];
    mocks.getDispatchedOrders.mockResolvedValue({
      list: [
        { id: 'social-add', status: 'pending', module_code: 'social_insurance', order_type: 'onboarding' },
        { id: 'social-minus', status: 'processing', module_code: 'social_insurance_resign', order_type: 'resignation' },
        { id: 'contact', status: 'pending', module_code: 'onboarding_contact', order_type: 'onboarding' },
        { id: 'contract', status: 'pending', module_code: 'contract', order_type: 'onboarding' },
        { id: 'data-entry', status: 'pending', module_code: 'data_entry', order_type: 'onboarding' },
        { id: 'renewal', status: 'pending', module_code: 'renewal_contract', order_type: 'renewal' },
      ],
      total: 6,
    });

    render(<MyDispatched mode="pending" />);
    const result = await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    expect(result.data.map((row: { id: string }) => row.id)).toEqual(['social-add', 'social-minus', 'contact', 'contract', 'data-entry']);
    expect(result.total).toBe(6);
  });

  it('shows initiated work as child-order rows without forcing returned status', async () => {
    render(<MyDispatched mode="initiated" />);

    expect(mocks.latestProTableProps.headerTitle).toBe('我发起的子工单');
    expect(mocks.latestProTableProps.toolBarRender).toBe(false);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, employee_name: '张三' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      employeeName: '张三',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      includeReturned: true,
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
    expect(params.statuses).toBeUndefined();
  });

  it('shows business-side done work by completed month without handler=current filter', async () => {
    mocks.currentRoles = ['business_group_member'];
    render(<MyDispatched mode="done" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      status: 'completed',
      completedFrom: expect.any(String),
      completedTo: expect.any(String),
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.handlerId).toBeUndefined();
    expect(params.orderMonth).toBeUndefined();
  });

  it('keeps backend done work scoped to current handler', async () => {
    mocks.currentRoles = ['labor_contract_member'];
    render(<MyDispatched mode="done" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      handlerId: 'current',
      completedFrom: expect.any(String),
      completedTo: expect.any(String),
    })));
  });

  it('offers batch accept for selected pending rows in pending mode', async () => {
    render(<MyDispatched mode="pending" />);

    const alert = mocks.latestProTableProps.tableAlertRender({
      selectedRowKeys: ['d-pending', 'd-processing'],
      selectedRows: [
        { id: 'd-pending', status: 'pending' },
        { id: 'd-processing', status: 'processing' },
      ],
      onCleanSelected: vi.fn(),
    }) as React.ReactElement;
    const batchAcceptButton = (alert.props.children as React.ReactNode[]).find((child) => (child as React.ReactElement)?.props?.children?.toString?.().includes('批量接单')) as React.ReactElement;
    batchAcceptButton.props.onClick();

    await waitFor(() => expect(mocks.batchAcceptDispatchedOrders).toHaveBeenCalledWith(['d-pending']));
  });

  it('shows returned work as child-order rows only', async () => {
    mocks.getDispatchedOrders.mockResolvedValue({
      list: [
        { id: 'd-returned', status: 'returned', module_code: 'contract', order_type: 'onboarding' },
        { id: 'd-processing', status: 'processing', module_code: 'contract', order_type: 'onboarding' },
      ],
      total: 2,
    });
    render(<MyDispatched mode="returned" />);

    expect(mocks.latestProTableProps.headerTitle).toBe('退回待处理子工单');
    expect(mocks.latestProTableProps.toolBarRender).toBe(false);

    const result = await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      status: 'returned',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      includeReturned: true,
    })));
    expect(result.data).toEqual([{ id: 'd-returned', status: 'returned', module_code: 'contract', order_type: 'onboarding' }]);
  });
});
