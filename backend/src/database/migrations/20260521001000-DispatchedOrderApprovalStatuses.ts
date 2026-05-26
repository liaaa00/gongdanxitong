import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchedOrderApprovalStatuses20260521001000 implements MigrationInterface {
  name = 'DispatchedOrderApprovalStatuses20260521001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'withdraw_pending'`);
    await queryRunner.query(`ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'withdrawn'`);
    await queryRunner.query(`ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'void_pending'`);
    await queryRunner.query(`ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'void'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum value removal is intentionally not supported here.
    // Reverting would require replacing the enum type and rewriting dispatched_orders.status safely.
  }
}
