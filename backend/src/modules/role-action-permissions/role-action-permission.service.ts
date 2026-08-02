import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from 'src/entities';

export const ROLE_ACTION_PERMISSION_SETTING_KEY = 'roleActionPermissions.v1';

export const ROLE_ACTIONS = [
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
  'route.dashboard',
  'route.notifications',
  'route.work_orders',
  'route.work_order_create',
  'route.work_order_import',
  'route.work_order_detail',
  'route.dispatched_detail',
  'route.onboarding',
  'route.onboarding_contract',
  'route.onboarding_contact',
  'route.onboarding_data_entry',
  'route.onboarding_social_insurance',
  'route.resignation_contact',
  'route.data_entry_resign',
  'route.social_insurance_resign',
  'route.offboarding',
  'route.offboarding_contact_pool',
  'route.offboarding_social_suspend_pool',
  'route.leader_dashboard',
  'system.admin',
  'module.contract.manage',
  'module.onboarding_contact.manage',
  'module.resignation_contact.manage',
  'module.data_entry.manage',
  'module.data_entry_resign.manage',
  'module.social_insurance.manage',
  'module.social_insurance_resign.manage',
  'dispatched_order.batch_import',
  'dispatched_order.batch_import_fields',
  'dispatched_order.batch_export',
  'dispatched_order.batch_accept',
  'dispatched_order.batch_complete',
  'dispatched_order.batch_feedback',
  'dispatched_order.batch_urge',
] as const;

export type RoleActionCode = (typeof ROLE_ACTIONS)[number];
export type RoleActionPermissionMatrix = Record<string, RoleActionCode[]>;

interface StoredRoleActionPermissions {
  roles?: Record<string, string[]>;
}

const ALL_ACTIONS = [...ROLE_ACTIONS];

const DASHBOARD_ACTIONS: RoleActionCode[] = ['route.dashboard', 'route.dispatched_detail'];
const NOTIFICATION_ACTIONS: RoleActionCode[] = ['route.notifications'];
const WORK_ORDER_BUSINESS_ACTIONS: RoleActionCode[] = [
  'route.work_orders',
  'route.work_order_create',
  'route.work_order_import',
  'route.work_order_detail',
];
const BUSINESS_SUB_ROUTE_ACTIONS: RoleActionCode[] = [
  'route.onboarding_contact',
  'route.onboarding_contract',
  'route.onboarding_data_entry',
  'route.onboarding_social_insurance',
  'route.resignation_contact',
  'route.data_entry_resign',
  'route.social_insurance_resign',
];
const MODULE_BATCH_BASE_ACTIONS: RoleActionCode[] = [
  'dispatched_order.batch_import',
  'dispatched_order.batch_export',
  'dispatched_order.batch_accept',
];
const STANDARD_MODULE_BATCH_ACTIONS: RoleActionCode[] = [
  ...MODULE_BATCH_BASE_ACTIONS,
  'dispatched_order.batch_complete',
];
const CONTRACT_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.onboarding_contract',
  'module.contract.manage',
  ...STANDARD_MODULE_BATCH_ACTIONS,
];
const ONBOARDING_CONTACT_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.onboarding_contact',
  'module.onboarding_contact.manage',
  'dispatched_order.batch_import_fields',
  ...STANDARD_MODULE_BATCH_ACTIONS,
];
const RESIGNATION_CONTACT_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.offboarding',
  'route.offboarding_contact_pool',
  'route.resignation_contact',
  'module.resignation_contact.manage',
  ...STANDARD_MODULE_BATCH_ACTIONS,
];
const DATA_ENTRY_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.onboarding_data_entry',
  'module.data_entry.manage',
  ...STANDARD_MODULE_BATCH_ACTIONS,
];
const DATA_ENTRY_RESIGN_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.offboarding',
  'route.offboarding_social_suspend_pool',
  'route.data_entry_resign',
  'module.data_entry_resign.manage',
  ...STANDARD_MODULE_BATCH_ACTIONS,
];
const SOCIAL_INSURANCE_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.onboarding_social_insurance',
  'module.social_insurance.manage',
  ...MODULE_BATCH_BASE_ACTIONS,
  'dispatched_order.batch_feedback',
];
const SOCIAL_INSURANCE_RESIGN_MODULE_ACTIONS: RoleActionCode[] = [
  'route.onboarding',
  'route.social_insurance_resign',
  'module.social_insurance_resign.manage',
  ...MODULE_BATCH_BASE_ACTIONS,
  'dispatched_order.batch_feedback',
];

