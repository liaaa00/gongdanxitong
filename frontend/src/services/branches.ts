import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface BranchItem {
  id: string;
  customer_id: string;
  branch_code: string;
  branch_name: string;
  city?: string;
  is_active: boolean;
  created_at: string;
}

const KEY = 'mock_branches_v1';
const SEED: BranchItem[] = [
  { id: 'b1', customer_id: '1', branch_code: 'ZJQF-HZ', branch_name: '浙江企服-杭州', city: '杭州', is_active: true, created_at: new Date().toISOString() },
  { id: 'b2', customer_id: '1', branch_code: 'ZJQF-NB', branch_name: '浙江企服-宁波', city: '宁波', is_active: true, created_at: new Date().toISOString() },
  { id: 'b3', customer_id: '2', branch_code: 'HZKJ-HZ', branch_name: '杭州科技-杭州', city: '杭州', is_active: true, created_at: new Date().toISOString() },
  { id: 'b4', customer_id: '3', branch_code: 'NBSM-NB', branch_name: '宁波商贸-宁波', city: '宁波', is_active: true, created_at: new Date().toISOString() },
  { id: 'b5', customer_id: '4', branch_code: 'WZZZ-WZ', branch_name: '温州制造-温州', city: '温州', is_active: true, created_at: new Date().toISOString() },
];

const store = () => loadList<BranchItem>(KEY, SEED);
const commit = (l: BranchItem[]) => saveList(KEY, l);

function getListFromResponse(result: any): any[] {
  if (Array.isArray(result)) return result;
  const rawList = result?.list ?? result?.items ?? result?.data ?? result?.records ?? [];
  return Array.isArray(rawList) ? rawList : [];
}

function normalizeBranch(item: any): BranchItem {
  return {
    id: item.id ?? item.ID ?? '',
    customer_id: item.customer_id ?? item.customerId ?? '',
    branch_code: item.branch_code ?? item.branchCode ?? '',
    branch_name: item.branch_name ?? item.branchName ?? '',
    city: item.city,
    is_active: item.is_active ?? item.isActive ?? true,
    created_at: item.created_at ?? item.createdAt ?? '',
  } as BranchItem;
}

export async function getBranches(customerId?: string): Promise<BranchItem[]> {
  if (isMockMode) {
    const list = store();
    const filtered = customerId ? list.filter((b) => b.customer_id === customerId) : list;
    return mockDelay(filtered);
  }
  const params = customerId ? { customer_id: customerId } : {};
  const result = await request.get('/admin/branches', { params }) as any;
  return getListFromResponse(result).map(normalizeBranch);
}

export async function createBranch(data: Partial<BranchItem>): Promise<BranchItem> {
  if (isMockMode) {
    const list = store();
    const item: BranchItem = {
      id: nextId(list),
      customer_id: data.customer_id || '',
      branch_code: data.branch_code || '',
      branch_name: data.branch_name || '',
      city: data.city,
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/branches', data) as Promise<BranchItem>;
}

export async function updateBranch(id: string, data: Partial<BranchItem>): Promise<BranchItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('商社不存在');
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/branches/${id}`, data) as Promise<BranchItem>;
}

export async function deleteBranch(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((b) => b.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/branches/${id}`) as Promise<void>;
}

export async function getBranchesByCustomer(customerId: string): Promise<BranchItem[]> {
  return getBranches(customerId);
}
