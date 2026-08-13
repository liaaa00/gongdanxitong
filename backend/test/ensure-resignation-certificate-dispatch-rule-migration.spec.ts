import { EnsureResignationCertificateDispatchRule20260813001000 } from 'src/database/migrations/20260813001000-EnsureResignationCertificateDispatchRule';

describe('EnsureResignationCertificateDispatchRule20260813001000', () => {
  it('upserts the missing conditional rule without writing business or identity tables', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new EnsureResignationCertificateDispatchRule20260813001000().up({ query } as never);

    expect(query).toHaveBeenCalledTimes(3);
    const sql = query.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain("rule_name = 'resignation-certificate-when-needed'");
    expect(sql).toContain("target_module = 'resignation_cert'");
    expect(sql).toContain("need_resignation_cert");
    expect(sql).toContain('INSERT INTO dispatch_rules');
    expect(sql).toContain("business_scope = 'beilun'");
    expect(sql).toContain("rule_name <> 'resignation-certificate-when-needed'");

    for (const table of [
      'work_orders',
      'dispatched_orders',
      'users',
      'user_roles',
      'customers',
      'operation_logs',
      'notifications',
    ]) {
      expect(sql).not.toMatch(new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM) ${table}\\b`, 'i'));
    }
  });

  it('keeps down as a no-op because the previous config row may have been administrator-owned', async () => {
    const query = jest.fn();
    await new EnsureResignationCertificateDispatchRule20260813001000().down();
    expect(query).not.toHaveBeenCalled();
  });
});
