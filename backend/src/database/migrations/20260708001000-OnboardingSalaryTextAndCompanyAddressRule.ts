import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 入职字段规则调整：
 * 1. 其他工资、试用期其他工资改为文本字段，允许填写“数字+文字说明”。
 * 2. 甲方住所只跟随电子签平台判断：E签宝必填，速创非必填。
 */
const salaryTextHelp = '可填写文字说明，如可填写数字加文字。';
const salaryNumberHelp = '数字格式：保留小数点后两位。';
const companyAddressHelp = '电子签平台为速创时非必填；电子签平台为E签宝时必填。';
const companyAddressOldHelp = '需要填写标准的合同签订主体的详细注册地址。';
const companyAddressEsignPlatform = `'{"op":"EQ","field":"esign_platform","value":"E签宝"}'::jsonb`;
const companyAddressNeedCompanyContract = `'{"op":"EQ","field":"need_company_contract","value":"是"}'::jsonb`;

export class OnboardingSalaryTextAndCompanyAddressRule20260708001000 implements MigrationInterface {
  name = 'OnboardingSalaryTextAndCompanyAddressRule20260708001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'text',
             help_text = $1
       WHERE field_code IN ('other_salary', 'probation_other_salary')
    `, [salaryTextHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${companyAddressEsignPlatform},
             help_text = $1
       WHERE field_code = 'company_address'
    `, [companyAddressHelp]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'number',
             help_text = $1
       WHERE field_code IN ('other_salary', 'probation_other_salary')
    `, [salaryNumberHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${companyAddressNeedCompanyContract},
             help_text = $1
       WHERE field_code = 'company_address'
    `, [companyAddressOldHelp]);
  }
}
