import { DataSource } from 'typeorm';
import { Role, RoleLevel } from 'src/entities';

const roleSeeds: Array<{
  code: string;
  name: string;
  level: RoleLevel;
  description: string;
  isActive: boolean;
}> = [
  // 新版角色体系
  { code: 'admin', name: '系统管理员', level: RoleLevel.GLOBAL, description: '系统全局管理：用户管理、角色权限、派发规则、字段配置、操作日志、强制审批、查看所有工单与数据。', isActive: true },
  { code: 'biz_manager', name: '业务负责人', level: RoleLevel.MANAGEMENT, description: '公司业务全局视角：查看所有业务团队的工单统计与报表（只读），不可操作具体工单，用于决策分析。', isActive: true },
  { code: 'biz_leader', name: '业务组长', level: RoleLevel.SUPERVISOR, description: '管理本业务组：拥有业务员的所有操作权限（建单、导入、修改、发起撤回等），额外可查看本组所有业务员发起的工单列表与状态，不参与审批。', isActive: true },
  { code: 'biz_member', name: '业务员（组员）', level: RoleLevel.EXECUTION, description: '工单发起者：手工建单或批量导入；查看、修改、提交自己创建的工单；处理退回的工单；发起撤回/修改申请；查看个人看板。', isActive: true },
  { code: 'shared_leader', name: '共享团队负责人', level: RoleLevel.SUPERVISOR, description: '管理劳动合同签订和入离职联系两个模块：拥有合同专员和入离职联系专员的所有操作权限，并可查看团队所有工单、改派任务、审批本模块相关的撤回申请（当具体处理人缺失时）。', isActive: true },
  { code: 'contract_specialist', name: '合同专员', level: RoleLevel.EXECUTION, description: '处理劳动合同签订、续签合同、法定福利待遇申报等合同类工单：接单、补充字段、完成、退回。', isActive: true },
  { code: 'onboarding_specialist', name: '入离职联系专员', level: RoleLevel.EXECUTION, description: '处理入职联系、离职联系、离职证明等联系类工单：接单、补充字段、完成、退回。', isActive: true },
  { code: 'data_entry_leader', name: '数据录入组长', level: RoleLevel.EXECUTION, description: '处理所有入职工单的数据录入子工单：接单、补充字段、完成、退回。若未来有组员，则具备查看组员工单、改派等管理权限。目前为唯一执行人。', isActive: true },
  { code: 'social_insurance_specialist', name: '福保负责人', level: RoleLevel.SUPERVISOR, description: '福利保障部社保公积金办理负责人：处理入职社保公积金子工单，支持接单、完成、退回、批量办理和导入导出。', isActive: true },
];

export async function seedRoles(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(Role);

  // 1. 创建/更新新版角色
  for (const roleSeed of roleSeeds) {
    const existed = await repository.findOne({ where: { code: roleSeed.code } });

    if (existed) {
      continue;
    }

    await repository.save(repository.create(roleSeed));
  }

  // 2. 停用旧版角色（保留用于历史数据外键）
  const deprecatedRoleCodes = [
    'manager',
    'salesperson',
    'contract_team',
    'onboarding_team',
    'data_entry_team',
    'contract_supervisor',
    'onboarding_supervisor',
    'data_entry_supervisor',
    'business_owner',
    'business_group_leader',
    'business_group_member',
    'shared_team_owner',
    'labor_contract_member',
    'onboarding_resignation_member',
    'social_security_team',
    'social_security_supervisor',
  ];

  void deprecatedRoleCodes;
}
