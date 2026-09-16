import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLES = ['business_group_member', 'business_group_leader', 'biz_member', 'biz_leader', 'salesperson'];
const ACTIONS = ['work_order.import', 'route.work_order_import'];

export class RestoreProvinceMainOrderImport20260916000000 implements MigrationInterface {
  name = 'RestoreProvinceMainOrderImport20260916000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 20260914220000 restored main-order import only for the beilun scope; the
    // out_of_province roles still lack work_order.import after the sparse
    // 20260911001000 override. Mirror the same recovery for out_of_province.
    const key = 'roleActionPermissions.v1.out_of_province';
    const rows = await queryRunner.query('SELECT value FROM system_settings WHERE key = $1 FOR UPDATE', [key]);
    if (!rows.length) return;
    const stored = JSON.parse(rows[0].value);
    if (!stored.roles) return;
    for (const role of ROLES) {
      if (!Array.isArray(stored.roles[role])) continue;
      stored.roles[role] = Array.from(new Set([...stored.roles[role], ...ACTIONS]));
    }
    await queryRunner.query('UPDATE system_settings SET value = $2, updated_at = now() WHERE key = $1', [key, JSON.stringify(stored)]);
  }

  async down(): Promise<void> {
    // Do not revoke business access or overwrite subsequent administrator changes.
  }
}
