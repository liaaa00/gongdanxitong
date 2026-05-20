import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface ModuleHandlerItem {
  id: string;
  module_code: string;
  handler_id: string;
  handler_name?: string;
  weight: number;
  is_backup: boolean;
  is_active: boolean;
  // aliases for camelCase
  moduleCode?: string;
  handlerId?: string;
  handlerName?: string;
  isBackup?: boolean;
  isActive?: boolean;
}

const KEY = 'mock_admin_module_handlers_v4'; // ★ v4: benefit_apply 模块码及 role 同步
const SEED: ModuleHandlerItem[] = [
  { id: '1', module_code: 'contract', handler_id: '22', handler_name: '江璐', weight: 2, is_backup: false, is_active: true },
  { id: '2', module_code: 'contract', handler_id: '23', handler_name: '杨纯', weight: 2, is_backup: false, is_active: true },
  { id: '3', module_code: 'renewal_contract', handler_id: '23', handler_name: '杨纯', weight: 1, is_backup: false, is_active: true },
  { id: '4', module_code: 'benefit', handler_id: '23', handler_name: '杨纯', weight: 1, is_backup: false, is_active: true },
  { id: '5', module_code: 'onboarding_contact', handler_id: '22', handler_name: '江璐', weight: 1, is_backup: false, is_active: true },
  { id: '6', module_code: 'onboarding_contact', handler_id: '24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: '7', module_code: 'resignation_contact', handler_id: '22', handler_name: '江璐', weight: 1, is_backup: false, is_active: true },
  { id: '8', module_code: 'resignation_contact', handler_id: '24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: '9', module_code: 'resignation_cert', handler_id: '24', handler_name: '毛雅妮', weight: 1, is_backup: false, is_active: true },
  { id: '10', module_code: 'data_entry', handler_id: '21', handler_name: '安娜祯', weight: 1, is_backup: false, is_active: true },
  // 社保公积金办理负责人暂不硬编码具体人员，管理员可在模块负责人页面配置。
];

// 负责人姓名由 /admin/users 列表在页面侧渲染，不在此维护前端假表。

const store = () => loadList<ModuleHandlerItem>(KEY, SEED);
const commit = (l: ModuleHandlerItem[]) => saveList(KEY, l);

export async function getModuleHandlers(moduleCode?: string, isActive?: boolean): Promise<ModuleHandlerItem[]> {
  if (isMockMode) {
    const list = store();
    const filtered = list.filter((h) =>
      (!moduleCode || h.module_code === moduleCode) &&
      (isActive === undefined || h.is_active === isActive),
    );
    return mockDelay(filtered);
  }
  try {
    const params: Record<string, unknown> = {};
    if (moduleCode) {
      params.moduleCode = moduleCode;
      // 兼容旧 mock / 旧接口；真实后端读取 moduleCode。
      params.module_code = moduleCode;
    }
    if (isActive !== undefined) params.isActive = isActive;
    const result = await request.get('/admin/module-handlers', { params }) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    return (Array.isArray(rawList) ? rawList : []).map((h: any) => ({
      id: h.id ?? h.ID ?? '',
      module_code: h.module_code ?? h.moduleCode ?? '',
      handler_id: h.handler_id ?? h.handlerId ?? '',
      handler_name: h.handler_name ?? h.handlerName ?? h.handler_name ?? '',
      weight: h.weight ?? 1,
      is_backup: h.is_backup ?? h.isBackup ?? false,
      is_active: h.is_active ?? h.isActive ?? true,
    } as ModuleHandlerItem));
  } catch {
    // ★ 后端不可用时返回空数组
    return [];
  }
}

export async function createModuleHandler(data: Partial<ModuleHandlerItem>): Promise<ModuleHandlerItem> {
  if (isMockMode) {
    const list = store();
    const handlerId = data.handler_id || '';
    const item: ModuleHandlerItem = {
      id: nextId(list),
      module_code: data.module_code || '',
      handler_id: handlerId,
      handler_name: data.handler_name || handlerId,
      weight: data.weight ?? 1,
      is_backup: data.is_backup ?? false,
      is_active: data.is_active ?? true,
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/module-handlers', {
    moduleCode: data.module_code ?? data.moduleCode,
    handlerId: data.handler_id ?? data.handlerId,
    weight: data.weight,
    isBackup: data.is_backup ?? data.isBackup,
    isActive: data.is_active ?? data.isActive,
  }) as Promise<ModuleHandlerItem>;
}

export async function createModuleHandlersBatch(moduleCode: string, handlerIds: string[], opts?: { weight?: number; is_backup?: boolean; is_active?: boolean }): Promise<ModuleHandlerItem[]> {
  if (isMockMode) {
    const list = store();
    const existing = new Set(list.filter((h) => h.module_code === moduleCode).map((h) => h.handler_id));
    const toAdd = handlerIds.filter((id) => !existing.has(id));
    let nextNum = Math.max(0, ...list.map((x) => Number(x.id) || 0));
    const created: ModuleHandlerItem[] = toAdd.map((handlerId) => {
      nextNum += 1;
      return {
        id: String(nextNum),
        module_code: moduleCode,
        handler_id: handlerId,
        handler_name: handlerId,
        weight: opts?.weight ?? 1,
        is_backup: opts?.is_backup ?? false,
        is_active: opts?.is_active ?? true,
      };
    });
    list.push(...created);
    commit(list);
    return mockDelay(created);
  }
  // 后端无 /batch 路由，循环单个 POST
  const results = await Promise.all(
    handlerIds.map((handlerId) =>
      request.post('/admin/module-handlers', {
        moduleCode,
        handlerId,
        weight: opts?.weight,
        isBackup: opts?.is_backup,
        isActive: opts?.is_active,
      }) as Promise<ModuleHandlerItem>,
    ),
  );
  return results;
}

export async function updateModuleHandler(id: string, data: Partial<ModuleHandlerItem>): Promise<ModuleHandlerItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((h) => h.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('记录不存在')));
    const merged = { ...list[idx], ...data, id };
    if (data.handler_id && !data.handler_name) merged.handler_name = data.handler_id;
    list[idx] = merged;
    commit(list);
    return mockDelay(merged);
  }
  const body: Record<string, unknown> = {};
  if (data.module_code !== undefined || data.moduleCode !== undefined) body.moduleCode = data.module_code ?? data.moduleCode;
  if (data.handler_id !== undefined || data.handlerId !== undefined) body.handlerId = data.handler_id ?? data.handlerId;
  if (data.weight !== undefined) body.weight = data.weight;
  if (data.is_backup !== undefined || data.isBackup !== undefined) body.isBackup = data.is_backup ?? data.isBackup;
  if (data.is_active !== undefined || data.isActive !== undefined) body.isActive = data.is_active ?? data.isActive;
  return request.put(`/admin/module-handlers/${id}`, body) as Promise<ModuleHandlerItem>;
}

export async function deleteModuleHandler(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((h) => h.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/module-handlers/${id}`) as Promise<void>;
}
