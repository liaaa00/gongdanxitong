import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface ExceptionModuleHandlerItem {
  id: string;
  moduleCode: string;
  customerCode: string;
  handlerId: string;
  handlerName?: string;
  createdAt?: string;
  updatedAt?: string;
  // snake_case aliases for defensive compatibility with older/mock responses
  module_code?: string;
  customer_code?: string;
  handler_id?: string;
  handler_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExceptionModuleHandlerPayload {
  moduleCode: string;
  customerCode: string;
  handlerId: string;
}

export interface ExceptionModuleHandlerQuery {
  moduleCode?: string;
  customerCode?: string;
  handlerId?: string;
  page?: number;
  current?: number;
  pageSize?: number;
}

export interface ExceptionModuleHandlerListResult {
  list: ExceptionModuleHandlerItem[];
  total: number;
  page: number;
  pageSize: number;
  success: boolean;
}

const KEY = 'mock_admin_exception_module_handlers_v1';
const SEED: ExceptionModuleHandlerItem[] = [];

const store = () => loadList<ExceptionModuleHandlerItem>(KEY, SEED);
const commit = (list: ExceptionModuleHandlerItem[]) => saveList(KEY, list);

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
};

function normalizeExceptionModuleHandler(item: any): ExceptionModuleHandlerItem {
  const moduleCode = firstText(item.moduleCode, item.module_code, item.module?.code, item.module?.moduleCode, item.module?.module_code);
  const customerCode = firstText(item.customerCode, item.customer_code, item.customer?.customerCode, item.customer?.customer_code, item.customer?.code);
  const handlerId = firstText(item.handlerId, item.handler_id, item.handler?.id, item.user?.id);
  const handlerName = firstText(
    item.handlerName,
    item.handler_name,
    item.handler?.realName,
    item.handler?.real_name,
    item.handler?.displayName,
    item.handler?.username,
    item.user?.realName,
    item.user?.real_name,
    item.user?.username,
  );
  const id = firstText(item.id, item.ID, item._id) || `${moduleCode}-${customerCode}-${handlerId}`;

  return {
    id,
    moduleCode,
    customerCode,
    handlerId,
    handlerName: handlerName || undefined,
    createdAt: firstText(item.createdAt, item.created_at) || undefined,
    updatedAt: firstText(item.updatedAt, item.updated_at) || undefined,
    module_code: moduleCode,
    customer_code: customerCode,
    handler_id: handlerId,
    handler_name: handlerName || undefined,
    created_at: firstText(item.created_at, item.createdAt) || undefined,
    updated_at: firstText(item.updated_at, item.updatedAt) || undefined,
  };
}

function normalizePayload(data: ExceptionModuleHandlerPayload): ExceptionModuleHandlerPayload {
  return {
    moduleCode: String(data.moduleCode || '').trim(),
    customerCode: String(data.customerCode || '').trim(),
    handlerId: String(data.handlerId || '').trim(),
  };
}

function getEnvelope(raw: any): any {
  if (!raw || Array.isArray(raw)) return raw;
  if (raw.data && typeof raw.data === 'object') return raw.data;
  if (raw.result && typeof raw.result === 'object') return raw.result;
  return raw;
}

