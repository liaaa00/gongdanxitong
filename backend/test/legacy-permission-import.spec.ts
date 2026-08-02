import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import {
  buildLegacyPermissionConfig,
  LegacyPermissionBaseline,
  parseStoredRoleActionPermissions,
} from 'src/database/legacy-permission-import';

const baseline = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../src/database/migrations/legacy-permission-baseline.json',
    ),
    'utf8',
  ),
) as LegacyPermissionBaseline;

describe('legacy permission config import', () => {
  it('builds a schema-valid config from routes, action overrides and field rows', () => {
    const config = buildLegacyPermissionConfig({
      version: '1.0.0-legacy.20260802',
      baseline,
      roles: [
        {
          id: '123e4567-e89b-42d3-a456-426614174000',
          code: 'biz_manager',
          name: '业务负责人',
          level: 'management',
          description: 'Legacy business owner',
          is_active: true,
        },
        {
          id: '123e4567-e89b-42d3-a456-426614174001',
          code: 'admin',
          name: '管理员',
          level: 'global',
          is_active: true,
        },
      ],
      fieldPermissions: [
        {
          role_code: 'biz_manager',
          scenario: 'dispatched:contract',
          field_code: 'employee_name',
          permission: 'readonly',
        },
      ],
      storedRoleActionPermissions: parseStoredRoleActionPermissions(
        JSON.stringify({ roles: { biz_manager: ['work_order.view_all'] } }),
      ),
    });

    expect(config.roles[0]).toMatchObject({
      code: 'biz_manager',
      canonicalCode: 'business_owner',
    });
    expect(config.routePermissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/work-orders' })]),
    );
    const viewAllRule = config.routePermissions.find((rule) =>
      rule.backendActions?.includes('work_order.view_all'),
    );
    expect(viewAllRule?.allowedRoles).toEqual(
      expect.arrayContaining(['admin', 'business_owner']),
    );
    expect(config.fieldPermissions).toEqual([
      {
        scenario: 'dispatched:contract',
        roleFieldRules: {
          business_owner: { employee_name: 'readonly' },
        },
      },
    ]);

    const schema = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../config/permission-schema.json'),
        'utf8',
      ),
    ) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat(
      'uuid',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const validate = ajv.compile(schema);
    expect(validate(config)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects malformed stored matrices and non-semantic versions', () => {
    expect(() =>
      parseStoredRoleActionPermissions('{"roles":{"admin":"all"}}'),
    ).toThrow('must be a string array');
    expect(() =>
      buildLegacyPermissionConfig({
        version: 'legacy',
        baseline,
        roles: [],
        fieldPermissions: [],
      }),
    ).toThrow('must be semantic');
  });
});
