import AppDataSource from 'src/database/data-source';
import { seedFieldPermissions } from 'src/database/seeds/seed-field-permissions';
import {
  DetailViewTemplate,
  FieldConfig,
  FieldPermission,
  FieldPermissionMode,
  OrderType,
  Role,
} from 'src/entities';

describe('seedFieldPermissions contract business permissions', () => {
  it('registers detail templates in the standalone seed data source', () => {
    expect(AppDataSource.options.entities).toContain(DetailViewTemplate);
  });

  it('makes configured contract fields editable only for business members', async () => {
    const roles = [
      { id: 'role-member', code: 'biz_member' },
      { id: 'role-leader', code: 'business_group_leader' },
    ];
    const fields = [
      { fieldCode: 'employee_name', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING] },
      { fieldCode: 'bank_name', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING] },
    ];
    const savedPermissions: Array<Record<string, unknown>> = [];
    const roleRepo = { find: jest.fn().mockResolvedValue(roles) };
    const fieldRepo = { find: jest.fn().mockResolvedValue(fields) };
    const permissionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        savedPermissions.push(value);
        return value;
      }),
    };
    const templateRepo = {
      findOne: jest.fn().mockResolvedValue({ fieldList: [{ fieldCode: 'employee_name' }] }),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Role) return roleRepo;
        if (entity === FieldConfig) return fieldRepo;
        if (entity === FieldPermission) return permissionRepo;
        if (entity === DetailViewTemplate) return templateRepo;
        throw new Error('unexpected repository');
      }),
    };

    await seedFieldPermissions(dataSource as any);

    const contractPermission = (roleId: string, fieldCode: string) => savedPermissions.find((item) => (
      item.roleId === roleId
      && item.fieldCode === fieldCode
      && item.scenario === 'dispatched:contract'
    ));
    expect(contractPermission('role-member', 'employee_name')?.permission).toBe(FieldPermissionMode.VISIBLE);
    expect(contractPermission('role-member', 'bank_name')?.permission).toBe(FieldPermissionMode.HIDDEN);
    expect(contractPermission('role-leader', 'employee_name')?.permission).toBe(FieldPermissionMode.READONLY);

    const scenarioPermission = (roleId: string, scenario: string) => savedPermissions.find((item) => (
      item.roleId === roleId
      && item.fieldCode === 'employee_name'
      && item.scenario === scenario
    ));
    expect(scenarioPermission('role-member', 'dispatched:onboarding_contact')?.permission).toBe(FieldPermissionMode.READONLY);
    expect(scenarioPermission('role-member', 'dispatched:data_entry')?.permission).toBe(FieldPermissionMode.READONLY);
    expect(scenarioPermission('role-member', 'dispatched:social_insurance')?.permission).toBe(FieldPermissionMode.READONLY);
  });
});
