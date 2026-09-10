import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkOrderCompletionEmails20260903161000 implements MigrationInterface {
  name = 'CreateWorkOrderCompletionEmails20260903161000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS completion_version integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_completion_emails (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        completed_version integer NOT NULL,
        template_code varchar(128) NOT NULL,
        template_version varchar(64) NOT NULL,
        to_recipients text[] NOT NULL DEFAULT '{}'::text[],
        cc_recipients text[] NOT NULL DEFAULT '{}'::text[],
        reply_to varchar(320) NULL,
        subject varchar(255) NOT NULL,
        body_snapshot text NOT NULL,
        attachment_id varchar(128) NULL,
        attachment_hash varchar(128) NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        attempt_count integer NOT NULL DEFAULT 0,
        next_retry_at timestamptz NULL,
        last_error text NULL,
        sent_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_work_order_completion_emails_status
          CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_work_order_completion_email_identity
      ON work_order_completion_emails(work_order_id, completed_version, template_code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_work_order_completion_emails_status_retry
      ON work_order_completion_emails(status, next_retry_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_order_completion_emails_status_retry');
    await queryRunner.query('DROP INDEX IF EXISTS uq_work_order_completion_email_identity');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_completion_emails');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS completion_version');
  }
}