function extractRawList(raw: any): any[] {
  const envelope = getEnvelope(raw);
  if (Array.isArray(envelope)) return envelope;
  const candidates = [
    envelope?.list,
    envelope?.items,
    envelope?.rows,
    envelope?.records,
    envelope?.data,
    envelope?.result,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = extractRawList(candidate);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function extractTotal(raw: any, listLength: number): number {
  const envelope = getEnvelope(raw);
  return Number(
    envelope?.total ??
    envelope?.totalCount ??
    envelope?.count ??
    envelope?.pagination?.total ??
    raw?.total ??
    raw?.totalCount ??
    listLength,
  ) || listLength;
}

function buildParams(query?: ExceptionModuleHandlerQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!query) return params;
  // Backend ListExceptionModuleHandlersQueryDto only whitelists moduleCode/customerCode.
  // Do not send page/pageSize/handlerId, otherwise forbidNonWhitelisted rejects the GET request.
  if (query.moduleCode) params.moduleCode = query.moduleCode;
  if (query.customerCode) params.customerCode = query.customerCode;
  return params;
}

function normalizePageResult(raw: unknown, query?: ExceptionModuleHandlerQuery): ExceptionModuleHandlerListResult {
  const requestedPage = Number(query?.page ?? query?.current ?? 1) || 1;
  const requestedPageSize = Number(query?.pageSize ?? 20) || 20;
  const keywordHandler = query?.handlerId?.trim();
  const envelope = getEnvelope(raw);
  const rawList = extractRawList(raw);
  const normalizedList = rawList
    .map(normalizeExceptionModuleHandler)
    .filter((item) => !keywordHandler || item.handlerId === keywordHandler);
  const total = keywordHandler ? normalizedList.length : extractTotal(raw, normalizedList.length);
  const responsePage = Number(envelope?.page ?? requestedPage) || requestedPage;
  const responsePageSize = Number(envelope?.pageSize ?? requestedPageSize) || requestedPageSize;
  const shouldSliceLocally = normalizedList.length === total;
  const start = (requestedPage - 1) * requestedPageSize;
  const list = shouldSliceLocally
    ? normalizedList.slice(start, start + requestedPageSize)
    : normalizedList;

  return {
    list,
    total,
    page: responsePage,
    pageSize: responsePageSize,
    success: true,
  };
}

export async function getExceptionModuleHandlers(query?: ExceptionModuleHandlerQuery): Promise<ExceptionModuleHandlerListResult> {
  const page = query?.page ?? query?.current ?? 1;
  const pageSize = query?.pageSize ?? 20;

  if (isMockMode) {
    const keywordModule = query?.moduleCode?.trim();
    const keywordCustomer = query?.customerCode?.trim();
    const keywordHandler = query?.handlerId?.trim();
    const filtered = store()
      .map(normalizeExceptionModuleHandler)
      .filter((item) =>
        (!keywordModule || item.moduleCode === keywordModule) &&
        (!keywordCustomer || item.customerCode === keywordCustomer) &&
        (!keywordHandler || item.handlerId === keywordHandler),
      );
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);
    return mockDelay({ list, total: filtered.length, page, pageSize, success: true });
  }

  const result = await request.get('/admin/exception-module-handlers', { params: buildParams(query) }) as any;
  return normalizePageResult(result, query);
}

export async function createExceptionModuleHandler(data: ExceptionModuleHandlerPayload): Promise<ExceptionModuleHandlerItem> {
  const payload = normalizePayload(data);
  if (isMockMode) {
    const list = store();
    const item: ExceptionModuleHandlerItem = {
      id: nextId(list),
      ...payload,
      handlerName: payload.handlerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(item);
    commit(list);
    return mockDelay(normalizeExceptionModuleHandler(item));
  }
  const result = await request.post('/admin/exception-module-handlers', payload) as any;
  return normalizeExceptionModuleHandler(getEnvelope(result) || payload);
}

export async function updateExceptionModuleHandler(id: string, data: ExceptionModuleHandlerPayload): Promise<ExceptionModuleHandlerItem> {
  const payload = normalizePayload(data);
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return Promise.reject(new Error('例外派发规则不存在'));
    const merged: ExceptionModuleHandlerItem = {
      ...list[idx],
      ...payload,
      handlerName: payload.handlerId,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = merged;
    commit(list);
    return mockDelay(normalizeExceptionModuleHandler(merged));
  }
  const result = await request.put(`/admin/exception-module-handlers/${id}`, payload) as any;
  return normalizeExceptionModuleHandler(getEnvelope(result) || { id, ...payload });
}

export async function deleteExceptionModuleHandler(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((item) => item.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/exception-module-handlers/${id}`) as Promise<void>;
}
