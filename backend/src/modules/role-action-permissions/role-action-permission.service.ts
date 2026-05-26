import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from 'src/entities';

export const ROLE_ACTION_PERMISSION_SETTING_KEY = 'roleActionPermissions.v1';

export const ROLE_ACTIONS = [
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

export type RoleActionCode = (typeof ROLE_ACTIONS)[number];
export type RoleActionPermissionMatrix = Record<string, RoleActionCode[]>;

interface StoredRoleActionPermissions {
  roles?: Record<string, string[]>;
}

const ALL_ACTIONS = [...ROLE_ACTIONS];

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

export const DEFAULT_ROLE_ACTION_PERMISSIONS: RoleActionPermissionMatrix = {
  admin: ALL_ACTIONS,
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
      { code: 'work_order.delete', name: '主工单-删除', description: '允许删除工单；建议仅管理员拥有' },
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
