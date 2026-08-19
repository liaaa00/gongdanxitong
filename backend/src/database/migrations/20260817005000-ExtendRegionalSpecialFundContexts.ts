import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendRegionalSpecialFundContexts20260817005000 implements MigrationInterface {
  name = 'ExtendRegionalSpecialFundContexts20260817005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
       SET business_context = '["onboarding","renewal","resignation"]'::jsonb,
           help_text = '仅选择配置了补充公积金的劳动合同主体时显示并可选。'
       WHERE field_code = 'supplementary_fund_ratio'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
       SET business_context = '["onboarding","resignation"]'::jsonb,
           help_text = '仅选择配置了补充公积金的上海劳动合同主体时显示并可选。'
       WHERE field_code = 'supplementary_fund_ratio'`,
    );
  }
}
