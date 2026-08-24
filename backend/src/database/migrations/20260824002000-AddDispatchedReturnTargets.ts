import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDispatchedReturnTargets20260824002000 implements MigrationInterface {
  name = 'AddDispatchedReturnTargets20260824002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatched_orders
        ADD COLUMN IF NOT EXISTS return_target_type varchar(32),
        ADD COLUMN IF NOT EXISTS return_target_id uuid
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatched_orders
        DROP COLUMN IF EXISTS return_target_id,
        DROP COLUMN IF EXISTS return_target_type
    `);
  }
}
