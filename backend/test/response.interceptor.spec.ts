import { StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';

describe('ResponseInterceptor', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ traceId: 'req_test' }),
    }),
  } as any;

  it('keeps the standard envelope for JSON responses', async () => {
    const result = await firstValueFrom(
      new ResponseInterceptor().intercept(context, { handle: () => of({ ok: true }) } as any),
    );

    expect(result).toEqual({
      code: 0,
      data: { ok: true },
      message: 'ok',
      traceId: 'req_test',
    });
  });

  it('passes StreamableFile through without JSON wrapping', async () => {
    const file = new StreamableFile(Buffer.from('document'));
    const result = await firstValueFrom(
      new ResponseInterceptor().intercept(context, { handle: () => of(file) } as any),
    );

    expect(result).toBe(file);
  });
});
