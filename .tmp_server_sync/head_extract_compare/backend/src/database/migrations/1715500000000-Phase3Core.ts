import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase3Core1715500000000 implements MigrationInterface {
  name = 'Phase3Core1715500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE field_configs ADD COLUMN IF NOT EXISTS conditional_required jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE module_handlers ADD COLUMN IF NOT EXISTS rr_cursor_version integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_work_orders_extra_data_gin ON work_orders USING GIN (extra_data)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_dispatch_rules_trigger_conditions_gin ON dispatch_rules USING GIN (trigger_conditions jsonb_path_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_dispatched_orders_handler_status ON dispatched_orders(handler_id, status)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_module_handlers_module_active ON module_handlers(module_code, is_active, is_backup)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_module_handlers_module_active');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dispatched_orders_handler_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dispatch_rules_trigger_conditions_gin');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_extra_data_gin');
    await queryRunner.query('ALTER TABLE module_handlers DROP COLUMN IF EXISTS rr_cursor_version');
    await queryRunner.query('ALTER TABLE field_configs DROP COLUMN IF EXISTS conditional_required');
  }
}
