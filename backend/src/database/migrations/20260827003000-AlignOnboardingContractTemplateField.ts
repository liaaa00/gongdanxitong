import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignOnboardingContractTemplateField20260827003000 implements MigrationInterface {
  name = 'AlignOnboardingContractTemplateField20260827003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '选择特殊模板时填写特殊合同模板名称。'
       WHERE field_code = 'contract_template'
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET collection_group = '业务判断项'
       WHERE field_code = 'special_contract_template_name'
    `);
  }

  async down(): Promise<void> {
    // ponytail: keep the clarified field metadata during rollback; reverting labels is not data-safe.
  }
}
