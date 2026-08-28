import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfigureBeilunResignationDataEntryHandler20260826001000 implements MigrationInterface {
  name = 'ConfigureBeilunResignationDataEntryHandler20260826001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const users = (await queryRunner.query(`
      SELECT id
      FROM users
      WHERE username = 'chenyujie'
        AND real_name = '陈雨杰'
        AND business_scope = 'beilun'
        AND is_active = true
      LIMIT 1
    `)) as unknown as Array<{ id: string }>;
    const handlerId = users[0]?.id;
    if (!handlerId) return;

    await queryRunner.query(`
      UPDATE work_order_modules
      SET dispatch_strategy = 'fixed', updated_at = now()
      WHERE module_code = 'data_entry_resign'
        AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE module_handlers
      SET is_active = false
      WHERE module_code = 'data_entry_resign'
        AND business_scope = 'beilun'
        AND handler_id <> $1
        AND is_active = true
    `, [handlerId]);
    await queryRunner.query(`
      UPDATE module_handlers
      SET is_active = true, is_backup = false, weight = 1
      WHERE module_code = 'data_entry_resign'
        AND business_scope = 'beilun'
        AND handler_id = $1
    `, [handlerId]);
    await queryRunner.query(`
      INSERT INTO module_handlers (module_code, business_scope, handler_id, weight, is_backup, is_active)
      SELECT 'data_entry_resign', 'beilun', $1, 1, false, true
      WHERE NOT EXISTS (
        SELECT 1
        FROM module_handlers
        WHERE module_code = 'data_entry_resign'
          AND business_scope = 'beilun'
          AND handler_id = $1
      )
    `, [handlerId]);
  }

  async down(): Promise<void> {
    // ponytail: do not reactivate former handlers automatically; choose replacements through the audited handover flow.
  }
}
