import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutOfProvinceOrders20260727003000 implements MigrationInterface {
  name = 'CreateOutOfProvinceOrders20260727003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP VIEW IF EXISTS out_of_province_orders');
    await queryRunner.query(`
      CREATE VIEW out_of_province_orders AS
      SELECT
        id AS work_order_id,
        order_type::text AS order_type,
        business_scope,
        NULLIF(trim(extra_data->>'province'), '') AS province,
        created_at,
        updated_at
      FROM work_orders
      WHERE business_scope = 'out_of_province'
        AND order_type::text IN ('out_of_province_increase', 'out_of_province_decrease')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP VIEW IF EXISTS out_of_province_orders');
  }
}
