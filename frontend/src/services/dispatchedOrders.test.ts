import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(data: T) => Promise.resolve(data),
}));

const { requestGet } = vi.hoisted(() => ({
  requestGet: vi.fn(),
}));

vi.mock('./request', () => ({
  default: {
    get: requestGet,
  },
}));

vi.mock('./notifications', () => ({
  addMockNotification: vi.fn(),
}));

vi.mock('./workOrders', () => ({
  reloadMockWorkOrders: vi.fn(),
}));

import { getDispatchedOrdersSafe } from './dispatchedOrders';

describe('dispatched orders list fallback', () => {
  beforeEach(() => {
    requestGet.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('resolves an empty page instead of propagating rejected list requests', async () => {
    requestGet.mockRejectedValueOnce(new Error('500'));

    await expect(getDispatchedOrdersSafe({ page: 2, current: 2, pageSize: 50, module_code: 'data_entry', sort: 'dispatched_at', order: 'descend' })).resolves.toMatchObject({
      list: [],
      page: 2,
      pageSize: 50,
      total: 0,
      totalPages: 0,
      success: false,
    });

    expect(requestGet).toHaveBeenCalledWith('/dispatched-orders', {
      params: expect.objectContaining({ module_code: 'data_entry', sort: 'dispatched_at', order: 'descend' }),
    });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[dispatched-orders] list request failed'), expect.any(Error));
  });
});
