import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClarifyFundRatioLocationLink20260828001000 implements MigrationInterface {
  name = 'ClarifyFundRatioLocationLink20260828001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '根据缴纳地自动加载可选比例。广州、深圳的单位与个人比例可分别选择。'
       WHERE field_code = 'fund_ratio'
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '仅当前缴纳地配置了补充公积金比例时显示并可选。'
       WHERE field_code = 'supplementary_fund_ratio'
    `);
  }

  async down(): Promise<void> {
    // ponytail: keep the corrected location-based guidance during rollback.
  }
}
