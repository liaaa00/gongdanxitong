import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';

describe('AuditInterceptor secret redaction', () => {
  it('retains account audit context while removing nested passwords and signed tokens', () => {
    const interceptor = new AuditInterceptor({} as never, {} as never);
    const result = (interceptor as unknown as { truncatePayload(value: unknown): { content: string } }).truncatePayload({
      params: { customerId: 'customer-1' }, body: { loginEmail: 'customer@example.com', password: 'Secret123', nested: { newPassword: 'NewSecret456' } },
      account: { id: 'account-1', passwordHash: 'hash-value' }, linkToken: 'signed-secret',
    });
    expect(result.content).toContain('customer-1');
    expect(result.content).toContain('account-1');
    for (const secret of ['Secret123', 'NewSecret456', 'hash-value', 'signed-secret']) expect(result.content).not.toContain(secret);
    expect(result.content).toContain('[REDACTED]');
  });
});
