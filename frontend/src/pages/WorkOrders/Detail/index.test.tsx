import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkOrdersDetail from './index';

const messageInfoMock = vi.fn();
const messageErrorMock = vi.fn();
const updateWorkOrderMock = vi.fn();
const resubmitWorkOrderMock = vi.fn();
const voidWorkOrderMock = vi.fn();
const getWorkOrderMock = vi.fn();

vi.mock('@/components/DynamicForm', () => ({
  default: ({ onFinish, submitText, readOnly }: { onFinish?: (values: Record<string, unknown>) => Promise<void>; submitText?: string; readOnly?: boolean }) => (
    <div data-testid="dynamic-form" data-readonly={String(readOnly)}>
      {onFinish && <button type="button" onClick={() => onFinish({ employee_name: '修改后员工' })}>{submitText || 'submit'}</button>}
    </div>
  ),
}));

vi.mock('@/hooks/useFieldPermissions', () => ({
  useFieldPermissions: () => ({ permissions: { employee_name: 'visible' } }),
}));

vi.mock('@/services/fields', () => ({
  getFields: vi.fn(async () => [
    { field_code: 'employee_name', field_name: '员工姓名', field_type: 'text', is_required: true, default_required: true, display_order: 1, is_active: true, collection_group: '基本信息' },
  ]),
}));

vi.mock('@/services/request', () => ({ default: { post: vi.fn() } }));

vi.mock('@/services/workOrders', () => ({
  getWorkOrder: (...args: unknown[]) => getWorkOrderMock(...args),
  updateWorkOrder: (...args: unknown[]) => updateWorkOrderMock(...args),
  resubmitWorkOrder: (...args: unknown[]) => resubmitWorkOrderMock(...args),
  voidWorkOrder: (...args: unknown[]) => voidWorkOrderMock(...args),
}));

const baseOrder = {
  id: 'wo-1',
  order_no: 'ON20260520001',
  order_type: 'onboarding',
  status: 'processing',
  employee_name: '原员工',
  customer_name: '测试客户',
  created_by: '业务员',
  submitted_at: '2026-05-20T01:00:00Z',
  completed_at: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T01:00:00Z',
  extra_data: { employee_name: '原员工' },
  dispatched_orders: [],
};

function renderDetail(initialEntry = '/work-orders/wo-1?edit=1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/work-orders/:id" element={<WorkOrdersDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkOrdersDetail main order readonly mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: { success: vi.fn(), error: messageErrorMock, info: messageInfoMock, warning: vi.fn(), loading: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
    getWorkOrderMock.mockResolvedValue(baseOrder);
    updateWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'pending', extra_data: { employee_name: '修改后员工' } });
    resubmitWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'processing', extra_data: { employee_name: '修改后员工' } });
    voidWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'void_pending' });
  });

  it('renders main work order as readonly and guides users to operate child orders', async () => {
    renderDetail();

    expect(await screen.findByText('主工单仅用于查看汇总信息')).toBeInTheDocument();
    expect(screen.getByText('修改、撤回、作废、催办等操作请进入下方对应子工单处理，避免影响其他正常子工单。')).toBeInTheDocument();
    expect(screen.getByText('工单数据（只读）')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-form')).toHaveAttribute('data-readonly', 'true');
    expect(messageInfoMock).toHaveBeenCalledWith('主工单仅支持查看，请到对应子工单中进行修改、撤回、作废或催办。');
  });

  it('does not expose legacy edit-resubmit actions on main work order detail', async () => {
    renderDetail();

    await screen.findByText('主工单仅用于查看汇总信息');

    expect(screen.queryByText('编辑后必须重新提交，原审批将被重置')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存并重新提交/ })).not.toBeInTheDocument();
    expect(updateWorkOrderMock).not.toHaveBeenCalled();
    expect(resubmitWorkOrderMock).not.toHaveBeenCalled();
  });

  it('enables repair actions for returned main order', async () => {
    getWorkOrderMock.mockResolvedValueOnce({
      ...baseOrder,
      status: 'returned',
      dispatched_orders: [
        { id: 'do-1', module_code: 'contract', status: 'returned', return_reason: '合同信息需修正' },
      ],
    });

    renderDetail('/work-orders/wo-1');

    expect(await screen.findByText('当前工单为可返修状态')).toBeInTheDocument();
    expect(screen.getByText('劳动合同签约: 合同信息需修正')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-form')).toHaveAttribute('data-readonly', 'false');
    expect(screen.getAllByRole('button', { name: /修改重新提交/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /一键作废/ })).toBeInTheDocument();
  });

  it('resubmits repaired withdrawn order and submits void request through approval flow', async () => {
    getWorkOrderMock.mockResolvedValueOnce({ ...baseOrder, status: 'withdrawn' });

    renderDetail('/work-orders/wo-1');

    expect(await screen.findByText('当前工单为可返修状态')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /一键作废/ }));
    fireEvent.change(await screen.findByPlaceholderText('请填写作废原因'), { target: { value: '客户取消' } });
    fireEvent.click(screen.getByRole('button', { name: '确 定' }));
    await waitFor(() => expect(voidWorkOrderMock).toHaveBeenCalledWith('wo-1', '客户取消'));

    getWorkOrderMock.mockResolvedValueOnce({ ...baseOrder, status: 'withdrawn' });
    renderDetail('/work-orders/wo-1');
    expect(await screen.findByText('当前工单为可返修状态')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '修改重新提交' }).at(-1)!);
    await waitFor(() => expect(updateWorkOrderMock).toHaveBeenCalledWith('wo-1', { employee_name: '修改后员工' }));
    expect(resubmitWorkOrderMock).toHaveBeenCalledWith('wo-1', { employee_name: '修改后员工' });
  });

  it('shows an error when main order detail fails to load', async () => {
    getWorkOrderMock.mockRejectedValueOnce(new Error('load failed'));

    renderDetail();

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('加载工单详情失败'));
    expect(await screen.findByText('工单不存在')).toBeInTheDocument();
    expect(updateWorkOrderMock).not.toHaveBeenCalled();
    expect(resubmitWorkOrderMock).not.toHaveBeenCalled();
  });
});
