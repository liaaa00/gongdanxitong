import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserBusinessScope20260729003000 implements MigrationInterface {
  name = 'AddUserBusinessScope20260729003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) return;

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "business_scope" varchar(32) NOT NULL DEFAULT 'beilun'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "chk_users_business_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "chk_users_business_scope"
        CHECK ("business_scope" IN ('beilun', 'out_of_province'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) return;

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "chk_users_business_scope",
        DROP COLUMN IF EXISTS "business_scope"
    `);
  }
}
