import { describe, expect, it } from 'vitest';
import { DISPATCHED_STATUS_FILTER_OPTIONS, buildEffectiveHeaderFilterParams, buildHeaderFilterParams, getFilterValues, normalizeTableFilters, serializeFilterValues } from './index';

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
