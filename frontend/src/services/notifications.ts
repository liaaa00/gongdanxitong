import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';

export interface NotificationItem {
  id: string;
  type: string;
  biz_type: 'sla' | 'task' | 'system' | 'field_change' | 'claim';
  priority: 'urgent' | 'normal' | 'low';
  title: string;
  content: string;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  // ★ FE-A5: diff 摘要与关联跳转
  diff_summary?: string;
  diff_fields?: Array<{ field_code: string; field_name?: string; old_value?: unknown; new_value?: unknown }>;
  ref_order_id?: string;
  ref_order_no?: string;
  order_no?: string;
}

const mockNotifications: NotificationItem[] = [
  {
    id: 'n1', type: 'info', biz_type: 'task', priority: 'normal',
    title: '工单 WO-2025-0001 已派发', content: '浙江企服的入职工单已自动派发至数据录入模块',
    entity_type: 'work_order', entity_id: '1', link: '/work-orders/1',
    is_read: false, created_at: new Date(Date.now() - 3600000).toISOString(),
    ref_order_id: '1', ref_order_no: 'WO-2025-0001',
  },
  {
    id: 'n2', type: 'warning', biz_type: 'sla', priority: 'urgent',
    title: 'SLA 即将超时', content: '杭州科技入职工单数据录入环节已 18h 未处理，距 SLA 截止仅 6 小时',
    entity_type: 'work_order', entity_id: '2', link: '/work-orders/2',
    is_read: false, created_at: new Date(Date.now() - 7200000).toISOString(),
    ref_order_id: '2', ref_order_no: 'WO-2025-0002',
  },
  {
    id: 'n3', type: 'info', biz_type: 'field_change', priority: 'normal',
    title: '工单 WO-2025-0003 已办结后被修改', content: '发起人修改了业务员字段：手机 → 13900001111',
    entity_type: 'work_order', entity_id: '3', link: '/work-orders/3',
    is_read: false, created_at: new Date(Date.now() - 86400000).toISOString(),
    diff_summary: 'mobile: 13800000000 → 13900001111\ncustomer_name: 宁波商贸\n修改原因: 业务员更新联系方式',
    diff_fields: [
      { field_code: 'mobile', field_name: '手机', old_value: '13800000000', new_value: '13900001111' },
      { field_code: 'customer_name', field_name: '客户', old_value: '宁波商贸（旧）', new_value: '宁波商贸' },
    ],
    ref_order_id: '3', ref_order_no: 'WO-2025-0003',
  },
  {
    id: 'n4', type: 'info', biz_type: 'claim', priority: 'normal',
    title: '江璐认领了子工单', content: '数据录入子工单 WO-2025-0004-S1 已被江璐认领',
    entity_type: 'dispatched_order', entity_id: 'd1', link: '/dispatched/d1',
    is_read: true, created_at: new Date(Date.now() - 172800000).toISOString(),
    ref_order_id: '4', ref_order_no: 'WO-2025-0004',
  },
  {
    id: 'n5', type: 'info', biz_type: 'system', priority: 'low',
    title: '系统维护通知', content: '系统计划于 5 月 20 日凌晨 2:00-4:00 进行例行维护',
    entity_type: null, entity_id: null, link: null,
    is_read: true, created_at: new Date(Date.now() - 259200000).toISOString(),
  },
];

export function addMockNotification(item: NotificationItem): void {
  mockNotifications.push(item);
}

export async function getNotifications(params: { unread?: boolean; biz_type?: string; priority?: string } & PageParams): Promise<PageResult<NotificationItem>> {
  if (isMockMode) {
    let list = mockNotifications;
    if (params.unread) list = list.filter((n) => !n.is_read);
    if (params.biz_type) list = list.filter((n) => n.biz_type === params.biz_type);
    if (params.priority) list = list.filter((n) => n.priority === params.priority);
    return mockDelay({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }
  return request.get('/notifications', { params }) as Promise<PageResult<NotificationItem>>;
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

export async function deleteNotification(id: string): Promise<void> {
  if (isMockMode) return mockDelay(undefined);
  return request.delete('/notifications/' + id) as Promise<void>;
}

export async function getUnreadCount(): Promise<number> {
  if (isMockMode) return mockDelay(mockNotifications.filter((n) => !n.is_read).length);
  const result = await (request.get('/notifications/unread-count') as Promise<{ count: number }>);
  return result.count;
}

export async function getUnreadCountByType(): Promise<{ sla: number; task: number; system: number }> {
  if (isMockMode) {
    const unread = mockNotifications.filter((n) => !n.is_read);
    return mockDelay({
      sla: unread.filter((n) => n.biz_type === 'sla').length,
      task: unread.filter((n) => n.biz_type === 'task').length,
      system: unread.filter((n) => n.biz_type === 'system').length,
    });
  }
  return request.get('/notifications/unread-by-type') as Promise<{ sla: number; task: number; system: number }>;
}
