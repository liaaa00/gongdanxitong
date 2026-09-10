import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPaymentLocationRules20260910110000 implements MigrationInterface {
  name = 'AddCustomerPaymentLocationRules20260910110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_portal_rules ADD COLUMN IF NOT EXISTS payment_location_rules jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE customer_portal_rules DROP COLUMN IF EXISTS payment_location_rules');
  }
}
