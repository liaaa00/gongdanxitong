import { MigrationInterface, QueryRunner } from 'typeorm';

const RESIGNATION_REASON_OPTIONS = [
  '个人辞职',
  '公司解聘',
  '协商解除（个人提出）',
  '协商解除（公司提出）',
  '合同到期不续签（个人提出）',
  '合同到期不续签（公司提出）',
  '试用期不符合录用条件',
  '社保缴纳地变更',
  '员工退休或死亡',
  '客户流失或破产',
  '法人变更',
];

export class ConfigureResignationReasonDropdown20260901001000 implements MigrationInterface {
  name = 'ConfigureResignationReasonDropdown20260901001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
          SET field_type = 'dropdown',
              dropdown_options = $1::jsonb,
              help_text = '请选择固定离职原因。历史工单中的自由文本仅保留展示。'
        WHERE field_code = 'resignation_reason'
          AND order_type = 'resignation'::order_type_enum`,
      [JSON.stringify(RESIGNATION_REASON_OPTIONS)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
          SET field_type = 'text',
              dropdown_options = NULL
        WHERE field_code = 'resignation_reason'
          AND order_type = 'resignation'::order_type_enum`,
    );
  }
}
