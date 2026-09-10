import { MigrationInterface, QueryRunner } from 'typeorm';

export class PortalAccountBusinessPermissions20260909100000 implements MigrationInterface {
  name = 'PortalAccountBusinessPermissions20260909100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preserve existing accounts' access once; new accounts require explicit grants.
    await queryRunner.query(`ALTER TABLE customer_portal_accounts ADD COLUMN IF NOT EXISTS business_permissions jsonb NOT NULL DEFAULT '["onboarding","resignation","salary"]'::jsonb`);
    await queryRunner.query(`ALTER TABLE customer_portal_accounts ALTER COLUMN business_permissions SET DEFAULT '[]'::jsonb`);
    await queryRunner.query('ALTER TABLE customer_portal_accounts ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE customer_portal_accounts DROP COLUMN IF EXISTS session_version');
    await queryRunner.query('ALTER TABLE customer_portal_accounts DROP COLUMN IF EXISTS business_permissions');
  }
}
