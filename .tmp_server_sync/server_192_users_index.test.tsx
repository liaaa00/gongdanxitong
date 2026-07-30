import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
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
    position: '业务组长',
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
const resetUserPassword = vi.fn();
const forceLogoutUser = vi.fn();
const getRoles = vi.fn();
const getModuleHandlers = vi.fn();
const flattenRoles = vi.fn((roles) => roles.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name })));
const reloadSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasRole: (role: string) => role === 'admin' }),
}));

vi.mock('@/services/users', () => ({
  getUsers: (...args: unknown[]) => getUsers(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPassword(...args),
  forceLogoutUser: (...args: unknown[]) => forceLogoutUser(...args),
  toggleUserActive: vi.fn(),
  deleteUser: vi.fn(),
  getUserPasswordStatus: vi.fn().mockReturnValue({ has_password: true, password: '123456' }),
}));

vi.mock('@/services/roles', () => ({
  getRoles: (...args: unknown[]) => getRoles(...args),
  flattenRoles: (...args: unknown[]) => flattenRoles(...args),
}));

vi.mock('@/services/moduleHandlers', () => ({
  getModuleHandlers: (...args: unknown[]) => getModuleHandlers(...args),
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
  render(
    <ConfigProvider getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}>
      <AdminUsers />
    </ConfigProvider>,
  );
  await waitFor(() => expect(getUsers).toHaveBeenCalled());
}

describe('AdminUsers user-role assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsers.mockResolvedValue({ list: mockUsers, page: 1, pageSize: 20, total: 1, totalPages: 1, success: true });
    getRoles.mockResolvedValue(mockRoles);
    getModuleHandlers.mockResolvedValue([
      { id: 'h-1', module_code: 'data_entry', handler_id: 'u-1', is_active: true },
    ]);
    createUser.mockResolvedValue({ id: 'u-2' });
    updateUser.mockResolvedValue({ id: 'u-1' });
  });

  it('given users with roles, when list renders, then it shows role column with correct role tags', async () => {
    await renderPage();

    expect(screen.getByRole('columnheader', { name: '角色' })).toBeInTheDocument();
    const row = screen.getByText('shenwenjun').closest('tr')!;
    expect(within(row).getByTitle('业务组长')).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('岗位'), '不应提交的岗位文本');
    await user.selectOptions(screen.getByLabelText('角色'), ['4', '7']);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'testuser',
      real_name: '测试',
      roles: expect.arrayContaining([
        { role_id: '4', role_name: '业务员', is_primary: true, isPrimary: true },
        { role_id: '7', role_name: '合同专员', is_primary: false, isPrimary: false },
      ]),
    }));
    expect(createUser.mock.calls[0][0]).not.toHaveProperty('position');
  });

  it('given account fields and roles are changed in edit form, when saving, then all supported fields are sent to update API', async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText('shenwenjun').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /编辑/ }));
    const usernameInput = await screen.findByLabelText('用户名');
    const realNameInput = screen.getByLabelText('姓名');
    const roleSelect = screen.getByLabelText('角色');
    await user.clear(usernameInput);
    await user.type(usernameInput, 'shenwenjun_new');
    await user.clear(realNameInput);
    await user.type(realNameInput, '沈文君新');
    await user.selectOptions(roleSelect, ['4', '7', '8']);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
      username: 'shenwenjun_new',
      real_name: '沈文君新',
      roles: expect.arrayContaining([
        expect.objectContaining({ role_id: '4', role_name: '业务员' }),
        expect.objectContaining({ role_id: '7', role_name: '合同专员' }),
        expect.objectContaining({ role_id: '8', role_name: '入离职联系专员' }),
      ]),
    }));
    const updatePayload = updateUser.mock.calls[0][1];
    expect(updatePayload).not.toHaveProperty('position');
    expect(updatePayload.roles.filter((role: { is_primary?: boolean }) => role.is_primary)).toHaveLength(1);
    expect(updatePayload.roles[0]).toMatchObject({ is_primary: true, isPrimary: true });
    expect(updatePayload.roles.slice(1).every((role: { is_primary?: boolean; isPrimary?: boolean }) => role.is_primary === false && role.isPrimary === false)).toBe(true);
  });

  it('shows each role contribution and module-handler impact in permission preview', async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText('shenwenjun').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /权限预览/ }));

    expect(await screen.findByText('角色逐项贡献')).toBeInTheDocument();
    await waitFor(() => expect(getModuleHandlers).toHaveBeenCalledWith(undefined, true));
    expect(screen.getByText('增员报岗录入 (data_entry)')).toBeInTheDocument();
    expect(screen.getByText('该用户是 1 个模块的负责人')).toBeInTheDocument();
  });

  it('requires confirmation before resetting a user password', async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText('shenwenjun').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /重置密码/ }));

    const description = await screen.findByText('密码将重置为默认密码 123456，用户下次登录必须先修改密码。');
    expect(description).toBeInTheDocument();
    expect(description.closest('.ant-popover')?.parentElement).toBe(document.body);
    expect(resetUserPassword).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认重置' }));
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u-1'));
  });

  it('requires confirmation before forcing a user logout', async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText('shenwenjun').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /强制下线/ }));

    expect(await screen.findByText('仅撤销该用户现有登录会话，不会停用账号或修改密码。')).toBeInTheDocument();
    expect(forceLogoutUser).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认下线' }));
    await waitFor(() => expect(forceLogoutUser).toHaveBeenCalledWith('u-1'));
  });
});
