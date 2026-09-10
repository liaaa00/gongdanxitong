import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCustomerPortalRulesForLocalFlow20260907100000 implements MigrationInterface {
  name = 'ExtendCustomerPortalRulesForLocalFlow20260907100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_portal_rules ADD COLUMN IF NOT EXISTS resignation_defaults jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(`ALTER TABLE customer_portal_rules ADD COLUMN IF NOT EXISTS salary_rules jsonb NOT NULL DEFAULT '{"billingDay":null,"reminderEnabled":true,"reminderWorkdayOffsets":[3,2,1]}'::jsonb`);
    await queryRunner.query(`ALTER TABLE customer_portal_rules ADD COLUMN IF NOT EXISTS shared_email_rules jsonb NOT NULL DEFAULT '{"mailbox":"","routeKey":""}'::jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE customer_portal_rules DROP COLUMN IF EXISTS shared_email_rules');
    await queryRunner.query('ALTER TABLE customer_portal_rules DROP COLUMN IF EXISTS salary_rules');
    await queryRunner.query('ALTER TABLE customer_portal_rules DROP COLUMN IF EXISTS resignation_defaults');
  }
}
