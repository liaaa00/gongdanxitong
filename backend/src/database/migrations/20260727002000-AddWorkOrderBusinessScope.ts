import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderBusinessScope20260727002000 implements MigrationInterface {
  name = 'AddWorkOrderBusinessScope20260727002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS business_scope varchar(32)
    `);
    await queryRunner.query(`
      UPDATE work_orders
      SET business_scope = CASE
        WHEN order_type::text IN ('out_of_province_increase', 'out_of_province_decrease')
          THEN 'out_of_province'
        ELSE 'beilun'
      END
    `);
    await queryRunner.query(`
      ALTER TABLE work_orders
      ALTER COLUMN business_scope SET DEFAULT 'beilun',
      ALTER COLUMN business_scope SET NOT NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ck_work_orders_business_scope'
        ) THEN
          ALTER TABLE work_orders
          ADD CONSTRAINT ck_work_orders_business_scope
          CHECK (business_scope IN ('beilun', 'out_of_province'));
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_work_orders_business_scope_type
      ON work_orders (business_scope, order_type, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_orders_business_scope_type');
    await queryRunner.query('ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS ck_work_orders_business_scope');
    await queryRunner.query('ALTER TABLE work_orders DROP COLUMN IF EXISTS business_scope');
  }
}
