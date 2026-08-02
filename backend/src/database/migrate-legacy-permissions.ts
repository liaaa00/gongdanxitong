import 'dotenv/config';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AppDataSource from './data-source';
import {
  buildLegacyPermissionConfig,
  LegacyFieldPermissionRow,
  LegacyPermissionBaseline,
  LegacyRoleRow,
  parseStoredRoleActionPermissions,
} from './legacy-permission-import';

interface CliOptions {
  version: string;
  activate: boolean;
  dryRun: boolean;
}

function parseOptions(args: string[]): CliOptions {
  let version = '';
  let activate = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--version') {
      version = args[index + 1] ?? '';
      index += 1;
    } else if (argument === '--activate') {
      activate = true;
    } else if (argument === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!version) throw new Error('--version is required');
  return { version, activate, dryRun };
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const baselinePath = join(
    __dirname,
    'migrations',
    'legacy-permission-baseline.json',
  );
  const baseline = JSON.parse(
    readFileSync(baselinePath, 'utf8'),
  ) as LegacyPermissionBaseline;

  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await queryRunner.query(
      `SELECT pg_advisory_xact_lock(hashtext('legacy-permission-config-import'))`,
    );

    const tableCheck = (await queryRunner.query(
      `SELECT to_regclass('permission_config_versions') AS versions_table,
              to_regclass('permission_change_logs') AS logs_table`,
    )) as Array<{ versions_table: string | null; logs_table: string | null }>;
    if (!tableCheck[0]?.versions_table || !tableCheck[0]?.logs_table) {
      throw new Error(
        'Permission center tables are missing; run TypeORM migrations first',
      );
    }

    const existing = (await queryRunner.query(
      `SELECT id, is_active FROM permission_config_versions WHERE version = $1 LIMIT 1`,
      [options.version],
    )) as Array<{ id: string; is_active: boolean }>;

    if (existing[0]) {
      if (options.activate && !existing[0].is_active && !options.dryRun) {
        await queryRunner.query(
          `UPDATE permission_config_versions SET is_active = false WHERE is_active = true`,
        );
        await queryRunner.query(
          `UPDATE permission_config_versions
             SET is_active = true, activated_at = now(), updated_at = now()
           WHERE id = $1`,
          [existing[0].id],
        );
      }
      await queryRunner.commitTransaction();
      console.log(
        `Permission config version ${options.version} already exists; no duplicate was inserted.`,
      );
      return;
    }

    const roles = (await queryRunner.query(
      `SELECT id, code, name, level, description, is_active
         FROM roles
        ORDER BY code`,
    )) as LegacyRoleRow[];
    const fieldPermissions = (await queryRunner.query(
      `SELECT r.code AS role_code, fp.scenario, fp.field_code, fp.permission
         FROM field_permissions fp
         JOIN roles r ON r.id = fp.role_id
        ORDER BY fp.scenario, r.code, fp.field_code`,
    )) as LegacyFieldPermissionRow[];
    const settingRows = (await queryRunner.query(
      `SELECT value FROM system_settings WHERE key = 'roleActionPermissions.v1' LIMIT 1`,
    )) as Array<{ value: string }>;

    const config = buildLegacyPermissionConfig({
      version: options.version,
      baseline,
      roles,
      fieldPermissions,
      storedRoleActionPermissions: parseStoredRoleActionPermissions(
        settingRows[0]?.value,
      ),
    });

    console.log(
      `Prepared ${config.roles.length} roles, ${config.routePermissions.length} route/action rules, ` +
        `and ${config.fieldPermissions.length} field scenarios.`,
    );

    if (options.dryRun) {
      await queryRunner.rollbackTransaction();
      console.log('Dry run completed; no database rows were changed.');
      return;
    }

    if (options.activate) {
      await queryRunner.query(
        `UPDATE permission_config_versions SET is_active = false WHERE is_active = true`,
      );
    }

    const inserted = (await queryRunner.query(
      `INSERT INTO permission_config_versions
         (version, config, is_active, created_by, activated_at, description)
       VALUES ($1, $2::jsonb, $3, NULL, CASE WHEN $3 THEN now() ELSE NULL END, $4)
       RETURNING id`,
      [
        options.version,
        JSON.stringify(config),
        options.activate,
        'Imported from legacy route, role-action and field-permission configuration',
      ],
    )) as Array<{ id: string }>;

    await queryRunner.query(
      `INSERT INTO permission_change_logs
         (version_id, change_type, target_resource, old_value, new_value, changed_by, reason)
       VALUES ($1, 'import_legacy', 'permission_config_versions', NULL, $2::jsonb, NULL, $3)`,
      [
        inserted[0].id,
        JSON.stringify({
          version: options.version,
          roles: config.roles.length,
          routePermissions: config.routePermissions.length,
          fieldPermissions: config.fieldPermissions.length,
          activated: options.activate,
        }),
        'Production migration from legacy permission configuration',
      ],
    );

    await queryRunner.commitTransaction();
    console.log(
      `Permission config ${options.version} imported${options.activate ? ' and activated' : ''}.`,
    );
  } catch (error) {
    if (queryRunner.isTransactionActive)
      await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Legacy permission import failed: ${message}`);
  process.exitCode = 1;
});
