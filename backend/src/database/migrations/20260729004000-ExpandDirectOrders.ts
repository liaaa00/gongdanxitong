import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandDirectOrders20260729004000 implements MigrationInterface {
  name = 'ExpandDirectOrders20260729004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;

    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD COLUMN IF NOT EXISTS "order_kind" varchar(40) NOT NULL DEFAULT 'single_business',
        ADD COLUMN IF NOT EXISTS "business_scope" varchar(32) NOT NULL DEFAULT 'beilun',
        ADD COLUMN IF NOT EXISTS "employee_name" varchar(128),
        ADD COLUMN IF NOT EXISTS "id_card_no" varchar(64),
        ADD COLUMN IF NOT EXISTS "extra_data" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ALTER COLUMN "business_type" DROP NOT NULL,
        ALTER COLUMN "process_type" DROP NOT NULL,
        ALTER COLUMN "province" DROP NOT NULL,
        ALTER COLUMN "business_description" DROP NOT NULL,
        ALTER COLUMN "service_fee" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_kind",
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_business_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ADD CONSTRAINT "chk_in_service_orders_kind"
        CHECK ("order_kind" IN (
          'single_business', 'contract_renewal', 'certificate',
          'resignation_certificate', 'out_of_province_increase',
          'out_of_province_decrease'
        )),
        ADD CONSTRAINT "chk_in_service_orders_business_scope"
        CHECK ("business_scope" IN ('beilun', 'out_of_province'))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_in_service_orders_kind_scope"
      ON "in_service_orders" ("order_kind", "business_scope")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('in_service_orders'))) return;

    await queryRunner.query(`
      UPDATE "in_service_orders"
      SET "business_type" = COALESCE("business_type", 'other'),
          "process_type" = COALESCE("process_type", 'professional_title_recognition'),
          "province" = COALESCE("province", '浙江'),
          "business_description" = COALESCE("business_description", ''),
          "service_fee" = COALESCE("service_fee", 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        ALTER COLUMN "business_type" SET NOT NULL,
        ALTER COLUMN "process_type" SET NOT NULL,
        ALTER COLUMN "province" SET NOT NULL,
        ALTER COLUMN "business_description" SET NOT NULL,
        ALTER COLUMN "service_fee" SET NOT NULL
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_in_service_orders_kind_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "in_service_orders"
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_kind",
        DROP CONSTRAINT IF EXISTS "chk_in_service_orders_business_scope",
        DROP COLUMN IF EXISTS "extra_data",
        DROP COLUMN IF EXISTS "id_card_no",
        DROP COLUMN IF EXISTS "employee_name",
        DROP COLUMN IF EXISTS "business_scope",
        DROP COLUMN IF EXISTS "order_kind"
    `);
  }
}
