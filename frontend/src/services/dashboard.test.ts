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

const nowIso = () => new Date().toISOString();

describe('dashboard services', () => {
  beforeEach(() => {
    requestGet.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('builds business dashboard cards from current-month work orders and message buckets', async () => {
    requestGet
      .mockResolvedValueOnce({
        list: [
          { id: 'wo-1', order_type: 'onboarding', status: 'processing', created_at: nowIso() },
          { id: 'wo-2', order_type: 'renewal', status: 'completed', created_at: nowIso() },
        ],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        total: 4,
        salesperson: { field_changed: 2, returned: 1, withdraw_void_result: 1 },
        backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 0, withdraw_void_request: 0 },
        system: 0,
      });

    await expect(getDashboardCards()).resolves.toMatchObject({
      totalThisMonth: 2,
      processing: 1,
      completed: 1,
      myMessages: 3,
    });
    expect(requestGet).toHaveBeenNthCalledWith(1, '/work-orders', {
      params: expect.objectContaining({ page: 1, pageSize: 100 }),
    });
    expect(requestGet).toHaveBeenNthCalledWith(2, '/notifications/unread-count-by-bucket');
  });

  it('prefers real order-type matrix endpoint before frontend aggregation', async () => {
    requestGet.mockResolvedValueOnce({
      rows: [
        { orderType: 'onboarding', label: '入职', total: 3, processing: 1, completed: 2, completionRate: 66.7 },
      ],
      total: 1,
    });

    await expect(getOrderTypeMatrix({ dimension: 'orderType' })).resolves.toMatchObject({
      rows: [expect.objectContaining({ orderType: 'onboarding', total: 3, completed: 2 })],
      total: 1,
    });

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/order-type-matrix', { params: { dimension: 'orderType' }, silentError: true });
  });

  it('falls back to node aggregation with pageSize within backend max 100 when real matrix endpoint is unavailable', async () => {
    requestGet
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ list: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });

    await getOrderTypeMatrix({ dimension: 'node' });

    expect(requestGet).toHaveBeenNthCalledWith(1, '/dashboard/order-type-matrix', { params: { dimension: 'node' }, silentError: true });
    expect(requestGet).toHaveBeenNthCalledWith(2, '/dispatched-orders', {
      params: expect.objectContaining({ page: 1, pageSize: 100 }),
    });
    expect(requestGet.mock.calls[1][1].params.pageSize).toBeLessThanOrEqual(100);
  });

  it('falls back to order aggregation with pageSize within backend max 100 when real matrix endpoint is unavailable', async () => {
    requestGet
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ list: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });

    await getOrderTypeMatrix({ dimension: 'orderType' });

    expect(requestGet).toHaveBeenNthCalledWith(1, '/dashboard/order-type-matrix', { params: { dimension: 'orderType' }, silentError: true });
    expect(requestGet).toHaveBeenNthCalledWith(2, '/work-orders', {
      params: expect.objectContaining({ page: 1, pageSize: 100 }),
    });
    expect(requestGet.mock.calls[1][1].params.pageSize).toBeLessThanOrEqual(100);
  });

  it('requests leader trend endpoint with order type and module code and normalizes bucket rates', async () => {
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

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/leader-trend', {
      params: { orderType: 'onboarding', moduleCode: 'data_entry' },
      silentError: true,
    });
  });

  it('returns silent zero buckets and does not aggregate work or dispatched orders when leader trend endpoint fails', async () => {
    requestGet.mockRejectedValueOnce(new Error('500'));

    const result = await getLeaderTrend('onboarding', 'data_entry');

    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith('/dashboard/leader-trend', {
      params: { orderType: 'onboarding', moduleCode: 'data_entry' },
      silentError: true,
    });
    expect(requestGet).not.toHaveBeenCalledWith('/work-orders', expect.anything());
    expect(requestGet).not.toHaveBeenCalledWith('/dispatched-orders', expect.anything());
    expect(result).toMatchObject({ orderType: 'onboarding', moduleCode: 'data_entry' });
    expect(result.buckets).toHaveLength(12);
    expect(result.buckets.every((bucket) => bucket.total === 0 && bucket.completed === 0 && bucket.rate === 0)).toBe(true);
  });
});
