import { MigrationInterface, QueryRunner } from 'typeorm';

const WELFARE_ROLE_CODE = 'welfare_specialist';
const WELFARE_PERMISSION_VERSIONS = {
  beilun: '1.1.1-welfare-beilun',
  out_of_province: '1.1.1-welfare-province',
} as const;
const TEMPORARY_PASSWORD_HASH = '$2b$10$t86lP7yfIqyYvpkJmLkSpOeE3W/7hRR07j/j0FtEw2ZP5q7RALrKe';

const WELFARE_USERS = [
  ['chenli', '陈丽'],
  ['yangyi', '杨易'],
  ['daijunxiang', '戴俊祥'],
  ['zhumin', '朱敏'],
  ['fangzhiying', '方志英'],
  ['heyitian', '何依恬'],
  ['xuxiaofen', '徐晓芬'],
  ['yangxiaohan', '羊晓焓'],
  ['yangjie', '杨杰'],
] as const;

const WELFARE_PROVINCE_MAPPINGS = [
  ['广东', 'chenli'],
  ['安徽', 'chenli'],
  ['黑龙江', 'yangyi'],
  ['河北', 'yangyi'],
  ['贵州', 'yangyi'],
  ['重庆', 'daijunxiang'],
  ['江苏', 'daijunxiang'],
  ['湖北', 'zhumin'],
  ['四川', 'zhumin'],
  ['广西', 'zhumin'],
  ['海南', 'zhumin'],
  ['江西', 'fangzhiying'],
  ['云南', 'fangzhiying'],
  ['吉林', 'fangzhiying'],
  ['甘肃', 'fangzhiying'],
  ['山西', 'heyitian'],
  ['山东', 'heyitian'],
  ['新疆', 'heyitian'],
  ['北京', 'xuxiaofen'],
  ['陕西', 'xuxiaofen'],
  ['辽宁', 'xuxiaofen'],
  ['天津', 'yangxiaohan'],
  ['福建', 'yangxiaohan'],
  ['上海', 'yangjie'],
  ['湖南', 'yangjie'],
  ['河南', 'yangjie'],
  ['宁夏', 'yangjie'],
] as const;

const WELFARE_HANDLER_ROWS = [
  ...WELFARE_PROVINCE_MAPPINGS.map(([province, username]) => ({
    moduleCode: `out_of_province_dispatch__${province}`,
    username,
  })),
  { moduleCode: 'out_of_province_dispatch__福建__厦门', username: 'yangjie' },
] as const;

interface RoleDefinition {
  id: string;
  code: string;
  name: string;
  canonicalCode: string;
  isActive: boolean;
  description?: string;
  level?: string;
}

interface RoutePermission {
  path: string;
  allowedRoles: string[];
  backendActions?: string[];
  menu?: Record<string, unknown>;
}

interface FieldPermissionRule {
  scenario: string;
  description?: string;
  roleFieldRules: Record<string, Record<string, string>>;
}

interface PermissionConfig {
  version: string;
  roles: RoleDefinition[];
  routePermissions: RoutePermission[];
  fieldPermissions: FieldPermissionRule[];
  metadata?: Record<string, unknown>;
}

interface ActivePermissionRow {
  id: string;
  config: PermissionConfig;
  business_scope: 'beilun' | 'out_of_province';
  created_by: string | null;
}

const SHARED_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/dashboard', ['route.dashboard']],
  ['/profile', []],
];

const BEILUN_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ...SHARED_ROUTES,
];

