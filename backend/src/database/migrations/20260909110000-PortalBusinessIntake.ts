import { MigrationInterface, QueryRunner } from 'typeorm';

export class PortalBusinessIntake20260909110000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE customer_portal_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id),
      account_id uuid NOT NULL REFERENCES customer_portal_accounts(id), business_type varchar(16) NOT NULL,
      request_id varchar(100) NOT NULL, input_hash varchar(64) NOT NULL, request_no varchar(64) NOT NULL,
      work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL, fields jsonb NOT NULL DEFAULT '{}',
      status varchar(16) NOT NULL DEFAULT 'received', result_note text, completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_portal_submission_request UNIQUE(customer_id, account_id, request_id),
      CONSTRAINT ck_portal_submission_type CHECK (business_type IN ('onboarding','resignation','salary')),
      CONSTRAINT ck_portal_submission_status CHECK (status IN ('received','completed'))
    )`);
    await queryRunner.query('CREATE INDEX idx_portal_submission_customer ON customer_portal_submissions(customer_id, business_type, created_at DESC)');
    await queryRunner.query('ALTER TABLE work_order_completion_emails ALTER COLUMN work_order_id DROP NOT NULL');
    await queryRunner.query('ALTER TABLE work_order_completion_emails ADD COLUMN portal_submission_id uuid REFERENCES customer_portal_submissions(id), ADD COLUMN attachment_ids jsonb NOT NULL DEFAULT \'[]\'::jsonb');
    await queryRunner.query('CREATE UNIQUE INDEX uq_portal_result_email ON work_order_completion_emails(portal_submission_id, template_code) WHERE portal_submission_id IS NOT NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // A rollback must not discard accepted customer submissions or queued mail.
    const rows = await queryRunner.query('SELECT 1 FROM customer_portal_submissions LIMIT 1');
    const mail = await queryRunner.query('SELECT 1 FROM work_order_completion_emails WHERE work_order_id IS NULL LIMIT 1');
    if (rows.length || mail.length) throw new Error('Portal intake contains business data; export and handle it before rollback');
    await queryRunner.query('DROP INDEX uq_portal_result_email');
    await queryRunner.query('ALTER TABLE work_order_completion_emails DROP COLUMN portal_submission_id, DROP COLUMN attachment_ids, ALTER COLUMN work_order_id SET NOT NULL');
    await queryRunner.query('DROP TABLE customer_portal_submissions');
  }
}
