import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderSearchIndexes20260913100000 implements MigrationInterface {
  name = 'AddWorkOrderSearchIndexes20260913100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_employee_name_trgm ON work_orders USING gin (employee_name gin_trgm_ops)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_employee_id_card_trgm ON work_orders USING gin (employee_id_card gin_trgm_ops)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_order_no_trgm ON work_orders USING gin (order_no gin_trgm_ops)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_customer_name_trgm ON work_orders USING gin (customer_name gin_trgm_ops)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_work_orders_customer_code_trgm ON work_orders USING gin (customer_code gin_trgm_ops)');
    await queryRunner.query("CREATE INDEX IF NOT EXISTS idx_work_orders_extra_data_jsonb ON work_orders USING gin (extra_data jsonb_path_ops)");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_extra_data_jsonb');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_customer_code_trgm');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_customer_name_trgm');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_order_no_trgm');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_employee_id_card_trgm');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_employee_name_trgm');
  }
}