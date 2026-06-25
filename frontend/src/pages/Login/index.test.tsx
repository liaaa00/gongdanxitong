import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './index';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navigate: vi.fn(),
  setToken: vi.fn(),
  setUser: vi.fn(),
  setMustChangePassword: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  login: (...args: unknown[]) => mocks.login(...args),
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    setToken: mocks.setToken,
    setUser: mocks.setUser,
    setMustChangePassword: mocks.setMustChangePassword,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@ant-design/pro-components', () => {
  const ProFormText = ({ name, fieldProps }: { name: string; fieldProps?: { placeholder?: string } }) => (
    <input name={name} placeholder={fieldProps?.placeholder} />
  );
  ProFormText.Password = ({ name, fieldProps }: { name: string; fieldProps?: { placeholder?: string } }) => (
    <input name={name} type="password" placeholder={fieldProps?.placeholder} />
  );

  return {
    LoginForm: ({ children, onFinish }: { children?: React.ReactNode; onFinish: (values: { username: string; password: string }) => Promise<void> }) => (
      <form onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        void onFinish({ username: String(formData.get('username') || ''), password: String(formData.get('password') || '') });
      }}>
        {children}
        <button type="submit">登录</button>
      </form>
    ),
    ProFormText,
  };
});

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...(actual as object),
    App: {
      ...((actual as Record<string, unknown>).App as object),
      useApp: () => ({ message: { success: mocks.messageSuccess, error: mocks.messageError } }),
    },
    theme: {
      ...((actual as Record<string, unknown>).theme as object),
      useToken: () => ({ token: { colorPrimary: '#1677ff', colorPrimaryBg: '#e6f4ff', colorTextSecondary: '#666' } }),
    },
  };
});

function makeLoginResponse(mustChangePassword: boolean, options?: { camelCaseOnly?: boolean }) {
  const response = {
    token: 'token-1',
    accessToken: 'access-token-1',
    refreshToken: 'refresh-token-1',
    user: {
      id: 'u-1',
      username: 'jianglu',
      real_name: '江璐',
      email: '',
      phone: '',
      avatar_url: null,
      is_active: true,
      roles: [{ id: 'r-1', code: 'shared_team_owner', name: '共享团队负责人', level: '' }],
      permissions: [],
    },
    roles: [{ id: 'r-1', code: 'shared_team_owner', name: '共享团队负责人', level: '' }],
    permissions: [],
    must_change_password: options?.camelCaseOnly ? undefined : mustChangePassword,
    mustChangePassword: options?.camelCaseOnly ? mustChangePassword : undefined,
  };
  return response;
}

describe('LoginPage mustChangePassword synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores mustChangePassword and redirects first-login users to change-password', async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue(makeLoginResponse(true));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText('用户名'), 'jianglu');
    await user.type(screen.getByPlaceholderText('密码'), '123456');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ username: 'jianglu', password: '123456' }));
    expect(mocks.setToken).toHaveBeenCalledWith('access-token-1', 'refresh-token-1');
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ must_change_password: true, mustChangePassword: true }));
    expect(mocks.setMustChangePassword).toHaveBeenCalledWith(true);
    expect(mocks.navigate).toHaveBeenCalledWith('/change-password', { replace: true });
  });

  it('also syncs camelCase mustChangePassword and redirects normal users to dashboard', async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue(makeLoginResponse(false, { camelCaseOnly: true }));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText('用户名'), 'jianglu');
    await user.type(screen.getByPlaceholderText('密码'), 'changedPass123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ must_change_password: false, mustChangePassword: false })));
    expect(mocks.setMustChangePassword).toHaveBeenCalledWith(false);
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('shows the backend error message when credentials are wrong', async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValue(new Error('用户名或密码错误'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText('用户名'), 'jianglu');
    await user.type(screen.getByPlaceholderText('密码'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('用户名或密码错误'));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.setToken).not.toHaveBeenCalled();
  });
});
