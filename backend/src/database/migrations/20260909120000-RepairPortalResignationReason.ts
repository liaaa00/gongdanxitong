import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairPortalResignationReason20260909120000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE field_configs SET field_type='dropdown', dropdown_options='["个人辞职","公司解聘","协商解除（个人提出）","协商解除（公司提出）","合同到期不续签（个人提出）","合同到期不续签（公司提出）","试用期不符合录用条件","社保缴纳地变更","员工退休或死亡","客户流失或破产","法人变更"]'::jsonb WHERE field_code='resignation_reason'`);
  }
  async down(): Promise<void> {}
}
