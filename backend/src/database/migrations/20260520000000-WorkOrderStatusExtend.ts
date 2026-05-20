import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkOrderStatusExtend20260520000000 implements MigrationInterface {
  name = 'WorkOrderStatusExtend20260520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'withdraw_pending'`);
    await queryRunner.query(`ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void_pending'`);
    await queryRunner.query(`ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'void'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum value removal is intentionally not supported here.
    // Reverting would require creating a replacement enum type, rewriting dependent columns,
    // and handling rows that may already use withdraw_pending / void_pending / void.
  }
}
