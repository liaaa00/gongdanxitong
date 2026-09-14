import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PortalIntakeWorkbench from './PortalIntakeWorkbench';
import PortalIntakeReviewPage from '../PortalIntakeReview';

// The first Ant Design/Vite render can be slow when this suite runs after the
// full business-test matrix; keep the timeout explicit so resource startup is
// not reported as a workflow failure.
vi.setConfig({ testTimeout: 60_000 });

const mocks = vi.hoisted(() => ({ getPortalIntakeWorkbench: vi.fn(), returnPortalIntakeForCorrection: vi.fn(), getAllCustomerRules: vi.fn(), getPortalIntake: vi.fn(), claimPortalIntake: vi.fn(), getWorkOrder: vi.fn(), getFields: vi.fn(), updateWorkOrder: vi.fn(), submitWorkOrder: vi.fn() }));
vi.mock('@/services/portalIntakeWorkbench', () => ({ getPortalIntakeWorkbench: mocks.getPortalIntakeWorkbench, returnPortalIntakeForCorrection: mocks.returnPortalIntakeForCorrection }));
vi.mock('@/services/customerRules', () => ({ getAllCustomerRules: mocks.getAllCustomerRules }));
vi.mock('@/services/portalReview', () => ({ getPortalIntake: mocks.getPortalIntake, claimPortalIntake: mocks.claimPortalIntake }));
vi.mock('@/services/fields', () => ({ getFields: mocks.getFields }));
vi.mock('@/services/workOrders', () => ({ getWorkOrder: mocks.getWorkOrder, updateWorkOrder: mocks.updateWorkOrder, submitWorkOrder: mocks.submitWorkOrder }));
vi.mock('@/components/MaterialsUpload', () => ({ default: () => <div>材料上传</div> }));

function LocationProbe() { const location = useLocation(); return <output aria-label="当前页面">{location.pathname}{location.search}</output>; }

