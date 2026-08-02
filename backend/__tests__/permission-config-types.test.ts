import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  FieldViewMode,
  RoleLevel,
  type PermissionChangeLog,
  type PermissionConfig,
  type PermissionConfigVersion,
  type RolePermissionSummary,
} from '../src/modules/permission-center/types/permission-config.types';

const permissionConfig = {
  version: '1.0.0',
  roles: [
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      code: 'biz_manager',
      name: '业务负责人',
      canonicalCode: 'business_owner',
      isActive: true,
      level: RoleLevel.MANAGEMENT,
    },
  ],
  routePermissions: [
    {
      path: '/work-orders',
      allowedRoles: ['business_owner'],
      backendActions: ['route.work_orders'],
      menu: { title: '工单管理', parentPath: '/work-orders' },
    },
  ],
  fieldPermissions: [
    {
      scenario: 'dispatched:contract',
      roleFieldRules: {
        business_owner: {
          employee_name: FieldViewMode.VISIBLE,
          id_card: FieldViewMode.MASKED,
          customer_code: FieldViewMode.READONLY,
          internal_note: FieldViewMode.HIDDEN,
        },
      },
    },
  ],
} satisfies PermissionConfig;

describe('permission configuration TypeScript contracts', () => {
  it('infers the complete permission hierarchy', () => {
    expectTypeOf(permissionConfig).toExtend<PermissionConfig>();
    expectTypeOf(permissionConfig.roles[0].level).toEqualTypeOf<'management'>();
    expectTypeOf(permissionConfig.fieldPermissions[0].roleFieldRules.business_owner.id_card)
      .toEqualTypeOf<'masked'>();

    expect(permissionConfig.routePermissions[0].menu.parentPath).toBe('/work-orders');
  });

  it('enforces field mode and role level constraints', () => {
    expectTypeOf<'visible'>().toExtend<FieldViewMode>();
    expectTypeOf<'editable'>().not.toExtend<FieldViewMode>();
    expectTypeOf<'management'>().toExtend<RoleLevel>();
    expectTypeOf<'unknown-level'>().not.toExtend<RoleLevel>();
  });

  it('keeps version, audit and summary records mutually consistent', () => {
    const version: PermissionConfigVersion = {
      id: 'version-id',
      version: '1.0.0',
      config: permissionConfig,
      isActive: true,
      createdBy: 'user-id',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    const log: PermissionChangeLog = {
      id: 'log-id',
      versionId: version.id,
      changeType: 'activate_version',
      targetResource: version.id,
      newValue: { isActive: true },
      changedBy: 'user-id',
      changedAt: new Date('2026-08-02T01:00:00.000Z'),
    };
    const summary: RolePermissionSummary = {
      roleCode: 'business_owner',
      roleName: '业务负责人',
      allowedRoutes: ['/work-orders'],
      backendActions: ['route.work_orders'],
      fieldPermissionScenarios: ['dispatched:contract'],
    };

    expectTypeOf(log.changeType).toEqualTypeOf<PermissionChangeLog['changeType']>();
    expect(log.versionId).toBe(version.id);
    expect(summary.fieldPermissionScenarios).toContain('dispatched:contract');
  });
});
