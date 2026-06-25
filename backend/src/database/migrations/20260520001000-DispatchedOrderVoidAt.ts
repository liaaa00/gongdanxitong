import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchedOrderVoidAt20260520001000 implements MigrationInterface {
  name = 'DispatchedOrderVoidAt20260520001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatched_orders ADD COLUMN IF NOT EXISTS void_at timestamptz NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatched_orders DROP COLUMN IF EXISTS void_at`);
  }
}
