import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mock', () => ({
  isMockMode: true,
  mockDelay: <T>(data: T) => Promise.resolve(data),
}));

vi.mock('./request', () => ({
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  default: {
    get: vi.fn(),
  },
}));

const fixedNow = new Date('2026-05-15T08:00:00.000Z');

import { getDashboardCards, getLeaderTrend, getOrderTypeMatrix } from './dashboard';

function setMockOrders(orders: unknown[]) {
  window.localStorage.setItem('mock_work_orders_v1', JSON.stringify(orders));
}

describe('dashboard services in mock mode use dispatched child-order metrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('does not fall back to parent work orders when current-month parents have no child orders', async () => {
    setMockOrders([
      { id: 'wo-parent-only', order_no: 'WO-1', order_type: 'onboarding', status: 'completed', created_at: '2026-05-02T00:00:00.000Z', dispatched_orders: [] },
    ]);

    await expect(getDashboardCards('business')).resolves.toMatchObject({
      totalThisMonth: 0,
      processing: 0,
      completed: 0,
      voided: 0,
    });

    const matrix = await getOrderTypeMatrix({ dimension: 'orderType' });
    expect(matrix.rows.find((row) => row.orderType === 'onboarding')).toMatchObject({ total: 0, completed: 0, voided: 0, completionRate: 0 });

    const trend = await getLeaderTrend('onboarding');
    const mayBucket = trend.buckets.find((bucket) => bucket.month === '5月');
    expect(mayBucket).toMatchObject({ total: 0, completed: 0, rate: 0 });
  });

  it('aggregates cards, order-type matrix, node matrix and trend by dispatched child orders only', async () => {
    setMockOrders([
      {
        id: 'wo-onboarding',
        order_no: 'WO-ON',
        order_type: 'onboarding',
        status: 'completed',
        created_at: '2026-05-01T00:00:00.000Z',
        dispatched_orders: [
          { module_code: 'data_entry', module_name: '数据录入', status: 'completed', dispatched_at: '2026-05-03T00:00:00.000Z' },
          { module_code: 'contract', module_name: '劳动合同签订', status: 'completed', dispatched_at: '2026-05-04T00:00:00.000Z' },
          { module_code: 'onboarding_contact', module_name: '入职联系', status: 'void', dispatched_at: '2026-05-05T00:00:00.000Z' },
        ],
      },
      {
        id: 'wo-renewal',
        order_no: 'WO-RE',
        order_type: 'renewal',
        status: 'processing',
        created_at: '2026-05-01T00:00:00.000Z',
        dispatched_orders: [
          { module_code: 'renewal_contract', module_name: '续签合同', status: 'processing', dispatched_at: '2026-05-06T00:00:00.000Z' },
        ],
      },
      {
        id: 'wo-old',
        order_no: 'WO-OLD',
        order_type: 'onboarding',
        status: 'completed',
        created_at: '2026-04-01T00:00:00.000Z',
        dispatched_orders: [
          { module_code: 'data_entry', module_name: '数据录入', status: 'completed', dispatched_at: '2026-04-03T00:00:00.000Z' },
        ],
      },
    ]);

    await expect(getDashboardCards('business')).resolves.toMatchObject({
      totalThisMonth: 4,
      processing: 1,
      completed: 2,
      voided: 1,
    });

    const orderTypeMatrix = await getOrderTypeMatrix({ dimension: 'orderType' });
    expect(orderTypeMatrix.rows.find((row) => row.orderType === 'onboarding')).toMatchObject({
      total: 3,
      completed: 2,
      voided: 1,
      completionRate: 100,
    });
    expect(orderTypeMatrix.rows.find((row) => row.orderType === 'renewal')).toMatchObject({
      total: 1,
      processing: 1,
      completed: 0,
      voided: 0,
      completionRate: 0,
    });

    const nodeMatrix = await getOrderTypeMatrix({ dimension: 'node' });
    expect(nodeMatrix.rows.find((row) => row.moduleCode === 'data_entry')).toMatchObject({ total: 1, completed: 1, completionRate: 100 });
    expect(nodeMatrix.rows.find((row) => row.moduleCode === 'onboarding_contact')).toMatchObject({ total: 1, voided: 1, completionRate: 0 });

    const trend = await getLeaderTrend('onboarding');
    const mayBucket = trend.buckets.find((bucket) => bucket.month === '5月');
    expect(mayBucket).toMatchObject({ total: 3, completed: 2, rate: 100 });
  });
});
