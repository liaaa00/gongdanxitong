import { RepairResignationReasonDropdown20260903001000 } from 'src/database/migrations/20260903001000-RepairResignationReasonDropdown';

describe('RepairResignationReasonDropdown migration', () => {
  it('repairs the seeded resignation reason field configuration', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return [];
      }),
    } as any;

    await new RepairResignationReasonDropdown20260903001000().up(runner);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql.replace(/\s+/g, ' ')).toContain(
      "UPDATE field_configs SET field_type = 'dropdown'",
    );
    expect(calls[0].sql).toContain("field_code = 'resignation_reason'");
    expect(calls[0].sql).toContain("order_type = 'resignation'::order_type_enum");
    expect(calls[0].params?.[0]).toContain('个人辞职');
    expect(calls[0].params?.[0]).toContain('法人变更');
  });
});
