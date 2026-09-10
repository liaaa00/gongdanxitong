import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomerRules from './index';
const mocks = vi.hoisted(() => ({
  getCustomerRules: vi.fn(), getCustomerRule: vi.fn(), updateCustomerRule: vi.fn(),
  getCustomerRuleBranches: vi.fn(), fillPendingCustomerRules: vi.fn(), getContractSubjects: vi.fn(), getFundLocations: vi.fn(),
  message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/customerRules', () => ({
  getCustomerRules: mocks.getCustomerRules, getCustomerRule: mocks.getCustomerRule, updateCustomerRule: mocks.updateCustomerRule,
  getCustomerRuleBranches: mocks.getCustomerRuleBranches, fillPendingCustomerRules: mocks.fillPendingCustomerRules,
}));
vi.mock('@/services/contractSubjects', () => ({ getContractSubjects: mocks.getContractSubjects, getFundLocations: mocks.getFundLocations }));
vi.mock('./RuleBatchActions', () => ({ default: () => <span>批量操作</span> }));
vi.mock('@ant-design/pro-components', () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return { ...actual, App: { ...actual.App, useApp: () => ({ message: mocks.message }) } };
});
const id = '11111111-1111-4111-8111-111111111111';
const detail = {
  customerId: id, customerCode: 'C001', customerName: '远页客户', configured: true,
  onboardingDefaults: { employee_type: '普通员工', fund_ratio: '5%+5%', need_esign: false, feedback_deadline: '三天' },
  resignationDefaults: { need_resignation_cert: '否', certificate_template: '模板一' },
  salaryRules: { billingDay: null, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
  sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'route' },
  completionEmailEnabled: true, completionEmailTo: ['to@example.com'], completionEmailCc: ['cc@example.com'],
  completionEmailReplyTo: null, completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'],
  completionEmailFields: ['order_no'], objectionDeadlineDays: 3, isActive: true,
};
describe('客户规则详情保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomerRules.mockResolvedValue({ list: [], total: 0 });
    mocks.getCustomerRule.mockResolvedValue(detail);
    mocks.updateCustomerRule.mockResolvedValue(detail);
    mocks.getCustomerRuleBranches.mockResolvedValue([{ id: '22222222-2222-4222-8222-222222222222', customer_id: id, branch_code: 'SH001', branch_name: '上海商社', is_active: true }]);
    mocks.getContractSubjects.mockResolvedValue([{ id: 'subject-1', subjectName: '上海客户主体', isActive: true }]);
    mocks.getFundLocations.mockResolvedValue(['上海', '宁波']);
  });
  it('opens a customer UUID directly even when the current page does not include the customer', async () => {
    render(<MemoryRouter initialEntries={['/customer-config?tab=rules&customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    expect(await screen.findByText('客户规则 · 远页客户')).toBeInTheDocument();
    expect(mocks.getCustomerRule).toHaveBeenCalledWith(id);
    expect(screen.getByDisplayValue('5%+5%')).toBeInTheDocument();
  });
  it('keeps unvisited tab settings, fixed reminder offsets and all three completion businesses when saving', async () => {
    const cityRule = { socialLocation: '上海', branchId: '22222222-2222-4222-8222-222222222222', onboardingDefaults: { contract_subject: '上海客户主体', need_esign: false }, resignationDefaults: {} };
    mocks.getCustomerRule.mockResolvedValue({ ...detail, paymentLocationRules: [cityRule] });
    render(<MemoryRouter initialEntries={['/customer-config?tab=rules&customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    await waitFor(() => expect(mocks.updateCustomerRule).toHaveBeenCalled());
    expect(mocks.updateCustomerRule).toHaveBeenCalledWith(id, expect.objectContaining({
      onboardingDefaults: expect.objectContaining({ feedback_deadline: '三天', fund_ratio: '5%+5%', need_esign: false }),
      resignationDefaults: detail.resignationDefaults,
      salaryRules: detail.salaryRules, sharedEmailRules: detail.sharedEmailRules,
      completionEmailTo: ['to@example.com'], completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'],
      paymentLocationRules: [cityRule],
    }));
    expect(mocks.getCustomerRule).toHaveBeenCalledTimes(2);
  });

  it('requires employee type for a nonempty onboarding rule instead of submitting incomplete settings', async () => {
    mocks.getCustomerRule.mockResolvedValue({ ...detail, onboardingDefaults: { fund_ratio: '5%+5%' } });
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    expect(await screen.findByText('填写入职规则时必须配置员工类型')).toBeInTheDocument();
    expect(mocks.updateCustomerRule).not.toHaveBeenCalled();
  });

  it('allows salary-only customers to choose the previous-month payroll period without onboarding fields', async () => {
    mocks.getCustomerRule.mockResolvedValue({ ...detail, onboardingDefaults: {} });
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('tab', { name: '薪资规则' }));
    fireEvent.mouseDown(screen.getByLabelText('薪资发薪周期'));
    fireEvent.click(await screen.findByText('当月发上月'));
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    await waitFor(() => expect(mocks.updateCustomerRule).toHaveBeenCalledWith(id, expect.objectContaining({ salaryRules: expect.objectContaining({ payrollMonthMode: 'previous', reminderWorkdayOffsets: [3, 2, 1] }) })));
    const payload = mocks.updateCustomerRule.mock.calls[0][1];
    expect(Object.values(payload.onboardingDefaults).every((value) => value === null)).toBe(true);
  });

  it('selects a real customer branch by UUID with its code and name and saves city-specific overrides', async () => {
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('tab', { name: '缴纳地与商社' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /新增缴纳地规则/ })).not.toBeDisabled());
    expect(mocks.getCustomerRuleBranches).toHaveBeenCalledWith(id);
    fireEvent.click(screen.getByRole('button', { name: /新增缴纳地规则/ }));
    fireEvent.mouseDown(screen.getByLabelText('缴纳地'));
    fireEvent.click(await screen.findByText('上海', { selector: '.ant-select-item-option-content' }));
    fireEvent.mouseDown(screen.getByLabelText('客户商社'));
    fireEvent.click(await screen.findByText('SH001 · 上海商社', { selector: '.ant-select-item-option-content' }));
    fireEvent.mouseDown(screen.getByLabelText('合同主体覆盖'));
    fireEvent.click(await screen.findByText('上海客户主体', { selector: '.ant-select-item-option-content' }));
    fireEvent.change(screen.getByLabelText('员工类型覆盖'), { target: { value: '劳务派遣' } });
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    await waitFor(() => expect(mocks.updateCustomerRule).toHaveBeenCalledWith(id, expect.objectContaining({ paymentLocationRules: [{
      socialLocation: '上海', branchId: '22222222-2222-4222-8222-222222222222',
      onboardingDefaults: { contract_subject: '上海客户主体', employee_type: '劳务派遣' }, resignationDefaults: {},
    }] })), { timeout: 5000 });
  }, 30000);

  it('rejects duplicate city rules before saving', async () => {
    const cityRule = { socialLocation: '上海', branchId: '22222222-2222-4222-8222-222222222222', onboardingDefaults: {}, resignationDefaults: {} };
    mocks.getCustomerRule.mockResolvedValue({ ...detail, paymentLocationRules: [cityRule, cityRule] });
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('tab', { name: '缴纳地与商社' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /新增缴纳地规则/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    expect((await screen.findAllByText('同一缴纳地只能配置一条规则', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(mocks.updateCustomerRule).not.toHaveBeenCalled();
  });

  it('fills only after confirmation and displays updated and skipped draft details', async () => {
    mocks.fillPendingCustomerRules.mockResolvedValue({ total: 3, updatedCount: 1, skippedCount: 1, failedCount: 1, results: [
      { workOrderId: 'order-1', requestNo: 'ON001', status: 'updated', fields: ['employee_type'], message: '已填充空白字段' },
      { workOrderId: 'order-2', requestNo: 'ON002', status: 'skipped', message: '已有人工配置，保持不变' },
      { workOrderId: 'order-3', requestNo: 'ON003', status: 'failed', message: '数据库暂不可用，请重试' },
    ] });
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('button', { name: '填充待提交草稿' }));
    expect(mocks.fillPendingCustomerRules).not.toHaveBeenCalled();
    expect(await screen.findByText('只填空白字段，保留已填写内容。页面修改请先保存。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始填充' }));
    expect(await screen.findByText('共 3 张草稿，已填充 1 张，跳过 1 张，失败 1 张')).toBeInTheDocument();
    expect(screen.getByText('ON003')).toBeInTheDocument();
    expect(screen.getByText('数据库暂不可用，请重试')).toBeInTheDocument();
    expect(mocks.fillPendingCustomerRules).toHaveBeenCalledWith(id);
    expect(screen.getByText('ON001')).toBeInTheDocument();
    expect(screen.getByText('已有人工配置，保持不变')).toBeInTheDocument();
  });

  it('blocks adding city rules when the real branch catalog cannot be loaded', async () => {
    mocks.getCustomerRuleBranches.mockRejectedValue(new Error('商社接口无权限'));
    render(<MemoryRouter initialEntries={['/?customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('tab', { name: '缴纳地与商社' }));
    expect(await screen.findByText('商社接口无权限')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新增缴纳地规则/ })).toBeDisabled();
    expect(mocks.updateCustomerRule).not.toHaveBeenCalled();
  });
});
