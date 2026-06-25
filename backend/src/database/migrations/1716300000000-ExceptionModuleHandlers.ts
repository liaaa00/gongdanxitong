import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExceptionModuleHandlers1716300000000 implements MigrationInterface {
  name = 'ExceptionModuleHandlers1716300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_module_handlers_module_code_enum') THEN
          CREATE TYPE exception_module_handlers_module_code_enum AS ENUM (
            'data_entry',
            'social_insurance',
            'onboarding_contact',
            'contract'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exception_module_handlers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code exception_module_handlers_module_code_enum NOT NULL,
        customer_code varchar(64) NOT NULL,
        handler_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_exception_module_handlers_module_customer UNIQUE(module_code, customer_code)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_exception_module_handlers_handler ON exception_module_handlers(handler_id)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_exception_module_handlers_lookup ON exception_module_handlers(module_code, customer_code)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_exception_module_handlers_lookup');
    await queryRunner.query('DROP INDEX IF EXISTS idx_exception_module_handlers_handler');
    await queryRunner.query('DROP TABLE IF EXISTS exception_module_handlers');
    await queryRunner.query('DROP TYPE IF EXISTS exception_module_handlers_module_code_enum');
  }
}
