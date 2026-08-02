import { QueryRunner, Table } from 'typeorm';
import { CreatePermissionCenter1785607751717 } from 'src/database/migrations/1785607751717-CreatePermissionCenter';

function makeQueryRunner() {
  return {
    hasTable: jest.fn().mockResolvedValue(false),
    getTable: jest.fn().mockResolvedValue({ indices: [] }),
    createTable: jest.fn().mockResolvedValue(undefined),
    createIndex: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as QueryRunner & {
    hasTable: jest.Mock;
    getTable: jest.Mock;
    createTable: jest.Mock;
    createIndex: jest.Mock;
    dropTable: jest.Mock;
    query: jest.Mock;
  };
}

function columnsByName(table: Table) {
  return Object.fromEntries(table.columns.map((column) => [column.name, column]));
}

describe('CreatePermissionCenter1785607751717 migration', () => {
  const migration = new CreatePermissionCenter1785607751717();

  it('creates the version and audit tables with their required columns', async () => {
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    expect(queryRunner.createTable).toHaveBeenCalledTimes(2);
    const [versionTable, createVersionIfMissing] = queryRunner.createTable.mock.calls[0] as [Table, boolean];
    const [logTable, createLogIfMissing] = queryRunner.createTable.mock.calls[1] as [Table, boolean];
    const versionColumns = columnsByName(versionTable);
    const logColumns = columnsByName(logTable);

    expect(versionTable.name).toBe('permission_config_versions');
    expect(createVersionIfMissing).toBe(true);
    expect(Object.keys(versionColumns)).toEqual([
      'id',
      'version',
      'config',
      'is_active',
      'created_by',
      'created_at',
      'updated_at',
      'activated_at',
      'description',
    ]);
    expect(versionColumns.id).toMatchObject({ type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' });
    expect(versionColumns.version).toMatchObject({ type: 'varchar', isUnique: true, isNullable: false });
    expect(versionColumns.config).toMatchObject({ type: 'jsonb', isNullable: false });
    expect(versionColumns.is_active).toMatchObject({ type: 'boolean', default: false });
    expect(versionTable.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'fk_permission_config_versions_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    ]);

    expect(logTable.name).toBe('permission_change_logs');
    expect(createLogIfMissing).toBe(true);
    expect(Object.keys(logColumns)).toEqual([
      'id',
      'version_id',
      'change_type',
      'target_resource',
      'old_value',
      'new_value',
      'changed_by',
      'changed_at',
      'created_at',
      'updated_at',
      'reason',
    ]);
    expect(logColumns.version_id).toMatchObject({ type: 'uuid', isNullable: false });
    expect(logColumns.old_value).toMatchObject({ type: 'jsonb', isNullable: true });
    expect(logColumns.new_value).toMatchObject({ type: 'jsonb', isNullable: true });
    expect(logColumns.changed_by).toMatchObject({ type: 'uuid', isNullable: true });
    expect(logTable.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'fk_permission_change_logs_version',
        columnNames: ['version_id'],
        referencedTableName: 'permission_config_versions',
        onDelete: 'CASCADE',
      }),
      expect.objectContaining({
        name: 'fk_permission_change_logs_changed_by',
        columnNames: ['changed_by'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    ]);
  });

  it('creates indexes for version lookup, audit chronology and active config lookup', async () => {
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    expect(queryRunner.createIndex.mock.calls).toEqual([
      [
        'permission_config_versions',
        expect.objectContaining({
          name: 'idx_permission_config_versions_version',
          columnNames: ['version'],
        }),
      ],
      [
        'permission_config_versions',
        expect.objectContaining({
          name: 'idx_permission_config_versions_active',
          columnNames: ['is_active', 'activated_at'],
        }),
      ],
      [
        'permission_change_logs',
        expect.objectContaining({ name: 'idx_permission_change_logs_version', columnNames: ['version_id'] }),
      ],
      [
        'permission_change_logs',
        expect.objectContaining({ name: 'idx_permission_change_logs_changed_at', columnNames: ['changed_at'] }),
      ],
    ]);
    expect(queryRunner.query).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when tables and indexes already exist', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.hasTable.mockResolvedValue(true);
    queryRunner.getTable.mockImplementation(async (tableName: string) => ({
      indices: [
        { name: tableName === 'permission_config_versions'
          ? 'idx_permission_config_versions_version'
          : 'idx_permission_change_logs_version' },
        { name: tableName === 'permission_config_versions'
          ? 'idx_permission_config_versions_active'
          : 'idx_permission_change_logs_changed_at' },
      ],
    }));

    await migration.up(queryRunner);

    expect(queryRunner.createTable).not.toHaveBeenCalled();
    expect(queryRunner.createIndex).not.toHaveBeenCalled();
  });

  it('reverts the dependent audit table before the version table', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.hasTable.mockResolvedValue(true);

    await migration.down(queryRunner);

    expect(queryRunner.dropTable.mock.calls).toEqual([
      ['permission_change_logs', true, true, true],
      ['permission_config_versions', true, true, true],
    ]);
  });
});
