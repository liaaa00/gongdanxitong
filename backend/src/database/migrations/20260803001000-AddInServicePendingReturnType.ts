import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2026-08-03 口径：单项业务办理人的「初审不通过」与「审核退回」拆成两个独立操作。
 * 两者仍复用 pending_info 状态与补料重提回环，新增 pending_return_type 记录退回类型：
 * initial_review = 初审不通过（内部材料审核不通过），authority_review = 审核退回（政府部门反馈）。
 * 历史待补料工单按来源状态回填，无法判定的保持 null，不改变任何工单状态。
 */
export class AddInServicePendingReturnType20260803001000 implements MigrationInterface {
  name = 'AddInServicePendingReturnType20260803001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;

    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD COLUMN IF NOT EXISTS "pending_return_type" varchar(32)
    `);

    // 历史数据回填：待补料工单按记录的来源状态推断退回类型，不触碰其他状态。
    await queryRunner.query(`
      UPDATE "in_service_orders"
      SET "pending_return_type" = CASE
        WHEN "pending_return_status" = 'accepted' THEN 'initial_review'
        WHEN "pending_return_status" = 'processing' THEN 'authority_review'
        ELSE NULL
      END
      WHERE "status" = 'pending_info' AND "pending_return_type" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;
    await queryRunner.query(`
      ALTER TABLE "in_service_orders" DROP COLUMN IF EXISTS "pending_return_type"
    `);
  }
}
