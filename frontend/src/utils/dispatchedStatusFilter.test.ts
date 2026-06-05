import { describe, expect, it } from 'vitest';
import {
  DISPATCHED_PROCESSING_STATUS_FILTER_VALUE,
  DISPATCHED_NINE_STATUS_OPTIONS,
  DISPATCHED_PROCESSING_STATUS_OPTION,
  isDispatchedProcessingStatusFilter,
  normalizeDispatchedStatusSearchParams,
} from './dispatchedStatusFilter';

describe('dispatched status search params', () => {
  it('exposes the required nine visible status options and keeps the legacy processing value', () => {
    expect(DISPATCHED_NINE_STATUS_OPTIONS.map((option) => option.label)).toEqual([
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
    expect(DISPATCHED_PROCESSING_STATUS_OPTION).toEqual({
      label: '未接单/已接单',
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

  it('keeps single pending or processing selections as individual status queries', () => {
    expect(normalizeDispatchedStatusSearchParams({ status: 'processing' })).toEqual({ status: 'processing' });
    expect(normalizeDispatchedStatusSearchParams({ status: 'pending' })).toEqual({ status: 'pending' });
    expect(isDispatchedProcessingStatusFilter('processing')).toBe(false);
    expect(isDispatchedProcessingStatusFilter('pending')).toBe(false);
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
