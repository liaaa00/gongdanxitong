import { MigrationInterface, QueryRunner } from 'typeorm';

export class DisableSocialUrgeField20260520002000 implements MigrationInterface {
  name = 'DisableSocialUrgeField20260520002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = false,
             is_required = false,
             default_required = false,
             collection_group = NULL
       WHERE field_code = 'social_urge'
    `);
    await queryRunner.query(`DELETE FROM field_permissions WHERE field_code = 'social_urge'`);
    await queryRunner.query(`UPDATE work_orders SET extra_data = COALESCE(extra_data, '{}'::jsonb) - 'social_urge' WHERE extra_data ? 'social_urge'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = true,
             is_required = false,
             default_required = false
       WHERE field_code = 'social_urge'
    `);
  }
}
