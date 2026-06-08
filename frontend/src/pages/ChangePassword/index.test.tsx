import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordPage from './index';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  navigate: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  changePassword: (...args: unknown[]) => mocks.changePassword(...args),
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({ setUser: mocks.setUser }),
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
        message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
      }),
    },
  };
});

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changePassword.mockResolvedValue(undefined);
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

    await user.clear(passwordInputs[0]);
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
  });
});
