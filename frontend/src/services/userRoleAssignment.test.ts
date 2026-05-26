import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  },
  configurable: true,
});

describe('user-role assignment services', () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it('given role seed data, when getRoles is called in mock mode, then it returns 9 unique core roles matching real organization', async () => {
    const { getRoles } = await import('./roles');

    const roles = await getRoles();
    const uniqueRoles = new Map(roles.map((r) => [r.id, r]));

    // ★ 9 核心角色体系：业务组通过 group_name 区分，不再按组编号独立成角色
    expect(uniqueRoles.size).toBe(9);
    expect([...uniqueRoles.values()].map((r) => r.name)).toEqual(expect.arrayContaining([
      '系统管理员',
      '业务负责人',
      '业务组长',         // 统一角色，不再区分 业务1组组长/业务2组组长...
      '业务员',           // 统一角色
      '数据录入组长',
      '共享团队负责人',
      '合同专员',
      '入离职联系专员',
      '福保负责人',
    ]));
  });

  it('given createUser receives roles, when mock user is created, then roles are persisted and returned by getUsers', async () => {
    const { createUser, getUsers } = await import('./users');
    const roles = [
      { role_id: '4', role_name: '业务员' },
      { role_id: '7', role_name: '合同专员' },
    ];

    const created = await createUser({ username: 'role-user', real_name: '角色用户', group_name: '测试', roles });
    const users = await getUsers({ page: 1, pageSize: 100 });

    expect(created.roles).toEqual(roles);
    expect(users.list.find((u) => u.id === created.id)?.roles).toEqual(roles);
  });

  it('given updateUser receives changed roles, when mock user is updated, then role data is persisted', async () => {
    const { createUser, updateUser, getUsers } = await import('./users');
    const created = await createUser({ username: 'editable-user', real_name: '可编辑用户', group_name: '测试', roles: [{ role_id: '4', role_name: '业务员' }] });
    const changedRoles = [
      { role_id: '5', role_name: '数据录入组长' },
      { role_id: '8', role_name: '入离职联系专员' },
    ];

    const updated = await updateUser(created.id, { roles: changedRoles });
    const users = await getUsers({ page: 1, pageSize: 100 });

    expect(updated.roles).toEqual(changedRoles);
    expect(users.list.find((u) => u.id === created.id)?.roles).toEqual(changedRoles);
  });
});
