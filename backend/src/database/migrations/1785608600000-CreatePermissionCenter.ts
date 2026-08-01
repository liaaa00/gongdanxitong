import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePermissionCenter1785608600000 implements MigrationInterface {
  name = 'CreatePermissionCenter1785608600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建权限配置版本表
    await queryRunner.query(`
      CREATE TABLE "permission_config_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "version" character varying(50) NOT NULL,
        "config" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "activated_at" TIMESTAMP,
        "description" text,
        CONSTRAINT "PK_permission_config_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permission_config_version" UNIQUE ("version")
      )
    `);

    // 创建权限变更审计表
    await queryRunner.query(`
      CREATE TABLE "permission_change_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "version_id" uuid NOT NULL,
        "change_type" character varying(50) NOT NULL,
        "target_resource" character varying(200) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "changed_by" uuid,
        "changed_at" TIMESTAMP NOT NULL DEFAULT now(),
        "reason" text,
        CONSTRAINT "PK_permission_change_logs" PRIMARY KEY ("id")
      )
    `);

    // 添加外键约束
    await queryRunner.query(`
      ALTER TABLE "permission_change_logs"
      ADD CONSTRAINT "FK_permission_change_logs_version"
      FOREIGN KEY ("version_id")
      REFERENCES "permission_config_versions"("id")
      ON DELETE CASCADE
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX "IDX_permission_config_version"
      ON "permission_config_versions" ("version")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permission_config_active"
      ON "permission_config_versions" ("is_active", "activated_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permission_logs_version"
      ON "permission_change_logs" ("version_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permission_logs_time"
      ON "permission_change_logs" ("changed_at" DESC)
    `);

    // 添加表注释
    await queryRunner.query(`
      COMMENT ON TABLE "permission_config_versions" IS '权限配置版本表'
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "permission_change_logs" IS '权限变更审计表'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX "IDX_permission_logs_time"`);
    await queryRunner.query(`DROP INDEX "IDX_permission_logs_version"`);
    await queryRunner.query(`DROP INDEX "IDX_permission_config_active"`);
    await queryRunner.query(`DROP INDEX "IDX_permission_config_version"`);

    // 删除外键约束
    await queryRunner.query(`
      ALTER TABLE "permission_change_logs"
      DROP CONSTRAINT "FK_permission_change_logs_version"
    `);

    // 删除表
    await queryRunner.query(`DROP TABLE "permission_change_logs"`);
    await queryRunner.query(`DROP TABLE "permission_config_versions"`);
  }
}
