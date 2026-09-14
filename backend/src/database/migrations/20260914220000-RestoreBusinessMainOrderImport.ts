import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreBusinessMainOrderImport20260914220000 implements MigrationInterface {
  name = 'RestoreBusinessMainOrderImport20260914220000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const key = 'roleActionPermissions.v1.beilun';
    const rows = await queryRunner.query('SELECT value FROM system_settings WHERE key = $1 FOR UPDATE', [key]);
    if (!rows.length) return;
    const stored = JSON.parse(rows[0].value);
    if (!stored.roles) return;
    // Restore only the explicitly requested main-order import entitlement.
    for (const role of ['business_group_member', 'business_group_leader', 'biz_member', 'biz_leader', 'salesperson']) {
      if (!Array.isArray(stored.roles[role])) continue;
      stored.roles[role] = Array.from(new Set([...stored.roles[role], 'work_order.import', 'route.work_order_import']));
    }
    await queryRunner.query('UPDATE system_settings SET value = $2, updated_at = now() WHERE key = $1', [key, JSON.stringify(stored)]);
  }

  async down(): Promise<void> {
    // Do not revoke business access or overwrite subsequent administrator changes.
  }
}
