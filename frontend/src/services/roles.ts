import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface RoleItem {
  id: string;
  code: string;
  name: string;
  level: string;
  description: string;
  is_active: boolean;
  parent_role_id?: string | null;
  children?: RoleItem[];
}

const KEY = 'mock_admin_roles_v3'; // ★ v3: 新增福保负责人角色
const SEED: RoleItem[] = [
  // ★ 8 个核心角色 — code 与 CORE_ROLES 集合精确匹配
  { id: '1', code: 'admin', name: '系统管理员', level: '全局', description: '李占博、王梓曦 — 全部工单和系统配置', is_active: true, parent_role_id: null },
  { id: '2', code: 'business_owner', name: '业务负责人', level: '管理层', description: '敖蕾、薛锟、余琴霞 — 查看全部业务工单、全局看板、导出，不可操作工单', is_active: true, parent_role_id: '1' },
  { id: '3', code: 'business_group_leader', name: '业务组长', level: '主管层', description: '沈文君、陈宇辰、高璐璐、刘程、余维维 — 查看本组全部工单；可发起/修改/撤回', is_active: true, parent_role_id: '2' },
  { id: '4', code: 'business_group_member', name: '业务员', level: '执行层', description: '姚怡萍、闫秋月等10人 — 只看自己发起的工单', is_active: true, parent_role_id: '3' },
  { id: '5', code: 'data_entry_leader', name: '数据录入组长', level: '主管层', description: '安娜祯 — 增员报岗录入/减员报岗录入模块全量，执行+审核管理', is_active: true, parent_role_id: '2' },
  { id: '6', code: 'shared_team_owner', name: '共享团队负责人', level: '主管层', description: '江璐 — 杨纯合同新签/续签 + 毛雅妮入职联系/离职材料收集合集，可接单/完成/退回/补充/改派', is_active: true, parent_role_id: '2' },
  { id: '7', code: 'labor_contract_member', name: '合同专员', level: '执行层', description: '杨纯 — 劳动合同新签/续签，待遇申报一期隐藏', is_active: true, parent_role_id: '2' },
  { id: '8', code: 'onboarding_resignation_member', name: '入离职联系专员', level: '执行层', description: '毛雅妮 — 入职联系/离职材料收集', is_active: true, parent_role_id: '2' },
  { id: '9', code: 'social_insurance_specialist', name: '福保负责人', level: '主管层', description: '傅倩雯 — 福利保障部，负责社保公积金增员/减员子工单', is_active: true, parent_role_id: '2' },
];

const store = () => loadList<RoleItem>(KEY, SEED);
const commit = (l: RoleItem[]) => saveList(KEY, l);

function withChildren(list: RoleItem[]): RoleItem[] {
  return list.map((r) => ({
    ...r,
    children: list.filter((c) => c.parent_role_id === r.id).map((c) => ({ ...c })),
  }));
}

export function flattenRoles(roles: RoleItem[]): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  const walk = (list: RoleItem[], prefix: string = '') => {
    for (const r of list) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        result.push({ value: r.id, label: prefix + r.name });
        if (r.children?.length) walk(r.children, prefix + '  ');
      }
    }
  };
  walk(roles);
  return result;
}

export async function getRoles(): Promise<RoleItem[]> {
  if (isMockMode) return mockDelay(withChildren(store()));
  try {
    const result = await request.get('/admin/roles') as any;
    // 后端返回分页对象 { list, page, pageSize, total, totalPages } 或直接数组
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || []);
    // Normalize camelCase/snake_case
    const list = (Array.isArray(rawList) ? rawList : []).map((r: any) => ({
      id: r.id ?? r.ID ?? '',
      code: r.code ?? '',
      name: r.name ?? '',
      level: r.level ?? '',
      description: r.description ?? '',
      is_active: r.is_active ?? r.isActive ?? true,
      parent_role_id: r.parent_role_id ?? r.parentRoleId ?? null,
    } as RoleItem));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function createRole(data: Partial<RoleItem>): Promise<RoleItem> {
  if (isMockMode) {
    const list = store();
    const item: RoleItem = {
      id: nextId(list),
      code: data.code || '',
      name: data.name || '',
      level: data.level || '执行层',
      description: data.description || '',
      is_active: data.is_active ?? true,
      parent_role_id: data.parent_role_id ?? null,
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/roles', packRole(data)) as Promise<RoleItem>;
}

function packRole(data: Partial<RoleItem>): Record<string, unknown> {
  // 后端 CreateRoleDto/UpdateRoleDto 只接受 camelCase 字段；parent_role_id 不在 DTO，故剔除
  const body: Record<string, unknown> = {};
  if (data.code !== undefined) body.code = data.code;
  if (data.name !== undefined) body.name = data.name;
  if (data.level !== undefined) body.level = data.level;
  if (data.description !== undefined) body.description = data.description;
  if (data.is_active !== undefined) body.isActive = data.is_active;
  return body;
}

export async function updateRole(id: string, data: Partial<RoleItem>): Promise<RoleItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('角色不存在')));
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/roles/${id}`, packRole(data)) as Promise<RoleItem>;
}

export async function deleteRole(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((r) => r.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/roles/${id}`) as Promise<void>;
}
