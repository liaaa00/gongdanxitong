import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPendingCustomerRules, getCustomerRuleBranches } from './customerRules';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./request', () => ({ default: mocks }));
const customerId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const branch = { id: branchId, customerId, branchCode: 'SH001', branchName: '上海商社', isActive: true, businessScope: 'beilun' };

describe('客户规则真实接口', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the selected customer UUID with the customer-rule read endpoint', async () => {
    mocks.get.mockResolvedValueOnce([branch, { ...branch, id: 'invalid-id' }, { ...branch, id: '33333333-3333-4333-8333-333333333333', branchCode: 'NB001' }]);
    const result = await getCustomerRuleBranches(customerId);
    expect(result.map((item) => item.branch_code)).toEqual(['SH001', 'NB001']);
    expect(result.every((item) => item.customer_id === customerId)).toBe(true);
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledWith(`/customer-rules/${customerId}/location-options`);
  });

  it('requests draft fill for exactly the selected customer and preserves the server detail result', async () => {
    const result = { total: 1, updatedCount: 0, skippedCount: 1, results: [{ workOrderId: 'order-1', orderNo: 'ON1', status: 'skipped', fields: [], message: '已有人工值' }] };
    mocks.post.mockResolvedValue(result);
    await expect(fillPendingCustomerRules(customerId)).resolves.toEqual(result);
    expect(mocks.post).toHaveBeenCalledWith(`/customer-rules/${customerId}/sync-pending`);
  });
});
