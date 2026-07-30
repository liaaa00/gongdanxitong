import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModuleDispatchStrategy20260526010000 implements MigrationInterface {
  name = 'ModuleDispatchStrategy20260526010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispatch_strategy_enum') THEN
          CREATE TYPE dispatch_strategy_enum AS ENUM ('fixed', 'round_robin', 'load_balance', 'pool');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE work_order_modules
      ADD COLUMN IF NOT EXISTS dispatch_strategy dispatch_strategy_enum NOT NULL DEFAULT 'pool'
    `);

    await queryRunner.query(`
      ALTER TABLE work_order_modules
      ADD COLUMN IF NOT EXISTS sla_hours integer NOT NULL DEFAULT 72
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE work_order_modules DROP COLUMN IF EXISTS sla_hours');
    await queryRunner.query('ALTER TABLE work_order_modules DROP COLUMN IF EXISTS dispatch_strategy');
  }
}
