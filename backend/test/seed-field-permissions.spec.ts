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

  it('makes the approved 34 social-insurance input fields editable for the specialist', async () => {
    const socialInputFields = [
      'customer_name', 'customer_code', 'outsource_type', 'position', 'position_type',
      'employee_name', 'id_card_type', 'id_card_no', 'gender', 'birth_date', 'age',
      'household_type', 'ethnicity', 'education', 'graduation_school', 'major',
      'graduation_date', 'marital_status', 'mobile', 'email', 'current_address',
      'household_address', 'postal_code', 'social_location', 'start_month',
      'social_base', 'fund_base', 'fund_ratio', 'bank_name', 'bank_account',
      'remark', 'business_mode', 'need_company_payroll', 'payroll_location',
    ];
    const handlingFields = [
      'social_insurance_result',
      'social_insurance_remark',
      'medical_insurance_result',
      'housing_fund_result',
    ];
    const roles = [{ id: 'role-social', code: 'social_insurance_specialist' }];
    const fields = [...socialInputFields, ...handlingFields].map((fieldCode) => ({
      fieldCode,
      orderType: OrderType.ONBOARDING,
      businessContext: [OrderType.ONBOARDING],
    }));
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
    const templateRepo = { findOne: jest.fn().mockResolvedValue(null) };
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

    const socialPermissions = savedPermissions.filter((item) => (
      item.roleId === 'role-social'
      && item.scenario === 'dispatched:social_insurance'
    ));
    for (const fieldCode of [...socialInputFields, ...handlingFields]) {
      const rows = socialPermissions.filter((item) => item.fieldCode === fieldCode);
      expect(rows).toHaveLength(2);
      expect(rows.every((item) => item.permission === FieldPermissionMode.VISIBLE)).toBe(true);
    }
  });

  it('gives welfare specialists editable permissions wherever the scenario exposes a field', async () => {
    const roles = [{ id: 'role-welfare', code: 'welfare_specialist' }];
    const fields = [
      { fieldCode: 'employee_name', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING] },
      { fieldCode: 'social_insurance_result', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING] },
    ];
    const savedPermissions: Array<Record<string, unknown>> = [];
    const permissionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        savedPermissions.push(value);
        return value;
      }),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Role) return { find: jest.fn().mockResolvedValue(roles) };
        if (entity === FieldConfig) return { find: jest.fn().mockResolvedValue(fields) };
        if (entity === FieldPermission) return permissionRepo;
        if (entity === DetailViewTemplate) return { findOne: jest.fn().mockResolvedValue(null) };
        throw new Error('unexpected repository');
      }),
    };

    await seedFieldPermissions(dataSource as any);

    const exposed = savedPermissions.filter((item) => (
      item.roleId === 'role-welfare'
      && ['create:onboarding', 'dispatched:social_insurance'].includes(String(item.scenario))
      && item.permission !== FieldPermissionMode.HIDDEN
    ));
    expect(exposed.length).toBeGreaterThan(0);
    expect(exposed.every((item) => item.permission === FieldPermissionMode.VISIBLE)).toBe(true);
    expect(exposed.every((item) => (
      item.businessScope === 'beilun' || item.businessScope === 'out_of_province'
    ))).toBe(true);
  });
});
