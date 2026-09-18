import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 多主体门户账号 · 批次3 最小闭环（2026-09-17 会议拍板口径）：
 * 一个客户组=一个门户账号，组下挂多个客户主体。
 * 新增账号↔主体关联表 customer_portal_account_links：
 * - accounts.customer_id 保留不动，作为"主主体"外键（既有按 customerId 收窄的代码语义不变）；
 * - UNIQUE(account_id, customer_id) 防重复挂载；
 * - partial unique ON (account_id) WHERE is_primary 保证一账号唯一主主体；
 * - customer_id 外键 RESTRICT：客户删除仅管理员（回归清单 §44），有挂载账号时禁止删除。
 * 回填：每个存量账号生成一条 is_primary=true 的单成员关联，历史受理归属不变。
 * down 仅 drop 表，不动 accounts，完全可逆。
 */
export class CreatePortalAccountLinks20260917010000 implements MigrationInterface {
  name = 'CreatePortalAccountLinks20260917010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_account_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        is_primary boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_portal_account_links_account
          FOREIGN KEY (account_id) REFERENCES customer_portal_accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_portal_account_links_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        CONSTRAINT uq_portal_account_links_account_customer UNIQUE (account_id, customer_id)
      )
    `);
    // 一账号唯一主主体（PostgreSQL partial unique index）
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_account_links_primary
        ON customer_portal_account_links (account_id) WHERE is_primary
    `);
    // 内部侧反查"该主体被哪些账号挂载"
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_portal_account_links_customer
        ON customer_portal_account_links (customer_id)
    `);
    // 回填存量单主体账号：每个现存账号一条"单成员"主主体关联。
    // accounts.customer_id 即历史提交主体，历史受理记录归属不变。
    await queryRunner.query(`
      INSERT INTO customer_portal_account_links (account_id, customer_id, is_primary)
      SELECT id, customer_id, true
        FROM customer_portal_accounts
      ON CONFLICT (account_id, customer_id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS customer_portal_account_links`);
  }
}
