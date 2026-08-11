import { QueryRunner } from 'typeorm';
import { ConsolidateSocialFundExportTemplates20260810003000 } from 'src/database/migrations/20260810003000-ConsolidateSocialFundExportTemplates';

describe('ConsolidateSocialFundExportTemplates20260810003000 migration', () => {
  it('consolidates both official templates to the 35/15 field lists', async () => {
    const query = jest.fn(async (sql: string) => (
      sql.includes('SELECT id, template_name') ? [{ id: 'keeper-id', template_name: '旧模板' }] : []
    ));
    const migration = new ConsolidateSocialFundExportTemplates20260810003000();

    await migration.up({ query } as unknown as QueryRunner);

    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    const updates = calls.filter(([sql]) => sql.includes('UPDATE export_templates'));
    const deletes = calls.filter(([sql]) => sql.includes('DELETE FROM export_templates'));
    expect(updates).toHaveLength(2);
    expect(deletes).toHaveLength(2);
    expect(JSON.parse(String(updates[0][1][1]))).toHaveLength(35);
    expect(JSON.parse(String(updates[1][1][1]))).toHaveLength(15);
    expect(deletes[0][1][2]).toEqual(expect.arrayContaining(['社保公积金增员导出模板']));
    expect(deletes[1][1][2]).toEqual(expect.arrayContaining(['社保公积金减员导出模板']));
  });

  it('keeps rollback as a no-op instead of restoring stale templates', async () => {
    const query = jest.fn();
    const migration = new ConsolidateSocialFundExportTemplates20260810003000();

    await migration.down();

    expect(query).not.toHaveBeenCalled();
  });
});
