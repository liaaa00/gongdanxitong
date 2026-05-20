import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';

export interface OperationLogDiffItem {
  field: string;
  fieldLabel?: string;
  before: unknown;
  after: unknown;
}

export interface OperationLogItem {
  id: string;
  createdAt: string;
  operatorId?: string | null;
  operatorName?: string;
  userId?: string | null;
  user_id?: string | null;
  userName?: string | null;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  actionCode: string;
  actionLabel?: string;
  diffs?: OperationLogDiffItem[];
  remark?: string | null;
  extra?: unknown;

  // Legacy fields kept for current backend/mock compatibility.
  entity_type?: string;
  entity_id?: string;
  user_name?: string;
  action_type?: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at?: string;
}

export interface OperationLogQuery extends PageParams {
  actionCodes?: string[];
  operatorIds?: string[];
  startTime?: string;
  endTime?: string;
  entityType?: string;
  entityId?: string;
  action_type?: string;
  user_name?: string;
  entity_type?: string;
  created_after?: string;
  created_before?: string;
}

const ACTION_LABEL: Record<string, string> = {
  create: '创建',
  submit: '提交',
  dispatch: '派发',
  accept: '接单',
  complete: '完成',
  return: '退回',
  supplement: '补件',
  withdraw: '撤回',
};

const ENTITY_LABEL: Record<string, string> = {
  work_order: '主工单',
  dispatched_order: '子工单',
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toStringValue = (value: unknown) => (value === null || value === undefined ? '' : String(value));

const clampPageSize = (value: unknown) => {
  const pageSize = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
};

function normalizeDiffItem(raw: unknown): OperationLogDiffItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const field = toStringValue(row.field ?? row.path ?? row.fieldCode ?? row.field_code);
  if (!field) return null;
  return {
    field,
    fieldLabel: toStringValue(row.fieldLabel ?? row.field_label ?? row.label) || field,
    before: row.before,
    after: row.after,
  };
}

export function normalizeOperationLogItem(raw: unknown): OperationLogItem {
  const row = (raw || {}) as Record<string, unknown>;
  const entityType = toStringValue(row.entityType ?? row.entity_type);
  const actionCode = toStringValue(row.actionCode ?? row.action_type ?? row.actionType);
  const createdAt = toStringValue(row.createdAt ?? row.created_at);
  const operatorName = toStringValue(row.operatorName ?? row.operator_name ?? row.user_name ?? row.userName);
  const userId = (row.userId ?? row.user_id ?? row.operatorId ?? row.operator_id ?? null) as string | null;
  const diffsSource = Array.isArray(row.diffs)
    ? row.diffs
    : Array.isArray(row.diff)
      ? row.diff
      : undefined;
  const diffs = diffsSource
    ?.map(normalizeDiffItem)
    .filter((item): item is OperationLogDiffItem => Boolean(item));

  return {
    id: toStringValue(row.id),
    createdAt,
    operatorId: userId,
    operatorName,
    userId,
    user_id: userId,
    userName: operatorName,
    entityType,
    entityId: toStringValue(row.entityId ?? row.entity_id),
    entityLabel: toStringValue(row.entityLabel ?? row.entity_label) || ENTITY_LABEL[entityType] || entityType,
    actionCode,
    actionLabel: toStringValue(row.actionLabel ?? row.action_label) || ACTION_LABEL[actionCode] || actionCode,
    diffs,
    remark: (row.remark ?? null) as string | null,
    extra: row.extra,

    entity_type: entityType,
    entity_id: toStringValue(row.entityId ?? row.entity_id),
    user_name: operatorName,
    action_type: actionCode,
    before_data: (row.before_data ?? row.beforeData ?? null) as Record<string, unknown> | null,
    after_data: (row.after_data ?? row.afterData ?? null) as Record<string, unknown> | null,
    ip_address: (row.ip_address ?? row.ipAddress ?? null) as string | null,
    created_at: createdAt,
  };
}

function normalizePageResult(raw: unknown): PageResult<OperationLogItem> {
  const result = (raw || {}) as Record<string, unknown>;
  const rawList = Array.isArray(result.items)
    ? result.items
    : Array.isArray(result.list)
      ? result.list
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(raw)
          ? raw as unknown[]
          : [];
  const list = rawList.map(normalizeOperationLogItem);
  const total = Number(result.total ?? result.totalCount ?? list.length);
  const page = Number(result.page ?? result.current ?? 1);
  const pageSize = Number(result.pageSize ?? result.size ?? (list.length || 20));

  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Number(result.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize)))),
    success: (result.success as boolean | undefined) ?? true,
  };
}

