import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreatePermissionCenter1785607751717 implements MigrationInterface {
  name = 'CreatePermissionCenter1785607751717';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('permission_config_versions'))) {
      await queryRunner.createTable(new Table({
        name: 'permission_config_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'activated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_permission_config_versions_created_by',
            columnNames: ['created_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        ],
      }), true);
    }

    if (!(await queryRunner.hasTable('permission_change_logs'))) {
      await queryRunner.createTable(new Table({
        name: 'permission_change_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
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
            isNullable: true,
          },
          {
            name: 'changed_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_permission_change_logs_version',
            columnNames: ['version_id'],
            referencedTableName: 'permission_config_versions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'fk_permission_change_logs_changed_by',
            columnNames: ['changed_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        ],
      }), true);
    }

    const indexes: Array<[string, TableIndex]> = [
      [
        'permission_config_versions',
        new TableIndex({
          name: 'idx_permission_config_versions_version',
          columnNames: ['version'],
        }),
      ],
      [
        'permission_config_versions',
        new TableIndex({
          name: 'idx_permission_config_versions_active',
          columnNames: ['is_active', 'activated_at'],
        }),
      ],
      [
        'permission_change_logs',
        new TableIndex({
          name: 'idx_permission_change_logs_version',
          columnNames: ['version_id'],
        }),
      ],
      [
        'permission_change_logs',
        new TableIndex({
          name: 'idx_permission_change_logs_changed_at',
          columnNames: ['changed_at'],
        }),
      ],
    ];

    for (const [tableName, index] of indexes) {
      const table = await queryRunner.getTable(tableName);
      if (table && !table.indices.some((existing) => existing.name === index.name)) {
        await queryRunner.createIndex(tableName, index);
      }
    }

    await queryRunner.query(
      `COMMENT ON TABLE "permission_config_versions" IS 'Permission configuration versions'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "permission_change_logs" IS 'Permission configuration change audit log'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('permission_change_logs')) {
      await queryRunner.dropTable('permission_change_logs', true, true, true);
    }
    if (await queryRunner.hasTable('permission_config_versions')) {
      await queryRunner.dropTable('permission_config_versions', true, true, true);
    }
  }
}
