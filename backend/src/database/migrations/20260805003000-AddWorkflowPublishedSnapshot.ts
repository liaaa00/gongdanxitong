import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowPublishedSnapshot20260805003000 implements MigrationInterface {
  name = 'AddWorkflowPublishedSnapshot20260805003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "published_definition_json" jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "published_at" timestamptz',
    );
    await queryRunner.query(`
      UPDATE "workflow_definitions"
      SET "published_definition_json" = "definition_json",
          "version" = CASE WHEN "version" < 1 THEN 1 ELSE "version" END,
          "published_at" = COALESCE("published_at", "updated_at")
      WHERE "status" = 'published'
        AND "published_definition_json" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workflow_definitions" DROP COLUMN IF EXISTS "published_at"');
    await queryRunner.query('ALTER TABLE "workflow_definitions" DROP COLUMN IF EXISTS "version"');
    await queryRunner.query('ALTER TABLE "workflow_definitions" DROP COLUMN IF EXISTS "published_definition_json"');
  }
}
