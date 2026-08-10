import { QueryRunner } from 'typeorm';
import { ProvisionWelfareSpecialists20260810001000 } from 'src/database/migrations/20260810001000-ProvisionWelfareSpecialists';

const USERNAMES = [
  'chenli',
  'yangyi',
  'daijunxiang',
  'zhumin',
  'fangzhiying',
  'heyitian',
  'xuxiaofen',
  'yangxiaohan',
  'yangjie',
];

const ROLE_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'welfare_specialist',
  name: '福保专员',
  level: 'execution',
  description: 'approved',
  is_active: true,
};

const VERIFICATION_ROW = {
  user_count: '9',
  role_link_count: '9',
  admin_permission_count: '100',
  welfare_permission_count: '100',
  missing_permission_count: '0',
  mapping_count: '28',
  mapping_handler_count: '9',
  conflicting_mapping_count: '0',
};

function makeQueryRunner(activeRows: Array<Record<string, unknown>> = []) {
  let insertedVersionIndex = 0;
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('WITH expected_mappings AS')) return [VERIFICATION_ROW];
    if (sql.includes('SELECT id, code, name, level, description, is_active')) return [ROLE_ROW];
    if (sql.includes('SELECT DISTINCT ON (business_scope)')) return activeRows;
    if (sql.includes('INSERT INTO permission_config_versions')) {
      insertedVersionIndex += 1;
      return [{ id: `version-${insertedVersionIndex}` }];
    }
    return [];
  });
  return { query } as unknown as QueryRunner & { query: jest.Mock };
}

describe('ProvisionWelfareSpecialists20260810001000 migration', () => {
  it('provisions only the approved role, accounts, mappings and admin-equivalent field matrix', async () => {
    const queryRunner = makeQueryRunner();
    const migration = new ProvisionWelfareSpecialists20260810001000();

    await migration.up(queryRunner);

    const calls = queryRunner.query.mock.calls;
    expect(calls).toHaveLength(10);
    expect(calls[0][0]).toContain('INSERT INTO roles');
    expect(calls[2][0]).toContain('INSERT INTO users');
    expect(calls[2][0]).toContain('ON CONFLICT (username) DO UPDATE');
    expect(calls[2][0]).not.toContain('password_hash = EXCLUDED.password_hash');
    expect(calls[2][0]).toContain("WHERE users.business_scope = 'out_of_province'");
    expect(calls[3][0]).toContain('INSERT INTO user_roles');
    expect(calls[3][1][0]).toEqual(USERNAMES);
    expect(calls[4][0]).toContain('UPDATE module_handlers target');
    expect(calls[5][0]).toContain('INSERT INTO module_handlers');
    expect(calls[5][1][0]).toContain('out_of_province_dispatch__福建__厦门');
    expect(JSON.parse(calls[5][1][0])).toHaveLength(28);
    expect(calls[6][0]).toContain("admin_role.code = 'admin'");
    expect(calls[6][0]).toContain('ON CONFLICT (role_id, field_code, scenario, business_scope)');
    expect(calls[7][0]).toContain('conflicting_mapping_count');
  });

  it('derives scope-specific active permission versions without broadening Beilun access', async () => {
    const sourceConfig = {
      version: '1.0.0',
      roles: [ROLE_ROW],
      routePermissions: [
        { path: '/renewal', allowedRoles: ['admin', 'welfare_specialist'] },
        { path: '/in-service/certificates', allowedRoles: ['admin', 'welfare_specialist'] },
        { path: '/out-of-province/increase', allowedRoles: ['admin'] },
      ],
      fieldPermissions: [{
        scenario: 'create:in_service',
        roleFieldRules: {
          admin: { employee_name: 'visible', id_card_no: 'visible' },
          welfare_specialist: { employee_name: 'hidden' },
        },
      }],
    };
    const queryRunner = makeQueryRunner([
      {
        id: '22222222-2222-4222-8222-222222222222',
        config: sourceConfig,
        business_scope: 'beilun',
        created_by: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        config: sourceConfig,
        business_scope: 'out_of_province',
        created_by: null,
      },
    ]);
    const migration = new ProvisionWelfareSpecialists20260810001000();

    await migration.up(queryRunner);

    const versionCalls = queryRunner.query.mock.calls.filter(
      ([sql]) => String(sql).includes('INSERT INTO permission_config_versions'),
    );
    expect(versionCalls).toHaveLength(2);
    expect(versionCalls.map(([, params]) => params[0])).toEqual([
      '1.1.1-welfare-beilun',
      '1.1.1-welfare-province',
    ]);
    const configs = new Map(versionCalls.map(([, params]) => [
      params[4],
      JSON.parse(params[1]),
    ]));
    const beilun = configs.get('beilun');
    const province = configs.get('out_of_province');
    const pathsFor = (config: typeof sourceConfig) => config.routePermissions
      .filter((route) => route.allowedRoles.includes('welfare_specialist'))
      .map((route) => route.path);

    expect(beilun.version).toBe('1.1.1-welfare-beilun');
    expect(province.version).toBe('1.1.1-welfare-province');
    expect(pathsFor(beilun)).toEqual(['/dashboard', '/profile']);
    expect(pathsFor(province)).toEqual(expect.arrayContaining([
      '/dashboard',
      '/profile',
      '/out-of-province',
      '/out-of-province/orders',
      '/out-of-province/orders/:id',
      '/out-of-province/increase',
      '/out-of-province/increase/:id',
      '/out-of-province/decrease',
      '/out-of-province/decrease/:id',
      '/out-of-province/single-business',
      '/out-of-province/single-business/:id',
    ]));
    expect(pathsFor(province)).not.toContain('/renewal');
    expect(pathsFor(province)).not.toContain('/in-service/certificates');
    expect(province.fieldPermissions[0].roleFieldRules.welfare_specialist).toEqual(
      province.fieldPermissions[0].roleFieldRules.admin,
    );
  });

  it('does not delete provisioned identities during migration rollback', async () => {
    const queryRunner = makeQueryRunner();
    const migration = new ProvisionWelfareSpecialists20260810001000();

    await migration.down(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');
    expect(queryRunner.query.mock.calls[0][1]).toEqual([[
      '1.1.1-welfare-beilun',
      '1.1.1-welfare-province',
    ]]);
    expect(sql).not.toContain('DELETE FROM users');
    expect(sql).not.toContain('DELETE FROM user_roles');
    expect(sql).not.toContain('DELETE FROM roles');
  });
});
