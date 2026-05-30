import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(data: T) => Promise.resolve(data),
}));

const { requestGet } = vi.hoisted(() => ({
  requestGet: vi.fn(),
}));

vi.mock('./request', () => ({
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  default: {
    get: requestGet,
  },
}));

import { getDashboardCards, getLeaderTrend, getOrderTypeMatrix } from './dashboard';

describe('dashboard services', () => {
  beforeEach(() => {
    requestGet.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('uses dashboard cards endpoint directly and does not aggregate work or dispatched orders on the frontend', async () => {
    requestGet.mockResolvedValueOnce({
      totalThisMonth: 6,
      processing: 2,
      completed: 3,
      voided: 1,
      myMessages: 4,
      scope: 'global',
    });

    await expect(getDashboardCards('business')).resolves.toMatchObject({
      totalThisMonth: 6,
      processing: 2,
      completed: 3,
      voided: 1,
      myMessages: 4,
      scope: 'global',
    });
    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/cards', {
      params: {},
      silentError: true,
    });
    expect(requestGet).not.toHaveBeenCalledWith('/work-orders', expect.anything());
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
  });

  it('passes only backend-supported scope to dashboard cards endpoint', async () => {
    requestGet.mockResolvedValueOnce({ totalThisMonth: 1, processing: 1, completed: 0, voided: 0, myMessages: 0 });

    await getDashboardCards('business', 'team');

    expect(requestGet).toHaveBeenCalledWith('/dashboard/cards', {
      params: { scope: 'team' },
      silentError: true,
    });
  });

  it('prefers real order-type matrix endpoint before frontend aggregation and does not pass audience', async () => {
    requestGet.mockResolvedValueOnce({
      rows: [
        { orderType: 'onboarding', label: '入职', total: 3, processing: 1, completed: 2, completionRate: 66.7 },
      ],
      total: 1,
    });

    await expect(getOrderTypeMatrix({ dimension: 'orderType', audience: 'backend', scope: 'team' })).resolves.toMatchObject({
      rows: [expect.objectContaining({ orderType: 'onboarding', total: 3, completed: 2, completionRate: 66.7 })],
      total: 1,
    });

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/order-type-matrix', { params: { dimension: 'orderType', scope: 'team' }, silentError: true });
    expect(requestGet.mock.calls[0][1].params).not.toHaveProperty('audience');
  });

  it('calculates matrix completion rate with voided orders excluded from denominator when backend omits rate', async () => {
    requestGet.mockResolvedValueOnce({
      rows: [
        { orderType: 'onboarding', label: '入职', total: 100, processing: 0, completed: 98, voided: 2 },
      ],
      total: 1,
    });

    await expect(getOrderTypeMatrix({ dimension: 'orderType' })).resolves.toMatchObject({
      rows: [expect.objectContaining({ total: 100, completed: 98, voided: 2, completionRate: 100 })],
      total: 1,
    });
  });

  it('keeps non-perfect completion rate when voided orders are excluded from denominator', async () => {
    requestGet.mockResolvedValueOnce({
      rows: [
        { orderType: 'onboarding', label: '入职', total: 100, processing: 1, completed: 97, voided: 2 },
      ],
      total: 1,
    });

    const result = await getOrderTypeMatrix({ dimension: 'orderType' });

    expect(result.rows[0]).toMatchObject({ total: 100, completed: 97, voided: 2, completionRate: 99 });
  });

  it('returns zero completion rate when denominator is zero after excluding voided orders', async () => {
    requestGet.mockResolvedValueOnce({
      rows: [
        { orderType: 'onboarding', label: '入职', total: 2, processing: 0, completed: 0, voided: 2 },
      ],
      total: 1,
    });

    const result = await getOrderTypeMatrix({ dimension: 'orderType' });

    expect(result.rows[0]).toMatchObject({ total: 2, completed: 0, voided: 2, completionRate: 0 });
  });

  it('returns an empty node matrix and does not call dispatched-orders when real matrix endpoint is unavailable', async () => {
    requestGet.mockRejectedValueOnce(new Error('not found'));

    const result = await getOrderTypeMatrix({ dimension: 'node' });

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenNthCalledWith(1, '/dashboard/order-type-matrix', { params: { dimension: 'node' }, silentError: true });
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('returns an empty order matrix and does not call dispatched-orders when real matrix endpoint is unavailable', async () => {
    requestGet.mockRejectedValueOnce(new Error('not found'));

    const result = await getOrderTypeMatrix({ dimension: 'orderType' });

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenNthCalledWith(1, '/dashboard/order-type-matrix', { params: { dimension: 'orderType' }, silentError: true });
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('prefers leader trend endpoint and normalizes empty buckets to zero trend data', async () => {
    requestGet.mockResolvedValueOnce({
      orderType: 'onboarding',
      moduleCode: 'data_entry',
      buckets: [
        { month: '2026-04', total: 0, completed: 0 },
        { month: '2026-05', total: 10, completed: 7, completionRate: 70 },
      ],
    });

    await expect(getLeaderTrend('onboarding', 'data_entry')).resolves.toMatchObject({
      orderType: 'onboarding',
      moduleCode: 'data_entry',
      buckets: [
        { month: '2026-04', total: 0, completed: 0, rate: 0 },
        { month: '2026-05', total: 10, completed: 7, rate: 70 },
      ],
    });
    expect(requestGet).toHaveBeenCalledWith('/dashboard/leader-trend', {
      params: { orderType: 'onboarding', moduleCode: 'data_entry' },
      silentError: true,
      timeout: 8_000,
    });
  });

  it('calculates leader trend rate with voided orders excluded from denominator when backend omits rate', async () => {
    requestGet.mockResolvedValueOnce({
      orderType: 'onboarding',
      moduleCode: 'data_entry',
      buckets: [
        { month: '2026-05', total: 100, completed: 98, voided: 2 },
        { month: '2026-06', total: 100, completed: 97, voided: 2 },
        { month: '2026-07', total: 2, completed: 0, voided: 2 },
      ],
    });

    await expect(getLeaderTrend('onboarding', 'data_entry')).resolves.toMatchObject({
      buckets: [
        { month: '2026-05', total: 100, completed: 98, rate: 100 },
        { month: '2026-06', total: 100, completed: 97, rate: 99 },
        { month: '2026-07', total: 2, completed: 0, rate: 0 },
      ],
    });
    expect(requestGet).toHaveBeenCalledWith('/dashboard/leader-trend', {
      params: { orderType: 'onboarding', moduleCode: 'data_entry' },
      silentError: true,
      timeout: 8_000,
    });
  });

  it('returns silent zero buckets and does not aggregate work or dispatched orders when leader trend endpoint fails', async () => {
    requestGet.mockRejectedValueOnce(new Error('500'));

    const result = await getLeaderTrend('onboarding', 'data_entry');

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/leader-trend', {
      params: { orderType: 'onboarding', moduleCode: 'data_entry' },
      silentError: true,
      timeout: 8_000,
    });
    expect(requestGet).not.toHaveBeenCalledWith('/work-orders', expect.anything());
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
    expect(result).toMatchObject({ orderType: 'onboarding', moduleCode: 'data_entry', fallbackReason: 'endpoint_error' });
    expect(result.buckets).toHaveLength(12);
    expect(result.buckets.every((bucket) => bucket.total === 0 && bucket.completed === 0 && bucket.rate === 0)).toBe(true);
  });

  it('returns an empty matrix on dashboard 400 without triggering dispatched-orders fallback or surfacing a timeout', async () => {
    const badRequest = Object.assign(new Error('Request failed with status code 400'), {
      response: { status: 400, data: { message: 'invalid dashboard params' } },
      config: { silentError: true },
    });
    requestGet.mockRejectedValueOnce(badRequest);

    const result = await getOrderTypeMatrix({ dimension: 'node', scope: 'team' });

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenNthCalledWith(1, '/dashboard/order-type-matrix', { params: { dimension: 'node', scope: 'team' }, silentError: true });
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
    expect(result).toEqual({ rows: [], total: 0 });
  });
});
