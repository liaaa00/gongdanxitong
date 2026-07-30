import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCertificateTypes1785390139000 implements MigrationInterface {
  name = 'AddCertificateTypes1785390139000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "certificate_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "description" text,
        "display_order" integer NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_certificate_types_name" UNIQUE ("name"),
        CONSTRAINT "PK_certificate_types" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."name" IS '证明类型名称'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."description" IS '证明类型描述'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."display_order" IS '排序，数字越小越靠前'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."is_active" IS '是否启用'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."created_at" IS '创建时间'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "certificate_types"."updated_at" IS '更新时间'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "certificate_types"`);
  }
}
