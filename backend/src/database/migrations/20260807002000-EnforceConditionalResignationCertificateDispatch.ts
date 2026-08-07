import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceConditionalResignationCertificateDispatch20260807002000 implements MigrationInterface {
  name = 'EnforceConditionalResignationCertificateDispatch20260807002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE dispatch_rules
      SET is_active = false
      WHERE order_type = 'resignation'
        AND target_module = 'resignation_cert'
        AND rule_name <> 'resignation-certificate-when-needed'
    `);

    await queryRunner.query(`
      UPDATE dispatch_rules
      SET trigger_conditions = '{"op":"AND","children":[{"field":"need_resignation_cert","op":"EQ","value":"是"}]}'::jsonb,
          dispatch_strategy = 'fixed',
          priority = 20,
          is_active = true
      WHERE rule_name = 'resignation-certificate-when-needed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE dispatch_rules
      SET is_active = false
      WHERE rule_name = 'resignation-certificate-when-needed'
    `);

    await queryRunner.query(`
      UPDATE dispatch_rules
      SET is_active = true
      WHERE order_type = 'resignation'
        AND target_module = 'resignation_cert'
        AND rule_name <> 'resignation-certificate-when-needed'
    `);
  }
}
