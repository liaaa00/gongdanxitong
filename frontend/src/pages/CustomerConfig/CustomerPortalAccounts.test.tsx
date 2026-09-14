import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import CustomerPortalAccounts from './CustomerPortalAccounts';
import type { CustomerRuleItem } from '@/services/customerRules';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/request', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put },
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Select: ({ value, options = [], onChange }: {
      value?: string;
      options?: Array<{ value: string; label: string }>;
      onChange?: (value: string) => void;
    }) => (
      <select aria-label="选择客户" value={value || ''} onChange={(event) => onChange?.(event.target.value)}>
        <option value="">请选择客户</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    ),
    App: { ...actual.App, useApp: () => ({ message: mocks.message }) },
  };
});
vi.setConfig({ testTimeout: 60_000 });

const customerIdAt = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const firstCustomerId = customerIdAt(1);
const selectedCustomerId = customerIdAt(201);
const customers: CustomerRuleItem[] = Array.from({ length: 201 }, (_, index) => ({
  customerId: customerIdAt(index + 1),
  customerName: index === 0 || index === 200 ? '同名客户' : `客户 ${index + 1}`,
  customerCode: index === 0 || index === 200 ? 'SAME-CODE' : `C${index + 1}`,
  configured: true,
  onboardingDefaults: { contract_subject: '测试主体' },
  resignationDefaults: { need_resignation_cert: '否' },
  salaryRules: { billingDay: 20, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] },
  sharedEmailRules: { mailbox: 'shared@example.test', routeKey: '' },
  readiness: { ready: true, missing: [] },
  completionEmailEnabled: false,
  completionEmailTo: [],
  completionEmailCc: [],
  completionEmailReplyTo: null,
  completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'],
  completionEmailFields: [],
  objectionDeadlineDays: null,
  isActive: true,
  updatedBy: null,
  updatedAt: null,
}));

const account = {
  id: '10000000-0000-4000-8000-000000000001',
  customerId: selectedCustomerId,
  loginEmail: 'portal@example.test',
  contactName: '门户联系人',
  isActive: true,
  mustChangePassword: false,
  businessPermissions: ['employee_changes', 'salary'],
  lastLoginAt: null,
  createdAt: '2026-09-09T00:00:00Z',
  updatedAt: '2026-09-09T00:00:00Z',
};
const accountsPath = (customerId: string) => `/customer-config/customers/${customerId}/accounts`;
let customerRuleOverrides: Partial<CustomerRuleItem> = {};
let accountOverrides: Partial<typeof account> = {};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

async function renderAccounts() {
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter initialEntries={[`/customer-config?tab=accounts&customerId=${selectedCustomerId}`]}>
        <CustomerPortalAccounts />
        <LocationProbe />
      </MemoryRouter>
    </ConfigProvider>,
  );
  await screen.findByText('portal@example.test', {}, { timeout: 10000 });
}

function fillCreateForm(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('登录邮箱'), { target: { value: 'new@example.test' } });
  fireEvent.change(within(dialog).getByLabelText('联系人姓名/备注'), { target: { value: '新联系人' } });
  fireEvent.change(within(dialog).getByLabelText('初始密码'), { target: { value: 'Portal1234' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  customerRuleOverrides = {};
  accountOverrides = {};
  mocks.get.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
    if (url === '/customer-rules') {
      const page = config?.params?.page || 1;
      return { list: customers.slice((page - 1) * 200, page * 200).map((row) => row.customerId === selectedCustomerId ? { ...row, ...customerRuleOverrides } : row), total: customers.length, page, pageSize: 200 };
    }
    if (url === accountsPath(selectedCustomerId)) return [{ ...account, ...accountOverrides }];
    if (url === accountsPath(firstCustomerId)) return [];
    throw new Error(`Unexpected API: ${url}`);
  });
  mocks.post.mockResolvedValue(account);
  mocks.put.mockResolvedValue(account);
});

afterEach(cleanup);

