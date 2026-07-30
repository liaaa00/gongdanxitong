import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignInServiceSingleBusiness20260729002000 implements MigrationInterface {
  name = 'AlignInServiceSingleBusiness20260729002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;

    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD COLUMN IF NOT EXISTS "expected_completion_date" date,
        ADD COLUMN IF NOT EXISTS "business_reason" varchar(512),
        ADD COLUMN IF NOT EXISTS "city" varchar(50),
        ADD COLUMN IF NOT EXISTS "district" varchar(50),
        ADD COLUMN IF NOT EXISTS "pending_return_status" varchar(32),
        ADD COLUMN IF NOT EXISTS "transfer_history" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "accepted_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ALTER COLUMN "contact_phone" DROP NOT NULL,
        ALTER COLUMN "requirement_type" DROP NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "in_service_orders"
      SET "status" = 'dispatched',
          "dispatched_at" = COALESCE("dispatched_at", "created_at")
      WHERE "status" = 'draft'
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD CONSTRAINT "chk_in_service_orders_status"
        CHECK ("status" IN (
          'draft', 'dispatched', 'accepted', 'ready', 'processing',
          'pending_info', 'completed', 'failed', 'cancelled', 'archived'
        ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;

    await queryRunner.query(`
      UPDATE "in_service_orders"
      SET "status" = CASE
        WHEN "status" IN ('accepted', 'ready') THEN 'dispatched'
        WHEN "status" = 'failed' THEN 'completed'
        WHEN "status" = 'cancelled' THEN 'archived'
        ELSE "status"
      END
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD CONSTRAINT "chk_in_service_orders_status"
        CHECK ("status" IN ('draft','dispatched','processing','pending_info','completed','archived'))
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        DROP COLUMN IF EXISTS "confirmed_at",
        DROP COLUMN IF EXISTS "accepted_at",
        DROP COLUMN IF EXISTS "transfer_history",
        DROP COLUMN IF EXISTS "pending_return_status",
        DROP COLUMN IF EXISTS "district",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "business_reason",
        DROP COLUMN IF EXISTS "expected_completion_date"
    `);
  }
}
