import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 把胡嘉逸的模块处理人激活配置对齐到杨纯（用户 2026-09-17 明确要求）。
 * 仅补齐 renewal_contract、resignation_cert 两个模块的处理人行，
 * 字段拷贝杨纯对应行、仅换 handler_id；纯个人信息不做对齐。
 * 杨纯或胡嘉逸任一账号缺失时整体跳过，不影响其他环境执行。
 */
export class AlignHujiayiModuleHandlers20260917030000 implements MigrationInterface {
  name = 'AlignHujiayiModuleHandlers20260917030000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const users = (await queryRunner.query(`
      SELECT id, real_name
      FROM users
      WHERE ((username = 'yangchun' AND real_name = '杨纯')
          OR (username = 'hujiayi' AND real_name = '胡嘉逸'))
        AND business_scope = 'beilun'
        AND is_active = true
    `)) as unknown as Array<{ id: string; real_name: string }>;
    const yangchunId = users.find((u) => u.real_name === '杨纯')?.id;
    const hujiayiId = users.find((u) => u.real_name === '胡嘉逸')?.id;
    if (!yangchunId || !hujiayiId) return;

    await queryRunner.query(`
      INSERT INTO module_handlers (module_code, business_scope, handler_id, weight, is_backup, is_active)
      SELECT source.module_code, source.business_scope, $1, source.weight, source.is_backup, true
      FROM module_handlers source
      WHERE source.handler_id = $2
        AND source.is_active = true
        AND source.module_code IN ('renewal_contract', 'resignation_cert')
        AND NOT EXISTS (
          SELECT 1
          FROM module_handlers target
          WHERE target.module_code = source.module_code
            AND target.handler_id = $1
        )
    `, [hujiayiId, yangchunId]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const users = (await queryRunner.query(`
      SELECT id
      FROM users
      WHERE username = 'hujiayi' AND real_name = '胡嘉逸'
      LIMIT 1
    `)) as unknown as Array<{ id: string }>;
    const hujiayiId = users[0]?.id;
    if (!hujiayiId) return;

    await queryRunner.query(`
      DELETE FROM module_handlers
      WHERE handler_id = $1
        AND module_code IN ('renewal_contract', 'resignation_cert')
    `, [hujiayiId]);
  }
}
