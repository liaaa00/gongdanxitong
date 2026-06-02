import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';

export interface NotificationItem {
  id: string;
  type: string;
  biz_type: string;
  priority: 'urgent' | 'normal' | 'low' | 'high';
  title: string;
  content: string;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  diff_summary?: string;
  diffSummary?: string;
  diff_fields?: Array<{ field_code?: string; fieldCode?: string; field_name?: string; fieldName?: string; old_value?: unknown; new_value?: unknown }>;
  diffFields?: Array<Record<string, unknown>>;
  diff?: Record<string, unknown> | Array<Record<string, unknown>>;
  field?: string;
  field_code?: string;
  fieldCode?: string;
  fieldName?: string;
  field_name?: string;
  entity?: string;
  entityName?: string;
  entity_name?: string;
  action?: string;
  oldValue?: unknown;
  old_value?: unknown;
  newValue?: unknown;
  new_value?: unknown;
  changes?: Array<Record<string, unknown>>;
  payload?: Record<string, unknown>;
  ref_order_id?: string;
  ref_order_no?: string;
  order_no?: string;
  actorName?: string;
  actor_name?: string;
  operatorName?: string;
  operator_name?: string;
  userName?: string;
  user_name?: string;
  realName?: string;
  real_name?: string;
  handlerName?: string;
  handler_name?: string;
  creatorName?: string;
  creator_name?: string;
  actor?: { realName?: string; real_name?: string; name?: string; userName?: string; user_name?: string } | string | null;
  operator?: { realName?: string; real_name?: string; name?: string; userName?: string; user_name?: string } | string | null;
  user?: { realName?: string; real_name?: string; name?: string; userName?: string; user_name?: string } | string | null;
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  context?: Record<string, unknown>;
  context_fields?: Record<string, unknown>;
  contextFields?: Record<string, unknown>;
}

export type SalespersonNotificationBucket = 'field_changed' | 'returned' | 'withdraw_void_result' | 'system';
export type BackendNotificationBucket = 'todo' | 'creator_modified' | 'withdraw_void_request' | 'system';
export type NotificationBucketKey = SalespersonNotificationBucket | BackendNotificationBucket | 'system';

export interface UnreadCountByBucket {
  total: number;
  salesperson: Record<SalespersonNotificationBucket, number>;
  backend: Record<BackendNotificationBucket, number>;
  system: number;
}

const EMPTY_BUCKET_COUNTS: UnreadCountByBucket = {
  total: 0,
  salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
  backend: { todo: 0, creator_modified: 0, withdraw_void_request: 0, system: 0 },
  system: 0,
};

function createEmptyBucketCounts(): UnreadCountByBucket {
  return {
    total: 0,
    salesperson: { ...EMPTY_BUCKET_COUNTS.salesperson },
    backend: { ...EMPTY_BUCKET_COUNTS.backend },
    system: 0,
  };
}

function normalizeBizType(value: string | undefined | null): string {
  return String(value || '').toLowerCase().replace(/[.:]/g, '_');
}

export function getNotificationBucket(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): NotificationBucketKey {
  const raw = `${normalizeBizType(item.biz_type)} ${normalizeBizType(item.type)} ${item.title || ''} ${item.content || ''}`.toLowerCase();
  if (raw.includes('system')) return 'system';
  if (raw.includes('sla_breached') || raw.includes('sla_breach') || raw.includes('breached') || raw.includes('breach') || raw.includes('已超时') || raw.includes('超期')) return 'todo';
  if (raw.includes('sla_warning') || raw.includes('sla_warn') || raw.includes('warning') || raw.includes('timeout') || raw.includes('即将超时') || raw.includes('预警')) return 'todo';
  if (raw.includes('urge_replied') || raw.includes('urge_result')) return 'todo';
  if (raw.includes('urge_received') || raw.includes('urge') || raw.includes('催办')) return 'todo';
  if (raw.includes('withdraw_request') || raw.includes('void_request') || raw.includes('creator_withdraw') || raw.includes('creator_void') || raw.includes('撤回申请') || raw.includes('作废申请')) return 'withdraw_void_request';
  if (raw.includes('withdraw_approved') || raw.includes('withdraw_rejected') || raw.includes('void_approved') || raw.includes('void_rejected') || raw.includes('withdraw_void_result')) return 'withdraw_void_result';
  if (raw.includes('dispatched_returned') || raw.includes('returned') || raw.includes('return') || raw.includes('退回')) return 'returned';
  if (raw.includes('dispatched_accepted') || raw.includes('dispatched_completed') || raw.includes('order_supplement_filled') || raw.includes('field_supplement') || raw.includes('field_supplemented') || raw.includes('backend_supplemented') || raw.includes('补充')) return 'field_changed';
  if (raw.includes('order_field_changed') || raw.includes('creator_modified') || raw.includes('completed_modified') || raw.includes('modified_by_creator') || raw.includes('field_changed_by_creator') || raw.includes('initiator_modified') || raw.includes('业务员') && raw.includes('修改')) return 'creator_modified';
  if (raw.includes('dispatch') || raw.includes('dispatched') || raw.includes('claim') || raw.includes('todo') || raw.includes('task')) return 'todo';
  if (raw.includes('field_changed') || raw.includes('field_change')) return 'field_changed';
  return 'system';
}

