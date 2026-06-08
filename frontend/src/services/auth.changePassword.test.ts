import { afterEach, describe, expect, it, vi } from 'vitest';

async function importAuthWithMockMode(isMockMode: boolean) {
  vi.resetModules();
  const post = vi.fn().mockResolvedValue(undefined);
  const changeUserPassword = vi.fn();
  vi.doMock('./request', () => ({
    default: { post },
    getFriendlyErrorMessage: vi.fn(),
  }));
  vi.doMock('./mock', () => ({
    isMockMode,
    mockDelay: <T,>(data: T) => Promise.resolve(data),
  }));
  vi.doMock('./users', () => ({
    validateUserCredentials: vi.fn(),
    changeUserPassword,
  }));
  const auth = await import('./auth');
  return { auth, post, changeUserPassword };
}

describe('auth changePassword DTO', () => {
  afterEach(() => {
    vi.doUnmock('./request');
    vi.doUnmock('./mock');
    vi.doUnmock('./users');
    vi.resetModules();
    localStorage.clear();
  });

  it('posts backend DTO fields oldPassword/newPassword without snake_case keys', async () => {
    const { auth, post } = await importAuthWithMockMode(false);

    await auth.changePassword({ oldPassword: 'oldPass123', newPassword: 'newPass123' });

    expect(post).toHaveBeenCalledWith('/auth/change-password', {
      oldPassword: 'oldPass123',
      newPassword: 'newPass123',
    });
    expect(post.mock.calls[0][1]).not.toHaveProperty('old_password');
    expect(post.mock.calls[0][1]).not.toHaveProperty('new_password');
  });

  it('keeps mock compatibility for legacy snake_case callers', async () => {
    const { auth, changeUserPassword } = await importAuthWithMockMode(true);
    localStorage.setItem('mock_session_user_v1', JSON.stringify({ username: 'maoyani' }));

    await auth.changePassword({ old_password: '123456', new_password: 'Newpass123' });

    expect(changeUserPassword).toHaveBeenCalledWith('maoyani', '123456', 'Newpass123');
  });
});