const OUT_OF_PROVINCE_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ...SHARED_ROUTES,
  ['/out-of-province', ['route.work_orders', 'work_order.view']],
  ['/out-of-province/orders', ['route.work_orders', 'work_order.view']],
  ['/out-of-province/orders/:id', ['route.work_order_detail', 'work_order.view']],
  ['/out-of-province/increase', ['route.work_orders', 'work_order.view']],
  ['/out-of-province/increase/:id', ['route.work_order_detail', 'work_order.view']],
  ['/out-of-province/decrease', ['route.work_orders', 'work_order.view']],
  ['/out-of-province/decrease/:id', ['route.work_order_detail', 'work_order.view']],
  ['/out-of-province/single-business', ['route.work_orders', 'work_order.view']],
  ['/out-of-province/single-business/:id', ['route.work_order_detail', 'work_order.view']],
];

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function addWelfareRoleToPermissionConfig(
  source: PermissionConfig,
  role: RoleDefinition,
  businessScope: 'beilun' | 'out_of_province',
): PermissionConfig {
  const allowedRoutes = businessScope === 'out_of_province'
    ? OUT_OF_PROVINCE_ROUTES
    : BEILUN_ROUTES;
  const allowedPaths = new Set(allowedRoutes.map(([path]) => path));

  const routePermissions = (source.routePermissions ?? [])
    .map((route) => ({
      ...route,
      allowedRoles: (route.allowedRoles ?? []).filter((code) => code !== WELFARE_ROLE_CODE),
    }))
    .filter((route) => route.allowedRoles.length > 0);

  for (const [path, backendActions] of allowedRoutes) {
    const route = routePermissions.find((candidate) => candidate.path === path);
    if (route) {
      route.allowedRoles = unique([...route.allowedRoles, WELFARE_ROLE_CODE]);
      if (backendActions.length > 0) {
        route.backendActions = unique([...(route.backendActions ?? []), ...backendActions]);
      }
      continue;
    }
    routePermissions.push({
      path,
      allowedRoles: [WELFARE_ROLE_CODE],
      ...(backendActions.length > 0 ? { backendActions: [...backendActions] } : {}),
    });
  }

  const fieldPermissions = (source.fieldPermissions ?? []).map((rule) => {
    const roleFieldRules = { ...(rule.roleFieldRules ?? {}) };
    delete roleFieldRules[WELFARE_ROLE_CODE];
    roleFieldRules[WELFARE_ROLE_CODE] = { ...(roleFieldRules.admin ?? {}) };
    return { ...rule, roleFieldRules };
  });

  return {
    ...source,
    version: WELFARE_PERMISSION_VERSIONS[businessScope],
    roles: [
      ...(source.roles ?? []).filter((candidate) => (
        candidate.code !== WELFARE_ROLE_CODE
        && candidate.canonicalCode !== WELFARE_ROLE_CODE
      )),
      role,
    ],
    routePermissions: routePermissions.filter((route) => (
      !route.allowedRoles.includes(WELFARE_ROLE_CODE) || allowedPaths.has(route.path)
    )),
    fieldPermissions,
    metadata: {
      ...(source.metadata ?? {}),
      updatedAt: new Date().toISOString(),
      comment: 'Provisioned welfare_specialist for nine approved province handlers',
    },
  };
}

