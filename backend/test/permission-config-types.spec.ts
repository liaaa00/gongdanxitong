import {
  FieldViewMode,
  PermissionChangeLog,
  PermissionConfig,
  PermissionConfigVersion,
  RolePermissionSummary,
} from 'src/modules/permission-center/types/permission-config.types';

const permissionConfig: PermissionConfig = {
  version: '1.0.0',
  roles: [
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      code: 'biz_manager',
      name: '业务负责人',
      canonicalCode: 'business_owner',
      isActive: true,
    },
  ],
  routePermissions: [
    {
      path: '/work-orders',
      allowedRoles: ['business_owner'],
      backendActions: ['route.work_orders'],
      menu: { title: '工单管理', hidden: false },
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
};

describe('permission configuration TypeScript contracts', () => {
  it('represents the complete permission hierarchy', () => {
    expect(permissionConfig.roles[0].canonicalCode).toBe('business_owner');
    expect(permissionConfig.routePermissions[0].backendActions).toEqual(['route.work_orders']);
    expect(permissionConfig.fieldPermissions[0].roleFieldRules.business_owner).toEqual({
      employee_name: 'visible',
      id_card: 'masked',
      customer_code: 'readonly',
      internal_note: 'hidden',
    });
  });

  it('defines all field view modes as stable serialized values', () => {
    expect(Object.values(FieldViewMode)).toEqual(['visible', 'hidden', 'readonly', 'masked']);
  });

  it('types version, audit and query result records consistently', () => {
    const version: PermissionConfigVersion = {
      id: 'version-id',
      version: '1.0.0',
      config: permissionConfig,
      isActive: true,
      createdBy: 'user-id',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      activatedAt: new Date('2026-08-02T01:00:00.000Z'),
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
      accessibleRoutes: ['/work-orders'],
      businessActions: ['route.work_orders'],
      fieldPermissions: {
        'dispatched:contract': { employee_name: FieldViewMode.VISIBLE },
      },
    };

    expect(log.versionId).toBe(version.id);
    expect(summary.fieldPermissions['dispatched:contract'].employee_name).toBe(FieldViewMode.VISIBLE);
  });
});
