import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResignationCertFieldsToImportTemplate20260805005000 implements MigrationInterface {
  name = 'AddResignationCertFieldsToImportTemplate20260805005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 补充插入离职证明相关字段到导入模板配置
    // need_resignation_cert 应该在第8列（在 need_resignation_share 之后）
    // cert_delivery_address 应该在第9列

    // 先调整后续字段的 display_order（原来第8-12列现在变成第10-14列）
    await queryRunner.query(`
      UPDATE import_template_fields
      SET display_order = display_order + 2
      WHERE order_type = 'resignation'::order_type_enum
        AND field_code IN ('feedback_deadline', 'is_common_template', 'template_name')
        AND display_order >= 8
    `);

    // 然后插入新字段（先检查是否已存在，避免重复）
    await queryRunner.query(`
      INSERT INTO import_template_fields(order_type, field_code, display_order, header_alias, is_required_override, is_active)
      SELECT 'resignation'::order_type_enum, 'need_resignation_cert', 8, NULL, NULL, true
      WHERE EXISTS (SELECT 1 FROM field_configs WHERE field_code = 'need_resignation_cert')
        AND NOT EXISTS (SELECT 1 FROM import_template_fields WHERE order_type = 'resignation'::order_type_enum AND field_code = 'need_resignation_cert')
    `);

    await queryRunner.query(`
      INSERT INTO import_template_fields(order_type, field_code, display_order, header_alias, is_required_override, is_active)
      SELECT 'resignation'::order_type_enum, 'cert_delivery_address', 9, NULL, NULL, true
      WHERE EXISTS (SELECT 1 FROM field_configs WHERE field_code = 'cert_delivery_address')
        AND NOT EXISTS (SELECT 1 FROM import_template_fields WHERE order_type = 'resignation'::order_type_enum AND field_code = 'cert_delivery_address')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 恢复原来的 display_order
    await queryRunner.query(`
      UPDATE import_template_fields
      SET display_order = display_order - 2
      WHERE order_type = 'resignation'::order_type_enum
        AND field_code IN ('feedback_deadline', 'is_common_template', 'template_name')
        AND display_order >= 10
    `);

    // 删除添加的字段
    await queryRunner.query(`
      DELETE FROM import_template_fields
      WHERE order_type = 'resignation'::order_type_enum
        AND field_code IN ('need_resignation_cert', 'cert_delivery_address')
    `);
  }
}
