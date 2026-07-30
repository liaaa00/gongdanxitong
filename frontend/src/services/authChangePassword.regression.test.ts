import { describe, expect, it, vi } from 'vitest';

const postMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('./request', () => ({
  default: {
    post: postMock,
  },
  getFriendlyErrorMessage: vi.fn(),
}));

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: vi.fn(),
}));

vi.mock('./users', () => ({
  validateUserCredentials: vi.fn(),
  changeUserPassword: vi.fn(),
  getUserPasswordStatus: vi.fn(() => ({ must_change_password: false, password_updated_at: null })),
}));

describe('QA regression: auth changePassword payload', () => {
  it('posts backend DTO fields oldPassword/newPassword without snake_case keys', async () => {
    const { changePassword } = await import('./auth');

    await changePassword({ oldPassword: 'old-pass-123', newPassword: 'new-pass-456' });

    expect(postMock).toHaveBeenCalledWith('/auth/change-password', {
      oldPassword: 'old-pass-123',
      newPassword: 'new-pass-456',
    }, { silentError: true });
    const [, payload] = postMock.mock.calls[0];
    expect(payload).not.toHaveProperty('old_password');
    expect(payload).not.toHaveProperty('new_password');
  });
});
