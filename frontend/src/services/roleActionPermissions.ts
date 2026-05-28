import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList } from './_mockStore';

export type RoleActionCode =
  | 'work_order.view'
  | 'work_order.view_team'
  | 'work_order.view_all'
  | 'work_order.create'
  | 'work_order.import'
  | 'work_order.update'
  | 'work_order.withdraw'
  | 'work_order.void'
  | 'work_order.urge'
  | 'work_order.export'
  | 'work_order.delete';

export interface RoleActionDefinition {
  code: RoleActionCode;
  name: string;
  description?: string;
}

export type RoleActionMatrix = Record<string, RoleActionCode[]>;

export interface RoleActionPermissionPayload {
  actions: RoleActionDefinition[];
  roles: RoleActionMatrix;
}

const KEY = 'mock_role_action_permissions_v1';

export const DEFAULT_ACTIONS: RoleActionDefinition[] = [
  { code: 'work_order.view', name: '查看本人数据', description: '查看自己发起或负责处理的工单' },
  { code: 'work_order.view_team', name: '查看团队数据', description: '查看本组或本团队范围内的工单' },
  { code: 'work_order.view_all', name: '查看全部数据', description: '查看系统内全部业务工单' },
  { code: 'work_order.create', name: '新建工单', description: '允许单条新建工单' },
  { code: 'work_order.import', name: '批量导入', description: '允许通过 Excel 批量导入工单' },
  { code: 'work_order.update', name: '修改工单', description: '允许修改未办结、未终止的工单数据' },
  { code: 'work_order.withdraw', name: '撤回工单', description: '允许发起撤回申请或撤回本人可操作的子工单' },
  { code: 'work_order.void', name: '作废工单', description: '允许发起作废申请或作废本人可操作的子工单' },
  { code: 'work_order.urge', name: '催办工单', description: '允许对后道办理人员发起催办' },
  { code: 'work_order.export', name: '导出数据', description: '允许导出有权限查看的工单数据' },
  { code: 'work_order.delete', name: '删除工单', description: '允许删除工单；建议仅管理员拥有' },
];

export const DEFAULT_MATRIX: RoleActionMatrix = {
  admin: DEFAULT_ACTIONS.map((item) => item.code),
  biz_manager: ['work_order.view_all', 'work_order.export'],
  business_owner: ['work_order.view_all', 'work_order.export'],
  biz_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export'],
  business_group_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export'],
  biz_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],
  business_group_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],
  salesperson: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],
  shared_team_owner: ['work_order.view_team', 'work_order.export'],
  data_entry_leader: ['work_order.view_team', 'work_order.export'],
  labor_contract_member: ['work_order.view', 'work_order.export'],
  onboarding_resignation_member: ['work_order.view', 'work_order.update', 'work_order.export'],
  social_insurance_specialist: ['work_order.view', 'work_order.export'],
};

const store = () => loadList<{ roleCode: string; actions: RoleActionCode[] }>(KEY, Object.entries(DEFAULT_MATRIX).map(([roleCode, actions]) => ({ roleCode, actions })));
const commit = (matrix: RoleActionMatrix) => saveList(KEY, Object.entries(matrix).map(([roleCode, actions]) => ({ roleCode, actions })));

function storeToMatrix(): RoleActionMatrix {
  return Object.fromEntries(store().map((item) => [item.roleCode, item.actions])) as RoleActionMatrix;
}

export async function getRoleActionPermissions(): Promise<RoleActionPermissionPayload> {
  if (isMockMode) return mockDelay({ actions: DEFAULT_ACTIONS, roles: { ...DEFAULT_MATRIX, ...storeToMatrix() } });
  const result = await request.get('/admin/role-action-permissions') as any;
  return {
    actions: Array.isArray(result?.actions) ? result.actions : DEFAULT_ACTIONS,
    roles: result?.roles || {},
  };
}

export async function updateRoleActionPermissions(roles: RoleActionMatrix): Promise<RoleActionPermissionPayload> {
  if (isMockMode) {
    commit(roles);
    return mockDelay({ actions: DEFAULT_ACTIONS, roles });
  }
  const result = await request.put('/admin/role-action-permissions', { roles }) as any;
  return {
    actions: Array.isArray(result?.actions) ? result.actions : DEFAULT_ACTIONS,
    roles: result?.roles || roles,
  };
}

export async function updateRoleActions(roleCode: string, actions: RoleActionCode[]): Promise<RoleActionPermissionPayload> {
  if (isMockMode) {
    const next = { ...DEFAULT_MATRIX, ...storeToMatrix(), [roleCode]: actions };
    commit(next);
    return mockDelay({ actions: DEFAULT_ACTIONS, roles: next });
  }
  const result = await request.put('/admin/role-action-permissions/role', { roleCode, actions }) as any;
  return {
    actions: Array.isArray(result?.actions) ? result.actions : DEFAULT_ACTIONS,
    roles: result?.roles || {},
  };
}

export async function getMyRoleActions(): Promise<RoleActionCode[]> {
  if (isMockMode) return mockDelay(DEFAULT_MATRIX.business_group_member);
  const result = await request.get('/role-action-permissions/me') as any;
  return Array.isArray(result?.actions) ? result.actions : [];
}
