import request from './request';
import { isMockMode, mockDelay, type PageResult } from './mock';
import { loadList, saveList } from './_mockStore';

export interface PoolItem {
  id: string;
  order_no: string;
  employee_name: string;
  customer_name: string;
  module_code: string; // contract | onboarding_contact | data_entry | social_insurance
  status: string; // pending | processing
  handler_name?: string;
  dispatched_at: string;
  work_order_id: string;
}

const KEY = 'mock_work_order_pool_v1';
const SEED: PoolItem[] = [
  { id: 'p1', order_no: 'WO-2025-0001', employee_name: '张三', customer_name: '浙江企服', module_code: 'contract', status: 'pending', dispatched_at: new Date().toISOString(), work_order_id: '1' },
  { id: 'p2', order_no: 'WO-2025-0002', employee_name: '李四', customer_name: '杭州科技', module_code: 'onboarding_contact', status: 'pending', dispatched_at: new Date().toISOString(), work_order_id: '2' },
  { id: 'p3', order_no: 'WO-2025-0003', employee_name: '王五', customer_name: '宁波商贸', module_code: 'data_entry', status: 'pending', dispatched_at: new Date().toISOString(), work_order_id: '3' },
  { id: 'p4', order_no: 'WO-2025-0004', employee_name: '赵六', customer_name: '温州制造', module_code: 'contract', status: 'processing', handler_name: '江璐', dispatched_at: new Date().toISOString(), work_order_id: '4' },
  { id: 'p5', order_no: 'WO-2025-0005', employee_name: '周七', customer_name: '绍兴服务', module_code: 'social_insurance', status: 'pending', dispatched_at: new Date().toISOString(), work_order_id: '5' },
];

const store = () => loadList<PoolItem>(KEY, SEED);
const commit = (l: PoolItem[]) => saveList(KEY, l);

export async function getPoolItems(params: { module_code: string; page?: number; pageSize?: number }): Promise<PageResult<PoolItem>> {
  if (isMockMode) {
    let list = store().filter((p) => p.module_code === params.module_code);
    return mockDelay({ list, page: params.page || 1, pageSize: params.pageSize || 20, total: list.length, totalPages: 1, success: true });
  }
  return request.get('/work-order-pool', { params }) as Promise<PageResult<PoolItem>>;
}

/** 认领工单（原子操作） */
export async function claimPoolItem(poolItemId: string): Promise<{ success: boolean; message?: string }> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((p) => p.id === poolItemId);
    if (idx === -1) return mockDelay({ success: false, message: '工单不存在' });
    if (list[idx].status !== 'pending') return mockDelay({ success: false, message: '工单已被认领' });
    list[idx] = { ...list[idx], status: 'processing', handler_name: '当前用户' };
    commit(list);
    return mockDelay({ success: true });
  }
  return request.post(`/work-order-pool/${poolItemId}/claim`) as Promise<{ success: boolean; message?: string }>;
}
