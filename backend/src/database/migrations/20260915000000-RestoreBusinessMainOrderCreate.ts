import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLES = ['business_group_member', 'business_group_leader', 'biz_member', 'biz_leader', 'salesperson'];
const ACTIONS = ['work_order.create', 'route.work_order_create'];

export class RestoreBusinessMainOrderCreate20260915000000 implements MigrationInterface {
  name = 'RestoreBusinessMainOrderCreate20260915000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 20260911001000 sparse overrides wiped the default work_order.* actions; the
    // 20260914220000 recovery migration only restored import. Restore single-order
    // create for the same business roles in both scopes, idempotently.
    for (const scope of ['beilun', 'out_of_province']) {
      const key = `roleActionPermissions.v1.${scope}`;
      const rows = await queryRunner.query('SELECT value FROM system_settings WHERE key = $1 FOR UPDATE', [key]);
      if (!rows.length) continue;
      const stored = JSON.parse(rows[0].value);
      if (!stored.roles) continue;
      for (const role of ROLES) {
        if (!Array.isArray(stored.roles[role])) continue;
        stored.roles[role] = Array.from(new Set([...stored.roles[role], ...ACTIONS]));
      }
      await queryRunner.query('UPDATE system_settings SET value = $2, updated_at = now() WHERE key = $1', [key, JSON.stringify(stored)]);
    }
  }

  async down(): Promise<void> {
    // Do not revoke business access or overwrite subsequent administrator changes.
  }
}
