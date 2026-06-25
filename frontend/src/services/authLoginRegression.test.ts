import { describe, it, expect, beforeEach } from 'vitest';
import { login, logout, getMe, refreshToken, changePassword } from './auth';
import { createUser } from './users';
import { useUserStore } from '@/stores/userStore';

const SESSION_KEY = 'mock_session_user_v1';

const seedUsers = [
  { username: 'lizhanbo', password: '123456', role: 'admin' },
  { username: 'wangzixi', password: '123456', role: 'admin' },
  { username: 'aolei', password: '123456', role: 'business_owner' },
  { username: 'jianglu', password: '123456', role: 'shared_team_owner' },
  { username: 'yangchun', password: '123456', role: 'labor_contract_member' },
  { username: 'maoyani', password: '123456', role: 'onboarding_resignation_member' },
  { username: 'annazhen', password: '123456', role: 'data_entry_leader' },
];

describe('auth mock login regression', () => {
  beforeEach(() => {
    localStorage.clear();
    useUserStore.setState({ user: null, token: null, refreshToken: null, isLoggedIn: false, loading: false });
  });

  it('allows lizhanbo/123456 to login and returns admin role with wildcard permissions', async () => {
    const res = await login({ username: 'lizhanbo', password: '123456' });

    expect(res.user.username).toBe('lizhanbo');
    expect(res.roles.map((r) => r.code)).toContain('admin');
    expect(res.permissions).toContain('*');
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').username).toBe('lizhanbo');
  });

  it('allows wangzixi/123456 to login and returns admin role', async () => {
    const res = await login({ username: 'wangzixi', password: '123456' });

    expect(res.user.username).toBe('wangzixi');
    expect(res.roles.map((r) => r.code)).toContain('admin');
    expect(res.permissions).toContain('*');
  });

  it('allows non-admin seed users to login with password 123456 and returns their own roles', async () => {
    for (const user of seedUsers.filter((u) => u.role !== 'admin')) {
      await logout();
      const res = await login({ username: user.username, password: user.password });
      const roleCodes = res.roles.map((r) => r.code);

      expect(res.user.username).toBe(user.username);
      expect(roleCodes).toContain(user.role);
      expect(roleCodes).not.toContain('admin');
      expect(res.permissions).not.toContain('*');
      expect(JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').username).toBe(user.username);
    }
  });

  it('keeps a non-admin user identity after a simulated page refresh/getMe/refreshToken flow', async () => {
    const res = await login({ username: 'maoyani', password: '123456' });
    useUserStore.getState().setToken(res.token);
    useUserStore.getState().setUser(res.user);

    useUserStore.setState({ user: null, token: localStorage.getItem('token'), isLoggedIn: true });
    await useUserStore.getState().fetchUser();

    expect(useUserStore.getState().user?.username).toBe('maoyani');
    expect(useUserStore.getState().user?.roles.map((r) => r.code)).toContain('onboarding_resignation_member');
    expect(useUserStore.getState().user?.roles.map((r) => r.code)).not.toContain('admin');

    const me = await getMe();
    const refreshed = await refreshToken();
    expect(me.username).toBe('maoyani');
    expect(refreshed.user.username).toBe('maoyani');
  });

  it('syncs mustChangePassword through login, refresh recovery and first-login password change', async () => {
    const res = await login({ username: 'jianglu', password: '123456' });
    expect(res.must_change_password).toBe(true);
    expect(res.user.must_change_password).toBe(true);

    useUserStore.getState().setToken(res.token);
    useUserStore.getState().setUser(res.user);
    expect(useUserStore.getState().mustChangePassword).toBe(true);

    useUserStore.setState({ user: null, token: localStorage.getItem('token'), isLoggedIn: true, mustChangePassword: false });
    await useUserStore.getState().fetchUser();
    expect(useUserStore.getState().user?.username).toBe('jianglu');
    expect(useUserStore.getState().mustChangePassword).toBe(true);

    const me = await getMe();
    const refreshed = await refreshToken();
    expect(me.must_change_password).toBe(true);
    expect(refreshed.must_change_password).toBe(true);

    await changePassword({ oldPassword: '123456', newPassword: 'JiangluNew123' });
    const changedMe = await getMe();
    expect(changedMe.must_change_password).toBe(false);
    expect(changedMe.password_updated_at).toEqual(expect.any(String));

    useUserStore.getState().setUser(changedMe);
    expect(useUserStore.getState().mustChangePassword).toBe(false);
  });

  it('clears session data on logout', async () => {
    const res = await login({ username: 'annazhen', password: '123456' });
    useUserStore.getState().setToken(res.token);
    useUserStore.getState().setUser(res.user);

    await logout();
    useUserStore.getState().logout();

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(useUserStore.getState().isLoggedIn).toBe(false);
  });

  it('allows a newly created user with configured password to login', async () => {
    await createUser({
      username: 'qa_login_user',
      real_name: 'QA测试用户',
      email: 'qa-login@example.com',
      phone: '13900009999',
      is_active: true,
      password: 'qaPass123',
      group_name: '测试团队',
      roles: [{ role_id: '4', role_name: '业务员' }],
    });

    const res = await login({ username: 'qa_login_user', password: 'qaPass123' });

    expect(res.user.username).toBe('qa_login_user');
    expect(res.roles.map((r) => r.code)).toContain('business_group_member');
    expect(res.roles.map((r) => r.code)).not.toContain('admin');
  });

  it('rejects invalid passwords and does not create a mock session', async () => {
    await expect(login({ username: 'jianglu', password: 'wrong-password' })).rejects.toThrow();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
