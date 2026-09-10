import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomerRules from './index';
const mocks = vi.hoisted(() => ({
  getCustomerRules: vi.fn(), getCustomerRule: vi.fn(), updateCustomerRule: vi.fn(),
  message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/customerRules', () => ({
  getCustomerRules: mocks.getCustomerRules, getCustomerRule: mocks.getCustomerRule, updateCustomerRule: mocks.updateCustomerRule,
}));
vi.mock('./RuleBatchActions', () => ({ default: () => <span>批量操作</span> }));
vi.mock('@ant-design/pro-components', () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return { ...actual, App: { ...actual.App, useApp: () => ({ message: mocks.message }) } };
});
const id = '11111111-1111-4111-8111-111111111111';
const detail = {
  customerId: id, customerCode: 'C001', customerName: '远页客户', configured: true,
  onboardingDefaults: { fund_ratio: '5%+5%', need_esign: false, feedback_deadline: '三天' },
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
  });
  it('opens a customer UUID directly even when the current page does not include the customer', async () => {
    render(<MemoryRouter initialEntries={['/customer-config?tab=rules&customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    expect(await screen.findByText('客户规则 · 远页客户')).toBeInTheDocument();
    expect(mocks.getCustomerRule).toHaveBeenCalledWith(id);
    expect(screen.getByDisplayValue('5%+5%')).toBeInTheDocument();
  });
  it('keeps unvisited tab settings, fixed reminder offsets and all three completion businesses when saving', async () => {
    render(<MemoryRouter initialEntries={['/customer-config?tab=rules&customerId=' + id]}><CustomerRules embedded /></MemoryRouter>);
    await screen.findByText('客户规则 · 远页客户');
    fireEvent.click(screen.getByRole('button', { name: /保存并校验/ }));
    await waitFor(() => expect(mocks.updateCustomerRule).toHaveBeenCalled());
    expect(mocks.updateCustomerRule).toHaveBeenCalledWith(id, expect.objectContaining({
      onboardingDefaults: expect.objectContaining({ feedback_deadline: '三天', fund_ratio: '5%+5%', need_esign: false }),
      resignationDefaults: detail.resignationDefaults,
      salaryRules: detail.salaryRules, sharedEmailRules: detail.sharedEmailRules,
      completionEmailTo: ['to@example.com'], completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'],
    }));
    expect(mocks.getCustomerRule).toHaveBeenCalledTimes(2);
  });
});
