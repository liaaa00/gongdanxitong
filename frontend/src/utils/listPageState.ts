import type { ProColumns } from '@ant-design/pro-components';
import dayjs, { type Dayjs } from 'dayjs';
import type { Key } from 'react';

export type CachedTableFilters = Record<string, Key[] | null>;

export const KEEP_ALIVE_ROUTE_ACTIVATED_EVENT = 'work-order:keep-alive-route-activated';

export interface KeepAliveRouteActivatedDetail {
  pathname: string;
  search: string;
}

export function notifyKeepAliveRouteActivated(detail: KeepAliveRouteActivatedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<KeepAliveRouteActivatedDetail>(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, { detail }));
}

export interface CachedListPageState {
  month?: string;
  current?: number;
  pageSize?: number;
  filters?: CachedTableFilters;
}

const STORAGE_PREFIX = 'list_page_state:';
const cache: Record<string, CachedListPageState> = {};

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function sanitizeFilters(value: unknown): CachedTableFilters | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const filters: CachedTableFilters = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (Array.isArray(item)) {
      const normalized = item.map((entry) => String(entry ?? '').trim()).filter(Boolean);
      filters[key] = normalized.length > 0 ? normalized : null;
      return;
    }
    if (item === null) filters[key] = null;
  });
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function sanitizeState(value: unknown): CachedListPageState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const state: CachedListPageState = {};
  if (typeof raw.month === 'string' && raw.month.trim()) state.month = raw.month.trim();
  const current = normalizePositiveNumber(raw.current);
  if (current) state.current = current;
  const pageSize = normalizePositiveNumber(raw.pageSize);
  if (pageSize) state.pageSize = pageSize;
  const filters = sanitizeFilters(raw.filters);
  if (filters) state.filters = filters;
  return state;
}

function readPersistentState(key: string): CachedListPageState {
  const storage = getSessionStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_PREFIX + key);
    return raw ? sanitizeState(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writePersistentState(key: string, state: CachedListPageState) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    // Ignore quota/security errors; in-memory cache still keeps current SPA navigation state.
  }
}

function removePersistentState(key: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Ignore storage errors.
  }
}

function clearPersistentStateWithPrefix() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const itemKey = storage.key(index);
      if (itemKey && itemKey.startsWith(STORAGE_PREFIX)) keys.push(itemKey);
    }
    keys.forEach((itemKey) => storage.removeItem(itemKey));
  } catch {
    // Ignore storage errors.
  }
}

export function getCachedListPageState(key: string): CachedListPageState {
  if (!cache[key]) cache[key] = readPersistentState(key);
  return cache[key] || {};
}

export function updateCachedListPageState(key: string, state: CachedListPageState): CachedListPageState {
  const next = sanitizeState({ ...getCachedListPageState(key), ...state });
  cache[key] = next;
  writePersistentState(key, next);
  return cache[key];
}

export function clearCachedListPageState(key?: string) {
  if (key) {
    delete cache[key];
    removePersistentState(key);
    return;
  }
  Object.keys(cache).forEach((item) => delete cache[item]);
  clearPersistentStateWithPrefix();
}

export function getCachedMonth(key: string): Dayjs {
  const month = getCachedListPageState(key).month;
  const parsed = month ? dayjs(month, 'YYYY-MM') : dayjs();
  return parsed.isValid() ? parsed : dayjs();
}

// 列表页默认空月份：无缓存时返回 null（=全部月份），有缓存且合法时返回该月份。
export function getCachedMonthOrNull(key: string): Dayjs | null {
  const month = getCachedListPageState(key).month;
  if (!month) return null;
  const parsed = dayjs(month, 'YYYY-MM');
  return parsed.isValid() ? parsed : null;
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
