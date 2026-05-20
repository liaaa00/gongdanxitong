import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationTemplates1715700000000 implements MigrationInterface {
  name = 'NotificationTemplates1715700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        biz_type varchar(64) NOT NULL UNIQUE,
        title_template varchar(255) NOT NULL,
        content_template text NOT NULL,
        default_link varchar(512),
        default_priority varchar(16) NOT NULL DEFAULT 'normal',
        default_channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
        variables jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON notification_templates(is_active)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_notification_templates_active');
    await queryRunner.query('DROP TABLE IF EXISTS notification_templates');
  }
}
