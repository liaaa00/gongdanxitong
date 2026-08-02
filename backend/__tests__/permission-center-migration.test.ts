import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { CreatePermissionCenter1785607751717 } from '../src/database/migrations/1785607751717-CreatePermissionCenter';

function makeQueryRunner() {
  return {
    hasTable: vi.fn().mockResolvedValue(false),
    getTable: vi.fn().mockResolvedValue({ indices: [] }),
    createTable: vi.fn().mockResolvedValue(undefined),
    createIndex: vi.fn().mockResolvedValue(undefined),
    dropTable: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueryRunner & {
    hasTable: ReturnType<typeof vi.fn>;
    getTable: ReturnType<typeof vi.fn>;
    createTable: ReturnType<typeof vi.fn>;
    createIndex: ReturnType<typeof vi.fn>;
    dropTable: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
}

function columnsByName(table: { columns: Array<{ name: string }> }) {
  return Object.fromEntries(table.columns.map((column) => [column.name, column]));
}

describe('CreatePermissionCenter1785607751717 migration', () => {
  const migration = new CreatePermissionCenter1785607751717();

  it('creates both permission tables with columns and foreign keys', async () => {
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    expect(queryRunner.createTable).toHaveBeenCalledTimes(2);
    const versionTable = queryRunner.createTable.mock.calls[0][0];
    const logTable = queryRunner.createTable.mock.calls[1][0];
    const versionColumns = columnsByName(versionTable);
    const logColumns = columnsByName(logTable);

    expect(versionTable.name).toBe('permission_config_versions');
    expect(Object.keys(versionColumns)).toEqual([
      'id', 'version', 'config', 'is_active', 'created_by', 'created_at', 'updated_at', 'activated_at', 'description',
    ]);
    expect(versionColumns.id).toMatchObject({ type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' });
    expect(versionColumns.version).toMatchObject({ type: 'varchar', length: '50', isUnique: true });
    expect(versionColumns.config).toMatchObject({ type: 'jsonb', isNullable: false });
    expect(versionTable.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'fk_permission_config_versions_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    ]);

    expect(logTable.name).toBe('permission_change_logs');
    expect(Object.keys(logColumns)).toEqual([
      'id', 'version_id', 'change_type', 'target_resource', 'old_value', 'new_value', 'changed_by', 'changed_at',
      'created_at', 'updated_at', 'reason',
    ]);
    expect(logColumns.old_value).toMatchObject({ type: 'jsonb', isNullable: true });
    expect(logColumns.new_value).toMatchObject({ type: 'jsonb', isNullable: true });
    expect(logTable.foreignKeys).toEqual([
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
    ]);
  });

  it('creates all lookup indexes and table comments', async () => {
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    expect(queryRunner.createIndex.mock.calls).toEqual([
      ['permission_config_versions', expect.objectContaining({ name: 'idx_permission_config_versions_version', columnNames: ['version'] })],
      ['permission_config_versions', expect.objectContaining({ name: 'idx_permission_config_versions_active', columnNames: ['is_active', 'activated_at'] })],
      ['permission_change_logs', expect.objectContaining({ name: 'idx_permission_change_logs_version', columnNames: ['version_id'] })],
      ['permission_change_logs', expect.objectContaining({ name: 'idx_permission_change_logs_changed_at', columnNames: ['changed_at'] })],
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

  it('drops the audit table before its referenced version table', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.hasTable.mockResolvedValue(true);

    await migration.down(queryRunner);

    expect(queryRunner.dropTable.mock.calls).toEqual([
      ['permission_change_logs', true, true, true],
      ['permission_config_versions', true, true, true],
    ]);
  });

  it('does not drop tables that are already absent', async () => {
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    expect(queryRunner.dropTable).not.toHaveBeenCalled();
  });
});