export class ProvisionWelfareSpecialists20260810001000 implements MigrationInterface {
  name = 'ProvisionWelfareSpecialists20260810001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO roles (code, name, level, description, is_active)
       VALUES ($1, '福保专员', 'execution',
         '浙江自签团队省外办理人员：按省份和福建厦门城市规则处理省外增员、减员和单项业务。',
         true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             level = EXCLUDED.level,
             description = EXCLUDED.description,
             is_active = true`,
      [WELFARE_ROLE_CODE],
    );

    await queryRunner.query(
      `INSERT INTO departments (code, name, parent_id, sort_order, is_active, business_scope)
       SELECT source.code, source.name, NULL, source.sort_order, true, 'out_of_province'
       FROM departments source
       WHERE source.code = 'WELFARE_SECURITY'
         AND source.business_scope = 'beilun'
       ON CONFLICT (code, business_scope) DO UPDATE
         SET name = EXCLUDED.name,
             sort_order = EXCLUDED.sort_order,
             is_active = true`,
    );

    await queryRunner.query(
      `INSERT INTO users (
         username, real_name, email, phone, password_hash, avatar_url, is_active,
         business_scope, must_change_password, password_updated_at,
         auth_version, failed_login_attempts, locked_until
       )
       SELECT seed.username, seed.real_name, NULL, NULL, $1, NULL, true,
              'out_of_province', true, NULL, 0, 0, NULL
       FROM (VALUES
         ('chenli', '陈丽'),
         ('yangyi', '杨易'),
         ('daijunxiang', '戴俊祥'),
         ('zhumin', '朱敏'),
         ('fangzhiying', '方志英'),
         ('heyitian', '何依恬'),
         ('xuxiaofen', '徐晓芬'),
         ('yangxiaohan', '羊晓焓'),
         ('yangjie', '杨杰')
       ) AS seed(username, real_name)
       ON CONFLICT (username) DO UPDATE
         SET real_name = EXCLUDED.real_name,
             is_active = true
       WHERE users.business_scope = 'out_of_province'`,
      [TEMPORARY_PASSWORD_HASH],
    );

    await queryRunner.query(
      `INSERT INTO user_roles (user_id, role_id, department_id, is_primary)
       SELECT user_row.id, role_row.id, department_row.id, true
       FROM users user_row
       CROSS JOIN roles role_row
       CROSS JOIN departments department_row
       WHERE user_row.username = ANY($1::varchar[])
         AND role_row.code = $2
         AND department_row.code = 'WELFARE_SECURITY'
         AND department_row.business_scope = 'out_of_province'
       ON CONFLICT (user_id, role_id, department_id) DO UPDATE
         SET is_primary = true`,
      [WELFARE_USERS.map(([username]) => username), WELFARE_ROLE_CODE],
    );

    const handlerRowsJson = JSON.stringify(WELFARE_HANDLER_ROWS);
    await queryRunner.query(
      `WITH expected AS (
         SELECT "moduleCode" AS module_code, username
         FROM jsonb_to_recordset($1::jsonb) AS row("moduleCode" text, username text)
       )
       UPDATE module_handlers target
       SET is_active = false
       WHERE target.business_scope = 'out_of_province'
         AND target.module_code IN (SELECT module_code FROM expected)`,
      [handlerRowsJson],
    );
    await queryRunner.query(
      `WITH expected AS (
         SELECT "moduleCode" AS module_code, username
         FROM jsonb_to_recordset($1::jsonb) AS row("moduleCode" text, username text)
       ),
       resolved AS (
         SELECT expected.module_code, user_row.id AS handler_id
         FROM expected
         JOIN users user_row
           ON user_row.username = expected.username
          AND user_row.business_scope = 'out_of_province'
          AND user_row.is_active = true
       ),
       updated AS (
         UPDATE module_handlers target
         SET weight = 100,
             is_backup = false,
             is_active = true,
             rr_cursor_version = 0
         FROM resolved
         WHERE target.module_code = resolved.module_code
           AND target.business_scope = 'out_of_province'
           AND target.handler_id = resolved.handler_id
         RETURNING target.module_code, target.handler_id
       )
       INSERT INTO module_handlers (
         module_code, handler_id, weight, is_backup, is_active,
         rr_cursor_version, business_scope
       )
       SELECT resolved.module_code, resolved.handler_id, 100, false, true, 0, 'out_of_province'
       FROM resolved
       WHERE NOT EXISTS (
         SELECT 1
         FROM updated
         WHERE updated.module_code = resolved.module_code
           AND updated.handler_id = resolved.handler_id
       )`,
      [handlerRowsJson],
    );

    await queryRunner.query(
      `INSERT INTO field_permissions (
         role_id, field_code, permission, scenario, business_scope, created_at
       )
       SELECT welfare_role.id, permission.field_code, permission.permission,
              permission.scenario, permission.business_scope, now()
       FROM field_permissions permission
       JOIN roles admin_role ON admin_role.id = permission.role_id AND admin_role.code = 'admin'
       CROSS JOIN roles welfare_role
       WHERE welfare_role.code = $1
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
         SET permission = EXCLUDED.permission`,
      [WELFARE_ROLE_CODE],
    );

    const verificationRows = await queryRunner.query(
      `WITH expected_mappings AS (
         SELECT "moduleCode" AS module_code, username
         FROM jsonb_to_recordset($3::jsonb) AS row("moduleCode" text, username text)
       ),
       resolved_mappings AS (
         SELECT expected_mappings.module_code, user_row.id AS handler_id
         FROM expected_mappings
         JOIN users user_row
           ON user_row.username = expected_mappings.username
          AND user_row.business_scope = 'out_of_province'
       )
       SELECT
         COUNT(DISTINCT user_row.id) FILTER (
           WHERE user_row.business_scope = 'out_of_province' AND user_row.is_active = true
         ) AS user_count,
         COUNT(DISTINCT role_link.user_id) AS role_link_count,
         (SELECT COUNT(*)
          FROM field_permissions permission
          JOIN roles role_row ON role_row.id = permission.role_id
          WHERE role_row.code = 'admin') AS admin_permission_count,
         (SELECT COUNT(*)
          FROM field_permissions permission
          JOIN roles role_row ON role_row.id = permission.role_id
          WHERE role_row.code = $2) AS welfare_permission_count,
         (SELECT COUNT(*)
          FROM (
            SELECT permission.field_code, permission.permission, permission.scenario, permission.business_scope
            FROM field_permissions permission
            JOIN roles role_row ON role_row.id = permission.role_id
            WHERE role_row.code = 'admin'
            EXCEPT
            SELECT permission.field_code, permission.permission, permission.scenario, permission.business_scope
            FROM field_permissions permission
            JOIN roles role_row ON role_row.id = permission.role_id
            WHERE role_row.code = $2
          ) missing_permissions) AS missing_permission_count,
         (SELECT COUNT(DISTINCT handler.module_code)
          FROM module_handlers handler
          JOIN resolved_mappings expected
            ON expected.module_code = handler.module_code
           AND expected.handler_id = handler.handler_id
          WHERE handler.business_scope = 'out_of_province'
            AND handler.is_active = true
            AND handler.is_backup = false
            AND handler.weight = 100) AS mapping_count,
         (SELECT COUNT(DISTINCT handler.handler_id)
          FROM module_handlers handler
          JOIN resolved_mappings expected
            ON expected.module_code = handler.module_code
           AND expected.handler_id = handler.handler_id
          WHERE handler.business_scope = 'out_of_province'
            AND handler.is_active = true) AS mapping_handler_count,
         (SELECT COUNT(*)
          FROM module_handlers handler
          JOIN expected_mappings expected ON expected.module_code = handler.module_code
          LEFT JOIN resolved_mappings resolved
            ON resolved.module_code = handler.module_code
           AND resolved.handler_id = handler.handler_id
          WHERE handler.business_scope = 'out_of_province'
            AND handler.is_active = true
            AND resolved.handler_id IS NULL) AS conflicting_mapping_count
       FROM users user_row
       LEFT JOIN user_roles role_link
         ON role_link.user_id = user_row.id
        AND role_link.role_id = (SELECT id FROM roles WHERE code = $2)
        AND role_link.department_id = (
          SELECT id FROM departments
          WHERE code = 'WELFARE_SECURITY' AND business_scope = 'out_of_province'
        )
       WHERE user_row.username = ANY($1::varchar[])`,
      [
        WELFARE_USERS.map(([username]) => username),
        WELFARE_ROLE_CODE,
        handlerRowsJson,
      ],
    ) as Array<{
      user_count: string;
      role_link_count: string;
      admin_permission_count: string;
      welfare_permission_count: string;
      missing_permission_count: string;
      mapping_count: string;
      mapping_handler_count: string;
      conflicting_mapping_count: string;
    }>;
    const verification = verificationRows[0];
    if (
      Number(verification?.user_count) !== WELFARE_USERS.length
      || Number(verification?.role_link_count) !== WELFARE_USERS.length
    ) {
      throw new Error('Welfare specialist provisioning did not create exactly nine scoped account bindings');
    }
    if (
      Number(verification?.admin_permission_count) > 0
      && (
        Number(verification?.welfare_permission_count) !== Number(verification?.admin_permission_count)
        || Number(verification?.missing_permission_count) !== 0
      )
    ) {
      throw new Error('Welfare specialist field permissions do not match the admin scenario matrix');
    }
    if (
      Number(verification?.mapping_count) !== WELFARE_HANDLER_ROWS.length
      || Number(verification?.mapping_handler_count) !== WELFARE_USERS.length
      || Number(verification?.conflicting_mapping_count) !== 0
    ) {
      throw new Error('Welfare specialist province handler mappings are incomplete or conflicting');
    }

    const roleRows = await queryRunner.query(
      `SELECT id, code, name, level, description, is_active
       FROM roles
       WHERE code = $1`,
      [WELFARE_ROLE_CODE],
    ) as Array<{
      id: string;
      code: string;
      name: string;
      level: string;
      description: string | null;
      is_active: boolean;
    }>;
    const roleRow = roleRows[0];
    if (!roleRow) throw new Error('welfare_specialist role provisioning failed');

    const activeRows = await queryRunner.query(
      `SELECT DISTINCT ON (business_scope)
         id, config, business_scope, created_by
       FROM permission_config_versions
       WHERE is_active = true
       ORDER BY business_scope, activated_at DESC NULLS LAST, created_at DESC`,
    ) as ActivePermissionRow[];

    for (const active of activeRows) {
      const permissionVersion = WELFARE_PERMISSION_VERSIONS[active.business_scope];
      const nextConfig = addWelfareRoleToPermissionConfig(active.config, {
        id: roleRow.id,
        code: roleRow.code,
        name: roleRow.name,
        canonicalCode: WELFARE_ROLE_CODE,
        isActive: roleRow.is_active,
        description: roleRow.description ?? undefined,
        level: roleRow.level,
      }, active.business_scope);

      await queryRunner.query(
        `UPDATE permission_config_versions
         SET is_active = false
         WHERE business_scope = $1
           AND is_active = true
           AND version <> $2`,
        [active.business_scope, permissionVersion],
      );
      const inserted = await queryRunner.query(
        `INSERT INTO permission_config_versions (
           version, config, is_active, created_by, created_at, activated_at,
           description, business_scope
         )
         VALUES ($1, $2::jsonb, true, $3, now(), now(), $4, $5)
         ON CONFLICT (version, business_scope) DO UPDATE
           SET config = EXCLUDED.config,
               is_active = true,
               activated_at = now(),
               description = EXCLUDED.description
         RETURNING id`,
        [
          permissionVersion,
          JSON.stringify(nextConfig),
          active.created_by,
          `Provision welfare specialists from permission version ${active.id}`,
          active.business_scope,
        ],
      ) as Array<{ id: string }>;

      await queryRunner.query(
        `INSERT INTO permission_change_logs (
           version_id, change_type, target_resource, old_value, new_value,
           changed_by, reason
         )
         VALUES ($1, 'update_role', $2, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          inserted[0].id,
          WELFARE_ROLE_CODE,
          JSON.stringify({ sourceVersionId: active.id }),
          JSON.stringify({
            users: WELFARE_USERS.length,
            businessScope: active.business_scope,
            routes: active.business_scope === 'out_of_province'
              ? OUT_OF_PROVINCE_ROUTES.map(([path]) => path)
              : BEILUN_ROUTES.map(([path]) => path),
          }),
          active.created_by,
          'Approved targeted provisioning for nine province welfare specialists',
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const targetRows = await queryRunner.query(
      `SELECT id, description, business_scope
       FROM permission_config_versions
       WHERE version = ANY($1::text[])`,
      [Object.values(WELFARE_PERMISSION_VERSIONS)],
    ) as Array<{ id: string; description: string | null; business_scope: string }>;

    for (const target of targetRows) {
      const sourceId = target.description?.match(/version ([0-9a-f-]{36})$/i)?.[1];
      await queryRunner.query(
        `DELETE FROM permission_config_versions WHERE id = $1`,
        [target.id],
      );
      if (sourceId) {
        await queryRunner.query(
          `UPDATE permission_config_versions
           SET is_active = true, activated_at = now()
           WHERE id = $1 AND business_scope = $2`,
          [sourceId, target.business_scope],
        );
      }
    }

    // Production identities are intentionally preserved on down to avoid
    // cascading deletion after accounts have created audit or business records.
  }
}