export const DEFAULT_ROLE_ACTION_PERMISSIONS: RoleActionPermissionMatrix = {
  admin: ALL_ACTIONS,
  biz_manager: ['work_order.view_all', 'work_order.export', 'route.dashboard', 'route.dispatched_detail', 'route.leader_dashboard'],
  business_owner: ['work_order.view_all', 'work_order.export', 'route.dashboard', 'route.dispatched_detail', 'route.leader_dashboard'],
  manager: ['work_order.view_all', 'work_order.export', 'route.dashboard', 'route.dispatched_detail', 'route.leader_dashboard'],

  biz_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...WORK_ORDER_BUSINESS_ACTIONS, ...BUSINESS_SUB_ROUTE_ACTIONS, 'route.offboarding', 'dispatched_order.batch_urge', 'route.leader_dashboard'],
  business_group_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...WORK_ORDER_BUSINESS_ACTIONS, ...BUSINESS_SUB_ROUTE_ACTIONS, 'route.offboarding', 'dispatched_order.batch_urge', 'route.leader_dashboard'],

  biz_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...WORK_ORDER_BUSINESS_ACTIONS, ...BUSINESS_SUB_ROUTE_ACTIONS, 'dispatched_order.batch_urge'],
  business_group_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...WORK_ORDER_BUSINESS_ACTIONS, ...BUSINESS_SUB_ROUTE_ACTIONS, 'dispatched_order.batch_urge'],
  salesperson: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...WORK_ORDER_BUSINESS_ACTIONS, ...BUSINESS_SUB_ROUTE_ACTIONS, 'dispatched_order.batch_urge'],

  shared_leader: ['work_order.view_team', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, 'route.leader_dashboard', ...CONTRACT_MODULE_ACTIONS, ...ONBOARDING_CONTACT_MODULE_ACTIONS, ...RESIGNATION_CONTACT_MODULE_ACTIONS],
  shared_team_owner: ['work_order.view_team', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, 'route.leader_dashboard', ...CONTRACT_MODULE_ACTIONS, ...ONBOARDING_CONTACT_MODULE_ACTIONS, ...RESIGNATION_CONTACT_MODULE_ACTIONS],
  data_entry_leader: ['work_order.view_team', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, 'route.leader_dashboard', ...DATA_ENTRY_MODULE_ACTIONS, ...DATA_ENTRY_RESIGN_MODULE_ACTIONS],
  contract_specialist: ['work_order.view', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...CONTRACT_MODULE_ACTIONS],
  labor_contract_member: ['work_order.view', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...CONTRACT_MODULE_ACTIONS],
  onboarding_specialist: ['work_order.view', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...ONBOARDING_CONTACT_MODULE_ACTIONS, ...RESIGNATION_CONTACT_MODULE_ACTIONS],
  onboarding_resignation_member: ['work_order.view', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...ONBOARDING_CONTACT_MODULE_ACTIONS, ...RESIGNATION_CONTACT_MODULE_ACTIONS],
  social_insurance_specialist: ['work_order.view', 'work_order.export', ...DASHBOARD_ACTIONS, ...NOTIFICATION_ACTIONS, ...SOCIAL_INSURANCE_MODULE_ACTIONS, ...SOCIAL_INSURANCE_RESIGN_MODULE_ACTIONS],
  social_security_team: ['work_order.view', 'work_order.export'],
};

/**
 * Emergency-only baseline used while the permission center has no active
 * version. Runtime authorization should prefer PermissionCenterService; this
 * helper exists for bootstrapping and backwards-compatible deployments.
 */
