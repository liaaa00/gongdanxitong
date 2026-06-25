import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchConfigSla20260522010000 implements MigrationInterface {
  name = 'DispatchConfigSla20260522010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE work_order_modules ADD COLUMN IF NOT EXISTS sla_hours integer NULL`);
    await queryRunner.query(`ALTER TABLE work_order_modules ADD COLUMN IF NOT EXISTS sla_reminder_before_hours integer NULL`);
    await queryRunner.query(`ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS due_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS sla_hours integer NULL`);
    await queryRunner.query(`ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS sla_reminder_before_hours integer NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dispatched_orders_due_at ON dispatched_orders(due_at)`);

    await queryRunner.query(`
      UPDATE work_order_modules
         SET sla_hours = CASE module_code
           WHEN 'data_entry' THEN 24
           WHEN 'onboarding_contact' THEN 24
           WHEN 'contract' THEN 48
           WHEN 'social_insurance' THEN 48
           WHEN 'renewal_contract' THEN 48
           WHEN 'benefit' THEN 48
           WHEN 'benefit_apply' THEN 48
           WHEN 'resignation_contact' THEN 24
           WHEN 'resignation_cert' THEN 24
           WHEN 'data_entry_resign' THEN 24
           ELSE sla_hours
         END,
         sla_reminder_before_hours = CASE module_code
           WHEN 'data_entry' THEN 4
           WHEN 'onboarding_contact' THEN 4
           WHEN 'contract' THEN 8
           WHEN 'social_insurance' THEN 8
           WHEN 'renewal_contract' THEN 8
           WHEN 'benefit' THEN 8
           WHEN 'benefit_apply' THEN 8
           WHEN 'resignation_contact' THEN 4
           WHEN 'resignation_cert' THEN 4
           WHEN 'data_entry_resign' THEN 4
           ELSE sla_reminder_before_hours
         END
       WHERE module_code IN ('data_entry','onboarding_contact','contract','social_insurance','renewal_contract','benefit','benefit_apply','resignation_contact','resignation_cert','data_entry_resign')
         AND (sla_hours IS NULL OR sla_reminder_before_hours IS NULL)
    `);

    await queryRunner.query(`
      UPDATE dispatched_orders d
         SET sla_hours = COALESCE(d.sla_hours, m.sla_hours),
             sla_reminder_before_hours = COALESCE(d.sla_reminder_before_hours, m.sla_reminder_before_hours),
             due_at = COALESCE(d.due_at, COALESCE(d.dispatched_at, d.created_at) + (m.sla_hours || ' hours')::interval)
        FROM work_order_modules m
       WHERE d.module_code = m.module_code
         AND m.sla_hours IS NOT NULL
         AND (d.due_at IS NULL OR d.sla_hours IS NULL OR d.sla_reminder_before_hours IS NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispatched_orders_due_at`);
    await queryRunner.query(`ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS sla_reminder_before_hours`);
    await queryRunner.query(`ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS sla_hours`);
    await queryRunner.query(`ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS due_at`);
    await queryRunner.query(`ALTER TABLE work_order_modules DROP COLUMN IF EXISTS sla_reminder_before_hours`);
    await queryRunner.query(`ALTER TABLE work_order_modules DROP COLUMN IF EXISTS sla_hours`);
  }
}