function buildUnreadCountByBucket(list: NotificationItem[]): UnreadCountByBucket {
  const counts = createEmptyBucketCounts();
  const unread = list.filter((n) => !n.is_read);
  counts.total = unread.length;
  for (const item of unread) {
    const bucket = getNotificationBucket(item);
    if (bucket === 'system') counts.system += 1;
    else if (bucket in counts.salesperson) counts.salesperson[bucket as SalespersonNotificationBucket] += 1;
    else if (bucket in counts.backend) counts.backend[bucket as BackendNotificationBucket] += 1;
    else counts.system += 1;
  }
  return counts;
}

function normalizeUnreadCountByBucket(raw: unknown): UnreadCountByBucket {
  const source = (raw || {}) as Partial<UnreadCountByBucket> & Record<string, unknown>;
  const salesperson = (source.salesperson || {}) as Record<string, unknown>;
  const backend = (source.backend || {}) as Record<string, unknown>;
  const counts: UnreadCountByBucket = {
    total: Number(source.total ?? 0),
    salesperson: {
      field_changed: Number(salesperson.field_changed ?? 0),
      returned: Number(salesperson.returned ?? 0),
      withdraw_void_result: Number(salesperson.withdraw_void_result ?? 0),
      system: Number(salesperson.system ?? 0),
    },
    backend: {
      todo: Number(backend.todo ?? 0)
        + Number(backend.urge ?? 0)
        + Number(backend.sla_warning ?? backend.slaWarning ?? 0)
        + Number(backend.sla_breached ?? backend.sla_breach ?? backend.slaBreached ?? backend.sla ?? 0),
      creator_modified: Number(backend.creator_modified ?? 0),
      withdraw_void_request: Number(backend.withdraw_void_request ?? 0),
      system: Number(backend.system ?? 0),
    },
    system: Number(source.system ?? 0),
  };
  const bucketSum = Object.values(counts.salesperson).reduce((sum, value) => sum + value, 0)
    + Object.values(counts.backend).reduce((sum, value) => sum + value, 0)
    + counts.system;
  counts.total = Number(source.total ?? bucketSum) || bucketSum;
  return counts;
}

const mockNotifications: NotificationItem[] = [
  {
    id: 'n1', type: 'info', biz_type: 'order.field_changed', priority: 'normal',
    title: '业务员修改了工单数据', content: '业务员修改了客户名称，请后道人员查看确认。',
    entity_type: 'dispatched_order', entity_id: '1', link: '/my-dispatched/1',
    is_read: false, created_at: new Date(Date.now() - 3600000).toISOString(),
    ref_order_id: '1', ref_order_no: 'WO-2026-0001',
  },
  {
    id: 'n2', type: 'warning', biz_type: 'sla_warning', priority: 'urgent',
    title: 'SLA 即将超时', content: '数据录入子工单即将超时，请尽快处理。',
    entity_type: 'dispatched_order', entity_id: '2', link: '/my-dispatched/2',
    is_read: false, created_at: new Date(Date.now() - 7200000).toISOString(),
    ref_order_id: '2', ref_order_no: 'WO-2026-0002',
  },
  {
    id: 'n3', type: 'info', biz_type: 'field_supplemented', priority: 'normal',
    title: '后道补充了字段', content: '后道补充了银行卡信息，请业务员查看。',
    entity_type: 'work_order', entity_id: '3', link: '/work-orders/3',
    is_read: false, created_at: new Date(Date.now() - 86400000).toISOString(),
    diff_summary: '银行卡号：空 → 6222000000000000000',
    diff_fields: [{ field_code: 'bank_account', field_name: '银行卡号', old_value: '', new_value: '6222000000000000000' }],
    ref_order_id: '3', ref_order_no: 'WO-2026-0003',
  },
  {
    id: 'n4', type: 'info', biz_type: 'dispatched_returned_to_salesperson', priority: 'normal',
    title: '子工单已退回', content: '入职联系子工单已退回，请修改后重新提交。',
    entity_type: 'dispatched_order', entity_id: '4', link: '/my-dispatched/4?action=edit',
    is_read: true, created_at: new Date(Date.now() - 172800000).toISOString(),
    ref_order_id: '4', ref_order_no: 'WO-2026-0004',
  },
  {
    id: 'n5', type: 'info', biz_type: 'system_announcement', priority: 'low',
    title: '系统维护通知', content: '系统计划于 5 月 20 日凌晨 2:00-4:00 进行例行维护',
    entity_type: null, entity_id: null, link: null,
    is_read: true, created_at: new Date(Date.now() - 259200000).toISOString(),
  },
];

