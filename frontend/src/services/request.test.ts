import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';

import { getFriendlyErrorMessage } from './request';

describe('request friendly error messages', () => {
  it('uses backend 400 message instead of reporting a network timeout', () => {
    const error = new AxiosError('Request failed with status code 400', undefined, undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as any,
      data: { message: '用户名或密码错误' },
    });

    expect(getFriendlyErrorMessage(error)).toBe('用户名或密码错误');
    expect(getFriendlyErrorMessage(error)).not.toContain('请求超时');
  });

  it('reports timeout only for ECONNABORTED or timeout messages', () => {
    const error = new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED');

    expect(getFriendlyErrorMessage(error)).toBe('请求超时，请检查网络后重试');
  });

  it('reports plain network failures separately from backend 4xx validation errors', () => {
    const error = new AxiosError('Network Error');

    expect(getFriendlyErrorMessage(error)).toBe('网络连接失败，请检查网络');
  });
});
