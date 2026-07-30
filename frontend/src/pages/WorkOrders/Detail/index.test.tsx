import { render, screen, waitFor } from '@testing-library/react';
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
const getCreateWorkOrderFieldsMock = vi.fn();
const getFieldsMock = vi.fn();

vi.mock('@/components/DynamicForm', () => ({
  default: ({ onFinish, submitText, readOnly, hideSubmit }: { onFinish?: (values: Record<string, unknown>) => Promise<void>; submitText?: string; readOnly?: boolean; hideSubmit?: boolean }) => (
    <div data-testid="dynamic-form" data-readonly={String(readOnly)} data-hide-submit={String(hideSubmit)}>
      {onFinish && !hideSubmit && <button type="button" onClick={() => onFinish({ employee_name: '修改后员工' })}>{submitText || 'submit'}</button>}
    </div>
  ),
}));

vi.mock('@/hooks/useFieldPermissions', () => ({
  useFieldPermissions: () => ({ permissions: { employee_name: 'visible' } }),
}));

vi.mock('@/services/importTemplates', () => ({
  getCreateWorkOrderFields: (...args: unknown[]) => getCreateWorkOrderFieldsMock(...args),
}));

vi.mock('@/services/fields', () => ({
  getFields: (...args: unknown[]) => getFieldsMock(...args),
}));

vi.mock('@/services/request', () => ({ default: { get: vi.fn(async () => null), post: vi.fn() } }));

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
    getCreateWorkOrderFieldsMock.mockResolvedValue([
      { field_code: 'employee_name', field_name: '员工姓名', field_type: 'text', is_required: true, default_required: true, display_order: 1, is_active: true },
      { field_code: 'custom_import_only', field_name: '导入模板自定义字段', field_type: 'text', is_required: false, default_required: false, display_order: 2, is_active: true },
    ]);
    getFieldsMock.mockResolvedValue([
      { field_code: 'employee_name', field_name: '员工姓名（系统）', field_type: 'text', is_required: true, default_required: true, display_order: 10, is_active: true, collection_group: '基本信息' },
      { field_code: 'custom_import_only', field_name: '导入模板自定义字段（系统）', field_type: 'text', is_required: false, default_required: false, display_order: 11, is_active: true, collection_group: '模板字段' },
      { field_code: 'system_only_field', field_name: '系统仅有字段', field_type: 'text', is_required: false, default_required: false, display_order: 12, is_active: true, collection_group: '系统字段' },
    ]);
    updateWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'pending', extra_data: { employee_name: '修改后员工' } });
    resubmitWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'processing', extra_data: { employee_name: '修改后员工' } });
    voidWorkOrderMock.mockResolvedValue({ ...baseOrder, status: 'void_pending' });
  });

  it('renders main work order fields once and hides submit controls', async () => {
    renderDetail();

    expect(await screen.findByText('基本信息')).toBeInTheDocument();
    expect(getCreateWorkOrderFieldsMock).toHaveBeenCalledWith('onboarding');
    expect(getFieldsMock).toHaveBeenCalledWith('onboarding');
    expect(screen.getByText('员工姓名')).toBeInTheDocument();
    expect(screen.getByText('模板字段')).toBeInTheDocument();
    expect(screen.getByText('导入模板自定义字段')).toBeInTheDocument();
    expect(screen.queryByText('系统字段')).not.toBeInTheDocument();
    expect(screen.queryByText('系统仅有字段')).not.toBeInTheDocument();
    expect(screen.getAllByText('原员工').length).toBeGreaterThan(0);
    expect(screen.queryByText('工单数据（只读）')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-form')).not.toBeInTheDocument();
    expect(messageInfoMock).not.toHaveBeenCalled();
  });

  it('does not expose edit-resubmit or void actions on main work order detail', async () => {
    renderDetail();

    await screen.findByText('基本信息');

    expect(screen.queryByRole('button', { name: /修改重新提交/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存并重新提交/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键作废/ })).not.toBeInTheDocument();
    expect(screen.queryByText('一键作废申请')).not.toBeInTheDocument();
    expect(updateWorkOrderMock).not.toHaveBeenCalled();
    expect(resubmitWorkOrderMock).not.toHaveBeenCalled();
    expect(voidWorkOrderMock).not.toHaveBeenCalled();
  });

  it('keeps returned main order readonly and points users to child orders', async () => {
    getWorkOrderMock.mockResolvedValueOnce({
      ...baseOrder,
      status: 'returned',
      dispatched_orders: [
        { id: 'do-1', module_code: 'contract', status: 'returned', return_reason: '合同信息需修正' },
      ],
    });

    renderDetail('/work-orders/wo-1');

    expect(await screen.findByText('基本信息')).toBeInTheDocument();
    expect(screen.getByText('工单存在被退回的子工单，请到对应子工单处理')).toBeInTheDocument();
    expect(screen.getByText('劳动合同新签: 合同信息需修正')).toBeInTheDocument();
    expect(screen.queryByText('工单数据（只读）')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /修改重新提交/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键作废/ })).not.toBeInTheDocument();
  });

  it('keeps withdrawn main order readonly and never calls main operation APIs', async () => {
    getWorkOrderMock.mockResolvedValueOnce({ ...baseOrder, status: 'withdrawn' });

    renderDetail('/work-orders/wo-1');

    expect(await screen.findByText('基本信息')).toBeInTheDocument();
    expect(screen.queryByText('工单数据（只读）')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /修改重新提交/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键作废/ })).not.toBeInTheDocument();
    expect(updateWorkOrderMock).not.toHaveBeenCalled();
    expect(resubmitWorkOrderMock).not.toHaveBeenCalled();
    expect(voidWorkOrderMock).not.toHaveBeenCalled();
  });

  it('shows resignation order type in Chinese for resignation aliases', async () => {
    getWorkOrderMock.mockResolvedValueOnce({ ...baseOrder, order_type: 'offboarding' });

    renderDetail('/work-orders/wo-1');

    expect(await screen.findByText('工单详情')).toBeInTheDocument();
    expect(screen.getByText('离职')).toBeInTheDocument();
  });

  it('shows an error when main order detail fails to load', async () => {
    getWorkOrderMock.mockRejectedValueOnce(new Error('load failed'));

    renderDetail();

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('加载工单详情失败'));
    expect(await screen.findByText('工单不存在')).toBeInTheDocument();
    expect(updateWorkOrderMock).not.toHaveBeenCalled();
    expect(resubmitWorkOrderMock).not.toHaveBeenCalled();
    expect(voidWorkOrderMock).not.toHaveBeenCalled();
  });
});
