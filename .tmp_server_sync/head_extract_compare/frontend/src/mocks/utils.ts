import { HttpResponse } from 'msw';

export const apiBase = '/api';

export function ok<T>(data: T, message = 'ok') {
  return HttpResponse.json({
    code: 0,
    data,
    message,
    traceId: `req_MOCK_${Date.now()}`,
  });
}

export function fail(code: number, message: string, status = 400, data: unknown = null) {
  return HttpResponse.json(
    {
      code,
      data,
      message,
      traceId: `req_MOCK_${Date.now()}`,
    },
    { status },
  );
}
