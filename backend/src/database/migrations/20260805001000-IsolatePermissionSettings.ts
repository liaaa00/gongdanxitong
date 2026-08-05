import { MigrationInterface, QueryRunner } from 'typeorm';

export class IsolatePermissionSettings20260805001000 implements MigrationInterface {
  name = 'IsolatePermissionSettings20260805001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "permission_config_versions"
       ADD COLUMN IF NOT EXISTS business_scope varchar(32) NOT NULL DEFAULT 'beilun'`,
    );
    await queryRunner.query(
      `ALTER TABLE "permission_config_versions"
       DROP CONSTRAINT IF EXISTS "UQ_permission_config_versions_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permission_config_versions"
       DROP CONSTRAINT IF EXISTS "permission_config_versions_version_key"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_permission_config_versions_scope"
       ON "permission_config_versions" (business_scope, is_active, activated_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_permission_config_versions_version_scope"
       ON "permission_config_versions" (version, business_scope)`,
    );

    await queryRunner.query(
      `INSERT INTO "permission_config_versions"
        (version, config, is_active, created_by, created_at, activated_at, description, business_scope)
       SELECT version || '-out-of-province', config, is_active, created_by, created_at, activated_at,
              COALESCE(description, '') || '（省外独立权限基线）', 'out_of_province'
       FROM "permission_config_versions" source
       WHERE source.business_scope = 'beilun'
         AND NOT EXISTS (
           SELECT 1 FROM "permission_config_versions" target
           WHERE target.business_scope = 'out_of_province'
         )`,
    );

    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'roleActionPermissions.v1.beilun'
       WHERE key = 'roleActionPermissions.v1'`,
    );
    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'ai.config.beilun'
       WHERE key = 'ai.config'`,
    );
    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'operationLog.retentionDays.beilun'
       WHERE key = 'operationLog.retentionDays'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'roleActionPermissions.v1'
       WHERE key = 'roleActionPermissions.v1.beilun'`,
    );
    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'ai.config'
       WHERE key = 'ai.config.beilun'`,
    );
    await queryRunner.query(
      `UPDATE "system_settings"
       SET key = 'operationLog.retentionDays'
       WHERE key = 'operationLog.retentionDays.beilun'`,
    );
    await queryRunner.query(
      `DELETE FROM "permission_config_versions" WHERE business_scope = 'out_of_province'`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_permission_config_versions_version_scope"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_config_versions_scope"`);
    await queryRunner.query(`ALTER TABLE "permission_config_versions" DROP COLUMN IF EXISTS business_scope`);
  }
}
