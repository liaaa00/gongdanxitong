import { Reflector } from '@nestjs/core';
import { PermissionCenterService } from 'src/modules/permission-center/services/permission-center.service';
import {
  RbacEngineService,
} from 'src/modules/permission-center/engine/rbac-engine.service';
import {
  REQUIRE_PERMISSION_KEY,
  RequirePermission,
} from 'src/modules/permission-center/engine/require-permission.decorator';
import { FieldViewMode, PermissionConfig } from 'src/modules/permission-center/types/permission-config.types';

const config: PermissionConfig = {
  version: '1.0.0',
  roles: [
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      code: 'biz_manager',
      canonicalCode: 'business_owner',
      name: '业务负责人',
      isActive: true,
    },
    {
      id: '123e4567-e89b-42d3-a456-426614174001',
      code: 'disabled_role',
      canonicalCode: 'disabled_role',
      name: 'Disabled',
      isActive: false,
    },
    {
      id: '123e4567-e89b-42d3-a456-426614174002',
      code: 'reader',
      canonicalCode: 'reader',
      name: 'Reader',
      isActive: true,
    },
  ],
  routePermissions: [
    {
      path: '/work-orders',
      allowedRoles: ['business_owner'],
      backendActions: ['work_order.create'],
    },
    {
      path: '/work-orders/:id',
      allowedRoles: ['reader'],
      backendActions: ['work_order.view'],
    },
    {
      path: '/admin/*',
      allowedRoles: ['business_owner'],
      backendActions: ['system.admin'],
    },
  ],
  fieldPermissions: [
    {
      scenario: 'dispatched:contract',
      roleFieldRules: {
        business_owner: {
          employee_name: FieldViewMode.VISIBLE,
          id_card: FieldViewMode.MASKED,
        },
        reader: {
          employee_name: FieldViewMode.READONLY,
          id_card: FieldViewMode.HIDDEN,
          customer_code: FieldViewMode.READONLY,
        },
      },
    },
  ],
};

describe('RbacEngineService', () => {
  let service: RbacEngineService;
  let permissionCenter: { getActiveConfig: jest.Mock };

  beforeEach(() => {
    permissionCenter = { getActiveConfig: jest.fn().mockResolvedValue(config) };
    service = new RbacEngineService(permissionCenter as unknown as PermissionCenterService);
  });

  it('checks actions using backend and canonical role aliases', async () => {
    await expect(service.canAccess(['biz_manager'], 'work_order.create')).resolves.toBe(true);
    await expect(service.canAccess(['business_owner'], 'work_order.create')).resolves.toBe(true);
    await expect(service.can({ roles: ['reader'] }, 'work_order.create')).resolves.toBe(false);
    await expect(service.canAccess(['disabled_role'], 'work_order.create')).resolves.toBe(false);
  });

  it('matches optional resources against route parameters and wildcards', async () => {
    await expect(service.canAccess(['reader'], 'work_order.view', '/work-orders/42')).resolves.toBe(true);
    await expect(service.canAccess(['reader'], 'work_order.view', '/work-orders')).resolves.toBe(false);
    await expect(service.can(['biz_manager'], 'system.admin', '/admin/users/42?tab=roles')).resolves.toBe(true);
    await expect(service.can(['biz_manager'], 'system.admin', '/work-orders')).resolves.toBe(false);
  });

  it('returns unique accessible routes in configuration order', async () => {
    await expect(service.getAccessibleRoutes(['biz_manager'])).resolves.toEqual(['/work-orders', '/admin/*']);
    await expect(service.getAccessibleRoutes(['unknown'])).resolves.toEqual([]);
  });

  it('merges field permissions with the existing permissiveness rank', async () => {
    await expect(service.getFieldPermissions(['biz_manager', 'reader'], 'dispatched:contract')).resolves.toEqual({
      employee_name: FieldViewMode.VISIBLE,
      id_card: FieldViewMode.MASKED,
      customer_code: FieldViewMode.READONLY,
    });
    await expect(service.getFieldPermissions(['reader'], 'missing')).resolves.toEqual({});
  });

  it('fails closed when there is no active configuration', async () => {
    permissionCenter.getActiveConfig.mockRejectedValue(new Error('not configured'));
    await expect(service.canAccess(['reader'], 'work_order.view')).resolves.toBe(false);
    await expect(service.getAccessibleRoutes(['reader'])).resolves.toEqual([]);
    await expect(service.getFieldPermissions(['reader'], 'dispatched:contract')).resolves.toEqual({});
  });

  it('exposes the required permission metadata decorator', () => {
    class ExampleController {
      @RequirePermission('work_order.create')
      create(): void {
        // Metadata-only method for the decorator contract.
      }
    }

    const reflector = new Reflector();
    expect(reflector.get(REQUIRE_PERMISSION_KEY, ExampleController.prototype.create)).toBe('work_order.create');
  });
});
