import { describe, expect, it } from 'vitest';
import { getInServiceOrders, sanitizeInServiceUpdatePayload } from './inServiceOrders';

describe('sanitizeInServiceUpdatePayload', () => {
  it('keeps editable fields and removes readonly response metadata', () => {
    expect(sanitizeInServiceUpdatePayload({
      customerId: 'customer-1',
      departmentId: 'department-1',
      orderKind: 'single_business',
      businessScope: 'beilun',
      businessDescription: 'updated content',
      serviceFee: null,
      extraData: { source: 'detail' },
    })).toEqual({
      customerId: 'customer-1',
      departmentId: 'department-1',
      extraData: { source: 'detail' },
      businessDescription: 'updated content',
      serviceFee: null,
    });
  });

  it('omits undefined fields while preserving explicit null values', () => {
    expect(sanitizeInServiceUpdatePayload({
      employeeName: undefined,
      idCardNo: null,
      expectedCompletionDate: null,
    })).toEqual({
      idCardNo: null,
      expectedCompletionDate: null,
    });
  });

  it('filters mock history dispatch data to unassigned dispatched certificates', async () => {
    const key = 'mock_in_service_orders_v2';
    localStorage.setItem(key, JSON.stringify([
      { id: 'cert-unassigned', orderNo: 'CERT-1', orderKind: 'certificate', status: 'dispatched', handlerId: null, businessScope: 'beilun', createdAt: '2026-08-20T00:00:00.000Z' },
      { id: 'cert-assigned', orderNo: 'CERT-2', orderKind: 'certificate', status: 'dispatched', handlerId: 'handler-1', businessScope: 'beilun', createdAt: '2026-08-20T00:00:00.000Z' },
      { id: 'renewal-unassigned', orderNo: 'RN-1', orderKind: 'contract_renewal', status: 'dispatched', handlerId: null, businessScope: 'beilun', createdAt: '2026-08-20T00:00:00.000Z' },
    ]));

    const result = await getInServiceOrders({
      page: 1,
      pageSize: 20,
      orderKind: 'certificate',
      status: 'dispatched',
      onlyUnassigned: true,
      businessScope: 'beilun',
    });

    expect(result.items.map((item) => item.id)).toEqual(['cert-unassigned']);
    localStorage.removeItem(key);
  });
});
