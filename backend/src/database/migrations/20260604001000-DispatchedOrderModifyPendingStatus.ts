import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchedOrderModifyPendingStatus20260604001000 implements MigrationInterface {
  name = 'DispatchedOrderModifyPendingStatus20260604001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'modify_pending'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum value removal is intentionally not supported here.
  }
}
