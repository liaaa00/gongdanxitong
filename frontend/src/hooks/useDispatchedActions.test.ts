import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    }),
  },
}));

const mockAccept = vi.fn();
const mockComplete = vi.fn();
const mockReturn = vi.fn();
const mockSupplement = vi.fn();
const mockGetDispatchedOrder = vi.fn();
const mockResubmit = vi.fn();

vi.mock('@/services/dispatchedOrders', () => ({
  acceptDispatchedOrder: (...args: unknown[]) => mockAccept(...args),
  completeDispatchedOrder: (...args: unknown[]) => mockComplete(...args),
  returnDispatchedOrder: (...args: unknown[]) => mockReturn(...args),
  supplementField: (...args: unknown[]) => mockSupplement(...args),
  getDispatchedOrder: (...args: unknown[]) => mockGetDispatchedOrder(...args),
  exportDispatchedOrder: vi.fn(),
  downloadDispatchedExport: vi.fn(),
  reassignDispatchedOrder: vi.fn(),
  creatorUpdateDispatchedOrderFields: vi.fn(),
  urgeDispatchedOrder: vi.fn(),
  resubmitDispatchedOrder: (...args: unknown[]) => mockResubmit(...args),
  withdrawDispatchedOrder: vi.fn(),
  voidDispatchedOrder: vi.fn(),
  approveWithdrawDispatchedOrder: vi.fn(),
  approveVoidDispatchedOrder: vi.fn(),
}));

import { useDispatchedActions } from './useDispatchedActions';

describe('useDispatchedActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOrder = {
    id: 'd1', parent_order_id: '1', order_no: 'ON001', module_code: 'contract',
    module_name: '合同', status: 'pending', handler_id: null, handler_name: null,
    employee_name: '测试', customer_name: '客户', visible_fields: [], return_reason: null,
    dispatched_at: null, accepted_at: null, completed_at: null, created_at: '',
  };

  it('accept succeeds and updates order', async () => {
    mockAccept.mockResolvedValue({ ...baseOrder, status: 'processing', accepted_at: new Date().toISOString() });
    const onUpdated = vi.fn();
    const { result } = renderHook(() =>
      useDispatchedActions({ orderId: 'd1', order: baseOrder, onOrderUpdated: onUpdated }),
    );
    await act(async () => { await result.current.handleAccept(); });
    expect(mockAccept).toHaveBeenCalledWith('d1');
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('accept fails gracefully', async () => {
    mockAccept.mockRejectedValue(new Error('conflict'));
    const onUpdated = vi.fn();
    const { result } = renderHook(() =>
      useDispatchedActions({ orderId: 'd1', order: baseOrder, onOrderUpdated: onUpdated }),
    );
    await act(async () => { await result.current.handleAccept(); });
    expect(mockAccept).toHaveBeenCalledWith('d1');
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('supplement refreshes order after success', async () => {
    mockSupplement.mockResolvedValue(undefined);
    mockGetDispatchedOrder.mockResolvedValue({ ...baseOrder, extra_data: { bank_name: '工行' } });
    const onUpdated = vi.fn();
    const { result } = renderHook(() =>
      useDispatchedActions({ orderId: 'd1', order: baseOrder, onOrderUpdated: onUpdated }),
    );
    await act(async () => {
      await result.current.handleSupplement({ bank_name: '工行' });
    });
    expect(mockSupplement).toHaveBeenCalledWith('d1', { bank_name: '工行' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('resubmits the current child order without sending edit fields', async () => {
    mockResubmit.mockResolvedValue({ ...baseOrder, status: 'pending' });
    const onUpdated = vi.fn();
    const { result } = renderHook(() =>
      useDispatchedActions({ orderId: 'd1', order: { ...baseOrder, status: 'returned' }, onOrderUpdated: onUpdated }),
    );

    await act(async () => { await result.current.handleResubmit(); });

    expect(mockResubmit).toHaveBeenCalledWith('d1', { moduleCode: 'contract', reason: '发起人重新提交子工单' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
  });
});
