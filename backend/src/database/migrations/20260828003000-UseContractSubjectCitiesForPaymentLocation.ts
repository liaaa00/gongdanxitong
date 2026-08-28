import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseContractSubjectCitiesForPaymentLocation20260828003000 implements MigrationInterface {
  name = 'UseContractSubjectCitiesForPaymentLocation20260828003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'dropdown',
             dropdown_options = NULL,
             placeholder = '请选择缴纳地',
             help_text = '选项来自启用劳动合同主体的城市配置。'
       WHERE field_code IN ('social_location', 'social_pay_region')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'text',
             dropdown_options = NULL
       WHERE field_code IN ('social_location', 'social_pay_region')
    `);
  }
}
