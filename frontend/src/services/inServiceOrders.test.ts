import { describe, expect, it } from 'vitest';
import { sanitizeInServiceUpdatePayload } from './inServiceOrders';

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
});
