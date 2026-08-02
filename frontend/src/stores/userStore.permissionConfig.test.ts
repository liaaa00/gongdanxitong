import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canAccessPath, setDynamicPermissionConfig } from '@/config/routeVisibility';

const { getConfig, realtime } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  realtime: { subscribe: vi.fn(), close: vi.fn(), handler: undefined as (() => void) | undefined },
}));

vi.mock('@/services/permissionCenter', () => ({ getActivePermissionConfig: getConfig }));
vi.mock('@/services/permissionConfigRealtime', () => ({
  subscribePermissionConfigUpdates: realtime.subscribe,
  closePermissionConfigUpdates: realtime.close,
}));

import { useUserStore } from './userStore';

const config = (version: string, allowedRoles: string[]) => ({
  version,
  roles: [],
  routePermissions: [{ path: '/work-orders', allowedRoles }],
  fieldPermissions: [],
});

describe('userStore permission-center integration', () => {
  beforeEach(() => {
    getConfig.mockReset();
    realtime.subscribe.mockReset();
    realtime.close.mockReset();
    realtime.handler = undefined;
    realtime.subscribe.mockImplementation((handler: () => void) => {
      realtime.handler = handler;
      return vi.fn();
    });
    setDynamicPermissionConfig(null);
    useUserStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      isLoggedIn: false,
      loading: false,
      mustChangePassword: false,
      permissionConfig: null,
      permissionConfigLoading: false,
    });
  });

  afterEach(() => {
    useUserStore.getState().logout();
    setDynamicPermissionConfig(null);
  });

  it('loads dynamic routes and subscribes once after initialization', async () => {
    getConfig.mockResolvedValue(config('2.0.0', ['admin']));

    await useUserStore.getState().loadPermissionConfig();

    expect(useUserStore.getState().permissionConfig?.version).toBe('2.0.0');
    expect(canAccessPath('/work-orders', [{ code: 'business_group_member' }])).toBe(false);
    expect(realtime.subscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps static route checks when the permission center is unavailable', async () => {
    getConfig.mockRejectedValue(new Error('offline'));

    await useUserStore.getState().loadPermissionConfig();

    expect(useUserStore.getState().permissionConfig).toBeNull();
    expect(canAccessPath('/work-orders', [{ code: 'business_group_member' }])).toBe(true);
    expect(realtime.subscribe).not.toHaveBeenCalled();
  });

  it('reloads configuration after a Socket.IO update event', async () => {
    getConfig.mockResolvedValueOnce(config('2.0.0', ['admin'])).mockResolvedValueOnce(config('2.0.1', ['business_group_member']));
    await useUserStore.getState().loadPermissionConfig();

    realtime.handler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getConfig).toHaveBeenCalledTimes(2);
    expect(useUserStore.getState().permissionConfig?.version).toBe('2.0.1');
    expect(canAccessPath('/work-orders', [{ code: 'business_group_member' }])).toBe(true);
  });
});
