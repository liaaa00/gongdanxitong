import { describe, expect, it } from 'vitest';
import { DISPATCHED_STATUS_FILTER_OPTIONS, buildEffectiveHeaderFilterParams, buildHeaderFilterParams, getFilterValues, normalizeTableFilters, serializeFilterValues } from './index';

describe('OnboardingModule table header filter params', () => {
  it('maps the visible processing filter option to both pending and processing backend statuses', () => {
    const processingOption = DISPATCHED_STATUS_FILTER_OPTIONS.find((option) => option.label === '处理中');

    expect(processingOption).toMatchObject({ value: 'pending,processing' });
    expect(buildHeaderFilterParams({ status: [processingOption?.value || ''] })).toMatchObject({
      statuses: 'pending,processing',
    });
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

  it('builds request params with all selected statuses', () => {
    expect(buildHeaderFilterParams({ status: ['pending', 'processing'] })).toMatchObject({
      statuses: 'pending,processing',
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
