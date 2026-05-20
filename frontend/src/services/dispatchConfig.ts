import request from './request';

export type DispatchConfigSource = 'handlers' | 'rules';

export interface DispatchConfigPerson {
  id?: string;
  user_id?: string;
  userId?: string;
  name?: string;
  displayName?: string | null;
  real_name?: string;
  realName?: string;
  username?: string;
}

export interface DispatchConfigItem {
  id: string;
  source: DispatchConfigSource;
  module?: string;
  module_code?: string;
  moduleCode?: string;
  sub_module?: string;
  subModule?: string;
  customer_id?: string;
  customerId?: string;
  customer_name?: string;
  customerName?: string;
  primary?: DispatchConfigPerson | string | null;
  backup1?: DispatchConfigPerson | string | null;
  backup2?: DispatchConfigPerson | string | null;
  handler_id?: string;
  handlerId?: string;
  handler_name?: string;
  handlerName?: string;
  weight?: number;
  is_backup?: boolean;
  isBackup?: boolean;
  is_active?: boolean;
  isActive?: boolean;
  rule_name?: string;
  ruleName?: string;
  order_type?: string;
  orderType?: string;
  trigger_conditions?: unknown;
  triggerConditions?: unknown;
  target_module?: string;
  targetModule?: string;
  dispatch_strategy?: string;
  dispatchStrategy?: string;
  department_id?: string;
  departmentId?: string;
  assignee_user_id?: string;
  assigneeUserId?: string;
  fallback_user_id?: string;
  fallbackUserId?: string;
  allow_manual_override?: boolean;
  allowManualOverride?: boolean;
  priority?: number;
}

function normalizeDispatchConfigItem(item: any): DispatchConfigItem {
  const advanced = item.advanced || {};
  const targetModule = item.target_module ?? item.targetModule ?? item.module ?? item.module_code ?? item.moduleCode;
  const subModule = item.sub_module ?? item.subModule ?? targetModule;
  const dispatchStrategy = item.dispatch_strategy ?? item.dispatchStrategy ?? advanced.strategy ?? advanced.dispatchStrategy;
  const orderType = item.order_type ?? item.orderType ?? advanced.orderType ?? advanced.order_type;
  const triggerConditions = item.trigger_conditions ?? item.triggerConditions ?? advanced.triggerConditions ?? advanced.trigger_conditions;
  const allowManualOverride = item.allow_manual_override ?? item.allowManualOverride ?? advanced.allowManualOverride ?? advanced.allow_manual_override;
  const isActive = item.is_active ?? item.isActive ?? advanced.isActive ?? advanced.is_active;

  return {
    ...item,
    id: item.id ?? item.ID ?? `${item.source || 'config'}-${targetModule || subModule || ''}-${item.customer_id || item.customerId || 'all'}`,
    source: item.source === 'rules' ? 'rules' : 'handlers',
    module: item.module ?? item.module_name ?? item.moduleName ?? targetModule,
    module_code: item.module_code ?? item.moduleCode ?? targetModule,
    moduleCode: item.moduleCode ?? item.module_code ?? targetModule,
    sub_module: subModule,
    subModule,
    customer_id: item.customer_id ?? item.customerId,
    customerId: item.customerId ?? item.customer_id,
    customer_name: item.customer_name ?? item.customerName,
    customerName: item.customerName ?? item.customer_name,
    primary: item.primary ?? null,
    backup1: item.backup1 ?? null,
    backup2: item.backup2 ?? null,
    rule_name: item.rule_name ?? item.ruleName ?? advanced.ruleName ?? advanced.rule_name,
    ruleName: item.ruleName ?? item.rule_name ?? advanced.ruleName ?? advanced.rule_name,
    order_type: orderType,
    orderType,
    trigger_conditions: triggerConditions,
    triggerConditions,
    target_module: targetModule,
    targetModule,
    dispatch_strategy: dispatchStrategy,
    dispatchStrategy,
    department_id: item.department_id ?? item.departmentId ?? advanced.departmentId ?? advanced.department_id,
    departmentId: item.departmentId ?? item.department_id ?? advanced.departmentId ?? advanced.department_id,
    assignee_user_id: item.assignee_user_id ?? item.assigneeUserId,
    assigneeUserId: item.assigneeUserId ?? item.assignee_user_id,
    fallback_user_id: item.fallback_user_id ?? item.fallbackUserId,
    fallbackUserId: item.fallbackUserId ?? item.fallback_user_id,
    allow_manual_override: allowManualOverride,
    allowManualOverride,
    priority: item.priority ?? advanced.priority,
    is_active: isActive,
    isActive,
  } as DispatchConfigItem;
}

export async function getDispatchConfig(): Promise<DispatchConfigItem[]> {
  const result = await request.get('/admin/dispatch-config') as any;
  const rawList = Array.isArray(result) ? result : (result?.rows || result?.list || result?.items || result?.data || []);
  return (Array.isArray(rawList) ? rawList : []).map((item) => normalizeDispatchConfigItem(item));
}
