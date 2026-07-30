'use strict';

const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SCHEMA_VERSION = 1;
const DEFAULT_BASELINE = path.resolve(__dirname, '../baselines/permission-baseline.json');
const ROLE_ACTION_SETTING_KEY = 'roleActionPermissions.v1';

function databaseConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'ticket_system',
  };
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeJson(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(normalizeJson(value));
}

function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sortedItems(items) {
  return [...items].map(normalizeJson).sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function groupedSection(items, groupKey) {
  const normalized = sortedItems(items);
  const groupedItems = new Map();
  for (const item of normalized) {
    const key = String(groupKey(item));
    const current = groupedItems.get(key) || [];
    current.push(item);
    groupedItems.set(key, current);
  }
  const groups = Array.from(groupedItems.entries())
    .map(([key, rows]) => ({ key, count: rows.length, sha256: digest(rows) }))
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    count: normalized.length,
    groupCount: groups.length,
    sha256: digest(normalized),
    groups,
  };
}

function normalizeRoleActionOverrides(rawValue) {
  if (!rawValue) return { configured: false, roles: {} };
  const parsed = JSON.parse(rawValue);
  const roles = {};
  for (const roleCode of Object.keys(parsed.roles || {}).sort()) {
    roles[roleCode] = Array.from(new Set(parsed.roles[roleCode] || [])).sort();
  }
  return { configured: true, roles };
}

async function query(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}

async function collectSnapshot(client, config) {
  const users = await query(client, `
    SELECT username, is_active AS "isActive", group_code AS "groupCode"
    FROM users
    ORDER BY username
  `);
  const roles = await query(client, `
    SELECT code, name, level::text AS level, is_active AS "isActive"
    FROM roles
    ORDER BY code
  `);
  const departments = await query(client, `
    SELECT d.code, d.name, parent.code AS "parentCode", d.is_active AS "isActive"
    FROM departments d
    LEFT JOIN departments parent ON parent.id = d.parent_id
    ORDER BY d.code
  `);
  const userRoles = await query(client, `
    SELECT u.username, r.code AS "roleCode", d.code AS "departmentCode", ur.is_primary AS "isPrimary"
    FROM user_roles ur
    INNER JOIN users u ON u.id = ur.user_id
    INNER JOIN roles r ON r.id = ur.role_id
    INNER JOIN departments d ON d.id = ur.department_id
    ORDER BY u.username, r.code, d.code
  `);
  const fieldPermissions = await query(client, `
    SELECT r.code AS "roleCode", fp.scenario, fp.field_code AS "fieldCode", fp.permission::text AS permission
    FROM field_permissions fp
    INNER JOIN roles r ON r.id = fp.role_id
    ORDER BY r.code, fp.scenario, fp.field_code
  `);
  const moduleHandlers = await query(client, `
    SELECT mh.module_code AS "moduleCode", u.username, mh.weight,
           mh.is_backup AS "isBackup", mh.is_active AS "isActive"
    FROM module_handlers mh
    INNER JOIN users u ON u.id = mh.handler_id
    ORDER BY mh.module_code, u.username, mh.is_backup, mh.weight
  `);
  const moduleSupervisors = await query(client, `
    SELECT ms.module_code AS "moduleCode", u.username, ms.is_active AS "isActive"
    FROM module_supervisors ms
    INNER JOIN users u ON u.id = ms.supervisor_id
    ORDER BY ms.module_code, u.username
  `);
  const exceptionModuleHandlers = await query(client, `
    SELECT emh.module_code::text AS "moduleCode", emh.customer_code AS "customerCode", u.username
    FROM exception_module_handlers emh
    INNER JOIN users u ON u.id = emh.handler_id
    ORDER BY emh.module_code, emh.customer_code, u.username
  `);
  const dispatchRules = await query(client, `
    SELECT dr.rule_name AS "ruleName", dr.order_type::text AS "orderType",
           dr.trigger_conditions AS "triggerConditions", dr.target_module AS "targetModule",
           customer.customer_code AS "customerCode", department.code AS "departmentCode",
           dr.sub_module AS "subModule", assignee.username AS "assigneeUsername",
           fallback.username AS "fallbackUsername", dr.allow_manual_override AS "allowManualOverride",
           dr.dispatch_strategy::text AS "dispatchStrategy", dr.is_active AS "isActive", dr.priority
    FROM dispatch_rules dr
    LEFT JOIN customers customer ON customer.id = dr.customer_id
    LEFT JOIN departments department ON department.id = dr.department_id
    LEFT JOIN users assignee ON assignee.id = dr.assignee_user_id
    LEFT JOIN users fallback ON fallback.id = dr.fallback_user_id
    ORDER BY dr.priority, dr.rule_name
  `);
  const workOrderModules = await query(client, `
    SELECT module_code AS "moduleCode", module_name AS "moduleName",
           parent_module_code AS "parentModuleCode", module_type AS "moduleType",
           is_active AS "isActive", dispatch_strategy::text AS "dispatchStrategy",
           sla_hours AS "slaHours", sla_reminder_before_hours AS "slaReminderBeforeHours"
    FROM work_order_modules
    ORDER BY module_code
  `);
  const moduleFields = await query(client, `
    SELECT module_code AS "moduleCode", field_code AS "fieldCode", group_name AS "groupName",
           display_order AS "displayOrder", is_required_override AS "isRequiredOverride",
           is_active AS "isActive"
    FROM module_fields
    ORDER BY module_code, field_code
  `);
  const customerAssignees = await query(client, `
    SELECT customer.customer_code AS "customerCode", u.username,
           ca.group_code AS "groupCode", ca.is_active AS "isActive"
    FROM customer_assignees ca
    INNER JOIN customers customer ON customer.id = ca.customer_id
    INNER JOIN users u ON u.id = ca.user_id
    ORDER BY customer.customer_code, u.username
  `);
  const roleActionRows = await query(
    client,
    'SELECT value FROM system_settings WHERE key = $1',
    [ROLE_ACTION_SETTING_KEY],
  );
  const roleActionOverrides = normalizeRoleActionOverrides(roleActionRows[0]?.value);
  const roleActionItems = [
    { roleCode: '__storage__', configured: roleActionOverrides.configured },
    ...Object.entries(roleActionOverrides.roles).map(([roleCode, actions]) => ({ roleCode, actions })),
  ];

  return normalizeJson({
    schemaVersion: SCHEMA_VERSION,
    scope: 'permission-and-dispatch-config',
    database: config.database,
    sections: {
      users: groupedSection(users, (item) => item.username),
      roles: groupedSection(roles, (item) => item.code),
      departments: groupedSection(departments, (item) => item.code),
      userRoles: groupedSection(userRoles, (item) => item.username),
      fieldPermissions: groupedSection(fieldPermissions, (item) => item.roleCode),
      roleActionOverrides: groupedSection(roleActionItems, (item) => item.roleCode),
      moduleHandlers: groupedSection(moduleHandlers, (item) => item.moduleCode),
      moduleSupervisors: groupedSection(moduleSupervisors, (item) => item.moduleCode),
      exceptionModuleHandlers: groupedSection(
        exceptionModuleHandlers,
        (item) => `${item.moduleCode}:${item.customerCode}`,
      ),
      dispatchRules: groupedSection(
        dispatchRules,
        (item) => `${item.priority}:${item.ruleName}:${item.targetModule}`,
      ),
      workOrderModules: groupedSection(workOrderModules, (item) => item.moduleCode),
      moduleFields: groupedSection(moduleFields, (item) => item.moduleCode),
      customerAssignees: groupedSection(customerAssignees, (item) => item.customerCode),
    },
  });
}

