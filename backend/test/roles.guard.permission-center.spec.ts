import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_PERMISSION_KEY } from 'src/common/decorators/business-permission.decorator';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionConfig } from 'src/modules/permission-center/types/permission-config.types';

const makeConfig = (overrides: Partial<PermissionConfig> = {}): PermissionConfig => ({
  version: '1.0.0',
  roles: [
    {
      id: 'role-id',
      code: 'biz_member',
      canonicalCode: 'business_member',
      name: '业务员',
      isActive: true,
    },
  ],
  routePermissions: [
    {
      path: '/work-orders',
      allowedRoles: ['business_member'],
      backendActions: ['work_order.create'],
    },
  ],
  fieldPermissions: [],
  ...overrides,
});

const makeContext = (roles: string[]): ExecutionContext => ({
  getHandler: jest.fn(),
  getClass: jest.fn(),
  switchToHttp: () => ({
    getRequest: () => ({ user: { roles } }),
  }),
} as unknown as ExecutionContext);

const makeReflector = (
  businessPermission?: string,
  requiredRoles?: string[],
): Reflector => ({
  getAllAndOverride: jest.fn((key: string) => {
    if (key === BUSINESS_PERMISSION_KEY) return businessPermission;
    if (key === ROLES_KEY) return requiredRoles;
    return undefined;
  }),
} as unknown as Reflector);

describe('RolesGuard permission center migration', () => {
  it('uses active config route permissions before the legacy matrix', async () => {
    const legacy = { hasAnyRoleAction: jest.fn().mockResolvedValue(false) };
    const center = { getActiveConfig: jest.fn().mockResolvedValue(makeConfig()) };
    const guard = new RolesGuard(
      makeReflector('work_order.create'),
      legacy as never,
      center as never,
    );

    await expect(guard.canActivate(makeContext(['biz_member']))).resolves.toBe(true);
    expect(legacy.hasAnyRoleAction).not.toHaveBeenCalled();
  });

  it('denies a missing config permission instead of falling back', async () => {
    const legacy = { hasAnyRoleAction: jest.fn().mockResolvedValue(true) };
    const center = {
      getActiveConfig: jest.fn().mockResolvedValue(makeConfig({
        routePermissions: [{
          path: '/work-orders',
          allowedRoles: ['business_member'],
          backendActions: ['work_order.view'],
        }],
      })),
    };
    const guard = new RolesGuard(
      makeReflector('work_order.create'),
      legacy as never,
      center as never,
    );

    await expect(guard.canActivate(makeContext(['biz_member']))).rejects.toThrow('业务权限不足');
    expect(legacy.hasAnyRoleAction).not.toHaveBeenCalled();
  });

  it('falls back to the legacy matrix when the config center is unavailable', async () => {
    const legacy = { hasAnyRoleAction: jest.fn().mockResolvedValue(true) };
    const center = { getActiveConfig: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const guard = new RolesGuard(
      makeReflector('work_order.create'),
      legacy as never,
      center as never,
    );

    await expect(guard.canActivate(makeContext(['biz_member']))).resolves.toBe(true);
    expect(legacy.hasAnyRoleAction).toHaveBeenCalledWith(['biz_member'], 'work_order.create');
  });

  it('falls back to the checked-in baseline when the legacy store also fails', async () => {
    const legacy = { hasAnyRoleAction: jest.fn().mockRejectedValue(new Error('settings unavailable')) };
    const center = { getActiveConfig: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const guard = new RolesGuard(
      makeReflector('work_order.create'),
      legacy as never,
      center as never,
    );

    await expect(guard.canActivate(makeContext(['biz_member']))).resolves.toBe(true);
  });

  it('supports canonical role aliases for @Roles when config is active', async () => {
    const legacy = { hasAnyRoleAction: jest.fn() };
    const center = { getActiveConfig: jest.fn().mockResolvedValue(makeConfig()) };
    const guard = new RolesGuard(
      makeReflector(undefined, ['business_member']),
      legacy as never,
      center as never,
    );

    await expect(guard.canActivate(makeContext(['biz_member']))).resolves.toBe(true);
  });

  it('keeps two-argument construction and role checks compatible', async () => {
    const guard = new RolesGuard(makeReflector(undefined, ['admin']), {} as never);

    await expect(guard.canActivate(makeContext(['admin']))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext(['biz_member']))).rejects.toThrow('角色权限不足');
  });
});
