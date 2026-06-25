import { MigrationInterface, QueryRunner } from 'typeorm';

export class StageABackend1715900000000 implements MigrationInterface {
  name = 'StageABackend1715900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        branch_code varchar(64) UNIQUE NOT NULL,
        branch_name varchar(128) NOT NULL,
        city varchar(64),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_branches_customer ON branches(customer_id)');

    await queryRunner.query(`
      INSERT INTO branches (customer_id, branch_code, branch_name, city, is_active)
      SELECT c.id, c.customer_code, c.customer_name, NULL, c.is_active
      FROM customers c
      WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.customer_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.branch_code = c.customer_code)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_assignees (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_code varchar(32),
        is_active boolean NOT NULL DEFAULT true,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_customer_assignees_customer_user UNIQUE(customer_id, user_id)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_customer_assignees_user ON customer_assignees(user_id) WHERE is_active');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_customer_assignees_customer ON customer_assignees(customer_id) WHERE is_active');

    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES branches(id) ON DELETE RESTRICT');
    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS customer_code varchar(64) NULL');
    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS branch_code varchar(64) NULL');
    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS customer_name varchar(128) NULL');
    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_modified_at timestamptz NULL');
    await queryRunner.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_modified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL');
    await queryRunner.query(`
      UPDATE work_orders w
      SET customer_code = COALESCE(w.customer_code, w.extra_data->>'customer_code'),
          branch_code = COALESCE(w.branch_code, w.extra_data->>'branch_code', w.extra_data->>'customer_code'),
          customer_name = COALESCE(w.customer_name, w.extra_data->>'customer_name')
    `);
    await queryRunner.query(`
      UPDATE work_orders w
      SET branch_id = b.id,
          branch_code = COALESCE(w.branch_code, b.branch_code),
          customer_code = COALESCE(w.customer_code, c.customer_code),
          customer_name = COALESCE(w.customer_name, c.customer_name)
      FROM customers c
      JOIN branches b ON b.customer_id = c.id
      WHERE w.customer_id = c.id
        AND w.branch_id IS NULL
        AND (w.branch_code IS NULL OR w.branch_code = b.branch_code OR b.branch_code = c.customer_code)
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_branch_created ON work_orders(branch_id, created_at)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_customer_filter ON work_orders(customer_code, branch_code, customer_name)');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM (
            SELECT employee_id_card, date_trunc('month', created_at AT TIME ZONE 'UTC') AS month_key, COUNT(*) AS duplicate_count
            FROM work_orders
            WHERE order_type = 'onboarding' AND status NOT IN ('withdrawn')
            GROUP BY employee_id_card, date_trunc('month', created_at AT TIME ZONE 'UTC')
            HAVING COUNT(*) > 1
          ) duplicated_id_cards
        ) THEN
          CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_idcard_month
          ON work_orders (employee_id_card, date_trunc('month', created_at AT TIME ZONE 'UTC'))
          WHERE order_type = 'onboarding' AND status NOT IN ('withdrawn');
        ELSE
          RAISE NOTICE 'Skip uq_work_orders_idcard_month because existing onboarding data contains duplicate employee_id_card in same month; application-level duplicate validation remains active.';
        END IF;
      END $$;
    `);

    await queryRunner.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS group_code varchar(32) NULL');
    await queryRunner.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true');
    await queryRunner.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at timestamptz NULL');

    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS department_id uuid NULL REFERENCES departments(id) ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS sub_module varchar(32) NULL');
    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS assignee_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS fallback_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE dispatch_rules ADD COLUMN IF NOT EXISTS allow_manual_override boolean NOT NULL DEFAULT true');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_dispatch_rules_lookup ON dispatch_rules(order_type, sub_module, customer_id, department_id, is_active)');

    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_dispatch_pool AS
      SELECT d.*, mh.module_code AS pool_code, mh.handler_id AS pool_member_id
      FROM dispatched_orders d
      JOIN module_handlers mh ON mh.module_code = d.module_code
      WHERE mh.is_active = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP VIEW IF EXISTS v_dispatch_pool');
    await queryRunner.query('DROP INDEX IF EXISTS idx_dispatch_rules_lookup');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS allow_manual_override');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS fallback_user_id');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS assignee_user_id');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS sub_module');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS department_id');
    await queryRunner.query('ALTER TABLE dispatch_rules DROP COLUMN IF EXISTS customer_id');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS password_updated_at');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS must_change_password');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS group_code');
    await queryRunner.query('DROP INDEX IF EXISTS uq_work_orders_idcard_month');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_customer_filter');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_branch_created');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS last_modified_by');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS last_modified_at');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS customer_name');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS branch_code');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS customer_code');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS branch_id');
    await queryRunner.query('DROP TABLE IF EXISTS customer_assignees');
    await queryRunner.query('DROP TABLE IF EXISTS branches');
  }
}