const mockLogs: OperationLogItem[] = [
  normalizeOperationLogItem({ id: 'log-1', entity_type: 'work_order', entity_id: '1', user_name: '业务员A', action_type: 'create', before_data: null, after_data: { employee_name: '张三', order_type: 'onboarding' }, ip_address: '192.168.1.100', created_at: '2026-05-08T09:30:00Z', diffs: [{ field: 'employee_name', fieldLabel: '员工姓名', before: null, after: '张三' }, { field: 'order_type', fieldLabel: '工单类型', before: null, after: 'onboarding' }] }),
  normalizeOperationLogItem({ id: 'log-2', entity_type: 'work_order', entity_id: '1', user_name: '业务员A', action_type: 'submit', before_data: { status: 'draft' }, after_data: { status: 'pending' }, ip_address: '192.168.1.100', created_at: '2026-05-08T10:00:00Z', diffs: [{ field: 'status', fieldLabel: '状态', before: 'draft', after: 'pending' }] }),
  normalizeOperationLogItem({ id: 'log-3', entity_type: 'dispatched_order', entity_id: 'd3', user_name: 'DispatchEngine', action_type: 'dispatch', before_data: null, after_data: { module_code: 'contract', handler_id: null }, ip_address: '127.0.0.1', created_at: '2026-05-08T10:00:01Z' }),
  normalizeOperationLogItem({ id: 'log-4', entity_type: 'dispatched_order', entity_id: 'd3', user_name: '合同专员A', action_type: 'accept', before_data: { status: 'pending', handler_id: null }, after_data: { status: 'processing', handler_id: 'user-contract' }, ip_address: '192.168.1.200', created_at: '2026-05-08T11:00:00Z', diffs: [{ field: 'status', fieldLabel: '状态', before: 'pending', after: 'processing' }, { field: 'handler_id', fieldLabel: '处理人', before: null, after: 'user-contract' }] }),
  normalizeOperationLogItem({ id: 'log-5', entity_type: 'dispatched_order', entity_id: 'd8', user_name: '社保专员B', action_type: 'return', before_data: { status: 'processing' }, after_data: { status: 'returned', return_reason: '社保基数与工资不符' }, ip_address: '192.168.1.201', created_at: '2026-05-08T09:00:00Z', diffs: [{ field: 'status', fieldLabel: '状态', before: 'processing', after: 'returned' }, { field: 'return_reason', fieldLabel: '退回原因', before: null, after: '社保基数与工资不符' }] }),
  normalizeOperationLogItem({ id: 'log-6', entity_type: 'dispatched_order', entity_id: 'd1', user_name: '录入员A', action_type: 'supplement', before_data: { bank_name: '' }, after_data: { bank_name: '中国工商银行' }, ip_address: '192.168.1.202', created_at: '2026-05-08T14:00:00Z', diffs: [{ field: 'bank_name', fieldLabel: '开户行', before: '', after: '中国工商银行' }] }),
  normalizeOperationLogItem({ id: 'log-7', entity_type: 'work_order', entity_id: '1', user_name: '业务员A', action_type: 'withdraw', before_data: { status: 'processing' }, after_data: { status: 'withdraw_pending' }, ip_address: '192.168.1.100', created_at: '2026-05-09T08:00:00Z', diffs: [{ field: 'status', fieldLabel: '状态', before: 'processing', after: 'withdraw_pending' }] }),
];

function includesAny(value: string | undefined, selected?: string[]) {
  if (!selected || selected.length === 0) return true;
  return Boolean(value && selected.includes(value));
}

export async function getOperationLogs(params: OperationLogQuery): Promise<PageResult<OperationLogItem>> {
  const page = Number((params as PageParams & { current?: number }).page ?? (params as PageParams & { current?: number }).current ?? 1);
  const pageSize = clampPageSize(params.pageSize);

  if (isMockMode) {
    let list = [...mockLogs];
    if (params.actionCodes?.length) list = list.filter((l) => includesAny(l.actionCode, params.actionCodes));
    if (params.operatorIds?.length) list = list.filter((l) => includesAny(l.operatorId || l.user_name, params.operatorIds));
    if (params.action_type) list = list.filter((l) => l.actionCode === params.action_type);
    if (params.user_name) list = list.filter((l) => (l.operatorName || '').includes(params.user_name as string));
    if (params.entityType || params.entity_type) list = list.filter((l) => l.entityType === (params.entityType || params.entity_type));
    if (params.startTime) list = list.filter((l) => new Date(l.createdAt).getTime() >= new Date(params.startTime as string).getTime());
    if (params.endTime) list = list.filter((l) => new Date(l.createdAt).getTime() <= new Date(params.endTime as string).getTime());
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);
    return mockDelay({ list: paged, page, pageSize, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / pageSize)), success: true });
  }

  const enableNewFilterParams = import.meta.env.VITE_OPERATION_LOG_FILTER_PARAMS === 'true';
  const query: Record<string, unknown> = { page, pageSize };
  if (params.entityType) query.entityType = params.entityType;
  if (params.entityId) query.entityId = params.entityId;

  if (enableNewFilterParams) {
    if (params.actionCodes?.length) query.actionCodes = params.actionCodes;
    if (params.operatorIds?.length) query.operatorIds = params.operatorIds;
    if (params.startTime) query.startTime = params.startTime;
    if (params.endTime) query.endTime = params.endTime;
  } else {
    // Current backend DTO only accepts userId/startAt/endAt. Keep the new UI safe
    // until backend finishes accepting actionCodes/operatorIds/startTime/endTime.
    if (params.operatorIds?.length === 1) query.userId = params.operatorIds[0];
    if (params.startTime) query.startAt = params.startTime;
    if (params.endTime) query.endAt = params.endTime;
  }

  const raw = await request.get('/admin/logs', { params: query });
  return normalizePageResult(raw);
}
