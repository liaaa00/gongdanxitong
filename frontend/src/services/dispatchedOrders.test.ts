import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(data: T) => Promise.resolve(data),
}));

vi.mock('./notifications', () => ({
  addMockNotification: vi.fn(),
}));

vi.mock('./workOrders', () => ({
  reloadMockWorkOrders: vi.fn(),
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

import { getDispatchedOrders, getDispatchedOrdersSafe } from './dispatchedOrders';

describe('dispatchedOrders services', () => {
  beforeEach(() => {
    requestGet.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('builds backend list params without leaking silentError into query params', async () => {
    requestGet.mockResolvedValueOnce({
      list: [
        {
          id: 'child-1',
          parent_order_id: 'parent-1',
          order_no: 'WO-001',
          module_code: 'data_entry',
          status: 'pending',
          employee_name: '张三',
          customer_name: '客户A',
          visible_fields: [],
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      page: 2,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });

    const result = await getDispatchedOrders({
      page: 2,
      pageSize: 50,
      moduleCode: 'data_entry',
      orderType: 'onboarding',
      statusIn: 'pending,accepted',
      orderNo: 'WO-001',
      customerName: '客户A',
      employeeName: '张三',
      idCardNo: '110101199001011234',
      orderMonth: '2026-05',
      dispatchedFrom: '2026-05-01',
      dispatchedTo: '2026-05-31',
      silentError: true,
    });

    expect(result).toMatchObject({ page: 2, pageSize: 50, total: 1, success: true });
    expect(result.list[0]).toMatchObject({ id: 'child-1', order_no: 'WO-001', module_code: 'data_entry' });
    expect(requestGet).toHaveBeenCalledWith('/dispatched-orders', {
      params: expect.objectContaining({
        page: 2,
        pageSize: 50,
        moduleCode: 'data_entry',
        orderType: 'onboarding',
        statusIn: 'pending,accepted',
        orderNo: 'WO-001',
        customerName: '客户A',
        employeeName: '张三',
        idCardNo: '110101199001011234',
        orderMonth: '2026-05',
        dispatchedFrom: '2026-05-01',
        dispatchedTo: '2026-05-31',
      }),
      silentError: true,
    });
    expect(requestGet.mock.calls[0][1].params).not.toHaveProperty('silentError');
  });

  it('returns an empty failed page instead of throwing when safe list receives a 400 response', async () => {
    const badRequest = Object.assign(new Error('Request failed with status code 400'), {
      response: { status: 400, data: { message: 'pageSize must not be greater than 100' } },
    });
    requestGet.mockRejectedValueOnce(badRequest);

    const result = await getDispatchedOrdersSafe({ current: 3, pageSize: 1000, moduleCode: 'contract' } as any);

    expect(requestGet).toHaveBeenCalledWith('/dispatched-orders', {
      params: expect.objectContaining({ page: 3, pageSize: 100, moduleCode: 'contract' }),
      silentError: true,
    });
    expect(requestGet.mock.calls[0][1].params).not.toHaveProperty('current');
    expect(result).toEqual({ list: [], page: 3, pageSize: 1000, total: 0, totalPages: 0, success: false });
  });

  it('rethrows auth failures so login or permission problems are not hidden by fallback tables', async () => {
    const unauthorized = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { message: 'unauthorized' } },
    });
    requestGet.mockRejectedValueOnce(unauthorized);

    await expect(getDispatchedOrdersSafe({ page: 1, pageSize: 20 } as any)).rejects.toBe(unauthorized);
  });

  it('keeps empty failed page fallback for transient server/network failures', async () => {
    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500, data: { message: 'internal error' } },
    });
    requestGet.mockRejectedValueOnce(serverError);

    const result = await getDispatchedOrdersSafe({ current: 3, pageSize: 1000, moduleCode: 'contract' } as any);

    expect(result).toEqual({ list: [], page: 3, pageSize: 1000, total: 0, totalPages: 0, success: false });
  });
});
