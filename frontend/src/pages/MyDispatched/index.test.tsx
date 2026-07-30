import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyDispatched from './index';
import { KEEP_ALIVE_ROUTE_ACTIVATED_EVENT } from '@/utils/listPageState';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  batchAcceptDispatchedOrders: vi.fn(),
  batchApproveModifyDispatchedOrders: vi.fn(),
  navigate: vi.fn(),
  reload: vi.fn(),
  currentRoles: [] as string[],
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
  ProTable: (props: any) => {
    mocks.latestProTableProps = props;
    if (props.actionRef) props.actionRef.current = { reload: mocks.reload };
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
  batchApproveModifyDispatchedOrders: (...args: unknown[]) => mocks.batchApproveModifyDispatchedOrders(...args),
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
    mocks.batchApproveModifyDispatchedOrders.mockResolvedValue({ success: true, processed: 1, skipped: [] });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('shows the nine status options and sends a single selected status', async () => {
    render(<MyDispatched mode="pending" />);

    const statusColumn = getColumn('status');
    expect(statusColumn.fieldProps.options.map((option: { label: string }) => option.label)).toEqual([
      '未接单',
      '已接单',
      '修改审批中',
      '撤回审批中',
      '作废审批中',
      '已完成',
      '已作废',
      '已撤回',
      '已退回',
    ]);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: 'processing', moduleCode: 'contract' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      status: 'processing',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.statuses).toBeUndefined();
  });

  it('reloads only when its cached my-work route is reactivated', async () => {
    render(<MyDispatched mode="pending" />);

    act(() => {
      window.dispatchEvent(new CustomEvent(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, {
        detail: { pathname: '/onboarding/data_entry', search: '' },
      }));
    });
    expect(mocks.reload).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, {
        detail: { pathname: '/my-work/pending', search: '' },
      }));
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
  });

  it('clears status search without reusing stale statuses and keeps default todo statuses', async () => {
    render(<MyDispatched mode="pending" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, status: '', statuses: 'pending,processing' });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      statuses: 'pending,processing,modify_pending,withdraw_pending,void_pending',
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
      statuses: 'pending,processing,modify_pending,withdraw_pending,void_pending',
    })));
  });

  it('includes approval-pending child orders in default my pending work', async () => {
    mocks.getDispatchedOrders.mockResolvedValue({
      list: [
        { id: 'd-modify', status: 'modify_pending', module_code: 'contract', order_type: 'onboarding' },
        { id: 'd-withdraw', status: 'withdraw_pending', module_code: 'contract', order_type: 'onboarding' },
        { id: 'd-completed', status: 'completed', module_code: 'contract', order_type: 'onboarding' },
      ],
      total: 3,
    });
    render(<MyDispatched mode="pending" />);

    const result = await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      statuses: 'pending,processing,modify_pending,withdraw_pending,void_pending',
    })));
    expect(result.data.map((row: { id: string }) => row.id)).toEqual(['d-modify', 'd-withdraw']);
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
      includeReturned: true,
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.status).toBeUndefined();
    expect(params.statuses).toBeUndefined();
  });

  it('shows business-side done work by dispatched/order month without handler=current filter', async () => {
    mocks.currentRoles = ['business_group_member'];
    render(<MyDispatched mode="done" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      status: 'completed',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.handlerId).toBeUndefined();
    expect(params.completedFrom).toBeUndefined();
    expect(params.completedTo).toBeUndefined();
  });

  it('keeps backend done work scoped to current handler and dispatched/order month', async () => {
    mocks.currentRoles = ['labor_contract_member'];
    render(<MyDispatched mode="done" />);

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      handlerId: 'current',
    })));
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.completedFrom).toBeUndefined();
    expect(params.completedTo).toBeUndefined();
  });

  it('offers batch accept for selected pending rows in pending mode', async () => {
    render(<MyDispatched mode="pending" />);

    expect(mocks.latestProTableProps.rowSelection).toEqual(expect.objectContaining({
      selectedRowKeys: [],
      preserveSelectedRowKeys: true,
    }));

    await act(async () => {
      mocks.latestProTableProps.rowSelection.onChange(['d-pending', 'd-processing'], [
        { id: 'd-pending', status: 'pending' },
        { id: 'd-processing', status: 'processing' },
      ]);
    });

    const option = mocks.latestProTableProps.tableAlertOptionRender({ onCleanSelected: vi.fn() }) as React.ReactElement;
    const batchAcceptButton = (option.props.children as React.ReactNode[]).find((child) => (child as React.ReactElement)?.props?.children?.toString?.().includes('批量接单')) as React.ReactElement;
    batchAcceptButton.props.onClick();

    await waitFor(() => expect(mocks.batchAcceptDispatchedOrders).toHaveBeenCalledWith(['d-pending']));
  });

  it('offers batch approval only for selected modify-pending rows', async () => {
    render(<MyDispatched mode="pending" />);

    await act(async () => {
      mocks.latestProTableProps.rowSelection.onChange(['d-modify', 'd-pending'], [
        { id: 'd-modify', status: 'modify_pending' },
        { id: 'd-pending', status: 'pending' },
      ]);
    });

    const option = mocks.latestProTableProps.tableAlertOptionRender({ onCleanSelected: vi.fn() }) as React.ReactElement;
    const batchApproveButton = (option.props.children as React.ReactNode[]).find((child) =>
      String((child as React.ReactElement)?.props?.children).includes('批量通过修改'),
    ) as React.ReactElement;
    batchApproveButton.props.onClick();

    await waitFor(() => expect(mocks.batchApproveModifyDispatchedOrders).toHaveBeenCalledWith(['d-modify']));
  });

  it('shows contact details for every dispatched module when provided', () => {
    render(<MyDispatched mode="pending" />);

    const resignation = { module_code: 'resignation_contact', extra_data: { mobile: '13800138000', email: 'hr@example.com' } };
    const contract = { module_code: 'contract', extra_data: { mobile: '13900139000', email: 'contract@example.com' } };
    expect(getColumn('mobile')?.render?.(null, resignation)).toBe('13800138000');
    expect(getColumn('email')?.render?.(null, resignation)).toBe('hr@example.com');
    expect(getColumn('mobile')?.render?.(null, contract)).toBe('13900139000');
    expect(getColumn('email')?.render?.(null, contract)).toBe('contract@example.com');
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
      includeReturned: true,
    })));
    expect(result.data).toEqual([{ id: 'd-returned', status: 'returned', module_code: 'contract', order_type: 'onboarding' }]);
  });
});
