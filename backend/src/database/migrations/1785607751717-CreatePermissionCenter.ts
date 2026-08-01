import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePermissionCenter1785607751717 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建权限配置版本表
    await queryRunner.createTable(
      new Table({
        name: 'permission_config_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'activated_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 创建权限变更审计表
    await queryRunner.createTable(
      new Table({
        name: 'permission_change_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'version_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'change_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'target_resource',
            type: 'varchar',
            length: '200',
            isNullable: false,
          },
          {
            name: 'old_value',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'new_value',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'changed_by',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'changed_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'permission_change_logs',
      new TableIndex({
        name: 'idx_perm_logs_version',
        columnNames: ['version_id'],
      }),
    );

    await queryRunner.createIndex(
      'permission_change_logs',
      new TableIndex({
        name: 'idx_perm_logs_time',
        columnNames: ['changed_at'],
      }),
    );

    await queryRunner.createIndex(
      'permission_config_versions',
      new TableIndex({
        name: 'idx_perm_config_active',
        columnNames: ['is_active', 'activated_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.dropIndex('permission_change_logs', 'idx_perm_logs_version');
    await queryRunner.dropIndex('permission_change_logs', 'idx_perm_logs_time');
    await queryRunner.dropIndex('permission_config_versions', 'idx_perm_config_active');

    // 删除表
    await queryRunner.dropTable('permission_change_logs');
    await queryRunner.dropTable('permission_config_versions');
  }
}
