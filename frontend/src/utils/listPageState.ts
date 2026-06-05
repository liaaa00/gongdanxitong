import type { ProColumns } from '@ant-design/pro-components';
import dayjs, { type Dayjs } from 'dayjs';
import type { Key } from 'react';

export type CachedTableFilters = Record<string, Key[] | null>;

export interface CachedListPageState {
  month?: string;
  current?: number;
  pageSize?: number;
  filters?: CachedTableFilters;
}

const cache: Record<string, CachedListPageState> = {};

export function getCachedListPageState(key: string): CachedListPageState {
  return cache[key] || {};
}

export function updateCachedListPageState(key: string, state: CachedListPageState): CachedListPageState {
  cache[key] = { ...cache[key], ...state };
  return cache[key];
}

export function clearCachedListPageState(key?: string) {
  if (key) {
    delete cache[key];
    return;
  }
  Object.keys(cache).forEach((item) => delete cache[item]);
}

export function getCachedMonth(key: string): Dayjs {
  const month = getCachedListPageState(key).month;
  const parsed = month ? dayjs(month, 'YYYY-MM') : dayjs();
  return parsed.isValid() ? parsed : dayjs();
}

export function toMonthKey(value?: Dayjs | null): string {
  const month = value && value.isValid() ? value : dayjs();
  return month.format('YYYY-MM');
}

export function normalizeCachedFilters(
  filters?: Record<string, readonly unknown[] | null | undefined>,
): CachedTableFilters {
  const normalized: CachedTableFilters = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item ?? '').trim()).filter(Boolean);
      if (items.length > 0) normalized[key] = items;
      else normalized[key] = null;
      return;
    }
    if (value === null) normalized[key] = null;
  });
  return normalized;
}

function getDataIndexKey(dataIndex: unknown): string | undefined {
  if (Array.isArray(dataIndex)) return dataIndex.map(String).join('.');
  if (dataIndex === undefined || dataIndex === null) return undefined;
  return String(dataIndex);
}

function getCachedFilterValue<T>(column: ProColumns<T>, filters: CachedTableFilters): Key[] | null | undefined {
  const candidates = [
    column.key === undefined || column.key === null ? undefined : String(column.key),
    getDataIndexKey(column.dataIndex),
  ].filter(Boolean) as string[];

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(filters, key)) {
      const value = filters[key];
      return Array.isArray(value) && value.length > 0 ? value : null;
    }
  }
  return undefined;
}

export function applyCachedColumnFilters<T>(
  columns: ProColumns<T>[],
  filters: CachedTableFilters,
): ProColumns<T>[] {
  return columns.map((column) => {
    if (!column.filterDropdown && !column.filters) return column;
    const value = getCachedFilterValue(column, filters);
    if (value === undefined) return column;
    return { ...column, filteredValue: value };
  });
}
