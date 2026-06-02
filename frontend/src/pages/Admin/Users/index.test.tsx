import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUsers from './index';

const mockUsers = [
  {
    id: 'u-1',
    username: 'shenwenjun',
    real_name: '沈文君',
    email: 'shenwenjun@example.com',
    phone: '13800001006',
    is_active: true,
    group_name: '业务1组',
    created_at: '2026-05-12T00:00:00.000Z',
    roles: [
      { role_id: '3', role_name: '业务组长' },
    ],
  },
];

const mockRoles = [
  { id: '1', code: 'admin', name: '系统管理员', level: '全局', description: '', is_active: true },
  { id: '2', code: 'business_owner', name: '业务负责人', level: '管理层', description: '', is_active: true },
  { id: '3', code: 'business_group_leader', name: '业务组长', level: '主管层', description: '', is_active: true },
  { id: '4', code: 'business_group_member', name: '业务员', level: '执行层', description: '', is_active: true },
  { id: '7', code: 'labor_contract_member', name: '合同专员', level: '执行层', description: '', is_active: true },
  { id: '8', code: 'onboarding_resignation_member', name: '入离职联系专员', level: '执行层', description: '', is_active: true },
];

const getUsers = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const getRoles = vi.fn();
const flattenRoles = vi.fn((roles) => roles.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name })));
const reloadSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasRole: (role: string) => role === 'admin' }),
}));

vi.mock('@/services/users', () => ({
  getUsers: (...args: unknown[]) => getUsers(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
  resetUserPassword: vi.fn(),
  toggleUserActive: vi.fn(),
  deleteUser: vi.fn(),
  getUserPasswordStatus: vi.fn().mockReturnValue({ has_password: true, password: '123456' }),
}));

vi.mock('@/services/roles', () => ({
  getRoles: (...args: unknown[]) => getRoles(...args),
  flattenRoles: (...args: unknown[]) => flattenRoles(...args),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const Select = ({ value = [], onChange, options = [], id, placeholder }: any) => (
    <select
      id={id}
      aria-label="角色"
      multiple
      value={value}
      data-placeholder={placeholder}
      onChange={(event) => {
        const selected = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
        onChange?.(selected);
      }}
    >
      {options.map((option: { value: string; label: string }) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );

  return {
    ...actual,
    Select,
    App: {
      ...(actual.App as object),
      useApp: () => ({
        message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        modal: { confirm: vi.fn() },
      }),
    },
  };
});

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: string } }) => (
    <section>
      <h1>{header?.title}</h1>
      {children}
    </section>
  ),
  ProTable: ({ columns, request, toolBarRender, actionRef }: Record<string, any>) => {
    const React = require('react');
    const [rows, setRows] = React.useState<any[]>([]);
    React.useEffect(() => {
      if (actionRef) actionRef.current = { reload: reloadSpy };
      request({ page: 1, pageSize: 20 }).then((res: { data: any[] }) => setRows(res.data));
    }, [request, actionRef]);
    return (
      <div>
        <div>{toolBarRender?.()}</div>
        <table>
          <thead>
            <tr>{columns.map((col: any) => <th key={col.key || col.dataIndex}>{col.title}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((col: any) => (
                  <td key={col.key || col.dataIndex}>
                    {col.render ? col.render(row[col.dataIndex], row) : row[col.dataIndex]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
}));

async function renderPage() {
  render(<AdminUsers />);
  await waitFor(() => expect(getUsers).toHaveBeenCalled());
  await screen.findByText('shenwenjun');
}

describe('AdminUsers user-role assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsers.mockResolvedValue({ list: mockUsers, page: 1, pageSize: 20, total: 1, totalPages: 1, success: true });
    getRoles.mockResolvedValue(mockRoles);
    createUser.mockResolvedValue({ id: 'u-2' });
    updateUser.mockResolvedValue({ id: 'u-1' });
  });

  it('given users with roles, when list renders, then it shows role column with correct role tags', async () => {
    await renderPage();

    expect(screen.getByRole('columnheader', { name: '角色' })).toBeInTheDocument();
    const row = screen.getByText('shenwenjun').closest('tr')!;
    expect(within(row).getByText('业务组长')).toBeInTheDocument();
  });

  it('given role seeds are loaded, when creating a user, then role multi-select lists all active role options', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: /新建用户/ }));
    await waitFor(() => expect(getRoles).toHaveBeenCalled());
    expect(flattenRoles).toHaveBeenCalledWith(mockRoles);

    const roleSelect = screen.getByLabelText('角色') as HTMLSelectElement;
    expect(roleSelect.multiple).toBe(true);
    for (const role of mockRoles) {
      expect(within(roleSelect).getByRole('option', { name: role.name })).toHaveValue(role.id);
    }
  });

  it('given roles are selected in create form, when saving, then role data is converted and sent to create API', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: /新建用户/ }));
    await user.type(screen.getByLabelText('用户名'), 'testuser');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.type(screen.getByLabelText('姓名'), '测试');
    await user.selectOptions(screen.getByLabelText('角色'), ['4', '7']);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'testuser',
      real_name: '测试',
      roles: expect.arrayContaining([
        { role_id: '4', role_name: '业务员' },
        { role_id: '7', role_name: '合同专员' },
      ]),
    }));
  });

  it('given roles are changed in edit form, when saving, then role data is sent to update API', async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText('shenwenjun').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /编辑/ }));
    const roleSelect = await screen.findByLabelText('角色');
    await user.selectOptions(roleSelect, ['4', '7', '8']);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
      roles: expect.arrayContaining([
        { role_id: '4', role_name: '业务员' },
        { role_id: '7', role_name: '合同专员' },
        { role_id: '8', role_name: '入离职联系专员' },
      ]),
    }));
  });
});
