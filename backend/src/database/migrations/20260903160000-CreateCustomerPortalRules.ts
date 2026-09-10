import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomerPortalRules20260903160000 implements MigrationInterface {
  name = 'CreateCustomerPortalRules20260903160000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        onboarding_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
        completion_email_enabled boolean NOT NULL DEFAULT false,
        completion_email_to text[] NOT NULL DEFAULT '{}'::text[],
        completion_email_cc text[] NOT NULL DEFAULT '{}'::text[],
        completion_email_reply_to varchar(320) NULL,
        completion_email_business_types text[] NOT NULL DEFAULT '{}'::text[],
        completion_email_fields jsonb NOT NULL DEFAULT '[\"order_no\",\"order_type\",\"customer_name\",\"employee_name\",\"employee_id_card\"]'::jsonb,
        objection_deadline_days int NULL,
        is_active boolean NOT NULL DEFAULT true,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_customer_portal_rules_objection_days
          CHECK (objection_deadline_days IS NULL OR objection_deadline_days BETWEEN 0 AND 30)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_customer_portal_rules_customer_active ON customer_portal_rules(customer_id, is_active)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_customer_portal_rules_customer_active');
    await queryRunner.query('DROP TABLE IF EXISTS customer_portal_rules');
  }
}
