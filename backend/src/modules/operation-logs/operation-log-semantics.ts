export interface OperationLogActionSemantic {
  label: string;
  actionLabel?: string;
  description: string;
  contextFields?: string[];
}

const statusContextFields = ['oldStatus', 'newStatus', 'reason'];
const assigneeContextFields = ['fromUserId', 'toUserId', 'handlerId', 'previousHandlerId', 'newHandlerId', 'reason'];
const dispatchContextFields = ['parentOrderId', 'dispatchedOrderId', 'moduleCode', 'toUserId', 'handlerId'];

export const OPERATION_LOG_ACTION_SEMANTICS: Record<string, OperationLogActionSemantic> = {
  // Admin / system audit entries kept for the original operation log page.
  'work_orders.batch-delete': { label: '批量删除主工单', description: '批量删除主工单记录' },
  'work_orders.delete': { label: '删除主工单', description: '删除主工单记录' },
  'dispatched_orders.batch-delete': { label: '批量删除子工单', description: '批量删除子工单记录' },
  'dispatched_orders.delete': { label: '删除子工单', description: '删除子工单记录' },
  'users.create': { label: '创建用户', description: '创建系统用户账号' },
  'users.update': { label: '更新用户', description: '修改系统用户资料' },
  'users.delete': { label: '删除用户', description: '删除系统用户账号' },
  'users.reset-password': { label: '重置密码', description: '重置用户登录密码并撤销现有会话' },
  'users.force-logout': { label: '强制下线', description: '撤销用户现有登录会话' },
  'auth.login_success': { label: '登录成功', description: '用户登录成功' },
  'auth.login_failed': { label: '登录失败', description: '用户登录凭据校验失败' },
  'auth.login_blocked': { label: '登录被锁定', description: '账号处于登录锁定期' },
  'auth.refresh_rejected': { label: '刷新令牌被拒绝', description: '刷新令牌因账号停用或会话撤销而失效' },
  'auth.change_password': { label: '修改密码', description: '用户修改本人登录密码并撤销旧会话' },
  'auth.change_password_failed': { label: '修改密码失败', description: '旧密码校验失败' },
  'auth.logout': { label: '退出登录', description: '用户退出并撤销现有会话' },
  'users.bind-role': { label: '绑定角色', description: '为用户绑定角色' },
  'users.unbind-role': { label: '解绑角色', description: '移除用户角色绑定' },
  'branches.create': { label: '创建分公司', description: '新增分公司配置' },
  'branches.update': { label: '更新分公司', description: '修改分公司配置' },
  'branches.delete': { label: '删除分公司', description: '删除分公司配置' },
  'departments.create': { label: '创建部门', description: '新增部门组织节点' },
  'departments.update': { label: '更新部门', description: '修改部门组织节点' },
  'departments.delete': { label: '删除部门', description: '删除部门组织节点' },
  'departments.move': { label: '移动部门', description: '调整部门组织层级' },
  'dispatch_rules.create': { label: '创建派发规则', description: '新增工单派发规则' },
  'dispatch_rules.update': { label: '更新派发规则', description: '修改工单派发规则' },
  'dispatch_rules.delete': { label: '删除派发规则', description: '删除工单派发规则' },
  'dispatch_rules.simulate': { label: '模拟派发规则', description: '执行派发规则模拟验证' },
  'ai-settings.update': { label: '更新 AI 设置', description: '修改 AI 相关系统设置' },
  'customer_assignees.create': { label: '创建客户负责人', description: '新增客户负责人配置' },
  'customer_assignees.update': { label: '更新客户负责人', description: '修改客户负责人配置' },
  'customer_assignees.delete': { label: '删除客户负责人', description: '删除客户负责人配置' },
  'roles.create': { label: '创建角色', description: '新增系统角色' },
  'roles.update': { label: '更新角色', description: '修改系统角色' },
  'roles.delete': { label: '删除角色', description: '删除系统角色' },
  'module_handlers.create': { label: '创建模块处理人', description: '新增模块处理人配置' },
  'module_handlers.update': { label: '更新模块处理人', description: '修改模块处理人配置' },
  'module_handlers.delete': { label: '删除模块处理人', description: '删除模块处理人配置' },
  'export_templates.apply': { label: '应用导出模板', description: '使用导出模板导出数据' },
  'export_templates.create': { label: '创建导出模板', description: '新增导出模板' },
  'export_templates.update': { label: '更新导出模板', description: '修改导出模板' },
  'export_templates.delete': { label: '删除导出模板', description: '删除导出模板' },
  'exception_module_handlers.create': { label: '创建例外模块处理人', description: '新增例外模块处理人配置' },
  'exception_module_handlers.update': { label: '更新例外模块处理人', description: '修改例外模块处理人配置' },
  'exception_module_handlers.delete': { label: '删除例外模块处理人', description: '删除例外模块处理人配置' },
  'field_configs.create': { label: '创建字段配置', description: '新增工单字段配置' },
  'field_configs.update': { label: '更新字段配置', description: '修改工单字段配置' },
  'field_configs.delete': { label: '删除字段配置', description: '删除工单字段配置' },
  'field_configs.reorder': { label: '字段排序', description: '调整字段展示顺序' },
  'customers.create': { label: '创建客户', description: '新增客户档案' },
  'customers.update': { label: '更新客户', description: '修改客户档案' },
  'customers.delete': { label: '删除客户', description: '删除客户档案' },
  'customers.toggle': { label: '启停客户', description: '切换客户启用状态' },
  'work_order_modules.upsert': { label: '保存工单模块', description: '新增或更新工单模块配置' },
  'work_order_modules.update': { label: '更新工单模块', description: '修改工单模块配置' },
  'module_fields.replace': { label: '替换模块字段', description: '替换模块可见字段配置' },
  'module_supervisors.upsert': { label: '保存模块主管', description: '新增或更新模块主管配置' },
  'action_configs.upsert': { label: '保存动作配置', description: '新增或更新模块动作配置' },
  'field_permissions.batch': { label: '批量配置字段权限', description: '批量保存字段权限配置' },
  'field_permissions.copy': { label: '复制字段权限', description: '复制字段权限配置' },

  // Work order timeline events.
  'work_order.create_draft': { label: '创建工单', description: '创建主工单草稿', contextFields: ['newStatus', 'createdBy'] },
  'work_order.update': { label: '更新工单', description: '修改主工单内容', contextFields: ['changedFields'] },
  'work_order.completed_modify': { label: '修改已完成工单', description: '修改已办结主工单内容', contextFields: ['changedFields'] },
  'work_order.submit': { label: '提交工单', description: '提交主工单并触发派发', contextFields: statusContextFields },
  'work_order.resubmit_after_return': { label: '退回后重提', description: '主工单被退回后重新提交', contextFields: statusContextFields },
  'work_order.salesperson_modify_resubmit': { label: '业务员修改后重提', description: '业务员编辑办理中或退回工单后强制重新提交', contextFields: statusContextFields },
  'work_order.returned': { label: '工单被退回', description: '子工单退回导致主工单进入退回状态', contextFields: ['oldStatus', 'newStatus', 'reason', 'dispatchedOrderId', 'moduleCode'] },
  'work_order.close': { label: '关闭工单', description: '所有子工单完成后主工单关闭', contextFields: ['oldStatus', 'newStatus', 'completedAt'] },
  'work_order.closed': { label: '关闭工单', description: '所有子工单完成后主工单关闭', contextFields: ['oldStatus', 'newStatus', 'completedAt'] },
  'work_order.delete': { label: '删除主工单', description: '删除主工单记录' },
  'work_order.withdraw': { label: '撤回工单', description: '提交人撤回主工单', contextFields: statusContextFields },
  'work_order.dispatched': { label: '工单已派发', description: '主工单派发生成子工单', contextFields: dispatchContextFields },
  'work_order.assignee_assigned': { label: '负责人赋予', description: '为工单设置负责人', contextFields: assigneeContextFields },
  'work_order.assignee_changed': { label: '负责人变更', description: '变更工单负责人', contextFields: assigneeContextFields },
  'work_order.status_changed': { label: '状态变更', description: '主工单状态发生变化', contextFields: statusContextFields },
  'work_order.escalated': { label: '工单升级', description: '工单升级或越级处理', contextFields: ['fromUserId', 'toUserId', 'reason', 'level'] },
  'work_order.evaluate': { label: '工单评价', description: '提交人对工单处理结果评价', contextFields: ['rating', 'comment'] },
  'work_order.comment': { label: '新增评论', description: '工单新增评论', contextFields: ['commentId', 'content'] },
  'work_order.attachment_added': { label: '添加附件', description: '工单新增附件', contextFields: ['attachmentId', 'fileId', 'fileName'] },
  'work_order.dirty_mark_created': { label: '创建脏字段提醒', description: '业务侧修改后创建待确认字段提醒', contextFields: ['fields', 'count'] },

  // Dispatched order timeline events.
  'dispatched_order.dispatched': { label: '子工单派发', description: '主工单派发或重提时生成/重置子工单', contextFields: dispatchContextFields },
  'dispatched_order.accept': { label: '接单', description: '处理人接收子工单', contextFields: assigneeContextFields },
  'dispatched_order.claim': { label: '认领子工单', description: '从待认领池认领子工单', contextFields: assigneeContextFields },
  'dispatched_order.complete': { label: '完成子工单', description: '处理并完成子工单', contextFields: ['oldStatus', 'newStatus', 'remark', 'completionRemark'] },
  'dispatched_order.return': { label: '退回子工单', description: '退回处理中子工单', contextFields: ['oldStatus', 'newStatus', 'returnReason', 'returnedFields'] },
  'dispatched_order.return_completed': { label: '退回已完成子工单', description: '退回已经完成的子工单', contextFields: ['oldStatus', 'newStatus', 'returnReason', 'returnedFields'] },
  'dispatched_order.feedback': { label: '反馈办理结果', description: '更新子工单办理结果' },
  'dispatched_order.creator_modify_request': { label: '申请修改', description: '业务员提交字段修改申请', contextFields: ['reason', 'previousStatus', 'status', 'pendingFields'] },
  'dispatched_order.creator_modify_approved': { label: '同意修改', description: '后道同意业务员的字段修改申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_modify_rejected': { label: '拒绝修改', description: '后道拒绝业务员的字段修改申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_update_fields': { label: '修改工单', description: '业务员修改子工单字段', contextFields: ['reason', 'fields', 'diff'] },
  'dispatched_order.creator_withdraw_direct_before_accept': { label: '撤回子工单', description: '业务员在接单前直接撤回子工单', contextFields: ['reason', 'previousStatus', 'status'] },
  'dispatched_order.creator_withdraw_request': { label: '申请撤回', description: '业务员提交子工单撤回申请', contextFields: ['reason', 'previousStatus', 'status'] },
  'dispatched_order.creator_withdraw_approved': { label: '同意撤回', description: '后道同意业务员的撤回申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_withdraw_rejected': { label: '拒绝撤回', description: '后道拒绝业务员的撤回申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_void_direct_before_accept': { label: '作废子工单', description: '业务员在接单前直接作废子工单', contextFields: ['reason', 'previousStatus', 'status'] },
  'dispatched_order.creator_void_direct': { label: '作废子工单', description: '业务员撤回后直接作废子工单', contextFields: ['reason', 'previousStatus', 'status'] },
  'dispatched_order.creator_void_request': { label: '申请作废', description: '业务员提交子工单作废申请', contextFields: ['reason', 'previousStatus', 'status'] },
  'dispatched_order.creator_void_approved': { label: '同意作废', description: '后道同意业务员的作废申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_void_rejected': { label: '拒绝作废', description: '后道拒绝业务员的作废申请', contextFields: ['comment', 'previousStatus', 'status'] },
  'dispatched_order.creator_restore_void': { label: '撤销作废', description: '业务员恢复已作废子工单' },
  'dispatched_order.creator_resubmit': { label: '重新提交', description: '业务员重新提交退回、撤回或作废的子工单', contextFields: ['reason', 'previousStatus', 'status', 'fields'] },
  'dispatched_order.creator_urge': { label: '催办', description: '业务员催办子工单', contextFields: ['reason'] },
  'dispatched_order.backend_urge_creator': { label: '提醒业务员', description: '后道提醒业务员处理子工单', contextFields: ['reason'] },
  'dispatched_order.social_insurance_batch_complete': { label: '社保批量完成', description: '批量完成社保公积金子工单', contextFields: ['oldStatus', 'newStatus', 'remark'] },
  'dispatched_order.reassign': { label: '改派子工单', description: '重新分配子工单处理人', contextFields: assigneeContextFields },
  'dispatched_order.benefit_stage_transition': { label: '福利阶段流转', description: '更新福利业务办理阶段', contextFields: ['previousStage', 'currentStage', 'payload'] },
  'dispatched_order.delete': { label: '删除子工单', description: '删除子工单记录' },
  'dispatched_order.dirty_confirm_read': { label: '确认字段变更', description: '确认已阅读字段变更提醒', contextFields: ['cleared', 'clearReason'] },
  'dispatched_order.status_changed': { label: '状态变更', description: '子工单状态发生变化', contextFields: statusContextFields },
  'dispatched_order.assignee_assigned': { label: '负责人赋予', description: '为子工单设置处理人', contextFields: assigneeContextFields },
  'dispatched_order.assignee_changed': { label: '负责人变更', description: '变更子工单处理人', contextFields: assigneeContextFields },
  'dispatched_order.escalated': { label: '子工单升级', description: '子工单升级或越级处理', contextFields: ['fromUserId', 'toUserId', 'reason', 'level'] },
  'dispatched_order.evaluate': { label: '子工单评价', description: '对子工单处理结果评价', contextFields: ['rating', 'comment'] },
  'dispatched_order.comment': { label: '新增评论', description: '子工单新增评论', contextFields: ['commentId', 'content'] },
  'dispatched_order.attachment_added': { label: '添加附件', description: '子工单新增附件', contextFields: ['attachmentId', 'fileId', 'fileName'] },
  'export_template.apply_export_template': { label: '应用导出模板', description: '使用导出模板导出工单数据' },
  'dispatched_order.apply_export_template': { label: '导出子工单', description: '使用模板导出子工单数据' },
};

export const OPERATION_LOG_ENTITY_SEMANTICS: Record<string, string> = {
  auth: '认证',
  ticket: '工单',
  tickets: '工单',
  work_order: '主工单',
  work_orders: '主工单',
  dispatched_order: '子工单',
  dispatched_orders: '子工单',
  users: '用户',
  branches: '分公司',
  departments: '部门',
  dispatch_rules: '派发规则',
  'ai-settings': 'AI 设置',
  customer_assignees: '客户负责人',
  roles: '角色',
  module_handlers: '模块处理人',
  export_templates: '导出模板',
  export_template: '导出模板',
  exception_module_handlers: '例外模块处理人',
  field_configs: '字段配置',
  customers: '客户',
  work_order_modules: '工单模块',
  module_fields: '模块字段',
  module_supervisors: '模块主管',
  action_configs: '动作配置',
  field_permissions: '字段权限',
};

export function toOperationLogActionCode(entityType: string, actionType: string): string {
  return `${entityType}.${actionType}`;
}

export function humanizeActionCode(code: string): string {
  const semantic = OPERATION_LOG_ACTION_SEMANTICS[code];
  return semantic?.actionLabel ?? semantic?.label ?? code;
}

export function describeActionCode(code: string): string {
  return OPERATION_LOG_ACTION_SEMANTICS[code]?.description ?? code;
}

export function getOperationLogContextFields(code: string): string[] {
  return OPERATION_LOG_ACTION_SEMANTICS[code]?.contextFields ?? [];
}

export function humanizeEntityType(type: string): string {
  return OPERATION_LOG_ENTITY_SEMANTICS[type] ?? type;
}
