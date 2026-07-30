import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from './request';
import { uploadExcel } from './upload';
import {
  confirmOutOfProvinceImport,
  getOutOfProvinceImportJob,
  getOutOfProvinceOrders,
  OUT_OF_PROVINCE_ORDER_TYPE,
  OUT_OF_PROVINCE_SCOPE,
  previewOutOfProvinceImport,
} from './outOfProvince';

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('./upload', () => ({
  uploadExcel: vi.fn(),
}));

describe('outOfProvince service business scope isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps ProTable pagination to the dedicated endpoint and filters Beilun rows', async () => {
    vi.mocked(request.get).mockResolvedValue({
      list: [
        {
          id: 'out-1',
          orderNo: 'OP-1',
          orderType: OUT_OF_PROVINCE_ORDER_TYPE.INCREASE,
          businessScope: OUT_OF_PROVINCE_SCOPE,
          status: 'pending',
          createdAt: '2026-07-27T00:00:00.000Z',
        },
        {
          id: 'beilun-1',
          order_no: 'BL-1',
          order_type: 'onboarding',
          businessScope: 'beilun',
          status: 'pending',
          created_at: '2026-07-27T00:00:00.000Z',
        },
      ],
      total: 2,
    });

    const result = await getOutOfProvinceOrders({ current: 2, pageSize: 20 });

    expect(request.get).toHaveBeenCalledWith('/out-of-province-orders', {
      params: { page: 2, pageSize: 20 },
    });
    expect(result.list.map((item) => item.id)).toEqual(['out-1']);
    expect(result.total).toBe(1);
  });

  it('rejects list responses without businessScope instead of risking mixed data', async () => {
    vi.mocked(request.get).mockResolvedValue({
      list: [{ id: 'unknown-1', order_no: 'UNKNOWN', status: 'pending' }],
      total: 1,
    });

    await expect(getOutOfProvinceOrders({ page: 1, pageSize: 20 }))
      .rejects.toThrow('缺少 businessScope');
  });

  it('sends scope and province order type through preview, confirm, and polling', async () => {
    vi.mocked(uploadExcel).mockResolvedValue({ fileId: 'file-1', size: 1 });
    vi.mocked(request.post)
      .mockResolvedValueOnce({
        fileId: 'file-1',
        mapping: [],
        availableFields: [],
        suggestedMapping: {},
        totalRows: 1,
        previewRows: [{}],
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        total_rows: 1,
        success_rows: 0,
        fail_rows: 0,
        status: 'processing',
      });
    vi.mocked(request.get).mockResolvedValue({
      id: 'job-1',
      total_rows: 1,
      success_rows: 1,
      fail_rows: 0,
      status: 'completed',
    });

    await previewOutOfProvinceImport(
      new File(['x'], 'orders.xlsx'),
      OUT_OF_PROVINCE_ORDER_TYPE.DECREASE,
    );
    await confirmOutOfProvinceImport(
      { 员工姓名: 'employee_name' },
      'file-1',
      OUT_OF_PROVINCE_ORDER_TYPE.DECREASE,
    );
    await getOutOfProvinceImportJob('job-1');

    expect(request.post).toHaveBeenNthCalledWith(1, '/work-orders/import/preview', expect.objectContaining({
      fileId: 'file-1',
      orderType: OUT_OF_PROVINCE_ORDER_TYPE.DECREASE,
    }));
    expect(request.post).toHaveBeenNthCalledWith(2, '/work-orders/import/confirm', expect.objectContaining({
      fileId: 'file-1',
      orderType: OUT_OF_PROVINCE_ORDER_TYPE.DECREASE,
      autoSubmit: true,
    }));
    expect(request.get).toHaveBeenCalledWith('/work-orders/import/job-1');
  });
});