describe('CustomerPortalAccounts customer identity and forms', () => {
  it('loads all rule pages and selects the URL UUID even when name and code duplicate a first-page customer', async () => {
    await renderAccounts();

    expect(mocks.get).toHaveBeenCalledWith('/customer-rules', { params: { page: 1, pageSize: 200, keyword: undefined } });
    expect(mocks.get).toHaveBeenCalledWith('/customer-rules', { params: { page: 2, pageSize: 200, keyword: undefined } });
    expect(screen.getByRole('combobox', { name: '选择客户' })).toHaveValue(selectedCustomerId);
    expect(screen.getAllByRole('option', { name: /同名客户/ })).toHaveLength(2);
    expect(screen.getByRole('option', { name: `同名客户（SAME-CODE） · ${firstCustomerId}` })).toHaveValue(firstCustomerId);
    expect(screen.getByRole('option', { name: `同名客户（SAME-CODE） · ${selectedCustomerId}` })).toHaveValue(selectedCustomerId);
    expect(mocks.get).not.toHaveBeenCalledWith(accountsPath(firstCustomerId));

    fireEvent.change(screen.getByRole('combobox', { name: '选择客户' }), { target: { value: firstCustomerId } });

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(accountsPath(firstCustomerId)));
    expect(screen.getByRole('combobox', { name: '选择客户' })).toHaveValue(firstCustomerId);
    expect(screen.getByTestId('location')).toHaveTextContent(`customerId=${firstCustomerId}`);
    expect(mocks.get.mock.calls.every(([url]) => url === '/customer-rules' || String(url).startsWith('/customer-config/customers/'))).toBe(true);
  });

  it('rejects incomplete create forms and submits a valid account to the selected customer UUID', async () => {
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增门户账号' });
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await within(dialog).findByText('请输入登录邮箱');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('登录邮箱'), { target: { value: 'new@example.test' } });
    fireEvent.change(within(dialog).getByLabelText('联系人姓名/备注'), { target: { value: '新联系人' } });
    fireEvent.change(within(dialog).getByLabelText('初始密码'), { target: { value: 'Portal1234' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '增减员' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '薪资' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(accountsPath(selectedCustomerId), {
      loginEmail: 'new@example.test', contactName: '新联系人', password: 'Portal1234', isActive: true, mustChangePassword: true, businessPermissions: ['employee_changes', 'salary'],
    }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.message.success).toHaveBeenCalledWith('门户账号已创建');
  });

  it('rejects a weak reset password and resets only the account belonging to the selected customer UUID', async () => {
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /重置密码/ }));
    const dialog = await screen.findByRole('dialog', { name: '重置密码 · 门户联系人' });
    fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: '1234' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await within(dialog).findByText('8 至 72 位，且同时包含字母和数字');
    expect(mocks.post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'Changed1234' } });
    expect(within(dialog).getByLabelText('下次登录必须修改密码')).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`${accountsPath(selectedCustomerId)}/${account.id}/reset-password`, {
      password: 'Changed1234', mustChangePassword: true,
    }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.message.success).toHaveBeenCalledWith('密码已重置');
  });

  it('requires an explicit business grant before account creation', async () => {
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增门户账号' });
    fireEvent.change(within(dialog).getByLabelText('登录邮箱'), { target: { value: 'new@example.test' } });
    fireEvent.change(within(dialog).getByLabelText('联系人姓名/备注'), { target: { value: '新联系人' } });
    fireEvent.change(within(dialog).getByLabelText('初始密码'), { target: { value: 'Portal1234' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));
    await within(dialog).findByText('请至少选择一项业务权限');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('displays existing grants and saves a reduced permission set for only that account', async () => {
    await renderAccounts();
    const row = screen.getByText('portal@example.test').closest('tr')!;
    expect(within(row).getByText('增减员')).toBeInTheDocument();
    expect(within(row).getByText('薪资')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /编辑/ }));
    const dialog = await screen.findByRole('dialog', { name: '编辑门户账号' });
    expect(within(dialog).getByRole('checkbox', { name: '增减员' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '增减员' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${accountsPath(selectedCustomerId)}/${account.id}`, {
      loginEmail: account.loginEmail, contactName: account.contactName, isActive: true, mustChangePassword: false, businessPermissions: ['salary'],
    }));
  });

  it.each([
    { label: '薪资', permission: 'salary', missing: '入职、离职规则', overrides: { onboardingDefaults: {}, resignationDefaults: {} } },
    { label: '增减员', permission: 'employee_changes', missing: '薪资账单日', overrides: { salaryRules: { billingDay: null, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] } } },
  ])('opens account creation and checks only $label rules even when global readiness is incomplete', async ({ label, permission, missing, overrides }) => {
    customerRuleOverrides = { ...overrides, readiness: { ready: false, missing: [missing] } };
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增门户账号' });
    fillCreateForm(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: label }));
    expect(within(dialog).queryByText('所选业务的办理规则尚未完成')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(accountsPath(selectedCustomerId), expect.objectContaining({ businessPermissions: [permission] })));
  });

  it('shows missing selected rules and refuses to grant salary without a shared mailbox address', async () => {
    customerRuleOverrides = { sharedEmailRules: { mailbox: '', routeKey: '' }, readiness: { ready: false, missing: ['共享邮箱地址'] } };
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增门户账号' });
    fillCreateForm(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '薪资' }));
    expect(await within(dialog).findByText('共享邮箱地址')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.message.error).toHaveBeenCalledWith('请先完善所选业务的客户办理规则：共享邮箱地址'));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(['contact', 'disable', 'revoke'])('permits $0 on an existing account when customer rules are incomplete', async (operation) => {
    customerRuleOverrides = { configured: false, readiness: { ready: false, missing: ['整套客户办理规则'] } };
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    const dialog = await screen.findByRole('dialog', { name: '编辑门户账号' });
    if (operation === 'contact') fireEvent.change(within(dialog).getByLabelText('联系人姓名/备注'), { target: { value: '修改联系人' } });
    if (operation === 'disable') fireEvent.click(within(dialog).getByLabelText('启用账号'));
    if (operation === 'revoke') fireEvent.click(within(dialog).getByRole('checkbox', { name: '增减员' }));
    expect(within(dialog).queryByText('所选业务的办理规则尚未完成')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(`${accountsPath(selectedCustomerId)}/${account.id}`, expect.objectContaining(
      operation === 'contact' ? { contactName: '修改联系人' } : operation === 'disable' ? { isActive: false } : { businessPermissions: ['salary'] },
    )));
  });

  it('blocks re-enabling until the retained permissions have their required customer rules', async () => {
    accountOverrides = { isActive: false };
    customerRuleOverrides = { salaryRules: { billingDay: null, reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] }, readiness: { ready: false, missing: ['薪资账单日'] } };
    await renderAccounts();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    const dialog = await screen.findByRole('dialog', { name: '编辑门户账号' });
    fireEvent.click(within(dialog).getByLabelText('启用账号'));
    expect(await within(dialog).findByText('薪资账单日')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));

    await waitFor(() => expect(mocks.message.error).toHaveBeenCalledWith('请先完善所选业务的客户办理规则：薪资账单日'));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('refreshes customer rules together with accounts after configuration changes', async () => {
    customerRuleOverrides = { configured: false, readiness: { ready: false, missing: ['整套客户办理规则'] } };
    await renderAccounts();
    expect(screen.getByText('整套客户办理规则')).toBeInTheDocument();
    customerRuleOverrides = {};
    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));
    await waitFor(() => expect(screen.queryByText('整套客户办理规则')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增门户账号' });
    fillCreateForm(dialog);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '薪资' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /OK|确 定|确定/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(accountsPath(selectedCustomerId), expect.objectContaining({ businessPermissions: ['salary'] })));
  });
});
