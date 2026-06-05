export const DISPATCHED_PROCESSING_STATUSES = ['pending', 'processing'] as const;
export const DISPATCHED_PROCESSING_STATUS_FILTER_VALUE = DISPATCHED_PROCESSING_STATUSES.join(',');
export const DISPATCHED_PROCESSING_STATUS_OPTION = {
  label: '未接单/已接单',
  value: DISPATCHED_PROCESSING_STATUS_FILTER_VALUE,
};

const PROCESSING_STATUS_SET = new Set<string>(DISPATCHED_PROCESSING_STATUSES);

type Params = Record<string, unknown>;

function readString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

export function isDispatchedProcessingStatusFilter(value: unknown): boolean {
  const raw = readString(value);
  if (!raw) return false;
  const values = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (values.length === 1) return PROCESSING_STATUS_SET.has(values[0]);
  if (values.length !== DISPATCHED_PROCESSING_STATUSES.length) return false;
  const unique = new Set(values);
  return DISPATCHED_PROCESSING_STATUSES.every((status) => unique.has(status));
}

export function normalizeDispatchedStatusSearchParams<T extends Params>(params: T): T & { status?: string; statuses?: string } {
  const next: Params = { ...params };
  const hasStatusKey = Object.prototype.hasOwnProperty.call(next, 'status');
  const status = readString(next.status);

  if (!status) {
    delete next.status;
    if (hasStatusKey) {
      delete next.statuses;
      delete next.statusIn;
    }
    return next as T & { status?: string; statuses?: string };
  }

  delete next.statusIn;
  if (isDispatchedProcessingStatusFilter(status)) {
    delete next.status;
    next.statuses = DISPATCHED_PROCESSING_STATUS_FILTER_VALUE;
    return next as T & { status?: string; statuses?: string };
  }

  next.status = status;
  delete next.statuses;
  return next as T & { status?: string; statuses?: string };
}
