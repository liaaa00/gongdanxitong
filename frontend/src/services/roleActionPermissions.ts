import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList } from './_mockStore';

export const ROLE_ACTION_CODES = [
  'page.work_order.main',
  'page.my_work.initiated',
  'page.my_work.pending',
  'page.my_work.done',
  'page.my_work.team',
  'page.my_work.history',
  'work_order.view',
  'work_order.view_team',
  'work_order.view_all',
  'work_order.create',
  'work_order.import',
  'work_order.update',
  'work_order.withdraw',
  'work_order.void',
  'work_order.urge',
  'work_order.export',
  'work_order.delete',
  'dispatched_order.view',
  'dispatched_order.view_team',
  'dispatched_order.accept',
  'dispatched_order.complete',
  'dispatched_order.return',
  'dispatched_order.supplement',
  'dispatched_order.creator_update',
  'dispatched_order.withdraw',
  'dispatched_order.void',
  'dispatched_order.urge',
  'dispatched_order.reassign',
  'dispatched_order.import',
  'dispatched_order.export',
] as const;

export type RoleActionCode = (typeof ROLE_ACTION_CODES)[number];

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

const KEY = 'mock_role_action_permissions_v2';

export const DEFAULT_ACTIONS: RoleActionDefinition[] = [
  { code: 'page.work_order.main', name: '页面-主工单列表', description: '允许进入主工单列表，仅查看主工单和子工单进度' },
  { code: 'page.my_work.initiated', name: '页面-我发起的', description: '允许查看本人发起的子工单合集' },
  { code: 'page.my_work.pending', name: '页面-我的待办', description: '允许进入我的待办；后道人员仅在此页面办理' },
  { code: 'page.my_work.done', name: '页面-我的已办', description: '允许查看已办子工单，默认只读' },
  { code: 'page.my_work.team', name: '页面-团队工单', description: '允许查看团队范围子工单，默认只读' },
  { code: 'page.my_work.history', name: '页面-历史工单', description: '允许查看历史子工单，默认只读' },
  { code: 'work_order.view', name: '主工单-查看本人数据', description: '查看自己发起或负责处理的工单' },
  { code: 'work_order.view_team', name: '主工单-查看团队数据', description: '查看本组或本团队范围内的工单' },
  { code: 'work_order.view_all', name: '主工单-查看全部数据', description: '查看系统内全部业务工单' },
  { code: 'work_order.create', name: '主工单-新建', description: '允许单条新建主工单' },
  { code: 'work_order.import', name: '主工单-批量导入', description: '允许通过 Excel 批量导入主工单' },
  { code: 'work_order.update', name: '主工单-修改（预留）', description: '会议口径下主工单默认只读；如确需恢复可在此勾选' },
  { code: 'work_order.withdraw', name: '主工单-撤回（预留）', description: '会议口径下撤回在子工单完成；如确需恢复可在此勾选' },
  { code: 'work_order.void', name: '主工单-作废（预留）', description: '会议口径下作废在子工单完成；如确需恢复可在此勾选' },
  { code: 'work_order.urge', name: '主工单-催办（预留）', description: '会议口径下催办在子工单完成；如确需恢复可在此勾选' },
  { code: 'work_order.export', name: '主工单-导出', description: '允许导出有权限查看的主工单数据' },
  { code: 'work_order.delete', name: '主工单-删除（管理员）', description: '删除数据仅由管理员后台处理；业务员需邮件联系管理员，不建议给业务员勾选' },
  { code: 'dispatched_order.view', name: '子工单-查看', description: '允许查看本人相关子工单详情' },
  { code: 'dispatched_order.view_team', name: '子工单-查看团队', description: '允许查看团队范围子工单，默认只读' },
  { code: 'dispatched_order.accept', name: '子工单-接单', description: '允许在“我的待办”接单' },
  { code: 'dispatched_order.complete', name: '子工单-完成办理', description: '允许在“我的待办”完成或批量完成子工单' },
  { code: 'dispatched_order.return', name: '子工单-退回', description: '允许在“我的待办”退回或批量退回给业务员' },
  { code: 'dispatched_order.supplement', name: '子工单-补充字段', description: '允许后道在子工单详情补充/修改可办理字段' },
  { code: 'dispatched_order.creator_update', name: '子工单-业务员修改', description: '允许业务员处理退回子工单并提交修改' },
  { code: 'dispatched_order.withdraw', name: '子工单-业务员撤回', description: '允许业务员在子工单发起撤回' },
  { code: 'dispatched_order.void', name: '子工单-业务员作废', description: '允许业务员在子工单作废；退回后作废不再二次审批' },
  { code: 'dispatched_order.urge', name: '子工单-催办', description: '允许子工单催办或批量催办' },
  { code: 'dispatched_order.reassign', name: '子工单-转交', description: '允许主管/负责人将子工单转交给同组人员' },
  { code: 'dispatched_order.import', name: '子工单-批导入办理', description: '允许在“我的待办”导入办理结果或字段修改' },
  { code: 'dispatched_order.export', name: '子工单-固定模板导出', description: '按系统配置的固定模板导出，用户不可选模板' },
];

