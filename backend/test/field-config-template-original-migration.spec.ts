import { QueryRunner } from 'typeorm';
import { AddIsIncludedInTemplateToFieldConfigs1722844800000 } from 'src/database/migrations/20260805004000-AddIsIncludedInTemplateToFieldConfigs';

describe('AddIsIncludedInTemplateToFieldConfigs1722844800000 migration compatibility', () => {
  it('is idempotent when the compatibility migration already added the column', async () => {
    const queryRunner = {
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { query: jest.Mock };
    const migration = new AddIsIncludedInTemplateToFieldConfigs1722844800000();

    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS is_included_in_template'),
    );
  });

  it('preserves the shared column on rollback', async () => {
    const queryRunner = {
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { query: jest.Mock };
    const migration = new AddIsIncludedInTemplateToFieldConfigs1722844800000();

    await migration.down(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
