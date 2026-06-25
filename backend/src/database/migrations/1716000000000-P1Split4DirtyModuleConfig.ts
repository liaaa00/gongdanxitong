import { MigrationInterface, QueryRunner } from 'typeorm';

export class P1Split4DirtyModuleConfig1716000000000 implements MigrationInterface {
  name = 'P1Split4DirtyModuleConfig1716000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_modules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code varchar(64) UNIQUE NOT NULL,
        module_name varchar(128) NOT NULL,
        parent_module_code varchar(64) NULL,
        module_type varchar(32) NOT NULL DEFAULT 'sub_module',
        description varchar(512) NULL,
        display_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_work_order_modules_parent FOREIGN KEY(parent_module_code) REFERENCES work_order_modules(module_code) ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_order_modules_parent ON work_order_modules(parent_module_code)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS module_fields (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code varchar(64) NOT NULL,
        field_code varchar(128) NOT NULL,
        group_name varchar(128) NULL,
        display_order integer NOT NULL DEFAULT 0,
        is_required_override boolean NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_module_fields_module FOREIGN KEY(module_code) REFERENCES work_order_modules(module_code) ON DELETE CASCADE,
        CONSTRAINT fk_module_fields_field FOREIGN KEY(field_code) REFERENCES field_configs(field_code) ON DELETE CASCADE,
        CONSTRAINT uq_module_fields_module_field UNIQUE(module_code, field_code)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_module_fields_module_active ON module_fields(module_code, is_active)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_module_fields_field ON module_fields(field_code)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS module_supervisors (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code varchar(64) NOT NULL,
        supervisor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_module_supervisors_module_user UNIQUE(module_code, supervisor_id)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_module_supervisors_lookup ON module_supervisors(module_code, supervisor_id, is_active)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS action_configs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code varchar(64) NOT NULL,
        action_code varchar(64) NOT NULL,
        action_name varchar(128) NOT NULL,
        required_roles jsonb NULL,
        form_schema jsonb NULL,
        remark_required boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_action_configs_module FOREIGN KEY(module_code) REFERENCES work_order_modules(module_code) ON DELETE CASCADE,
        CONSTRAINT uq_action_configs_module_action UNIQUE(module_code, action_code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_order_field_dirty_marks (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        dispatched_order_id uuid NULL REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        module_code varchar(64) NOT NULL,
        field_code varchar(128) NOT NULL,
        field_label varchar(128) NOT NULL,
        old_value jsonb NULL,
        new_value jsonb NULL,
        changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        changed_at timestamptz NOT NULL DEFAULT now(),
        flow_round integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        cleared_at timestamptz NULL,
        cleared_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        clear_reason varchar(64) NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_dirty_dispatched_active ON work_order_field_dirty_marks(dispatched_order_id, is_active)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_dirty_work_module_round_active ON work_order_field_dirty_marks(work_order_id, module_code, flow_round, is_active)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_dirty_work_field_round ON work_order_field_dirty_marks(work_order_id, field_code, flow_round)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatched_order_return_records (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        dispatched_order_id uuid NOT NULL REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        module_code varchar(64) NOT NULL,
        returned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        return_reason varchar(512) NOT NULL,
        before_status varchar(32) NOT NULL,
        after_status varchar(32) NOT NULL,
        payload jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_return_records_dispatched ON dispatched_order_return_records(dispatched_order_id, created_at DESC)');

    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS modification_round integer NOT NULL DEFAULT 0');
    await queryRunner.query('ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS flow_round integer NOT NULL DEFAULT 0');
    await queryRunner.query('ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS completion_remark varchar(1024) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS completion_remark');
    await queryRunner.query('ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS flow_round');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS modification_round');
    await queryRunner.query('DROP INDEX IF EXISTS idx_return_records_dispatched');
    await queryRunner.query('DROP TABLE IF EXISTS dispatched_order_return_records');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dirty_work_field_round');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dirty_work_module_round_active');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dirty_dispatched_active');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_field_dirty_marks');
    await queryRunner.query('DROP TABLE IF EXISTS action_configs');
    await queryRunner.query('DROP INDEX IF EXISTS idx_module_supervisors_lookup');
    await queryRunner.query('DROP TABLE IF EXISTS module_supervisors');
    await queryRunner.query('DROP INDEX IF EXISTS idx_module_fields_field');
    await queryRunner.query('DROP INDEX IF EXISTS idx_module_fields_module_active');
    await queryRunner.query('DROP TABLE IF EXISTS module_fields');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_order_modules_parent');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_modules');
  }
}