function renderPage(path = '/portal-intake-review') {
  return render(<ConfigProvider theme={{ token: { motion: false } }}><MemoryRouter initialEntries={[path]}><PortalIntakeReviewPage /><LocationProbe /></MemoryRouter></ConfigProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAllCustomerRules.mockResolvedValue([{ customerId: 'c-1', customerName: '客户甲', customerCode: 'C001' }]);
  mocks.getPortalIntakeWorkbench.mockResolvedValue({ total: 1, page: 1, pageSize: 20, items: [{ id: 'i-1', requestNo: 'REQ-1', customerId: 'c-1', customerName: '客户甲', customerCode: 'C001', businessType: 'onboarding', workOrderId: 'w-1', employeeName: '张三', employeeIdCard: 'ID1', createdAt: '2026-09-10T09:00:00Z', status: 'draft', reviewStatus: 'in_review', configurationMissing: [], correctionReason: '', correctionFields: [], claimedBy: 'u-1', canClaim: false, canReview: true, originalStopMonth: null }] });
  mocks.returnPortalIntakeForCorrection.mockResolvedValue({ workOrderId: 'w-1', reviewStatus: 'needs_correction' });
  mocks.claimPortalIntake.mockResolvedValue({ workOrderId: 'w-1' });
  mocks.getWorkOrder.mockResolvedValue({ id: 'w-1', order_type: 'onboarding', status: 'draft', submitted_at: null, extra_data: { special_remark: '客户原始资料' } });
  mocks.getFields.mockResolvedValue([{ id: 'special_remark', field_code: 'special_remark', field_name: '审核备注', field_type: 'text', is_required: false, default_required: false, display_order: 1, is_active: true }]);
  mocks.updateWorkOrder.mockResolvedValue(undefined);
  mocks.submitWorkOrder.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('门户增减员审核工作台', () => {
  it('按客户范围显示跨客户记录，由业务员直接审核修改，不提供退回补正入口', async () => {
    render(<ConfigProvider><MemoryRouter><PortalIntakeWorkbench /></MemoryRouter></ConfigProvider>);
    expect(await screen.findByText('REQ-1')).toBeInTheDocument();
    expect(screen.getByText('客户甲')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退回补正' })).not.toBeInTheDocument();
    expect(mocks.returnPortalIntakeForCorrection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '继续审核' }));
    expect(await screen.findByRole('textbox', { name: '审核备注' })).toHaveValue('客户原始资料');
  });

  it('hides review actions for read-only workbench rows', async () => {
    mocks.getPortalIntakeWorkbench.mockResolvedValue({ total: 1, page: 1, pageSize: 20, items: [{ id: 'i-2', requestNo: 'REQ-2', customerId: 'c-1', customerName: '客户甲', customerCode: 'C001', businessType: 'resignation', workOrderId: 'w-2', employeeName: '李四', employeeIdCard: 'ID2', createdAt: '2026-09-10T09:00:00Z', status: 'draft', reviewStatus: 'pending_review', configurationMissing: [], correctionReason: '', correctionFields: [], claimedBy: '', canClaim: false, canReview: false, originalStopMonth: null }] });
    render(<ConfigProvider><MemoryRouter><PortalIntakeWorkbench /></MemoryRouter></ConfigProvider>);
    expect(await screen.findByText('REQ-2')).toBeInTheDocument();
    expect(screen.getByText('只读')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '审核' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续审核' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退回补正' })).not.toBeInTheDocument();
    expect(mocks.claimPortalIntake).not.toHaveBeenCalled();
  });

  it('独立入口从当前受理记录直接打开审核抽屉，通过后保留列表筛选和原页面', async () => {
    renderPage('/portal-intake-review?customerId=c-1');
    await screen.findByText('REQ-1');
    const search = screen.getByPlaceholderText('工单号、客户、员工或证件号');
    fireEvent.change(search, { target: { value: '张三' } });
    fireEvent.keyDown(search, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(mocks.getPortalIntakeWorkbench).toHaveBeenLastCalledWith({ customerId: 'c-1', search: '张三', page: 1, pageSize: 20 }));
    fireEvent.click(screen.getByRole('button', { name: '继续审核' }));
    expect(await screen.findByRole('textbox', { name: '审核备注' })).toHaveValue('客户原始资料');
    expect(mocks.claimPortalIntake).toHaveBeenCalledWith('c-1', 'i-1');
    expect(mocks.getPortalIntake).not.toHaveBeenCalled();
    expect(screen.getByLabelText('当前页面')).toHaveTextContent('/portal-intake-review?customerId=c-1');
    expect(screen.queryByRole('button', { name: '返回门户审核工单' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新受理记录' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '审核备注' }), { target: { value: '业务员已核对' } });
    fireEvent.click(screen.getByRole('button', { name: '审核通过并派发' }));
    await waitFor(() => expect(mocks.submitWorkOrder).toHaveBeenCalledWith('w-1'));
    expect(mocks.updateWorkOrder).toHaveBeenCalledWith('w-1', { extra_data: { special_remark: '业务员已核对' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存资料' })).not.toBeInTheDocument());
    expect(mocks.getPortalIntakeWorkbench).toHaveBeenLastCalledWith({ customerId: 'c-1', search: '张三', page: 1, pageSize: 20 });
    expect(search).toHaveValue('张三');
    expect(screen.getByLabelText('当前页面')).toHaveTextContent('/portal-intake-review?customerId=c-1');
  });

  it('认领成功但详情暂时加载失败时在原抽屉重试同一受理记录', async () => {
    mocks.getWorkOrder.mockRejectedValueOnce(new Error('审核资料加载超时'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '继续审核' }));
    expect(await screen.findByText('审核资料加载超时')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '审核通过并派发' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));
    expect(await screen.findByRole('textbox', { name: '审核备注' })).toHaveValue('客户原始资料');
    expect(mocks.claimPortalIntake).toHaveBeenCalledTimes(2);
    expect(mocks.claimPortalIntake).toHaveBeenLastCalledWith('c-1', 'i-1');
    expect(mocks.getPortalIntake).not.toHaveBeenCalled();
    expect(screen.getByLabelText('当前页面')).toHaveTextContent('/portal-intake-review');
  });

  it('派发校验失败保留审核资料，修正后可再次提交', async () => {
    mocks.submitWorkOrder.mockRejectedValueOnce(new Error('请补齐材料'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '继续审核' }));
    const remark = await screen.findByRole('textbox', { name: '审核备注' });
    fireEvent.change(remark, { target: { value: '补充资料尚待确认' } });
    fireEvent.click(screen.getByRole('button', { name: '审核通过并派发' }));
    await waitFor(() => expect(mocks.submitWorkOrder).toHaveBeenCalledTimes(1));
    expect(remark).toHaveValue('补充资料尚待确认');
    await waitFor(() => expect(screen.getByRole('button', { name: '审核通过并派发' })).not.toHaveAttribute('disabled'));
    fireEvent.click(screen.getByRole('button', { name: '审核通过并派发' }));
    await waitFor(() => expect(mocks.submitWorkOrder).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存资料' })).not.toBeInTheDocument());
  });
});

