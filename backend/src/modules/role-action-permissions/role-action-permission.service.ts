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
] as const;

export type RoleActionCode = (typeof ROLE_ACTIONS)[number];
export type RoleActionPermissionMatrix = Record<string, RoleActionCode[]>;

interface StoredRoleActionPermissions {
  roles?: Record<string, string[]>;
}

const ALL_ACTIONS = [...ROLE_ACTIONS];

export const DEFAULT_ROLE_ACTION_PERMISSIONS: RoleActionPermissionMatrix = {
  admin: ALL_ACTIONS,
  biz_manager: ['work_order.view_all', 'work_order.export'],
  business_owner: ['work_order.view_all', 'work_order.export'],
  manager: ['work_order.view_all', 'work_order.export'],

  biz_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export'],
  business_group_leader: ['work_order.view_team', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export'],

  biz_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],
  business_group_member: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],
  salesperson: ['work_order.view', 'work_order.create', 'work_order.import', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge'],

  shared_leader: ['work_order.view_team', 'work_order.export'],
  shared_team_owner: ['work_order.view_team', 'work_order.export'],
  data_entry_leader: ['work_order.view_team', 'work_order.export'],
  contract_specialist: ['work_order.view', 'work_order.export'],
  labor_contract_member: ['work_order.view', 'work_order.export'],
  onboarding_specialist: ['work_order.view', 'work_order.export'],
  onboarding_resignation_member: ['work_order.view', 'work_order.export'],
  social_insurance_specialist: ['work_order.view', 'work_order.export'],
  social_security_team: ['work_order.view', 'work_order.export'],
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
