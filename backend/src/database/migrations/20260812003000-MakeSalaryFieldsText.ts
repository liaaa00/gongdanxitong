import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeSalaryFieldsText20260812003000 implements MigrationInterface {
  name = 'MakeSalaryFieldsText20260812003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'text'::field_type_enum,
             validation_regex = NULL,
             validation_msg = NULL,
             help_text = '可填写数字、货币格式或文字说明。'
       WHERE field_code IN ('base_salary', 'probation_salary')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'number'::field_type_enum,
             help_text = '数字格式：保留小数点后两位。'
       WHERE field_code IN ('base_salary', 'probation_salary')
    `);
  }
}
