import { QueryRunner, Table } from 'typeorm';
import { EnsurePermissionCenterTables20260804004500 } from 'src/database/migrations/20260804004500-EnsurePermissionCenterTables';

const buildQueryRunner = (tablesExist: boolean) => {
  const tableIndexes = new Map<string, Array<{ name?: string }>>();
  return {
    hasTable: jest.fn(async () => tablesExist),
    createTable: jest.fn(async (table: Table) => {
      tableIndexes.set(table.name, []);
    }),
    getTable: jest.fn(async (tableName: string) => ({
      name: tableName,
      indices: tableIndexes.get(tableName) ?? [],
    })),
    createIndex: jest.fn(async () => undefined),
    query: jest.fn(async () => []),
    dropTable: jest.fn(async () => undefined),
  } as unknown as QueryRunner & {
    hasTable: jest.Mock;
    createTable: jest.Mock;
    getTable: jest.Mock;
    createIndex: jest.Mock;
    query: jest.Mock;
    dropTable: jest.Mock;
  };
};

describe('EnsurePermissionCenterTables20260804004500 migration', () => {
  it('creates permission center tables before scoped permission migrations', async () => {
    const queryRunner = buildQueryRunner(false);
    const migration = new EnsurePermissionCenterTables20260804004500();

    await migration.up(queryRunner);

    expect(queryRunner.createTable).toHaveBeenCalledTimes(2);
    const [versionTable] = queryRunner.createTable.mock.calls[0] as [Table, boolean];
    const [logTable] = queryRunner.createTable.mock.calls[1] as [Table, boolean];

    expect(versionTable.name).toBe('permission_config_versions');
    expect(versionTable.columns.map((column) => column.name)).toEqual([
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
    expect(versionTable.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'fk_permission_config_versions_created_by',
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    ]);

    expect(logTable.name).toBe('permission_change_logs');
    expect(logTable.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'fk_permission_change_logs_version',
          referencedTableName: 'permission_config_versions',
          onDelete: 'CASCADE',
        }),
        expect.objectContaining({
          name: 'fk_permission_change_logs_changed_by',
          referencedTableName: 'users',
          onDelete: 'SET NULL',
        }),
      ]),
    );
    expect(queryRunner.createIndex).toHaveBeenCalledTimes(4);
  });

  it('does not recreate tables that already exist', async () => {
    const queryRunner = buildQueryRunner(true);
    const migration = new EnsurePermissionCenterTables20260804004500();

    await migration.up(queryRunner);

    expect(queryRunner.createTable).not.toHaveBeenCalled();
    expect(queryRunner.createIndex).toHaveBeenCalledTimes(4);
  });

  it('does not drop permission configuration or audit data on rollback', async () => {
    const queryRunner = buildQueryRunner(true);
    const migration = new EnsurePermissionCenterTables20260804004500();

    await migration.down(queryRunner);

    expect(queryRunner.dropTable).not.toHaveBeenCalled();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
