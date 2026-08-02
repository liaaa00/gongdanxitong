import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

const SCHEMA_PATH = resolve(process.cwd(), '../config/permission-schema.json');

function createValidator(): ValidateFunction {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object;
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return ajv.compile(schema);
}

function makeValidConfig() {
  return {
    version: '1.0.0',
    roles: [
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        code: 'biz_manager',
        name: '业务负责人',
        canonicalCode: 'business_owner',
        isActive: true,
        level: 'management',
      },
    ],
    routePermissions: [
      {
        path: '/work-orders/:id',
        allowedRoles: ['business_owner'],
        backendActions: ['route.work_orders', 'work_order.view'],
        menu: { title: '工单管理', parentPath: '/work-orders' },
      },
    ],
    fieldPermissions: [
      {
        scenario: 'dispatched:contract',
        roleFieldRules: {
          business_owner: {
            employee_name: 'visible',
            id_card: 'masked',
            internal_note: 'hidden',
            customer_code: 'readonly',
          },
        },
      },
    ],
  };
}

function expectInvalid(validate: ValidateFunction, config: unknown, keyword: string) {
  expect(validate(config)).toBe(false);
  expect((validate.errors ?? []).map((error: ErrorObject) => error.keyword)).toContain(keyword);
}

describe('permission configuration JSON Schema', () => {
  const validate = createValidator();

  it('accepts a complete permission configuration', () => {
    expect(validate(makeValidConfig())).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects a missing required section', () => {
    const config = makeValidConfig();
    delete (config as Partial<typeof config>).routePermissions;

    expectInvalid(validate, config, 'required');
  });

  it.each([
    ['invalid semantic version', (config: ReturnType<typeof makeValidConfig>) => { config.version = '1.0'; }, 'pattern'],
    ['invalid UUID type', (config: ReturnType<typeof makeValidConfig>) => { config.roles[0].id = 'not-a-uuid'; }, 'format'],
    ['boolean type mismatch', (config: ReturnType<typeof makeValidConfig>) => { (config.roles[0] as { isActive: unknown }).isActive = 'yes'; }, 'type'],
    ['empty allowed roles', (config: ReturnType<typeof makeValidConfig>) => { config.routePermissions[0].allowedRoles = []; }, 'minItems'],
    ['unsupported field mode', (config: ReturnType<typeof makeValidConfig>) => { config.fieldPermissions[0].roleFieldRules.business_owner.id_card = 'editable'; }, 'enum'],
  ])('rejects %s', (_label, mutate, keyword) => {
    const config = makeValidConfig();
    mutate(config);

    expectInvalid(validate, config, keyword);
  });
});
