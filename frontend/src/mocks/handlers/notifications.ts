import { http } from 'msw';
import { ok } from '../utils';

const now = new Date().toISOString();

function normalizeBizType(value: string | undefined | null): string {
  return String(value || '').toLowerCase().replace(/[.:]/g, '_');
}

function getNotificationBucket(item: { biz_type?: string; type?: string; title?: string; content?: string }): string {
  const raw = `${normalizeBizType(item.biz_type)} ${normalizeBizType(item.type)} ${item.title || ''} ${item.content || ''}`.toLowerCase();
  if (raw.includes('system')) return 'system';
  if (raw.includes('withdraw_request') || raw.includes('void_request')) return 'withdraw_void_request';
  if (raw.includes('modify_request')) return 'creator_modified';
  if (raw.includes('withdraw_approved') || raw.includes('withdraw_rejected') || raw.includes('void_approved') || raw.includes('void_rejected') || raw.includes('withdraw_void_result')) return 'withdraw_void_result';
  if (raw.includes('dispatched_returned') || raw.includes('returned') || raw.includes('return') || raw.includes('退回')) return 'returned';
  if (raw.includes('order_field_changed') || raw.includes('creator_modified') || raw.includes('completed_modified') || raw.includes('modified_by_creator') || raw.includes('modify_approved') || raw.includes('modify_rejected')) return 'creator_modified';
  if (raw.includes('field_changed') || raw.includes('field_change') || raw.includes('field_supplement') || raw.includes('supplement') || raw.includes('补充')) return 'field_changed';
  if (raw.includes('sla') || raw.includes('dispatch') || raw.includes('dispatched') || raw.includes('task') || raw.includes('todo') || raw.includes('claim')) return 'todo';
  return 'system';
}

function matchesBucketFilter(item: { biz_type?: string; type?: string; title?: string; content?: string }, bucket: string | null): boolean {
  const buckets = new Set(String(bucket || '').split(',').map((value) => value.trim()).filter(Boolean));
  if (!buckets.size) return true;
  return buckets.has(getNotificationBucket(item));
}

const NOTIFICATIONS = [
  { id: 'n-1', type: 'dispatched', biz_type: 'task', priority: 'normal', title: '新子工单', content: '您有一个新的增员报岗录入子工单待处理', entity_type: 'dispatched_order', entity_id: 'd1', link: '/my-dispatched/d1', is_read: false, created_at: now },
  { id: 'n-2', type: 'returned', biz_type: 'task', priority: 'urgent', title: '工单退回', content: '工单 ON20260507005 已被退回', entity_type: 'work_order', entity_id: '4', link: '/work-orders/4', is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'n-3', type: 'completed', biz_type: 'task', priority: 'normal', title: '工单完成', content: '工单 ON20260506003 已完成', entity_type: 'work_order', entity_id: '3', link: '/work-orders/3', is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'n-4', type: 'sla_warning', biz_type: 'sla_warning', priority: 'urgent', title: 'SLA预警', content: '子工单 d1 增员报岗录入即将超期', entity_type: 'dispatched_order', entity_id: 'd1', link: '/my-dispatched/d1', is_read: false, created_at: new Date(Date.now() - 1800000).toISOString() },
  { id: 'n-5', type: 'sla_breach', biz_type: 'sla_breach', priority: 'urgent', title: 'SLA超期', content: '子工单 d8 社保公积金减员已超期', entity_type: 'dispatched_order', entity_id: 'd8', link: '/my-dispatched/d8', is_read: false, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'n-6', type: 'system', biz_type: 'system', priority: 'low', title: '系统通知', content: '系统将于本周六维护', entity_type: null, entity_id: null, link: null, is_read: false, created_at: new Date(Date.now() - 43200000).toISOString() },
];

export const notificationHandlers = [
  http.get('/api/notifications', async ({ request }) => {
    const url = new URL(request.url);
    let list = [...NOTIFICATIONS];
    if (url.searchParams.get('unread')) list = list.filter((n) => !n.is_read);
    const bizType = url.searchParams.get('biz_type') || url.searchParams.get('bizType');
    if (bizType) {
      const bizTypes = bizType.split(',').map((item) => item.trim()).filter(Boolean);
      list = list.filter((n) => bizTypes.includes(n.biz_type) || bizTypes.includes(n.type));
    }
    const priority = url.searchParams.get('priority');
    if (priority) list = list.filter((n) => n.priority === priority);
    const bucket = url.searchParams.get('bucket');
    if (bucket) list = list.filter((n) => matchesBucketFilter(n, bucket));
    return ok({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }),

  http.get('/api/notifications/unread-count', async () => {
    return ok({ count: NOTIFICATIONS.filter((n) => !n.is_read).length });
  }),

  http.get('/api/notifications/unread-count-by-bucket', async () => {
    const unread = NOTIFICATIONS.filter((n) => !n.is_read);
    return ok({
      total: unread.length,
      salesperson: {
        field_changed: unread.filter((n) => n.biz_type === 'field_change' || n.type === 'field_changed').length,
        returned: unread.filter((n) => n.type === 'returned').length,
        withdraw_void_result: unread.filter((n) => ['withdraw_approved', 'withdraw_rejected', 'void_approved', 'void_rejected'].includes(n.type)).length,
        system: unread.filter((n) => n.biz_type === 'system').length,
      },
      backend: {
        todo: unread.filter((n) => (n.biz_type === 'task' && n.type !== 'returned') || n.type === 'urge_received' || n.type === 'sla_warning' || n.type === 'sla_breach' || n.type === 'sla_breached').length,
        creator_modified: unread.filter((n) => n.type === 'creator_modified').length,
        withdraw_void_request: unread.filter((n) => ['withdraw_request', 'void_request'].includes(n.type)).length,
        system: unread.filter((n) => n.biz_type === 'system').length,
      },
      system: unread.filter((n) => n.biz_type === 'system').length,
    });
  }),

  http.get('/api/notifications/unread-by-type', async () => {
    const unread = NOTIFICATIONS.filter((n) => !n.is_read);
    return ok({
      sla: unread.filter((n) => n.biz_type === 'sla' || n.biz_type === 'sla_warning' || n.biz_type === 'sla_breach' || n.biz_type === 'sla_breached').length,
      task: unread.filter((n) => n.biz_type === 'task').length,
      system: unread.filter((n) => n.biz_type === 'system').length,
    });
  }),

  http.post('/api/notifications/:id/read', async () => ok(null)),
  http.post('/api/notifications/read-all', async () => ok(null)),
];
