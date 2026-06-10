import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResignationSocialInsuranceEnum20260609001000 implements MigrationInterface {
  name = 'AddResignationSocialInsuranceEnum20260609001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_module_handlers_module_code_enum')
           AND NOT EXISTS (
             SELECT 1
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'exception_module_handlers_module_code_enum'
               AND e.enumlabel = 'resignation_social_insurance'
           ) THEN
          ALTER TYPE exception_module_handlers_module_code_enum ADD VALUE 'resignation_social_insurance';
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove enum values safely without rebuilding dependent columns.
  }
}
