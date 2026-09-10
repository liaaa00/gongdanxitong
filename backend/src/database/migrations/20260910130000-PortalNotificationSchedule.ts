import { MigrationInterface, QueryRunner } from 'typeorm';

export class PortalNotificationSchedule20260910130000 implements MigrationInterface {
  name = 'PortalNotificationSchedule20260910130000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE portal_notification_settings (
      id uuid PRIMARY KEY CHECK (id = '00000000-0000-4000-8000-000000000001'),
      settings jsonb NOT NULL DEFAULT '{}'::jsonb, calendar jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`ALTER TABLE work_order_completion_emails ADD COLUMN deduplication_key varchar(255), ADD COLUMN notification_context jsonb, ADD COLUMN claim_token uuid`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_portal_notification_deduplication ON work_order_completion_emails (deduplication_key) WHERE deduplication_key IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE work_order_completion_emails DROP CONSTRAINT ck_work_order_completion_emails_status, ADD CONSTRAINT ck_work_order_completion_emails_status CHECK (status IN ('pending','sending','sent','failed','cancelled'))`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`SELECT 1 FROM work_order_completion_emails WHERE deduplication_key IS NOT NULL OR status = 'cancelled' LIMIT 1`);
    if (rows.length) throw new Error('自动通知已有记录，请先归档审核，禁止回退删除通知历史');
    const settings = await queryRunner.query('SELECT 1 FROM portal_notification_settings LIMIT 1');
    if (settings.length) throw new Error('通知配置已有数据，禁止回退删除配置');
    await queryRunner.query('DROP INDEX uq_portal_notification_deduplication');
    await queryRunner.query(`ALTER TABLE work_order_completion_emails DROP COLUMN deduplication_key, DROP COLUMN notification_context, DROP COLUMN claim_token, DROP CONSTRAINT ck_work_order_completion_emails_status, ADD CONSTRAINT ck_work_order_completion_emails_status CHECK (status IN ('pending','sending','sent','failed'))`);
    await queryRunner.query('DROP TABLE portal_notification_settings');
  }
}
