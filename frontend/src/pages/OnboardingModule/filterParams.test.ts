import { describe, expect, it, vi } from 'vitest';
import {
  DISPATCHED_STATUS_FILTER_OPTIONS,
  buildEffectiveHeaderFilterParams,
  buildHeaderFilterParams,
  fetchAllFilteredDispatchedOrders,
  getFilterValues,
  mergeSelectedDispatchedRows,
  normalizeTableFilters,
  runChunkedRequests,
  serializeFilterValues,
} from './index';

describe('OnboardingModule table header filter params', () => {
  it('uses the required nine visible status filter options', () => {
    expect(DISPATCHED_STATUS_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      '未接单',
      '已接单',
      '修改审批中',
      '撤回审批中',
      '作废审批中',
      '已完成',
      '已作废',
      '已撤回',
      '已退回',
    ]);
  });

  it('serializes multiple selected status filters for request params', () => {
    const filters = { status: ['pending', 'processing'] };

    expect(getFilterValues(filters, 'status')).toEqual(['pending', 'processing']);
    expect(serializeFilterValues(filters, 'status')).toBe('pending,processing');
  });

  it('returns undefined when a header filter is cleared', () => {
    expect(serializeFilterValues({ status: [] }, 'status')).toBeUndefined();
    expect(serializeFilterValues({ status: null }, 'status')).toBeUndefined();
  });

  it('normalizes table filters for controlled filteredValue and drops cleared fields', () => {
    expect(normalizeTableFilters({ status: ['pending', 'processing'], order_no: [] })).toEqual({
      status: ['pending', 'processing'],
    });
  });

  it('builds request params with all selected statuses and creator name filter', () => {
    expect(buildHeaderFilterParams({ status: ['pending', 'processing'], created_by_name: ['张三'] })).toMatchObject({
      statuses: 'pending,processing',
      createdByName: '张三',
    });
  });

  it('keeps single selected status compatible with the statuses request param', () => {
    expect(buildHeaderFilterParams({ status: ['pending'] })).toMatchObject({
      statuses: 'pending',
    });
  });

  it('serializes the related data-entry status filter independently', () => {
    expect(buildHeaderFilterParams({
      status: ['pending'],
      data_entry_status: ['processing', 'completed'],
    })).toMatchObject({
      statuses: 'pending',
      dataEntryStatuses: 'processing,completed',
    });
  });

  it('omits statuses request param after status filter is cleared', () => {
    expect(buildHeaderFilterParams({ status: [] })).not.toHaveProperty('statuses');
    expect(buildHeaderFilterParams({ status: null })).not.toHaveProperty('statuses');
  });

  it('uses controlled table filters when reload request receives an empty filter payload', () => {
    expect(buildEffectiveHeaderFilterParams({}, { status: ['pending', 'processing'] })).toMatchObject({
      statuses: 'pending,processing',
    });
  });

  it('does not reuse stale controlled statuses when ProTable sends an explicit clear payload', () => {
    expect(buildEffectiveHeaderFilterParams({ status: [] }, { status: ['pending'] })).not.toHaveProperty('statuses');
  });
});

describe('OnboardingModule select-all and chunking helpers', () => {
  it('fetches 450 filtered rows in 200, 200, and 50 row pages with the exact filters', async () => {
    const fetchPage = vi.fn(async (params: Record<string, unknown>) => {
      const page = Number(params.current);
      const count = page < 3 ? 200 : 50;
      return {
        list: Array.from({ length: count }, (_item, index) => ({
          id: `row-${(page - 1) * 200 + index + 1}`,
          module_code: 'contract',
          status: 'pending',
        })),
        total: 450,
        page,
        pageSize: 200,
        totalPages: 3,
        success: true,
      };
    });

    const result = await fetchAllFilteredDispatchedOrders({
      module_code: 'contract',
      statuses: 'pending',
      dataEntryStatuses: 'completed',
      keyword: '张三',
    }, fetchPage as never);

    expect(result.rows).toHaveLength(450);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([params]) => params)).toEqual([
      expect.objectContaining({ current: 1, pageSize: 200, statuses: 'pending', dataEntryStatuses: 'completed', keyword: '张三' }),
      expect.objectContaining({ current: 2, pageSize: 200, statuses: 'pending', dataEntryStatuses: 'completed', keyword: '张三' }),
      expect.objectContaining({ current: 3, pageSize: 200, statuses: 'pending', dataEntryStatuses: 'completed', keyword: '张三' }),
    ]);
  });

  it('preserves off-page rows and removes manually unchecked keys', () => {
    const previousRows = [
      { id: 'page-1-a', module_code: 'contract', status: 'pending' },
      { id: 'page-1-b', module_code: 'contract', status: 'pending' },
    ];
    const currentRows = [
      { id: 'page-2-c', module_code: 'contract', status: 'processing' },
    ];

    expect(mergeSelectedDispatchedRows(previousRows as never, ['page-1-a', 'page-2-c'], currentRows as never)
      .map((row) => row.id)).toEqual(['page-1-a', 'page-2-c']);
  });

  it('submits 120 items as 50, 50, and 20 and continues after a failed chunk', async () => {
    const requestChunk = vi.fn()
      .mockResolvedValueOnce({ accepted: 50 })
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ accepted: 20 });
    const ids = Array.from({ length: 120 }, (_item, index) => `id-${index + 1}`);

    const result = await runChunkedRequests(ids, 50, requestChunk);

    expect(requestChunk.mock.calls.map(([chunk]) => chunk.length)).toEqual([50, 50, 20]);
    expect(result.results).toEqual([{ accepted: 50 }, { accepted: 20 }]);
    expect(result.failedItems).toEqual(ids.slice(50, 100));
  });
});
