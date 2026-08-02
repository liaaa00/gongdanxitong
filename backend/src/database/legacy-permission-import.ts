import {
  FieldPermissionRule,
  FieldViewMode,
  PermissionConfig,
  RoleDefinition,
  RoutePermission,
} from 'src/modules/permission-center/types/permission-config.types';

export interface LegacyPermissionBaseline {
  canonicalRoleAliases: Record<string, string>;
  routePermissions: Array<{
    path: string;
    allowedRoles: string[];
  }>;
  defaultRoleActionPermissions: Record<string, string[]>;
}

export interface LegacyRoleRow {
  id: string;
  code: string;
  name: string;
  level?: string | null;
  description?: string | null;
  is_active: boolean;
}

export interface LegacyFieldPermissionRow {
  role_code: string;
  scenario: string;
  field_code: string;
  permission: string;
}

const SEMVER_PATTERN =
  /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE_PATH_PATTERN =
  /^\/(?:[A-Za-z0-9_-]+|:[A-Za-z0-9_-]+|\*)(?:\/(?:[A-Za-z0-9_-]+|:[A-Za-z0-9_-]+|\*))*$/;
const ACTION_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const SCENARIO_PATTERN = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*$/;
const FIELD_CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FIELD_MODES = new Set<FieldViewMode>([
  FieldViewMode.VISIBLE,
  FieldViewMode.HIDDEN,
  FieldViewMode.READONLY,
  FieldViewMode.MASKED,
]);

function canonicalRole(
  code: string,
  baseline: LegacyPermissionBaseline,
): string {
  return baseline.canonicalRoleAliases[code] ?? code;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function parseStoredRoleActionPermissions(
  value?: string | null,
): Record<string, string[]> {
  if (!value) return {};

  const parsed = JSON.parse(value) as { roles?: unknown };
  if (
    !parsed.roles ||
    typeof parsed.roles !== 'object' ||
    Array.isArray(parsed.roles)
  ) {
    throw new Error('Legacy role action setting must contain a roles object');
  }

  const matrix: Record<string, string[]> = {};
  for (const [roleCode, actions] of Object.entries(parsed.roles)) {
    if (
      !Array.isArray(actions) ||
      !actions.every((action) => typeof action === 'string')
    ) {
      throw new Error(
        `Legacy actions for role ${roleCode} must be a string array`,
      );
    }
    matrix[roleCode] = unique(actions);
  }
  return matrix;
}

export function buildLegacyPermissionConfig(input: {
  version: string;
  baseline: LegacyPermissionBaseline;
  roles: LegacyRoleRow[];
  fieldPermissions: LegacyFieldPermissionRow[];
  storedRoleActionPermissions?: Record<string, string[]>;
}): PermissionConfig {
  const { version, baseline } = input;
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Permission config version must be semantic: ${version}`);
  }
  if (input.roles.length === 0) {
    throw new Error('Cannot import legacy permissions without roles');
  }

  const roles: RoleDefinition[] = input.roles.map((row) => {
    const canonicalCode = canonicalRole(row.code, baseline);
    if (
      !ROLE_CODE_PATTERN.test(row.code) ||
      !ROLE_CODE_PATTERN.test(canonicalCode)
    ) {
      throw new Error(`Invalid role code in legacy data: ${row.code}`);
    }
    if (!UUID_PATTERN.test(row.id))
      throw new Error(`Invalid role UUID in legacy data: ${row.id}`);
    if (!row.name.trim()) throw new Error(`Role ${row.code} has an empty name`);

    const role: RoleDefinition = {
      id: row.id,
      code: row.code,
      name: row.name.slice(0, 50),
      canonicalCode,
      isActive: Boolean(row.is_active),
    };
    if (row.description) role.description = row.description.slice(0, 200);
    if (row.level) role.level = row.level as RoleDefinition['level'];
    return role;
  });

  const routePermissions: RoutePermission[] = baseline.routePermissions.map(
    (route) => {
      const allowedRoles = unique(
        route.allowedRoles.map((role) => canonicalRole(role, baseline)),
      );
      if (!ROUTE_PATH_PATTERN.test(route.path) || allowedRoles.length === 0) {
        throw new Error(`Invalid legacy route permission: ${route.path}`);
      }
      if (allowedRoles.some((role) => !ROLE_CODE_PATTERN.test(role))) {
        throw new Error(`Invalid role on legacy route: ${route.path}`);
      }
      return { path: route.path, allowedRoles };
    },
  );

  const actionMatrix = {
    ...baseline.defaultRoleActionPermissions,
    ...(input.storedRoleActionPermissions ?? {}),
  };
  const rolesByAction = new Map<string, Set<string>>();
  for (const [roleCode, actions] of Object.entries(actionMatrix)) {
    for (const action of actions) {
      if (!ACTION_PATTERN.test(action))
        throw new Error(`Invalid legacy action code: ${action}`);
      const allowedRoles = rolesByAction.get(action) ?? new Set<string>();
      allowedRoles.add(canonicalRole(roleCode, baseline));
      rolesByAction.set(action, allowedRoles);
    }
  }

  for (const [action, allowedRoles] of [...rolesByAction.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    routePermissions.push({
      path: `/__permission-actions/${action.replace(/[^A-Za-z0-9_-]/g, '-')}`,
      allowedRoles: [...allowedRoles].sort(),
      backendActions: [action],
    });
  }

  const rulesByScenario = new Map<string, FieldPermissionRule>();
  for (const row of input.fieldPermissions) {
    if (!FIELD_MODES.has(row.permission as FieldViewMode)) {
      throw new Error(`Unsupported field permission mode: ${row.permission}`);
    }
    if (
      !SCENARIO_PATTERN.test(row.scenario) ||
      !FIELD_CODE_PATTERN.test(row.field_code)
    ) {
      throw new Error(
        `Invalid legacy field permission: ${row.scenario}/${row.field_code}`,
      );
    }

    const roleCode = canonicalRole(row.role_code, baseline);
    if (!ROLE_CODE_PATTERN.test(roleCode)) {
      throw new Error(
        `Invalid role on legacy field permission: ${row.role_code}`,
      );
    }
    const rule = rulesByScenario.get(row.scenario) ?? {
      scenario: row.scenario,
      roleFieldRules: {},
    };
    rule.roleFieldRules[roleCode] ??= {};
    rule.roleFieldRules[roleCode][row.field_code] =
      row.permission as FieldViewMode;
    rulesByScenario.set(row.scenario, rule);
  }

  return {
    version,
    roles,
    routePermissions,
    fieldPermissions: [...rulesByScenario.values()].sort((a, b) =>
      a.scenario.localeCompare(b.scenario),
    ),
  };
}
