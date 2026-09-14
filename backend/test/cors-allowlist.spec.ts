import { buildCorsOptions, isAllowedOrigin, resolveAllowedOrigins } from 'src/config/cors';

/**
 * CORS 白名单回归（治理计划 2-6 / G7）。
 * 断言可观察行为：允许/拒绝哪些 Origin，以及 enableCors 配置形态。
 */
describe('CORS allow-list (src/config/cors.ts)', () => {
  it('derives localhost + 127.0.0.1 origins from default ports when no env is set', () => {
    const allowed = resolveAllowedOrigins({});
    expect(allowed).toEqual(
      expect.arrayContaining([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ]),
    );
    // 不硬编码任何 192.168 单一 IP（未给 LAN IP 时不应凭空出现）
    expect(allowed.some((origin) => origin.includes('192.168.'))).toBe(false);
  });

  it('adds LAN origins from TICKET_LAN_IP using the same port basis as env.ps1', () => {
    const allowed = resolveAllowedOrigins({ TICKET_LAN_IP: '192.168.31.240' });
    expect(allowed).toContain('http://192.168.31.240:5173');
    expect(allowed).toContain('http://192.168.31.240:3000');
  });

  it('honors overridden ports from VITE_PORT / PORT', () => {
    const allowed = resolveAllowedOrigins({ VITE_PORT: '5199', PORT: '3011', TICKET_LAN_IP: '192.168.1.9' });
    expect(allowed).toContain('http://localhost:5199');
    expect(allowed).toContain('http://127.0.0.1:3011');
    expect(allowed).toContain('http://192.168.1.9:5199');
  });

  it('appends extra ALLOWED_ORIGINS entries (comma/space separated, trailing slash tolerant)', () => {
    const allowed = resolveAllowedOrigins({ ALLOWED_ORIGINS: 'https://gongsi.example.com , http://10.0.0.5:8080/' });
    expect(allowed).toContain('https://gongsi.example.com');
    expect(allowed).toContain('http://10.0.0.5:8080');
  });

  it('ignores malformed TICKET_LAN_IP instead of producing a bogus origin', () => {
    const allowed = resolveAllowedOrigins({ TICKET_LAN_IP: 'not-an-ip' });
    expect(allowed.some((origin) => origin.includes('not-an-ip'))).toBe(false);
  });

  it('isAllowedOrigin matches whitelist case-insensitively and tolerates trailing slash', () => {
    const allowed = ['http://localhost:5173'];
    expect(isAllowedOrigin('http://localhost:5173', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173/', allowed)).toBe(true);
    expect(isAllowedOrigin('HTTP://LOCALHOST:5173', allowed)).toBe(true);
    expect(isAllowedOrigin('http://evil.example.com', allowed)).toBe(false);
  });

  it('allows headerless / same-origin requests (undefined or null origin)', () => {
    expect(isAllowedOrigin(undefined, [])).toBe(true);
    expect(isAllowedOrigin('null', [])).toBe(true);
  });

  it('enables credentials and reflects allow decision through the cors origin callback', () => {
    const options = buildCorsOptions({ TICKET_LAN_IP: '192.168.31.240' });
    expect(options.credentials).toBe(true);
    expect(typeof options.origin).toBe('function');

    const originFn = options.origin as unknown as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let allowedResult: boolean | undefined;
    originFn('http://192.168.31.240:5173', (err, allow) => {
      expect(err).toBeNull();
      allowedResult = allow;
    });
    expect(allowedResult).toBe(true);

    // 非白名单来源：不报 Error（避免 500），而是 allow=false → 不下发 ACAO 头
    let rejectedErr: Error | null | undefined = undefined;
    let rejectedAllow: boolean | undefined;
    originFn('http://attacker.example.net', (err, allow) => {
      rejectedErr = err;
      rejectedAllow = allow;
    });
    expect(rejectedErr).toBeNull();
    expect(rejectedAllow).toBe(false);
  });
});
