import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestGet, requestPost } = vi.hoisted(() => ({
  requestGet: vi.fn(),
  requestPost: vi.fn(),
}));

vi.mock('./mock', () => ({ isMockMode: false, mockDelay: vi.fn() }));
vi.mock('./request', () => ({
  default: { get: requestGet, post: requestPost },
}));

import {
  activatePermissionVersion,
  createPermissionVersion,
  getActivePermissionConfig,
  getPermissionVersion,
  getPermissionVersions,
  type PermissionConfig,
} from './permissionCenter';

const config: PermissionConfig = {
  version: '1.2.3',
  roles: [],
  routePermissions: [],
  fieldPermissions: [],
};

describe('permission center service', () => {
  beforeEach(() => {
    requestGet.mockReset();
    requestPost.mockReset();
  });

  it('uses the permission-center API without duplicating the global api prefix', async () => {
    requestGet.mockResolvedValueOnce(config);

    await expect(getActivePermissionConfig()).resolves.toEqual(config);

    expect(requestGet).toHaveBeenCalledWith('/permission-center/config');
  });

  it('normalizes version entity snake_case fields', async () => {
    requestGet.mockResolvedValueOnce([{
      id: 'v1',
      version: '1.2.3',
      config,
      is_active: true,
      created_at: '2026-08-02T01:00:00Z',
      activated_at: '2026-08-02T02:00:00Z',
      description: 'active version',
    }]);

    const versions = await getPermissionVersions();

    expect(versions[0]).toMatchObject({
      id: 'v1',
      isActive: true,
      createdAt: '2026-08-02T01:00:00Z',
      activatedAt: '2026-08-02T02:00:00Z',
    });
    expect(requestGet).toHaveBeenCalledWith('/permission-center/versions');
  });

  it('creates, reads and activates versions through the documented endpoints', async () => {
    requestPost.mockResolvedValueOnce({
      id: 'v2', version: '1.2.4', config: { ...config, version: '1.2.4' }, is_active: false, created_at: 'now',
    });
    requestGet.mockResolvedValueOnce({
      id: 'v2', version: '1.2.4', config: { ...config, version: '1.2.4' }, is_active: false, created_at: 'now',
    });
    requestPost.mockResolvedValueOnce({ message: 'ok' });

    await createPermissionVersion({ ...config, version: '1.2.4' }, 'route update');
    await getPermissionVersion('v2');
    await activatePermissionVersion('v2');

    expect(requestPost).toHaveBeenNthCalledWith(1, '/permission-center/config', {
      config: { ...config, version: '1.2.4' },
      description: 'route update',
    });
    expect(requestGet).toHaveBeenCalledWith('/permission-center/versions/v2');
    expect(requestPost).toHaveBeenNthCalledWith(2, '/permission-center/config/v2/activate');
  });
});
