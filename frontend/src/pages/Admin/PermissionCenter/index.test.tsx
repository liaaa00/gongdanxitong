import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PermissionCenter from './index';
import type { PermissionConfig, PermissionConfigVersion } from '@/services/permissionCenter';

const { api } = vi.hoisted(() => ({
  api: {
    getActivePermissionConfig: vi.fn(),
    getPermissionVersions: vi.fn(),
    getPermissionVersion: vi.fn(),
    createPermissionVersion: vi.fn(),
    activatePermissionVersion: vi.fn(),
  },
}));

vi.mock('@/services/permissionCenter', async () => {
  const actual = await vi.importActual<typeof import('@/services/permissionCenter')>('@/services/permissionCenter');
  return { ...actual, ...api };
});

const config: PermissionConfig = {
  version: '1.0.0',
  roles: [
    { id: 'role-admin', code: 'admin', canonicalCode: 'admin', name: '系统管理员', level: 'global', isActive: true },
    { id: 'role-member', code: 'business_group_member', canonicalCode: 'business_group_member', name: '业务员', level: 'execution', isActive: true },
  ],
  routePermissions: [
    { path: '/dashboard', allowedRoles: ['admin', 'business_group_member'], backendActions: ['route.dashboard'], menu: { title: '仪表盘' } },
  ],
  fieldPermissions: [
    { scenario: 'create:onboarding', description: '入职创建', roleFieldRules: { admin: { employee_name: 'visible' }, business_group_member: { employee_name: 'readonly' } } },
  ],
};

const activeVersion: PermissionConfigVersion = {
  id: 'version-1',
  version: '1.0.0',
  config,
  isActive: true,
  createdAt: '2026-08-02T00:00:00Z',
};

function renderPage() {
  return render(<PermissionCenter />);
}

describe('PermissionCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getActivePermissionConfig.mockResolvedValue(structuredClone(config));
    api.getPermissionVersions.mockResolvedValue([structuredClone(activeVersion)]);
    api.createPermissionVersion.mockResolvedValue({ ...activeVersion, id: 'version-2', version: '1.0.1', isActive: false });
    api.activatePermissionVersion.mockResolvedValue(undefined);
  });

  it('shows roles, route matrix, field matrix and version history', async () => {
    renderPage();

    expect(await screen.findByText('权限配置中心')).toBeInTheDocument();
    expect(screen.getByText('系统管理员')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '路由权限' }));
    expect(screen.getByDisplayValue('/dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('/dashboard-业务员')).toBeChecked();

    await userEvent.click(screen.getByRole('tab', { name: '字段权限' }));
    expect(screen.getByText('employee_name')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '版本历史' }));
    expect(screen.getAllByText('1.0.0').length).toBeGreaterThan(0);
    expect(screen.getByText('当前')).toBeInTheDocument();
  });

  it('keeps edits local until they are saved as a new version', async () => {
    renderPage();
    await screen.findByText('系统管理员');
    await userEvent.click(screen.getByRole('tab', { name: '路由权限' }));

    fireEvent.click(screen.getByLabelText('/dashboard-业务员'));
    expect(api.createPermissionVersion).not.toHaveBeenCalled();
    expect(screen.getByText('当前有未保存修改')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /\u4fdd存为新版本/ }));
    const modal = await screen.findByRole('dialog', { name: '保存权限配置版本' });
    await userEvent.type(within(modal).getByLabelText('变更说明'), '收紧业务员仪表盘权限');
    await userEvent.click(within(modal).getByRole('button', { name: /\u786e\s*\u5b9a/ }));

    await waitFor(() => expect(api.createPermissionVersion).toHaveBeenCalledTimes(1));
    const savedConfig = api.createPermissionVersion.mock.calls[0][0] as PermissionConfig;
    expect(savedConfig.version).toBe('1.0.1');
    expect(savedConfig.routePermissions[0].allowedRoles).toEqual(['admin']);
    expect(api.activatePermissionVersion).not.toHaveBeenCalled();
  });

  it('removes a deleted role from route and field rules in the draft', async () => {
    renderPage();
    await screen.findByText('系统管理员');

    await userEvent.click(screen.getByRole('button', { name: '删除业务员' }));
    await userEvent.click(await screen.findByRole('button', { name: /\u786e\s*\u5b9a/ }));
    await userEvent.click(screen.getByRole('button', { name: /\u4fdd存为新版本/ }));
    const modal = await screen.findByRole('dialog', { name: '保存权限配置版本' });
    await userEvent.type(within(modal).getByLabelText('变更说明'), '删除废弃角色');
    await userEvent.click(within(modal).getByRole('button', { name: /\u786e\s*\u5b9a/ }));

    await waitFor(() => expect(api.createPermissionVersion).toHaveBeenCalledTimes(1));
    const saved = api.createPermissionVersion.mock.calls[0][0] as PermissionConfig;
    expect(saved.roles.map((role) => role.code)).toEqual(['admin']);
    expect(saved.routePermissions[0].allowedRoles).toEqual(['admin']);
    expect(saved.fieldPermissions[0].roleFieldRules).not.toHaveProperty('business_group_member');
  });
});
