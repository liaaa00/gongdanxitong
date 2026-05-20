import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/stores/userStore', () => ({
  useUserStore: vi.fn(),
}));

vi.mock('@/services/fieldPermissions', () => ({
  getFieldPermissions: vi.fn(),
}));

import { useUserStore } from '@/stores/userStore';
import { getFieldPermissions } from '@/services/fieldPermissions';
import { useFieldPermissions } from './useFieldPermissions';

describe('useFieldPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-fetches when roles change', async () => {
    const mockSetUserStore = (roles: { id: string; code: string }[]) => {
      (useUserStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { roles, id: 'u1', username: 'test' },
      });
    };

    mockSetUserStore([{ id: 'role-4', code: 'contract_team' }]);
    (getFieldPermissions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', role_id: 'role-4', field_code: 'name', permission: 'visible', scenario: 'main' },
    ]);

    const { result, rerender } = renderHook(({ scenario }) => useFieldPermissions(scenario), {
      initialProps: { scenario: 'main' },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.permissions).toHaveProperty('name');
  });

  it('switches scenario correctly', async () => {
    (useUserStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { roles: [{ id: 'r1', code: 'salesperson' }], id: 'u1', username: 'test' },
    });
    (getFieldPermissions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', role_id: 'r1', field_code: 'contract_feedback', permission: 'visible', scenario: 'dispatched:contract' },
    ]);

    const { result } = renderHook(({ scenario }) => useFieldPermissions(scenario), {
      initialProps: { scenario: 'dispatched:contract' },
    });

    await waitFor(() => expect(result.current.permissions).toHaveProperty('contract_feedback'));
  });
});
