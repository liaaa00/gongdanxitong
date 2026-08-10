import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillOutOfProvinceCustomers20260809002000 implements MigrationInterface {
  name = 'BackfillOutOfProvinceCustomers20260809002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO customers (
        id,
        customer_code,
        customer_name,
        business_scope,
        is_active,
        created_at
      )
      SELECT
        gen_random_uuid(),
        source.customer_code,
        source.customer_name,
        'out_of_province',
        source.is_active,
        source.created_at
      FROM customers source
      WHERE source.business_scope = 'beilun'
        AND NOT EXISTS (
          SELECT 1
          FROM customers target
          WHERE target.customer_code = source.customer_code
            AND target.business_scope = 'out_of_province'
        )
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {}
}
