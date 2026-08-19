import { ConfigureResignationCertificateFormat20260816001000 } from 'src/database/migrations/20260816001000-ConfigureResignationCertificateFormat';

describe('ConfigureResignationCertificateFormat migration', () => {
  it('configures the conditional format field and inserts it into resignation templates', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return [];
      }),
    } as any;

    await new ConfigureResignationCertificateFormat20260816001000().up(runner);

    const sql = calls.map((item) => item.sql.replace(/\\s+/g, ' ')).join('\\n');
    expect(sql).toContain('resignation_cert_format');
    expect(sql).toContain('need_resignation_cert');
    expect(sql).toContain('import_template_fields');
    expect(sql).toContain("order_type = 'resignation'");
  });
});