export function hasDefaultRoleActionPermission(roleCodes: readonly string[], action: string): boolean {
  if (roleCodes.includes('admin')) return true;
  return roleCodes.some((roleCode) =>
    DEFAULT_ROLE_ACTION_PERMISSIONS[roleCode]?.some((candidate) => candidate === action) ?? false);
}

@Injectable()
export class RoleActionPermissionService {
  private readonly logger = new Logger(RoleActionPermissionService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
  ) {}

  async getMatrix(): Promise<RoleActionPermissionMatrix> {
    const stored = await this.readStoredMatrix();
    return { ...DEFAULT_ROLE_ACTION_PERMISSIONS, ...stored };
  }

  async updateMatrix(matrix: RoleActionPermissionMatrix): Promise<RoleActionPermissionMatrix> {
    const normalized = this.normalizeMatrix(matrix);
    const merged = { ...DEFAULT_ROLE_ACTION_PERMISSIONS, ...normalized };
    await this.saveStoredMatrix(merged);
    return merged;
  }

  async setRolePermissions(roleCode: string, actions: string[]): Promise<RoleActionPermissionMatrix> {
    const matrix = await this.getMatrix();
    matrix[roleCode] = this.normalizeActions(actions);
    await this.saveStoredMatrix(matrix);
    return matrix;
  }

  async getAllowedActionsForRoles(roleCodes: readonly string[]): Promise<RoleActionCode[]> {
    const matrix = await this.getMatrix();
    const allowed = new Set<RoleActionCode>();
    for (const roleCode of roleCodes) {
      const actions = matrix[roleCode] || [];
      for (const action of actions) allowed.add(action);
    }
    return Array.from(allowed);
  }

  async hasAnyRoleAction(roleCodes: readonly string[], action: string): Promise<boolean> {
    if (roleCodes.includes('admin')) return true;
    if (!ROLE_ACTIONS.includes(action as RoleActionCode)) return false;
    const allowed = await this.getAllowedActionsForRoles(roleCodes);
    return allowed.includes(action as RoleActionCode);
  }

