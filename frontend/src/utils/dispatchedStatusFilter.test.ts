import { describe, expect, it } from 'vitest';
import {
  DISPATCHED_PROCESSING_STATUS_FILTER_VALUE,
  DISPATCHED_PROCESSING_STATUS_OPTION,
  isDispatchedProcessingStatusFilter,
  normalizeDispatchedStatusSearchParams,
} from './dispatchedStatusFilter';

describe('dispatched status search params', () => {
  it('exposes one visible processing option that represents pending plus processing', () => {
    expect(DISPATCHED_PROCESSING_STATUS_OPTION).toEqual({
      label: '处理中',
      value: 'pending,processing',
    });
    expect(DISPATCHED_PROCESSING_STATUS_FILTER_VALUE).toBe('pending,processing');
  });

  it('normalizes selected processing filter to statuses=pending,processing', () => {
    expect(normalizeDispatchedStatusSearchParams({ page: 1, status: 'pending,processing', module_code: 'contract' })).toEqual({
      page: 1,
      module_code: 'contract',
      statuses: 'pending,processing',
    });
  });

  it('also treats legacy single pending or processing values as processing group', () => {
    expect(normalizeDispatchedStatusSearchParams({ status: 'processing' })).toEqual({ statuses: 'pending,processing' });
    expect(normalizeDispatchedStatusSearchParams({ status: 'pending' })).toEqual({ statuses: 'pending,processing' });
    expect(isDispatchedProcessingStatusFilter('processing')).toBe(true);
    expect(isDispatchedProcessingStatusFilter('pending')).toBe(true);
  });

  it('keeps other statuses as a single status query', () => {
    expect(normalizeDispatchedStatusSearchParams({ status: 'completed', statuses: 'pending,processing' })).toEqual({
      status: 'completed',
    });
  });

  it('clears status fields without reusing stale statuses', () => {
    expect(normalizeDispatchedStatusSearchParams({ status: '', statuses: 'pending,processing', statusIn: 'pending,processing', keyword: 'abc' })).toEqual({
      keyword: 'abc',
    });
  });
});
