import { describe, it, expect, beforeEach, vi } from 'vitest';
import dayjs from 'dayjs';
import {
  getCachedListPageState,
  updateCachedListPageState,
  clearCachedListPageState,
  getCachedMonth,
  toMonthKey,
  normalizeCachedFilters,
  applyCachedColumnFilters,
  type CachedListPageState,
  type CachedTableFilters,
} from './listPageState';

function mockSessionStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  };
}

function mockWindow(ss?: ReturnType<typeof mockSessionStorage>) {
  const storage = ss ?? mockSessionStorage();
  vi.stubGlobal('window', {
    ...(globalThis as unknown as Record<string, unknown>),
    sessionStorage: storage,
  } as unknown as Window & typeof globalThis);
  return storage;
}

function restoreWindow() {
  vi.unstubAllGlobals();
}

describe('listPageState', () => {
  let ss: ReturnType<typeof mockSessionStorage>;

  beforeEach(() => {
    clearCachedListPageState();
    ss = mockWindow();
  });

  afterEach(() => {
    clearCachedListPageState();
    restoreWindow();
  });

  describe('getCachedListPageState / updateCachedListPageState', () => {
    it('returns empty state for unknown key', () => {
      expect(getCachedListPageState('unknown-key')).toEqual({});
    });

    it('saves and restores pagination state', () => {
      updateCachedListPageState('my-work:initiated', { current: 3, pageSize: 50 });
      const state = getCachedListPageState('my-work:initiated');
      expect(state.current).toBe(3);
      expect(state.pageSize).toBe(50);
    });

    it('saves and restores filters', () => {
      updateCachedListPageState('my-work:done', {
        filters: { status: ['completed'], handler: ['user-1'] },
      });
      const state = getCachedListPageState('my-work:done');
      expect(state.filters).toEqual({ status: ['completed'], handler: ['user-1'] });
    });

    it('saves and restores month', () => {
      updateCachedListPageState('history', { month: '2026-05' });
      expect(getCachedListPageState('history').month).toBe('2026-05');
    });

    it('merges partial updates without losing existing values', () => {
      updateCachedListPageState('merge-test', { current: 2, pageSize: 30, month: '2026-04' });
      updateCachedListPageState('merge-test', { current: 5 });
      const state = getCachedListPageState('merge-test');
      expect(state.current).toBe(5);
      expect(state.pageSize).toBe(30);
      expect(state.month).toBe('2026-04');
    });

    it('persists state across multiple reads via sessionStorage', () => {
      updateCachedListPageState('persist-key', { current: 7, pageSize: 100 });
      // Simulate a new read (in-memory cache should be populated from sessionStorage on first read,
      // but since we already updated, cache is already hot)
      const state = getCachedListPageState('persist-key');
      expect(state.current).toBe(7);
      expect(state.pageSize).toBe(100);
      expect(ss.setItem).toHaveBeenCalled();
    });

    it('sanitizes non-positive pagination values', () => {
      updateCachedListPageState('sanitize-test', { current: -1, pageSize: 0 } as CachedListPageState);
      const state = getCachedListPageState('sanitize-test');
      expect(state.current).toBeUndefined();
      expect(state.pageSize).toBeUndefined();
    });

    it('sanitizes NaN pagination values', () => {
      updateCachedListPageState('nan-test', { current: NaN, pageSize: NaN } as CachedListPageState);
      const state = getCachedListPageState('nan-test');
      expect(state.current).toBeUndefined();
      expect(state.pageSize).toBeUndefined();
    });
  });

  describe('clearCachedListPageState', () => {
    it('clears a single key from memory and sessionStorage', () => {
      updateCachedListPageState('key-a', { current: 1 });
      updateCachedListPageState('key-b', { current: 2 });

      clearCachedListPageState('key-a');

      expect(getCachedListPageState('key-a')).toEqual({});
      expect(getCachedListPageState('key-b').current).toBe(2);
      expect(ss.removeItem).toHaveBeenCalled();
    });

    it('clears all keys when called without argument', () => {
      updateCachedListPageState('key-a', { current: 1 });
      updateCachedListPageState('key-b', { current: 2 });

      clearCachedListPageState();

      expect(getCachedListPageState('key-a')).toEqual({});
      expect(getCachedListPageState('key-b')).toEqual({});
    });
  });

  describe('getCachedMonth', () => {
    it('returns cached month as dayjs object', () => {
      updateCachedListPageState('month-test', { month: '2026-03' });
      const month = getCachedMonth('month-test');
      expect(month.format('YYYY-MM')).toBe('2026-03');
      expect(month.isValid()).toBe(true);
    });

    it('returns current month when no cached month exists', () => {
      const month = getCachedMonth('no-month');
      expect(month.format('YYYY-MM')).not.toBe('Invalid Date');
      expect(month.isValid()).toBe(true);
    });

    it('returns current month when cached month is invalid', () => {
      updateCachedListPageState('bad-month', { month: 'not-a-date' });
      const month = getCachedMonth('bad-month');
      expect(month.isValid()).toBe(true);
    });
  });

  describe('toMonthKey', () => {
    it('formats a dayjs value to YYYY-MM', () => {
      const value = dayjs('2026-06-15');
      expect(toMonthKey(value)).toBe('2026-06');
    });

    it('returns current month for null/undefined', () => {
      const key = toMonthKey(null);
      expect(key).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('normalizeCachedFilters', () => {
    it('converts readonly arrays to mutable arrays', () => {
      const input = { status: ['pending'] as readonly string[] };
      const result = normalizeCachedFilters(input);
      expect(result.status).toEqual(['pending']);
      // Should be a mutable copy
      expect(Array.isArray(result.status)).toBe(true);
    });

    it('handles null filter values', () => {
      const result = normalizeCachedFilters({ status: null });
      expect(result.status).toBeNull();
    });

    it('handles empty arrays', () => {
      const result = normalizeCachedFilters({ status: [] as unknown as readonly string[] });
      expect(result.status).toBeNull();
    });

    it('handles undefined input', () => {
      expect(normalizeCachedFilters(undefined)).toEqual({});
    });

    it('trims whitespace from filter values', () => {
      const result = normalizeCachedFilters({ name: ['  alice  ', 'bob'] as unknown as readonly string[] });
      expect(result.name).toEqual(['alice', 'bob']);
    });
  });

  describe('applyCachedColumnFilters', () => {
    it('applies filteredValue to matching columns by key', () => {
      const columns = [
        { title: 'Status', key: 'status', dataIndex: 'status', filters: true },
        { title: 'Type', key: 'type', dataIndex: 'type', filters: true },
        { title: 'Name', key: 'name', dataIndex: 'name' },
      ];
      const filters: CachedTableFilters = { status: ['active'], type: ['onboarding'] };

      const result = applyCachedColumnFilters(columns, filters);
      expect(result[0].filteredValue).toEqual(['active']);
      expect(result[1].filteredValue).toEqual(['onboarding']);
      expect(result[2].filteredValue).toBeUndefined();
    });

    it('applies filteredValue by dataIndex when key is missing', () => {
      const columns = [
        { title: 'Status', dataIndex: 'status', filters: true },
      ];
      const filters: CachedTableFilters = { status: ['completed'] };

      const result = applyCachedColumnFilters(columns, filters);
      expect(result[0].filteredValue).toEqual(['completed']);
    });

    it('prefers key over dataIndex when both match', () => {
      const columns = [
        { title: 'Status', key: 'status_key', dataIndex: 'status', filters: true },
      ];
      const filters: CachedTableFilters = { status_key: ['by-key'], status: ['by-dataIndex'] };

      const result = applyCachedColumnFilters(columns, filters);
      // key takes priority
      expect(result[0].filteredValue).toEqual(['by-key']);
    });

    it('sets filteredValue to null for empty filter arrays', () => {
      const columns = [
        { title: 'Status', key: 'status', dataIndex: 'status', filters: true },
      ];
      const filters: CachedTableFilters = { status: [] };

      const result = applyCachedColumnFilters(columns, filters);
      // null means "cleared filter"
      expect(result[0].filteredValue).toBeNull();
    });

    it('does not modify columns without filterDropdown or filters', () => {
      const columns = [
        { title: 'Name', key: 'name', dataIndex: 'name' },
      ];
      const filters: CachedTableFilters = { name: ['alice'] };

      const result = applyCachedColumnFilters(columns, filters);
      expect(result[0].filteredValue).toBeUndefined();
    });

    it('handles empty filters object', () => {
      const columns = [
        { title: 'Status', key: 'status', dataIndex: 'status', filters: true },
      ];
      const result = applyCachedColumnFilters(columns, {});
      expect(result[0].filteredValue).toBeUndefined();
    });

    it('handles composite dataIndex (array)', () => {
      const columns = [
        { title: 'User', dataIndex: ['user', 'name'] as unknown as string, filters: true },
      ];
      const filters: CachedTableFilters = { 'user.name': ['alice'] };

      const result = applyCachedColumnFilters(columns, filters);
      expect(result[0].filteredValue).toEqual(['alice']);
    });
  });

  describe('state isolation', () => {
    it('keeps different list keys isolated from each other', () => {
      updateCachedListPageState('my-work:initiated', { current: 2, filters: { status: ['pending'] } });
      updateCachedListPageState('my-work:done', { current: 5, filters: { status: ['completed'] } });

      const initiated = getCachedListPageState('my-work:initiated');
      const done = getCachedListPageState('my-work:done');

      expect(initiated.current).toBe(2);
      expect(initiated.filters).toEqual({ status: ['pending'] });
      expect(done.current).toBe(5);
      expect(done.filters).toEqual({ status: ['completed'] });
    });
  });

  describe('graceful degradation without sessionStorage', () => {
    it('returns empty state when sessionStorage is unavailable', () => {
      restoreWindow();
      vi.stubGlobal('window', undefined);
      const state = getCachedListPageState('no-ss');
      expect(state).toEqual({});
    });

    it('update still works in-memory without sessionStorage', () => {
      restoreWindow();
      vi.stubGlobal('window', undefined);
      updateCachedListPageState('no-ss', { current: 1 });
      // Should not throw; in-memory cache still holds
      const state = getCachedListPageState('no-ss');
      expect(state.current).toBe(1);
    });
  });
});