function compareSnapshots(expected, actual) {
  const differences = [];
  if (expected.schemaVersion !== actual.schemaVersion) {
    differences.push(`schemaVersion: ${expected.schemaVersion} -> ${actual.schemaVersion}`);
  }
  if (expected.scope !== actual.scope) {
    differences.push(`scope: ${expected.scope} -> ${actual.scope}`);
  }
  if (expected.database !== actual.database) {
    differences.push(`database: ${expected.database} -> ${actual.database}`);
  }

  const names = Array.from(new Set([
    ...Object.keys(expected.sections || {}),
    ...Object.keys(actual.sections || {}),
  ])).sort();
  for (const name of names) {
    const before = expected.sections?.[name];
    const after = actual.sections?.[name];
    if (!before || !after) {
      differences.push(`${name}: ${before ? 'present' : 'missing'} -> ${after ? 'present' : 'missing'}`);
      continue;
    }
    if (before.sha256 !== after.sha256) {
      differences.push(`${name}: count ${before.count ?? '-'} -> ${after.count ?? '-'}, sha256 ${before.sha256} -> ${after.sha256}`);
      const beforeGroups = new Map((before.groups || []).map((group) => [group.key, group]));
      const afterGroups = new Map((after.groups || []).map((group) => [group.key, group]));
      const groupKeys = Array.from(new Set([...beforeGroups.keys(), ...afterGroups.keys()])).sort();
      for (const key of groupKeys) {
        const beforeGroup = beforeGroups.get(key);
        const afterGroup = afterGroups.get(key);
        if (beforeGroup?.sha256 !== afterGroup?.sha256) {
          differences.push(`  ${name}[${key}]: count ${beforeGroup?.count ?? 0} -> ${afterGroup?.count ?? 0}`);
        }
      }
    }
  }
  return differences;
}

function printSummary(snapshot) {
  console.log(`Permission baseline database: ${snapshot.database}`);
  for (const [name, value] of Object.entries(snapshot.sections)) {
    const groupSuffix = value.groupCount === undefined ? '' : `, groups=${value.groupCount}`;
    console.log(`- ${name}: count=${value.count}${groupSuffix}, sha256=${value.sha256}`);
  }
}

function usage() {
  console.log('Usage:');
  console.log('  node scripts/permission-baseline.js print');
  console.log('  node scripts/permission-baseline.js summary');
  console.log('  node scripts/permission-baseline.js check [baseline-file]');
}

async function main() {
  const mode = process.argv[2] || 'check';
  if (!['print', 'summary', 'check'].includes(mode)) {
    usage();
    process.exitCode = 2;
    return;
  }

  const config = databaseConfig();
  const client = new Client(config);
  await client.connect();
  let snapshot;
  try {
    await client.query('BEGIN READ ONLY');
    snapshot = await collectSnapshot(client, config);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  if (mode === 'print') {
    console.log(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  if (mode === 'summary') {
    printSummary(snapshot);
    return;
  }

  const baselinePath = path.resolve(process.argv[3] || DEFAULT_BASELINE);
  const expected = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const differences = compareSnapshots(expected, snapshot);
  if (differences.length > 0) {
    console.error(`Permission baseline mismatch: ${baselinePath}`);
    for (const difference of differences) console.error(`- ${difference}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Permission baseline matched: ${baselinePath}`);
  printSummary(snapshot);
}

main().catch((error) => {
  console.error(`Permission baseline failed: ${error.message}`);
  process.exitCode = 1;
});