  getActionDefinitions() {
    return [
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
      { code: 'route.dashboard', name: '仪表盘入口', description: '允许访问仪表盘' },
      { code: 'route.notifications', name: '消息通知入口', description: '允许访问消息通知' },
      { code: 'route.work_orders', name: '主工单列表入口', description: '允许访问主工单列表' },
      { code: 'route.work_order_create', name: '新建工单入口', description: '允许访问新建工单页面' },
      { code: 'route.work_order_import', name: '主工单导入入口', description: '允许访问主工单批量导入页面' },
      { code: 'route.work_order_detail', name: '主工单详情入口', description: '允许访问主工单详情页' },
      { code: 'route.dispatched_detail', name: '子工单详情入口', description: '允许访问有权查看的子工单详情页' },
      { code: 'route.onboarding', name: '入职管理入口', description: '允许访问入职管理分组入口' },
      { code: 'route.onboarding_contract', name: '劳动合同新签入口', description: '允许访问劳动合同新签子工单入口' },
      { code: 'route.onboarding_contact', name: '入职联系入口', description: '允许访问入职联系子工单入口' },
      { code: 'route.onboarding_data_entry', name: '增员报岗录入入口', description: '允许访问增员报岗录入子工单入口' },
      { code: 'route.onboarding_social_insurance', name: '社保公积金增员入口', description: '允许访问社保公积金增员子工单入口' },
      { code: 'route.resignation_contact', name: '离职材料收集入口', description: '允许访问离职材料收集子工单入口' },
      { code: 'route.data_entry_resign', name: '减员报岗录入入口', description: '允许访问减员报岗录入子工单入口' },
      { code: 'route.social_insurance_resign', name: '社保公积金减员入口', description: '允许访问社保公积金减员子工单入口' },
      { code: 'route.offboarding', name: '离职管理入口', description: '允许访问离职管理分组入口' },
      { code: 'route.offboarding_contact_pool', name: '离职材料收集池入口', description: '允许访问离职材料收集池入口' },
      { code: 'route.offboarding_social_suspend_pool', name: '减员报岗录入池入口', description: '允许访问减员报岗录入池入口' },
      { code: 'route.leader_dashboard', name: '领导看板入口', description: '允许访问领导看板' },
      { code: 'system.admin', name: '后台管理入口', description: '允许访问后台管理配置入口' },
      { code: 'module.contract.manage', name: '劳动合同新签模块', description: '允许访问劳动合同新签子工单模块' },
      { code: 'module.onboarding_contact.manage', name: '入职联系模块', description: '允许访问入职联系子工单模块' },
      { code: 'module.resignation_contact.manage', name: '离职材料收集模块', description: '允许访问离职材料收集子工单模块' },
      { code: 'module.data_entry.manage', name: '增员报岗录入模块', description: '允许访问增员报岗录入子工单模块' },
      { code: 'module.data_entry_resign.manage', name: '减员报岗录入模块', description: '允许访问减员报岗录入子工单模块' },
      { code: 'module.social_insurance.manage', name: '社保公积金增员模块', description: '允许访问社保公积金增员子工单模块' },
      { code: 'module.social_insurance_resign.manage', name: '社保公积金减员模块', description: '允许访问社保公积金减员子工单模块' },
      { code: 'dispatched_order.batch_import', name: '导入办理结果', description: '允许在授权子工单模块批量导入办理结果' },
      { code: 'dispatched_order.batch_import_fields', name: '导入字段修改', description: '允许在授权子工单模块批量导入字段修改，例如银行卡修改' },
      { code: 'dispatched_order.batch_export', name: '固定模板导出', description: '允许在授权子工单模块按固定模板导出' },
      { code: 'dispatched_order.batch_accept', name: '批量接单', description: '允许在授权子工单模块批量接单' },
      { code: 'dispatched_order.batch_complete', name: '批量完成', description: '允许在授权子工单模块批量完成' },
      { code: 'dispatched_order.batch_feedback', name: '批量反馈办理结果', description: '允许在社保公积金模块批量反馈办理结果' },
      { code: 'dispatched_order.batch_urge', name: '批量催办', description: '允许业务侧或管理员对子工单批量催办' },
    ];
  }

  private async readStoredMatrix(): Promise<RoleActionPermissionMatrix> {
    try {
      const row = await this.settingsRepo.findOne({ where: { key: ROLE_ACTION_PERMISSION_SETTING_KEY } });
      if (!row) return {};
      const parsed = JSON.parse(row.value) as StoredRoleActionPermissions;
      return this.normalizeMatrix(parsed.roles || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load role action permissions: ${message}`);
      return {};
    }
  }

  private async saveStoredMatrix(matrix: RoleActionPermissionMatrix): Promise<void> {
    const value = JSON.stringify({ roles: this.normalizeMatrix(matrix) });
    const row = await this.settingsRepo.findOne({ where: { key: ROLE_ACTION_PERMISSION_SETTING_KEY } });
    if (row) {
      row.value = value;
      row.isEncrypted = false;
      await this.settingsRepo.save(row);
      return;
    }
    await this.settingsRepo.save(this.settingsRepo.create({ key: ROLE_ACTION_PERMISSION_SETTING_KEY, value, isEncrypted: false }));
  }

  private normalizeMatrix(matrix: Record<string, string[]>): RoleActionPermissionMatrix {
    const result: RoleActionPermissionMatrix = {};
    for (const [roleCode, actions] of Object.entries(matrix || {})) {
      if (!roleCode) continue;
      result[roleCode] = this.normalizeActions(actions);
    }
    return result;
  }

  private normalizeActions(actions: string[]): RoleActionCode[] {
    const allowed = new Set<RoleActionCode>();
    for (const action of actions || []) {
      if (ROLE_ACTIONS.includes(action as RoleActionCode)) allowed.add(action as RoleActionCode);
    }
    return Array.from(allowed);
  }
}
