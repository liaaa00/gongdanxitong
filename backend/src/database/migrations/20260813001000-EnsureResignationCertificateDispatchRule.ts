import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureResignationCertificateDispatchRule20260813001000 implements MigrationInterface {
  name = 'EnsureResignationCertificateDispatchRule20260813001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE dispatch_rules
         SET order_type = 'resignation'::order_type_enum,
             trigger_conditions = '{"op":"AND","children":[{"field":"need_resignation_cert","op":"EQ","value":"是"}]}'::jsonb,
             target_module = 'resignation_cert',
             customer_id = NULL,
             department_id = NULL,
             sub_module = NULL,
             assignee_user_id = NULL,
             fallback_user_id = NULL,
             allow_manual_override = true,
             dispatch_strategy = 'fixed'::dispatch_strategy_enum,
             is_active = true,
             priority = 20,
             business_scope = 'beilun'
       WHERE rule_name = 'resignation-certificate-when-needed'
         AND business_scope = 'beilun'
    `);

    await queryRunner.query(`
      INSERT INTO dispatch_rules (
        rule_name, business_scope, order_type, trigger_conditions, target_module,
        customer_id, department_id, sub_module, assignee_user_id, fallback_user_id,
        allow_manual_override, dispatch_strategy, is_active, priority, created_at
      )
      SELECT
        'resignation-certificate-when-needed',
        'beilun',
        'resignation'::order_type_enum,
        '{"op":"AND","children":[{"field":"need_resignation_cert","op":"EQ","value":"是"}]}'::jsonb,
        'resignation_cert',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        true,
        'fixed'::dispatch_strategy_enum,
        true,
        20,
        now()
      WHERE NOT EXISTS (
        SELECT 1
          FROM dispatch_rules
         WHERE rule_name = 'resignation-certificate-when-needed'
           AND business_scope = 'beilun'
      )
    `);

    await queryRunner.query(`
      UPDATE dispatch_rules
         SET is_active = false
       WHERE order_type = 'resignation'::order_type_enum
         AND target_module = 'resignation_cert'
         AND business_scope = 'beilun'
         AND rule_name <> 'resignation-certificate-when-needed'
    `);
  }

  public async down(): Promise<void> {
    // Existing configuration ownership cannot be inferred; rollback uses the predeploy config backup.
  }
}
