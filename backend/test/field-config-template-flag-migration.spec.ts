import { QueryRunner } from 'typeorm';
import { EnsureFieldConfigTemplateFlag20260805005500 } from 'src/database/migrations/20260805005500-EnsureFieldConfigTemplateFlag';

describe('EnsureFieldConfigTemplateFlag20260805005500 migration', () => {
  it('adds the template inclusion flag before migrations that use it', async () => {
    const queryRunner = {
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { query: jest.Mock };
    const migration = new EnsureFieldConfigTemplateFlag20260805005500();

    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS is_included_in_template'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("field_code IN ('education', 'graduation_school', 'major', 'graduation_date')"),
    );
  });

  it('does not drop template configuration on rollback', async () => {
    const queryRunner = {
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { query: jest.Mock };
    const migration = new EnsureFieldConfigTemplateFlag20260805005500();

    await migration.down(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
