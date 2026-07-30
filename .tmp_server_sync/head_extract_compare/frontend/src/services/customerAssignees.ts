import request from './request';
import { isMockMode, mockDelay, type PageResult } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface CustomerAssigneeItem {
  id: string;
  customer_id: string;
  user_id: string;
  group_code?: string;
  is_active: boolean;
  assigned_at: string;
  // joined fields
  customer_name?: string;
  customer_code?: string;
  user_name?: string;
  user_real_name?: string;
}

const KEY = 'mock_customer_assignees_v1';
const SEED: CustomerAssigneeItem[] = [
  { id: 'a1', customer_id: '1', user_id: 'u1', group_code: '业务一组', is_active: true, assigned_at: new Date().toISOString(), customer_name: '浙江企服', customer_code: 'C001', user_real_name: '姚怡萍' },
  { id: 'a2', customer_id: '2', user_id: 'u2', group_code: '业务二组', is_active: true, assigned_at: new Date().toISOString(), customer_name: '杭州科技', customer_code: 'C002', user_real_name: '闫秋月' },
  { id: 'a3', customer_id: '3', user_id: 'u3', group_code: '业务一组', is_active: true, assigned_at: new Date().toISOString(), customer_name: '宁波商贸', customer_code: 'C003', user_real_name: '业务员3' },
];

const store = () => loadList<CustomerAssigneeItem>(KEY, SEED);
const commit = (l: CustomerAssigneeItem[]) => saveList(KEY, l);

export async function getCustomerAssignees(params?: { customer_id?: string; user_id?: string; group_code?: string }): Promise<PageResult<CustomerAssigneeItem>> {
  if (isMockMode) {
    let list = store();
    if (params?.customer_id) list = list.filter((a) => a.customer_id === params.customer_id);
    if (params?.user_id) list = list.filter((a) => a.user_id === params.user_id);
    if (params?.group_code) list = list.filter((a) => a.group_code === params.group_code);
    return mockDelay({ list, page: 1, pageSize: 100, total: list.length, totalPages: 1, success: true });
  }
  return request.get('/admin/customer-assignees', { params }) as Promise<PageResult<CustomerAssigneeItem>>;
}

export async function createCustomerAssignee(data: { customer_id: string; user_id: string; group_code?: string }): Promise<CustomerAssigneeItem> {
  if (isMockMode) {
    const list = store();
    const exists = list.find((a) => a.customer_id === data.customer_id && a.user_id === data.user_id && a.is_active);
    if (exists) throw new Error('该客户与业务员的绑定已存在');
    const item: CustomerAssigneeItem = {
      id: nextId(list),
      customer_id: data.customer_id,
      user_id: data.user_id,
      group_code: data.group_code,
      is_active: true,
      assigned_at: new Date().toISOString(),
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/customer-assignees', data) as Promise<CustomerAssigneeItem>;
}

export async function deleteCustomerAssignee(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((a) => a.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/customer-assignees/${id}`) as Promise<void>;
}

export async function updateCustomerAssignee(id: string, data: Partial<CustomerAssigneeItem>): Promise<CustomerAssigneeItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('绑定不存在');
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/customer-assignees/${id}`, data) as Promise<CustomerAssigneeItem>;
}
