import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendInServiceOrderTypes20260726002000 implements MigrationInterface {
  name = 'ExtendInServiceOrderTypes20260726002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of [
      'in_service',
      'out_of_province',
      'out_of_province_increase',
      'out_of_province_decrease',
    ]) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type_enum')
             AND NOT EXISTS (
               SELECT 1
               FROM pg_enum e
               JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'order_type_enum' AND e.enumlabel = '${value}'
             ) THEN
            ALTER TYPE order_type_enum ADD VALUE '${value}';
          END IF;
        END $$;
      `);
    }

    for (const value of [
      'single_business',
      'out_of_province_increase',
      'out_of_province_decrease',
      'in_service_single_business',
      'out_of_province_dispatch',
    ]) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_module_handlers_module_code_enum')
             AND NOT EXISTS (
               SELECT 1
               FROM pg_enum e
               JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'exception_module_handlers_module_code_enum' AND e.enumlabel = '${value}'
             ) THEN
            ALTER TYPE exception_module_handlers_module_code_enum ADD VALUE '${value}';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely without rebuilding dependent columns.
  }
}
