import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface DispatchRuleItem {
  id: string;
  rule_name: string;
  order_type: string;
  trigger_conditions: unknown;
  target_module: string;
  /** ★ new: sub_module (contact/contract/data_entry) */
  sub_module?: string;
  dispatch_strategy: string;
  /** ★ new: 按客户维度匹配 */
  customer_id?: string;
  /** ★ new: 按业务组维度匹配 */
  department_id?: string;
  /** ★ new: 指定负责人 */
  assignee_user_id?: string;
  /** ★ new: AB角回退人 */
  fallback_user_id?: string;
  /** ★ new: 是否允许手动调整 */
  allow_manual_override?: boolean;
  is_active: boolean;
  priority: number;
}

const KEY = 'mock_admin_dispatch_rules_v2'; // ★ v2: try-catch 防御
const SEED: DispatchRuleItem[] = [
  { id: '1', rule_name: '入职→数据录入', order_type: 'onboarding', trigger_conditions: { operator: 'AND', conditions: [] }, target_module: 'data_entry', dispatch_strategy: 'pool', is_active: true, priority: 10 },
  { id: '2', rule_name: '入职→入职联系', order_type: 'onboarding', trigger_conditions: { operator: 'AND', conditions: [{ type: 'leaf', field: 'need_onboarding_contact', operator: 'eq', value: '是' }] }, target_module: 'onboarding_contact', dispatch_strategy: 'pool', is_active: true, priority: 20 },
  { id: '3', rule_name: '入职→劳动合同签订', order_type: 'onboarding', trigger_conditions: { operator: 'AND', conditions: [] }, target_module: 'contract', dispatch_strategy: 'pool', is_active: true, priority: 30 },
  { id: '4', rule_name: '续签→劳动合同签订', order_type: 'renewal', trigger_conditions: { operator: 'AND', conditions: [] }, target_module: 'contract', dispatch_strategy: 'pool', is_active: true, priority: 10 },
  { id: '5', rule_name: '离职→社保停保', order_type: 'resignation', trigger_conditions: { operator: 'AND', conditions: [] }, target_module: 'data_entry', dispatch_strategy: 'pool', is_active: true, priority: 10 },
  { id: '6', rule_name: '待遇申报→数据录入', order_type: 'benefit', trigger_conditions: { operator: 'AND', conditions: [] }, target_module: 'data_entry', dispatch_strategy: 'pool', is_active: true, priority: 10 },
];

const store = () => loadList<DispatchRuleItem>(KEY, SEED);
const commit = (l: DispatchRuleItem[]) => saveList(KEY, l);

export async function getDispatchRules(orderType?: string): Promise<DispatchRuleItem[]> {
  if (isMockMode) {
    const list = store();
    return mockDelay(orderType ? list.filter((r) => r.order_type === orderType) : list);
  }
  try {
    const result = await request.get('/admin/dispatch-rules', { params: { orderType, order_type: orderType } }) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    return (Array.isArray(rawList) ? rawList : []).map(normalizeRule);
  } catch {
    return [];
  }
}

function normalizeRule(r: any): DispatchRuleItem {
  return {
    id: String(r.id ?? ''),
    rule_name: r.rule_name ?? r.ruleName ?? '',
    order_type: r.order_type ?? r.orderType ?? '',
    trigger_conditions: r.trigger_conditions ?? r.triggerConditions ?? null,
    target_module: r.target_module ?? r.targetModule ?? '',
    sub_module: r.sub_module ?? r.subModule,
    dispatch_strategy: r.dispatch_strategy ?? r.dispatchStrategy ?? 'pool',
    customer_id: r.customer_id ?? r.customerId,
    department_id: r.department_id ?? r.departmentId,
    assignee_user_id: r.assignee_user_id ?? r.assigneeUserId,
    fallback_user_id: r.fallback_user_id ?? r.fallbackUserId,
    allow_manual_override: r.allow_manual_override ?? r.allowManualOverride,
    is_active: r.is_active ?? r.isActive ?? true,
    priority: r.priority ?? 10,
  };
}

export async function createDispatchRule(data: Partial<DispatchRuleItem>): Promise<DispatchRuleItem> {
  if (isMockMode) {
    const list = store();
    const item: DispatchRuleItem = {
      id: nextId(list),
      rule_name: data.rule_name || '',
      order_type: data.order_type || 'onboarding',
      trigger_conditions: data.trigger_conditions ?? null,
      target_module: data.target_module || data.sub_module || 'data_entry',
      sub_module: data.sub_module,
      dispatch_strategy: data.dispatch_strategy || 'pool',
      customer_id: data.customer_id,
      department_id: data.department_id,
      assignee_user_id: data.assignee_user_id,
      fallback_user_id: data.fallback_user_id,
      allow_manual_override: data.allow_manual_override,
      is_active: data.is_active ?? true,
      priority: data.priority ?? 10,
    };
    list.push(item); commit(list);
    return mockDelay(item);
  }
  return request.post('/admin/dispatch-rules', packDispatchRule(data)) as Promise<DispatchRuleItem>;
}

function packDispatchRule(data: Partial<DispatchRuleItem>): Record<string, unknown> {
  // 后端 CreateDispatchRuleDto 只接受 camelCase 核心字段，其它字段被 whitelist 拦截
  const body: Record<string, unknown> = {};
  if (data.rule_name !== undefined) body.ruleName = data.rule_name;
  if (data.order_type !== undefined) body.orderType = data.order_type;
  if (data.target_module !== undefined || data.sub_module !== undefined) body.targetModule = data.target_module ?? data.sub_module;
  if (data.trigger_conditions !== undefined) body.triggerConditions = data.trigger_conditions;
  if (data.dispatch_strategy !== undefined) body.dispatchStrategy = data.dispatch_strategy;
  if (data.sub_module !== undefined) body.subModule = data.sub_module;
  if (data.customer_id !== undefined) body.customerId = data.customer_id;
  if (data.department_id !== undefined) body.departmentId = data.department_id;
  if (data.assignee_user_id !== undefined) body.assigneeUserId = data.assignee_user_id;
  if (data.fallback_user_id !== undefined) body.fallbackUserId = data.fallback_user_id;
  if (data.allow_manual_override !== undefined) body.allowManualOverride = data.allow_manual_override;
  if (data.priority !== undefined) body.priority = data.priority;
  if (data.is_active !== undefined) body.isActive = data.is_active;
  return body;
}

export async function updateDispatchRule(id: string, data: Partial<DispatchRuleItem>): Promise<DispatchRuleItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('规则不存在')));
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/dispatch-rules/${id}`, packDispatchRule(data)) as Promise<DispatchRuleItem>;
}

export async function deleteDispatchRule(id: string): Promise<void> {
  if (isMockMode) {
    commit(store().filter((r) => r.id !== id));
    return mockDelay(undefined);
  }
  return request.delete(`/admin/dispatch-rules/${id}`) as Promise<void>;
}
