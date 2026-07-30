import request from './request';
import { loadList, nextId, saveList } from './_mockStore';
import { isMockMode, mockDelay } from './mock';

export interface ModuleDelegationItem {
  id: string;
  moduleCode: string;
  sourceHandlerId: string;
  delegateHandlerId: string | null;
  sourceHandlerName?: string;
  delegateHandlerName?: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  isActive: boolean;
}

export interface CreateModuleDelegationInput {
  moduleCode: string;
  sourceHandlerId: string;
  delegateHandlerId?: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
}

const KEY = 'mock_module_handler_delegations_v1';

function normalize(row: any): ModuleDelegationItem {
  return {
    id: row.id,
    moduleCode: row.moduleCode ?? row.module_code,
    sourceHandlerId: row.sourceHandlerId ?? row.source_handler_id,
    delegateHandlerId: row.delegateHandlerId ?? row.delegate_handler_id ?? null,
    sourceHandlerName: row.sourceHandler?.realName ?? row.source_handler?.real_name ?? row.sourceHandlerName,
    delegateHandlerName: row.delegateHandler?.realName ?? row.delegate_handler?.real_name ?? row.delegateHandlerName ?? null,
    startsAt: row.startsAt ?? row.starts_at,
    endsAt: row.endsAt ?? row.ends_at,
    reason: row.reason,
    isActive: row.isActive ?? row.is_active ?? true,
  };
}

export async function getModuleDelegations(
  moduleCode?: string,
  includeInactive = false,
): Promise<ModuleDelegationItem[]> {
  if (isMockMode) {
    return mockDelay(loadList<ModuleDelegationItem>(KEY, []).filter((row) =>
      (!moduleCode || row.moduleCode === moduleCode) && (includeInactive || row.isActive)));
  }
  const result = await request.get('/admin/module-delegations', {
    params: { moduleCode, includeInactive },
  }) as any;
  const list = Array.isArray(result) ? result : result?.list || result?.items || [];
  return list.map(normalize);
}

export async function createModuleDelegation(
  input: CreateModuleDelegationInput,
): Promise<ModuleDelegationItem> {
  if (isMockMode) {
    const list = loadList<ModuleDelegationItem>(KEY, []);
    const item: ModuleDelegationItem = {
      id: nextId(list),
      ...input,
      delegateHandlerId: input.delegateHandlerId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isActive: true,
    };
    list.push(item);
    saveList(KEY, list);
    return mockDelay(item);
  }
  return normalize(await request.post('/admin/module-delegations', input));
}

export async function cancelModuleDelegation(id: string): Promise<void> {
  if (isMockMode) {
    const list = loadList<ModuleDelegationItem>(KEY, []);
    const row = list.find((item) => item.id === id);
    if (row) row.isActive = false;
    saveList(KEY, list);
    return mockDelay(undefined);
  }
  await request.delete(`/admin/module-delegations/${id}`);
}
