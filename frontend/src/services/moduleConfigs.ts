import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface ModuleConfigItem {
  id: string;
  module_code: string;
  module_name: string;
  parent_module_code?: string | null;
  module_type?: string;
  description?: string | null;
  display_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  moduleCode?: string;
  moduleName?: string;
  parentModuleCode?: string | null;
  moduleType?: string;
  displayOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const KEY = 'mock_admin_module_configs_v1';
const SEED: ModuleConfigItem[] = [
  { id: '1', module_code: 'onboarding', module_name: '入职管理', module_type: 'main', display_order: 10, is_active: true, created_at: new Date().toISOString() },
  { id: '2', module_code: 'data_entry', module_name: '数据录入', parent_module_code: 'onboarding', module_type: 'sub', display_order: 11, is_active: true, created_at: new Date().toISOString() },
  { id: '3', module_code: 'social_insurance', module_name: '社保公积金办理', parent_module_code: 'onboarding', module_type: 'sub', display_order: 12, is_active: true, created_at: new Date().toISOString() },
  { id: '4', module_code: 'onboarding_contact', module_name: '入职联系', parent_module_code: 'onboarding', module_type: 'sub', display_order: 13, is_active: true, created_at: new Date().toISOString() },
  { id: '5', module_code: 'contract', module_name: '劳动合同签订', parent_module_code: 'onboarding', module_type: 'sub', display_order: 14, is_active: true, created_at: new Date().toISOString() },
  { id: '6', module_code: 'renewal_contract', module_name: '续签合同', module_type: 'sub', display_order: 20, is_active: true, created_at: new Date().toISOString() },
  { id: '7', module_code: 'benefit', module_name: '待遇申报', module_type: 'sub', display_order: 30, is_active: true, created_at: new Date().toISOString() },
  { id: '8', module_code: 'resignation_contact', module_name: '离职联系', module_type: 'sub', display_order: 40, is_active: true, created_at: new Date().toISOString() },
  { id: '9', module_code: 'resignation_cert', module_name: '离职证明', module_type: 'sub', display_order: 41, is_active: true, created_at: new Date().toISOString() },
  { id: '10', module_code: 'data_entry_resign', module_name: '社保停保', module_type: 'sub', display_order: 42, is_active: true, created_at: new Date().toISOString() },
];

const store = () => loadList<ModuleConfigItem>(KEY, SEED);
const commit = (list: ModuleConfigItem[]) => saveList(KEY, list);

function normalizeModuleConfig(raw: any): ModuleConfigItem {
  return {
    id: String(raw.id ?? ''),
    module_code: raw.module_code ?? raw.moduleCode ?? '',
    module_name: raw.module_name ?? raw.moduleName ?? '',
    parent_module_code: raw.parent_module_code ?? raw.parentModuleCode ?? null,
    module_type: raw.module_type ?? raw.moduleType,
    description: raw.description ?? null,
    display_order: raw.display_order ?? raw.displayOrder ?? 0,
    is_active: raw.is_active ?? raw.isActive ?? true,
    created_at: raw.created_at ?? raw.createdAt,
    updated_at: raw.updated_at ?? raw.updatedAt,
  };
}

function packModuleConfig(data: Partial<ModuleConfigItem>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.module_code !== undefined || data.moduleCode !== undefined) body.moduleCode = data.module_code ?? data.moduleCode;
  if (data.module_name !== undefined || data.moduleName !== undefined) body.moduleName = data.module_name ?? data.moduleName;
  if (data.parent_module_code !== undefined || data.parentModuleCode !== undefined) body.parentModuleCode = data.parent_module_code ?? data.parentModuleCode;
  if (data.module_type !== undefined || data.moduleType !== undefined) body.moduleType = data.module_type ?? data.moduleType;
  if (data.description !== undefined) body.description = data.description;
  if (data.display_order !== undefined || data.displayOrder !== undefined) body.displayOrder = data.display_order ?? data.displayOrder;
  if (data.is_active !== undefined || data.isActive !== undefined) body.isActive = data.is_active ?? data.isActive;
  return body;
}

export async function getModuleConfigs(params?: { parentModuleCode?: string; isActive?: boolean }): Promise<ModuleConfigItem[]> {
  if (isMockMode) {
    let list = store();
    if (params?.parentModuleCode !== undefined) list = list.filter((item) => item.parent_module_code === params.parentModuleCode);
    if (params?.isActive !== undefined) list = list.filter((item) => item.is_active === params.isActive);
    return mockDelay(list);
  }
  try {
    const result = await request.get('/admin/work-order-modules', { params }) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    return (Array.isArray(rawList) ? rawList : []).map(normalizeModuleConfig);
  } catch {
    return [];
  }
}

export async function getModuleConfig(id: string): Promise<ModuleConfigItem> {
  if (isMockMode) {
    const item = store().find((m) => m.id === id);
    if (!item) return mockDelay(Promise.reject(new Error('模块不存在')));
    return mockDelay(item);
  }
  const result = await request.get(`/admin/work-order-modules/${id}`) as any;
  return normalizeModuleConfig(result);
}

export async function createModuleConfig(data: Partial<ModuleConfigItem>): Promise<ModuleConfigItem> {
  if (isMockMode) {
    const list = store();
    const item: ModuleConfigItem = {
      id: nextId(list),
      module_code: data.module_code ?? data.moduleCode ?? '',
      module_name: data.module_name ?? data.moduleName ?? '',
      parent_module_code: data.parent_module_code ?? data.parentModuleCode ?? null,
      module_type: data.module_type ?? data.moduleType ?? 'sub',
      description: data.description ?? null,
      display_order: data.display_order ?? data.displayOrder ?? 0,
      is_active: data.is_active ?? data.isActive ?? true,
      created_at: new Date().toISOString(),
    };
    list.push(item);
    commit(list);
    return mockDelay(item);
  }
  const result = await request.post('/admin/work-order-modules', packModuleConfig(data)) as any;
  return normalizeModuleConfig(result);
}

export async function updateModuleConfig(id: string, data: Partial<ModuleConfigItem>): Promise<ModuleConfigItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((m) => m.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('模块不存在')));
    const merged = { ...list[idx], ...data, id, updated_at: new Date().toISOString() };
    list[idx] = merged;
    commit(list);
    return mockDelay(merged);
  }
  const result = await request.put(`/admin/work-order-modules/${id}`, packModuleConfig(data)) as any;
  return normalizeModuleConfig(result);
}

export async function deleteModuleConfig(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((m) => m.id !== id));
    return mockDelay(undefined);
  }
  await request.delete(`/admin/work-order-modules/${id}`);
}
