import { http } from 'msw';
import { ok } from '../utils';

const now = new Date().toISOString();

const NOTIFICATIONS = [
  { id: 'n-1', type: 'dispatched', biz_type: 'task', priority: 'normal', title: '新子工单', content: '您有一个新的数据录入子工单待处理', entity_type: 'dispatched_order', entity_id: 'd1', link: '/my-dispatched/d1', is_read: false, created_at: now },
  { id: 'n-2', type: 'returned', biz_type: 'task', priority: 'urgent', title: '工单退回', content: '工单 ON20260507005 已被退回', entity_type: 'work_order', entity_id: '4', link: '/work-orders/4', is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'n-3', type: 'completed', biz_type: 'task', priority: 'normal', title: '工单完成', content: '工单 ON20260506003 已完成', entity_type: 'work_order', entity_id: '3', link: '/work-orders/3', is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'n-4', type: 'sla_warning', biz_type: 'sla', priority: 'urgent', title: 'SLA预警', content: '子工单 d1 数据录入即将超期', entity_type: 'dispatched_order', entity_id: 'd1', link: '/my-dispatched/d1', is_read: false, created_at: new Date(Date.now() - 1800000).toISOString() },
  { id: 'n-5', type: 'sla_breach', biz_type: 'sla', priority: 'urgent', title: 'SLA超期', content: '子工单 d8 社保公积金已超期', entity_type: 'dispatched_order', entity_id: 'd8', link: '/my-dispatched/d8', is_read: false, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'n-6', type: 'system', biz_type: 'system', priority: 'low', title: '系统通知', content: '系统将于本周六维护', entity_type: null, entity_id: null, link: null, is_read: false, created_at: new Date(Date.now() - 43200000).toISOString() },
];

export const notificationHandlers = [
  http.get('/api/notifications', async ({ request }) => {
    const url = new URL(request.url);
    let list = [...NOTIFICATIONS];
    if (url.searchParams.get('unread')) list = list.filter((n) => !n.is_read);
    return ok({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }),

  http.get('/api/notifications/unread-count', async () => {
    return ok({ count: NOTIFICATIONS.filter((n) => !n.is_read).length });
  }),

  http.get('/api/notifications/unread-by-type', async () => {
    const unread = NOTIFICATIONS.filter((n) => !n.is_read);
    return ok({
      sla: unread.filter((n) => n.biz_type === 'sla').length,
      task: unread.filter((n) => n.biz_type === 'task').length,
      system: unread.filter((n) => n.biz_type === 'system').length,
    });
  }),

  http.post('/api/notifications/:id/read', async () => ok(null)),
  http.post('/api/notifications/read-all', async () => ok(null)),
];
