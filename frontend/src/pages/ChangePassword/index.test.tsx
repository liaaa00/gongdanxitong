import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordPage from './index';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  logoutApi: vi.fn(),
  navigate: vi.fn(),
  storeLogout: vi.fn(),
  fetchUser: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  changePassword: (...args: unknown[]) => mocks.changePassword(...args),
  logout: (...args: unknown[]) => mocks.logoutApi(...args),
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    user: null,
    mustChangePassword: false,
    logout: mocks.storeLogout,
    isLoggedIn: false,
    loading: false,
    fetchUser: mocks.fetchUser,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...(actual as object),
    App: {
      ...((actual as Record<string, unknown>).App as object),
      useApp: () => ({
        message: { success: vi.fn(), error: mocks.messageError, info: vi.fn(), warning: vi.fn() },
      }),
    },
  };
});

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changePassword.mockResolvedValue(undefined);
    mocks.logoutApi.mockResolvedValue(undefined);
  });

  it('submits oldPassword/newPassword DTO fields to auth service', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs).toHaveLength(3);
    expect(passwordInputs[0]).toHaveValue('');
    expect(screen.queryByText('当前密码（默认密码）')).not.toBeInTheDocument();

    await user.type(passwordInputs[0], '123456');
    await user.type(passwordInputs[1], 'Newpass123');
    await user.type(passwordInputs[2], 'Newpass123');
    await user.click(screen.getByRole('button', { name: /确认修改/ }));

    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledWith({
      oldPassword: '123456',
      newPassword: 'Newpass123',
    }));
    expect(mocks.changePassword.mock.calls[0][0]).not.toHaveProperty('old_password');
    expect(mocks.changePassword.mock.calls[0][0]).not.toHaveProperty('new_password');
    expect(mocks.logoutApi).toHaveBeenCalled();
    expect(mocks.storeLogout).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('shows the backend friendly error and keeps the session when password change fails', async () => {
    const user = userEvent.setup();
    mocks.changePassword.mockRejectedValueOnce({ _friendlyMsg: '旧密码不正确' });
    render(
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    await user.type(passwordInputs[0], 'wrong-password');
    await user.type(passwordInputs[1], 'Newpass123');
    await user.type(passwordInputs[2], 'Newpass123');
    await user.click(screen.getByRole('button', { name: /确认修改/ }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('旧密码不正确'));
    expect(mocks.logoutApi).not.toHaveBeenCalled();
    expect(mocks.storeLogout).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
