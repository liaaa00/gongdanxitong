import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface CustomerItem {
  id: string;
  customer_code: string;
  customer_name: string;
  is_active: boolean;
  created_at: string;
  // aliases for camelCase backend compatibility
  customerCode?: string;
  customerName?: string;
  isActive?: boolean;
  createdAt?: string;
}

const KEY = 'mock_admin_customers_v2'; // ★ v2: try-catch + camelCase/snake_case 防御
const SEED: CustomerItem[] = [
  { id: 'CUST_NB001', customer_code: 'CUST_NB001', customer_name: '宁波某制造集团', is_active: true, created_at: new Date().toISOString() },
  { id: 'CUST_HZ002', customer_code: 'CUST_HZ002', customer_name: '杭州某科技公司', is_active: true, created_at: new Date().toISOString() },
  { id: 'CUST_WZ003', customer_code: 'CUST_WZ003', customer_name: '温州某服务外包企业', is_active: true, created_at: new Date().toISOString() },
];

const store = () => loadList<CustomerItem>(KEY, SEED);
const commit = (l: CustomerItem[]) => saveList(KEY, l);

export function getFallbackCustomers(params: PageParams = { page: 1, pageSize: 20 }): PageResult<CustomerItem> {
  const list = SEED.filter((item) => item.is_active);
  return { list, page: params.page ?? 1, pageSize: params.pageSize ?? list.length, total: list.length, totalPages: 1, success: true };
}

export async function getCustomers(params: PageParams): Promise<PageResult<CustomerItem>> {
  if (isMockMode) {
    const list = store();
    return mockDelay({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }
  try {
    const result = await request.get('/admin/customers', { params, silentError: true } as any) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    // Normalize: map camelCase backend fields to snake_case for frontend compatibility
    const list = (Array.isArray(rawList) ? rawList : []).map((item: any) => ({
      id: item.id ?? item.ID ?? '',
      customer_code: item.customer_code ?? item.customerCode ?? '',
      customer_name: item.customer_name ?? item.customerName ?? '',
      is_active: item.is_active ?? item.isActive ?? true,
      created_at: item.created_at ?? item.createdAt ?? '',
    } as CustomerItem));
    return {
      list,
      page: result?.page ?? params.page ?? 1,
      pageSize: result?.pageSize ?? params.pageSize ?? list.length,
      total: result?.total ?? list.length,
      totalPages: result?.totalPages ?? 1,
      success: result?.success ?? true,
    } as PageResult<CustomerItem>;
  } catch (e: any) {
    const errMsg = e?.response?.data?.message || e?.message || '获取客户列表失败';
    const list = SEED.filter((item) => item.is_active);
    return { list, page: 1, pageSize: params.pageSize || 20, total: list.length, totalPages: 1, success: true, error: errMsg };
  }
}

export async function createCustomer(data: Partial<CustomerItem>): Promise<CustomerItem> {
  if (isMockMode) {
    const list = store();
    const item: CustomerItem = {
      id: nextId(list),
      customer_code: data.customer_code || '',
      customer_name: data.customer_name || '',
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/customers', data) as Promise<CustomerItem>;
}

export async function updateCustomer(id: string, data: Partial<CustomerItem>): Promise<CustomerItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('客户不存在')));
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/customers/${id}`, data) as Promise<CustomerItem>;
}

export async function deleteCustomer(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((c) => c.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/customers/${id}`) as Promise<void>;
}