export function addMockNotification(item: NotificationItem): void {
  mockNotifications.push(item);
}

export async function getNotifications(params: { unread?: boolean; isRead?: boolean; biz_type?: string; priority?: string; includeDispatch?: boolean; bucket?: string; current?: number } & PageParams): Promise<PageResult<NotificationItem>> {
  const safeParams = {
    ...params,
    pageSize: Math.min(Number(params.pageSize ?? 20) || 20, 100),
  };
  if (isMockMode) {
    let list = mockNotifications;
    if (safeParams.unread) list = list.filter((n) => !n.is_read);
    if (typeof safeParams.isRead === 'boolean') list = list.filter((n) => n.is_read === safeParams.isRead);
    if (safeParams.bucket) list = list.filter((n) => getNotificationBucket(n) === safeParams.bucket);
    if (safeParams.biz_type) {
      const bizTypes = safeParams.biz_type.split(',').map((item) => item.trim()).filter(Boolean);
      list = list.filter((n) => bizTypes.includes(n.biz_type) || bizTypes.includes(n.type));
    }
    if (safeParams.priority) list = list.filter((n) => n.priority === safeParams.priority);
    const currentPage = Math.max(1, Number(safeParams.current ?? safeParams.page ?? 1) || 1);
    const pageSize = safeParams.pageSize;
    const total = list.length;
    const pageList = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return mockDelay({ list: pageList, page: currentPage, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), success: true });
  }
  return request.get('/notifications', { params: safeParams }) as Promise<PageResult<NotificationItem>>;
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isMockMode) {
    const item = mockNotifications.find((n) => n.id === id);
    if (!item) return mockDelay(Promise.reject(new Error('通知不存在')));
    item.is_read = true;
    return mockDelay(undefined);
  }
  return request.post('/notifications/' + id + '/read') as Promise<void>;
}

export async function markAllRead(): Promise<void> {
  if (isMockMode) {
    mockNotifications.forEach((n) => { n.is_read = true; });
    return mockDelay(undefined);
  }
  return request.post('/notifications/read-all') as Promise<void>;
}

export async function markNotificationsReadByQuery(params: { biz_type?: string; bucket?: string; includeDispatch?: boolean }): Promise<{ success: boolean; affected: number; unread_count: number } | void> {
  if (isMockMode) {
    let list = mockNotifications.filter((n) => !n.is_read);
    if (params.bucket) list = list.filter((n) => getNotificationBucket(n) === params.bucket);
    if (params.biz_type) {
      const bizTypes = params.biz_type.split(',').map((item) => item.trim()).filter(Boolean);
      list = list.filter((n) => bizTypes.includes(n.biz_type) || bizTypes.includes(n.type));
    }
    list.forEach((n) => { n.is_read = true; });
    return mockDelay({ success: true, affected: list.length, unread_count: mockNotifications.filter((n) => !n.is_read).length });
  }
  return request.post('/notifications/read-by-query', null, { params }) as Promise<{ success: boolean; affected: number; unread_count: number }>;
}

export async function deleteNotification(id: string): Promise<void> {
  if (isMockMode) return mockDelay(undefined);
  return request.delete('/notifications/' + id) as Promise<void>;
}

export async function getUnreadCount(): Promise<number> {
  if (isMockMode) return mockDelay(mockNotifications.filter((n) => !n.is_read).length);
  const result = await (request.get('/notifications/unread-count') as Promise<{ count: number }>);
  return result.count;
}

export async function getUnreadCountByBucket(): Promise<UnreadCountByBucket> {
  if (isMockMode) return mockDelay(buildUnreadCountByBucket(mockNotifications));
  try {
    const result = await request.get('/notifications/unread-count-by-bucket');
    return normalizeUnreadCountByBucket(result);
  } catch {
    const unread = await getNotifications({ unread: true, page: 1, pageSize: 100 });
    return buildUnreadCountByBucket(Array.isArray(unread?.list) ? unread.list : []);
  }
}

export async function getUnreadCountByType(): Promise<{ sla: number; task: number; system: number }> {
  if (isMockMode) {
    const unread = mockNotifications.filter((n) => !n.is_read);
    return mockDelay({
      sla: unread.filter((n) => n.biz_type === 'sla' || n.biz_type === 'sla_warning' || n.biz_type === 'sla_breach' || n.biz_type === 'sla_breached').length,
      task: unread.filter((n) => n.biz_type === 'task').length,
      system: unread.filter((n) => n.biz_type === 'system' || n.biz_type === 'system_announcement').length,
    });
  }
  return request.get('/notifications/unread-by-type') as Promise<{ sla: number; task: number; system: number }>;
}
