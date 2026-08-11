import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminFieldPermissions from './index';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getRoles: vi.fn(),
    getFields: vi.fn(),
    requestGet: vi.fn(),
    requestPost: vi.fn(),
    messageSuccess: vi.fn(),
    messageError: vi.fn(),
  },
}));

vi.mock('@/services/mock', () => ({
  isMockMode: false,
  mockDelay: vi.fn(async (value: unknown) => value),
}));

vi.mock('@/services/roles', () => ({
  getRoles: (...args: unknown[]) => mocks.getRoles(...args),
}));

vi.mock('@/services/fields', () => ({
  getFields: (...args: unknown[]) => mocks.getFields(...args),
}));

vi.mock('@/services/request', () => ({
  default: {
    get: (...args: unknown[]) => mocks.requestGet(...args),
    post: (...args: unknown[]) => mocks.requestPost(...args),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { roles: [{ code: 'admin' }] },
    hasRole: (role: string) => role === 'admin',
  }),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Select: ({ value, options = [], onChange, 'aria-label': ariaLabel, placeholder }: any) => (
      <select
        aria-label={ariaLabel || placeholder}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    ),
  };
});

describe('AdminFieldPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: {
        success: mocks.messageSuccess,
        error: mocks.messageError,
        info: vi.fn(),
        warning: vi.fn(),
        loading: vi.fn(),
        open: vi.fn(),
        destroy: vi.fn(),
      } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
    mocks.getRoles.mockResolvedValue([
      { id: 'role-sales', code: 'business_group_member', name: '业务员', level: '执行层', description: '', is_active: true },
      { id: 'role-disabled', code: 'disabled', name: '停用角色', level: '执行层', description: '', is_active: false },
    ]);
    mocks.getFields.mockResolvedValue([
      {
        id: 'field-employee',
        field_code: 'employee_name',
        field_name: '员工姓名',
        field_type: 'text',
        is_required: true,
        default_required: true,
        validation_regex: null,
        validation_msg: null,
        dropdown_options: null,
        placeholder: null,
        help_text: null,
        order_type: 'onboarding',
        source_category: 'customer_filled',
        sub_ticket_scope: 'contract',
        collection_group: '基本信息',
        display_order: 1,
        is_active: true,
      },
      {
        id: 'field-contract-feedback',
        field_code: 'contract_feedback',
        field_name: '劳动合同新签反馈',
        field_type: 'text',
        is_required: false,
        default_required: false,
        validation_regex: null,
        validation_msg: null,
        dropdown_options: null,
        placeholder: null,
        help_text: null,
        order_type: 'onboarding',
        source_category: 'agent_supplemented',
        sub_ticket_scope: 'contract',
        collection_group: '劳动合同新签',
        display_order: 2,
        is_active: true,
      },
      {
        id: 'field-hidden',
        field_code: 'system_hidden',
        field_name: '停用字段',
        field_type: 'text',
        is_required: false,
        default_required: false,
        validation_regex: null,
        validation_msg: null,
        dropdown_options: null,
        placeholder: null,
        help_text: null,
        order_type: 'onboarding',
        source_category: 'customer_filled',
        sub_ticket_scope: 'contract',
        collection_group: '基本信息',
        display_order: 2,
        is_active: false,
      },
    ]);
    mocks.requestGet.mockResolvedValue({
      scenarios: ['create:onboarding', 'dispatched:contract'],
      matrix: {
        'role-sales': {
          'create:onboarding': { employee_name: 'visible', contract_feedback: 'readonly' },
          'dispatched:contract': { employee_name: 'readonly' },
        },
      },
    });
    mocks.requestPost.mockResolvedValue({ affected: 1 });
  });

  it('shows business-friendly guidance and saves field permission changes to the real backend endpoint', async () => {
    render(<AdminFieldPermissions />);

    expect(await screen.findByText('字段填写权限')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('当前查看：业务员（business_group_member）'));
    expect(screen.getByRole('alert')).toHaveTextContent('修改后点击右上角保存');
    expect(screen.getByText('员工姓名')).toBeInTheDocument();
    expect(screen.getByText('employee_name')).toBeInTheDocument();
    expect(screen.getAllByText('劳动合同新签').length).toBeGreaterThan(0);
    expect(screen.queryByText('停用字段')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '员工姓名-业务员-权限' }), '只读');
    await userEvent.click(screen.getByRole('button', { name: /保存（1）/ }));

    await waitFor(() => expect(mocks.requestPost).toHaveBeenCalledWith('/admin/field-permissions/batch', {
      items: [{
        roleId: 'role-sales',
        scenario: 'create:onboarding',
        fieldCode: 'employee_name',
        permission: 'readonly',
      }],
    }));
    expect(mocks.messageSuccess).toHaveBeenCalledWith('已保存 1 条权限变更');
  });

  it('tracks a field permission change to hidden before saving', async () => {
    render(<AdminFieldPermissions />);

    const permissionSelect = await screen.findByRole('combobox', { name: '员工姓名-业务员-权限' });
    await userEvent.selectOptions(permissionSelect, '隐藏');

    expect(permissionSelect).toHaveValue('隐藏');
    expect(screen.getByRole('button', { name: /保存（1）/ })).toBeEnabled();
    expect(mocks.requestPost).not.toHaveBeenCalled();
  });
});
