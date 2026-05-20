import { MigrationInterface, QueryRunner } from 'typeorm';

export class P7Extend1715800000000 implements MigrationInterface {
  name = 'P7Extend1715800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. order_type_enum 补值（renewal / resignation / benefit）
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'order_type_enum' AND e.enumlabel = 'renewal'
        ) THEN
          ALTER TYPE order_type_enum ADD VALUE 'renewal';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'order_type_enum' AND e.enumlabel = 'resignation'
        ) THEN
          ALTER TYPE order_type_enum ADD VALUE 'resignation';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'order_type_enum' AND e.enumlabel = 'benefit'
        ) THEN
          ALTER TYPE order_type_enum ADD VALUE 'benefit';
        END IF;
      END $$;
    `);

    // 2. field_configs 增加 business_context 列（JSONB 数组）区分业务域。
    //    取值示例：["onboarding"] / ["renewal"] / ["resignation"] / ["benefit"] /
    //    ["onboarding","renewal","resignation","benefit"]（公共字段）
    //    该列与 order_type 并存，查询语义以 business_context 优先，
    //    未设置时回退到旧的 order_type 单值，保持向后兼容。
    await queryRunner.query(`
      ALTER TABLE field_configs
      ADD COLUMN IF NOT EXISTS business_context jsonb
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fc_business_context
        ON field_configs USING GIN (business_context)
    `);

    // 3. order_attachments：所有订单类型的附件总表（待遇材料 / 离职证明 / 续签合同回传）
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS order_attachments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        dispatched_order_id uuid NULL REFERENCES dispatched_orders(id) ON DELETE SET NULL,
        biz_purpose varchar(64) NOT NULL,
        file_id varchar(128) NOT NULL,
        file_name varchar(255) NOT NULL,
        original_name varchar(255) NOT NULL,
        mime_type varchar(128) NOT NULL,
        file_path varchar(1024) NOT NULL,
        file_size bigint NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'uploaded',
        reject_reason varchar(512),
        stamp_no varchar(128),
        stamped_at timestamptz,
        received_at timestamptz,
        reviewed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_oa_wo ON order_attachments(work_order_id)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_oa_do ON order_attachments(dispatched_order_id)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_oa_status ON order_attachments(status)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_oa_purpose ON order_attachments(biz_purpose)');

    // 4. order_stages：订单节点流水（待遇申报 6 节点 + 续签 / 离职的简单节点）
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS order_stages (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        dispatched_order_id uuid NULL REFERENCES dispatched_orders(id) ON DELETE SET NULL,
        stage_code varchar(64) NOT NULL,
        stage_name varchar(128) NOT NULL,
        stage_status varchar(32) NOT NULL DEFAULT 'done',
        happened_at timestamptz NOT NULL DEFAULT now(),
        operator_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_os_do_time ON order_stages(dispatched_order_id, happened_at DESC)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_os_stage ON order_stages(stage_code)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_os_wo_time ON order_stages(work_order_id, happened_at DESC)');

    // 5. 软下线 social_security：停用角色 / 规则 / 处理人映射，并将社保场景的字段权限全部置 hidden
    await queryRunner.query("UPDATE roles SET is_active = false WHERE code IN ('social_security_team', 'social_security_supervisor')");
    await queryRunner.query("UPDATE dispatch_rules SET is_active = false WHERE target_module = 'social_security'");
    await queryRunner.query("UPDATE module_handlers SET is_active = false WHERE module_code = 'social_security'");
    await queryRunner.query("UPDATE field_permissions SET permission = 'hidden' WHERE scenario = 'dispatched:social_security'");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE field_permissions SET permission = 'visible' WHERE scenario = 'dispatched:social_security' AND permission = 'hidden'");
    await queryRunner.query("UPDATE module_handlers SET is_active = true WHERE module_code = 'social_security'");
    await queryRunner.query("UPDATE dispatch_rules SET is_active = true WHERE target_module = 'social_security'");
    await queryRunner.query("UPDATE roles SET is_active = true WHERE code IN ('social_security_team', 'social_security_supervisor')");
    await queryRunner.query('DROP TABLE IF EXISTS order_stages');
    await queryRunner.query('DROP TABLE IF EXISTS order_attachments');
    await queryRunner.query('DROP INDEX IF EXISTS idx_fc_business_context');
    await queryRunner.query('ALTER TABLE field_configs DROP COLUMN IF EXISTS business_context');
    // order_type_enum 新值无法通过 ALTER TYPE DROP VALUE 删除，不回退（无副作用）
  }
}
