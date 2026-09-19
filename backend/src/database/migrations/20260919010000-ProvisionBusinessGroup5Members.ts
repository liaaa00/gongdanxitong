import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增业务5组两名业务员：陈诗（chenshi）、何楚红（hechuhong）（用户 2026-09-19 明确要求）。
 * - 角色固定 biz_member（业务员（组员）），主部门 BUSINESS_GROUP_5（业务5组，北仑范围）；
 *   路由/动作权限经 legacy-permission-baseline 的 canonical 别名自动生效，无需另配权限中心。
 * - 初始密码 123456（bcrypt，与 seed-users 同款），首登强制改密；email 置空由管理员补录。
 * - 幂等：ON CONFLICT 防重；任一前置（角色/部门）缺失时整体跳过，不影响其他环境执行。
 * - down 仅停用账号不删除，避免已产生审计/业务记录后的级联清理（沿用福利专员迁移的保守策略）。
 */
export class ProvisionBusinessGroup5Members20260919010000 implements MigrationInterface {
  name = 'ProvisionBusinessGroup5Members20260919010000';

  private static readonly MEMBERS = [
    { username: 'chenshi', realName: '陈诗' },
    { username: 'hechuhong', realName: '何楚红' },
  ] as const;

  private static readonly TEMPORARY_PASSWORD_HASH = '$2b$10$t86lP7yfIqyYvpkJmLkSpOeE3W/7hRR07j/j0FtEw2ZP5q7RALrKe';

  async up(queryRunner: QueryRunner): Promise<void> {
    const anchors = (await queryRunner.query(`
      SELECT
        (SELECT id FROM roles WHERE code = 'biz_member' AND is_active = true LIMIT 1) AS role_id,
        (SELECT id FROM departments WHERE code = 'BUSINESS_GROUP_5' AND business_scope = 'beilun' AND is_active = true LIMIT 1) AS department_id
    `)) as unknown as Array<{ role_id: string; department_id: string }>;
    const roleId = anchors[0]?.role_id;
    const departmentId = anchors[0]?.department_id;
    if (!roleId || !departmentId) return;

    await queryRunner.query(`
      INSERT INTO users (
        username, real_name, email, phone, password_hash, avatar_url, is_active,
        business_scope, must_change_password, password_updated_at,
        auth_version, failed_login_attempts, locked_until
      )
      SELECT seed.username, seed.real_name, NULL, NULL, $1, NULL, true,
             'beilun', true, NULL, 0, 0, NULL
      FROM (VALUES
        ('chenshi', '陈诗'),
        ('hechuhong', '何楚红')
      ) AS seed(username, real_name)
      ON CONFLICT (username) DO UPDATE
        SET real_name = EXCLUDED.real_name,
            is_active = true
      WHERE users.business_scope = 'beilun'
    `, [ProvisionBusinessGroup5Members20260919010000.TEMPORARY_PASSWORD_HASH]);

    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id, department_id, is_primary)
      SELECT user_row.id, $1, $2, true
      FROM users user_row
      WHERE user_row.username = ANY($3::varchar[])
        AND user_row.business_scope = 'beilun'
      ON CONFLICT (user_id, role_id, department_id) DO UPDATE
        SET is_primary = true
    `, [roleId, departmentId, ProvisionBusinessGroup5Members20260919010000.MEMBERS.map((member) => member.username)]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET is_active = false
      WHERE username = ANY($1::varchar[])
        AND business_scope = 'beilun'
        AND NOT EXISTS (
          SELECT 1 FROM user_roles relation
          JOIN departments department ON department.id = relation.department_id
          WHERE relation.user_id = users.id
            AND (department.code <> 'BUSINESS_GROUP_5' OR department.business_scope <> 'beilun')
        )
    `, [ProvisionBusinessGroup5Members20260919010000.MEMBERS.map((member) => member.username)]);
  }
}
