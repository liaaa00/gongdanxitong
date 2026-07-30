import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendDispatchModuleEnum20260526011000 implements MigrationInterface {
  name = 'ExtendDispatchModuleEnum20260526011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const values = [
      'renewal_contract',
      'benefit_apply',
      'resignation_contact',
      'resignation_cert',
      'data_entry_resign',
    ];

    for (const value of values) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_module_handlers_module_code_enum')
             AND NOT EXISTS (
               SELECT 1
               FROM pg_enum e
               JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'exception_module_handlers_module_code_enum'
                 AND e.enumlabel = '${value}'
             ) THEN
            ALTER TYPE exception_module_handlers_module_code_enum ADD VALUE '${value}';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove enum values safely without rebuilding dependent columns.
  }
}
