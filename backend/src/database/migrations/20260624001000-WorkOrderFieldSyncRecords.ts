import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkOrderFieldSyncRecords20260624001000 implements MigrationInterface {
  name = 'WorkOrderFieldSyncRecords20260624001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_field_sync_batches (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        source_dispatched_order_id uuid NOT NULL REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        source_module_code varchar(64) NOT NULL,
        trigger varchar(64) NOT NULL,
        status varchar(32) NOT NULL,
        changed_fields jsonb NOT NULL,
        requested_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        reason varchar(512) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_batches_work_created ON work_order_field_sync_batches(work_order_id, created_at DESC)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_batches_source_created ON work_order_field_sync_batches(source_dispatched_order_id, created_at DESC)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_batches_status ON work_order_field_sync_batches(status)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_field_sync_items (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        batch_id uuid NOT NULL REFERENCES work_order_field_sync_batches(id) ON DELETE CASCADE,
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        dispatched_order_id uuid NOT NULL REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        module_code varchar(64) NOT NULL,
        field_code varchar(128) NOT NULL,
        field_label varchar(128) NULL,
        old_value jsonb NULL,
        new_value jsonb NULL,
        status varchar(32) NOT NULL,
        requires_approval boolean NOT NULL DEFAULT false,
        approved_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamptz NULL,
        comment varchar(512) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_items_batch ON work_order_field_sync_items(batch_id)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_items_dispatched_status ON work_order_field_sync_items(dispatched_order_id, status)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_field_sync_items_work_field_status ON work_order_field_sync_items(work_order_id, field_code, status)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_items_work_field_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_items_dispatched_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_items_batch');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_field_sync_items');
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_batches_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_batches_source_created');
    await queryRunner.query('DROP INDEX IF EXISTS idx_field_sync_batches_work_created');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_field_sync_batches');
  }
}
