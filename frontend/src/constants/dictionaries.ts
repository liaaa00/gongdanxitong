export const WORK_ORDER_STATUS_CODES = [
  'processing',
  'completed',
  'returned',
  'withdrawn',
  'void',
  'withdraw_pending',
  'void_pending',
] as const;

export type WorkOrderStatusCode = (typeof WORK_ORDER_STATUS_CODES)[number];

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '未办结', color: 'default' },
  pending: { label: '处理中', color: 'processing' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'success' },
  returned: { label: '已退回', color: 'warning' },
  withdrawn: { label: '已撤回', color: 'default' },
  withdraw_pending: { label: '撤回审批中', color: 'gold' },
  void_pending: { label: '作废审批中', color: 'gold' },
  void: { label: '已作废', color: 'default' },

  // 子工单/历史状态兼容：不属于主工单状态机，但复用通用展示函数。
  accepted: { label: '处理中', color: 'blue' },
  cancelled: { label: '已作废', color: 'default' },
  skipped: { label: '本次不生成', color: 'default' },
};

export const STATUS_TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([code, item]) => [code, item.label]),
);

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([code, item]) => [code, item.color]),
);

export const PERMISSION_TEXT: Record<string, string> = {
  visible: '可编辑',
  editable: '可编辑',
  readonly: '只读',
  hidden: '隐藏',
  masked: '脱敏',
};

export const FIELD_TYPE_TEXT: Record<string, string> = {
  text: '文本',
  textarea: '多行文本',
  number: '数字',
  money: '金额',
  date: '日期',
  month: '月份',
  select: '单选',
  multi_select: '多选',
  boolean: '是/否',
  user: '人员',
  attachment: '附件',
};

export const ACTION_TEXT: Record<string, string> = {
  claim: '接单',
  complete: '完成',
  batch_complete: '批量完成',
  return: '退回',
  return_completed: '退回已完成节点',
  confirm_read: '确认已阅',
  export: '导出',
};

export const STRATEGY_TEXT: Record<string, string> = {
  fixed: '固定负责人',
  pool: '固定负责人 + AB角',
  round_robin: '轮询分派',
  module_handler: '按模块负责人',
};

export function getStatusText(code?: string | null): string {
  if (!code) return '状态未知';
  return STATUS_TEXT[code] || '状态未知';
}

export function getStatusColor(code?: string | null): string {
  if (!code) return 'default';
  return STATUS_COLOR[code] || 'default';
}

export function getPermissionText(code?: string | null): string {
  if (!code) return '权限未知';
  return PERMISSION_TEXT[code] || '权限未知';
}
