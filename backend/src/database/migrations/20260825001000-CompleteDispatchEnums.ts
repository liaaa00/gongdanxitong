import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteDispatchEnums20260825001000 implements MigrationInterface {
  name = 'CompleteDispatchEnums20260825001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      { typeName: 'exception_module_handlers_module_code_enum', value: 'payroll_bank_card' },
      { typeName: 'exception_module_handlers_module_code_enum', value: 'in_service_certificate' },
      { typeName: 'dispatch_strategy_enum', value: 'team_claim' },
    ];

    for (const { typeName, value } of additions) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}')
             AND NOT EXISTS (
               SELECT 1
               FROM pg_enum e
               JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = '${typeName}'
                 AND e.enumlabel = '${value}'
             ) THEN
            ALTER TYPE ${typeName} ADD VALUE '${value}';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove enum values safely without rebuilding dependent columns.
  }
}