const BUSINESS_MEMBER_ACTIONS: RoleActionCode[] = [
  'page.my_work.initiated',
  'page.my_work.history',
  'work_order.view',
  'dispatched_order.view',
  'dispatched_order.creator_update',
  'dispatched_order.withdraw',
  'dispatched_order.void',
  'dispatched_order.urge',
];

const BUSINESS_TEAM_READ_ACTIONS: RoleActionCode[] = [
  'page.work_order.main',
  ...BUSINESS_MEMBER_ACTIONS,
  'page.my_work.team',
  'work_order.view_team',
  'dispatched_order.view_team',
];

const BACKEND_TODO_ACTIONS: RoleActionCode[] = [
  'page.my_work.pending',
  'page.my_work.done',
  'page.my_work.history',
  'work_order.view',
  'dispatched_order.view',
  'dispatched_order.accept',
  'dispatched_order.complete',
  'dispatched_order.return',
  'dispatched_order.supplement',
  'dispatched_order.urge',
  'dispatched_order.import',
  'dispatched_order.export',
];

const BACKEND_SUPERVISOR_ACTIONS: RoleActionCode[] = [
  ...BACKEND_TODO_ACTIONS,
  'page.my_work.team',
  'dispatched_order.view_team',
  'dispatched_order.reassign',
];

export const DEFAULT_MATRIX: RoleActionMatrix = {
  admin: DEFAULT_ACTIONS.map((item) => item.code),
  biz_manager: [...BUSINESS_TEAM_READ_ACTIONS, 'work_order.view_all', 'work_order.export'],
  business_owner: [...BUSINESS_TEAM_READ_ACTIONS, 'work_order.view_all', 'work_order.export'],
  manager: [...BUSINESS_TEAM_READ_ACTIONS, 'work_order.view_all', 'work_order.export'],
  biz_leader: BUSINESS_TEAM_READ_ACTIONS,
  business_group_leader: BUSINESS_TEAM_READ_ACTIONS,
  biz_member: BUSINESS_MEMBER_ACTIONS,
  business_group_member: BUSINESS_MEMBER_ACTIONS,
  salesperson: BUSINESS_MEMBER_ACTIONS,
  shared_leader: BACKEND_SUPERVISOR_ACTIONS,
  shared_team_owner: BACKEND_SUPERVISOR_ACTIONS,
  data_entry_leader: BACKEND_SUPERVISOR_ACTIONS,
  contract_specialist: BACKEND_TODO_ACTIONS,
  labor_contract_member: BACKEND_TODO_ACTIONS,
  onboarding_specialist: BACKEND_TODO_ACTIONS,
  onboarding_resignation_member: BACKEND_TODO_ACTIONS,
  social_insurance_specialist: BACKEND_TODO_ACTIONS,
  social_security_team: BACKEND_TODO_ACTIONS,
};

const store = () => loadList<{ roleCode: string; actions: RoleActionCode[] }>(KEY, Object.entries(DEFAULT_MATRIX).map(([roleCode, actions]) => ({ roleCode, actions })));
const commit = (matrix: RoleActionMatrix) => saveList(KEY, Object.entries(matrix).map(([roleCode, actions]) => ({ roleCode, actions })));

function withAdminFullAccess(matrix: RoleActionMatrix): RoleActionMatrix {
  return { ...matrix, admin: DEFAULT_MATRIX.admin };
}

function storeToMatrix(): RoleActionMatrix {
  return withAdminFullAccess(Object.fromEntries(store().map((item) => [item.roleCode, item.actions])) as RoleActionMatrix);
}

export async function getRoleActionPermissions(): Promise<RoleActionPermissionPayload> {
  if (isMockMode) return mockDelay({ actions: DEFAULT_ACTIONS, roles: withAdminFullAccess({ ...DEFAULT_MATRIX, ...storeToMatrix() }) });
  const result = await request.get('/admin/role-action-permissions') as any;
  return {
    actions: Array.isArray(result?.actions) ? result.actions : DEFAULT_ACTIONS,
    roles: result?.roles || {},
  };
}

export async function updateRoleActionPermissions(roles: RoleActionMatrix): Promise<RoleActionPermissionPayload> {
  if (isMockMode) {
    const next = withAdminFullAccess(roles);
    commit(next);
    return mockDelay({ actions: DEFAULT_ACTIONS, roles: next });
  }
  const result = await request.put('/admin/role-action-permissions', { roles }) as any;
  return {
    actions: Array.isArray(result?.actions) ? result.actions : DEFAULT_ACTIONS,
    roles: result?.roles || roles,
  };
}

export async function updateRoleActions(roleCode: string, actions: RoleActionCode[]): Promise<RoleActionPermissionPayload> {
  if (isMockMode) {
    const next = withAdminFullAccess({ ...DEFAULT_MATRIX, ...storeToMatrix(), [roleCode]: actions });
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
