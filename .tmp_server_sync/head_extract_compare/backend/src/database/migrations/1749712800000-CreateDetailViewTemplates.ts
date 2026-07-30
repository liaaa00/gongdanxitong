import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDetailViewTemplates1749712800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'detail_view_templates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'template_name',
            type: 'varchar',
            length: '100',
            comment: '模板名称',
          },
          {
            name: 'module_code',
            type: 'varchar',
            length: '50',
            comment: '模块代码',
          },
          {
            name: 'field_list',
            type: 'jsonb',
            comment: '字段列表配置',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            comment: '是否启用',
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
            comment: '创建人',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'detail_view_templates',
      new TableIndex({
        name: 'idx_detail_view_templates_module',
        columnNames: ['module_code'],
      }),
    );

    await queryRunner.createIndex(
      'detail_view_templates',
      new TableIndex({
        name: 'idx_detail_view_templates_active',
        columnNames: ['is_active'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('detail_view_templates');
  }
}
