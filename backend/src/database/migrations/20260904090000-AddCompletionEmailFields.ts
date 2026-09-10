import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompletionEmailFields20260904090000 implements MigrationInterface {
  name = 'AddCompletionEmailFields20260904090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_portal_rules
      ADD COLUMN IF NOT EXISTS completion_email_fields jsonb NOT NULL
      DEFAULT '["order_no","order_type","customer_name","employee_name","employee_id_card"]'::jsonb
    `);
    await queryRunner.query(`
      UPDATE customer_portal_rules
         SET completion_email_fields = '["order_no","order_type","customer_name","employee_name","employee_id_card"]'::jsonb
       WHERE completion_email_fields IS NULL OR jsonb_array_length(completion_email_fields) = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE customer_portal_rules DROP COLUMN IF EXISTS completion_email_fields');
  }
}
