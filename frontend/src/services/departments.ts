import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface DepartmentItem {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  children?: DepartmentItem[];
}

const KEY = 'mock_admin_departments_v1';
const SEED: DepartmentItem[] = [
  { id: '1', parent_id: null, code: 'sys_admin', name: '系统管理', sort_order: 1, is_active: true },
  { id: '2', parent_id: null, code: 'business', name: '业务团队', sort_order: 2, is_active: true },
  { id: '3', parent_id: null, code: 'shared', name: '共享团队', sort_order: 3, is_active: true },
  { id: '4', parent_id: '2', code: 'biz_group1', name: '业务1组', sort_order: 1, is_active: true },
  { id: '5', parent_id: '2', code: 'biz_group2', name: '业务2组', sort_order: 2, is_active: true },
  { id: '6', parent_id: '2', code: 'biz_group3', name: '业务3组', sort_order: 3, is_active: true },
  { id: '7', parent_id: '2', code: 'biz_group4', name: '业务4组', sort_order: 4, is_active: true },
  { id: '8', parent_id: '2', code: 'biz_group5', name: '业务5组', sort_order: 5, is_active: true },
];

const store = () => loadList<DepartmentItem>(KEY, SEED);
const commit = (list: DepartmentItem[]) => saveList(KEY, list);

export async function getDepartments(): Promise<DepartmentItem[]> {
  if (isMockMode) return mockDelay(store());
  try {
    const result = await request.get('/admin/departments') as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  } catch {
    return [];
  }
}

export async function getDepartmentTree(): Promise<DepartmentItem[]> {
  if (isMockMode) return mockDelay(store());
  return request.get('/admin/departments/tree') as Promise<DepartmentItem[]>;
}

export async function createDepartment(data: Partial<DepartmentItem>): Promise<DepartmentItem> {
  if (isMockMode) {
    const list = store();
    const item: DepartmentItem = {
      id: nextId(list),
      parent_id: (data.parent_id as string | null) ?? null,
      code: data.code || '',
      name: data.name || '',
      sort_order: data.sort_order ?? 1,
      is_active: data.is_active ?? true,
    };
    list.push(item);
    commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/departments', packDepartment(data)) as Promise<DepartmentItem>;
}

function packDepartment(data: Partial<DepartmentItem>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.code !== undefined) body.code = data.code;
  if (data.name !== undefined) body.name = data.name;
  if (data.parent_id !== undefined) body.parentId = data.parent_id;
  if (data.sort_order !== undefined) body.sortOrder = data.sort_order;
  if (data.is_active !== undefined) body.isActive = data.is_active;
  return body;
}

export async function updateDepartment(id: string, data: Partial<DepartmentItem>): Promise<DepartmentItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((d) => d.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('部门不存在')));
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/departments/${id}`, packDepartment(data)) as Promise<DepartmentItem>;
}

export async function deleteDepartment(id: string): Promise<void> {
  if (isMockMode) {
    const list = store().filter((d) => d.id !== id && d.parent_id !== id);
    commit(list);
    return mockDelay(undefined);
  }
  return request.delete(`/admin/departments/${id}`) as Promise<void>;
}
