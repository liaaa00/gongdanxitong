import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';

export type WorkflowNodeType = 'start' | 'process' | 'approval' | 'end';

export interface WorkflowFieldBindingConfig {
  visible_fields?: string[];
  editable_fields?: string[];
  action_buttons?: string[];
  [key: string]: unknown;
}

export interface WorkflowReminderConfig {
  enabled?: boolean;
  before_hours?: number;
  channels?: string[];
  repeat_hours?: number;
}

export interface WorkflowReturnRuleConfig {
  allow_return?: boolean;
  return_to?: string;
  require_reason?: boolean;
  allow_return_completed?: boolean;
}

export interface WorkflowAssigneeConfig {
  strategy?: 'role' | 'fixed_user' | 'module_pool' | 'creator_manager';
  role?: string;
  user_id?: string;
  module_code?: string;
}

export interface WorkflowGenerationConditionConfig {
  field?: string;
  operator?: 'eq' | 'ne' | 'contains' | 'not_empty' | 'empty';
  value?: string;
}

export interface WorkflowGenerationRuleConfig {
  /** always=默认生成；condition=满足条件生成；manual=人工确认；disabled=暂不生成 */
  mode?: 'always' | 'condition' | 'manual' | 'disabled';
  /** all=全部条件满足；any=任一条件满足 */
  match_mode?: 'all' | 'any';
  conditions?: WorkflowGenerationConditionConfig[];
  description?: string;
  expression?: string;
  fields?: string[];
}

export interface WorkflowNodeConfig {
  id: string;
  type: WorkflowNodeType;
  label: string;
  module_code?: string;
  generation_rule?: WorkflowGenerationRuleConfig;
  assignee_role?: string;
  assignee?: WorkflowAssigneeConfig;
  sla_hours?: number;
  reminder?: WorkflowReminderConfig;
  return_rule?: WorkflowReturnRuleConfig;
  auto_dispatch?: boolean;
  position?: { x: number; y: number };
  form_schema?: WorkflowFieldBindingConfig;
}

export interface WorkflowEdgeConfig {
  id: string;
  source: string;
  target: string;
  condition?: string;
  condition_expression?: string;
  condition_fields?: string[];
  priority?: number;
}

export interface WorkflowDefinitionJson {
  nodes: WorkflowNodeConfig[];
  edges: WorkflowEdgeConfig[];
}

export interface WorkflowItem {
  id: string;
  name: string;
  order_type: string;
  version?: number;
  status: 'draft' | 'published' | 'active' | 'archived' | string;
  definition_json: WorkflowDefinitionJson;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  [key: string]: unknown;
}

const DEFAULT_DEFINITION: WorkflowDefinitionJson = {
  nodes: [
    { id: 'start', type: 'start', label: '开始', auto_dispatch: true, position: { x: 40, y: 160 }, form_schema: { visible_fields: [], editable_fields: [], action_buttons: ['submit'] } },
    {
      id: 'data_entry', type: 'process', label: '增员报岗录入', module_code: 'data_entry',
      generation_rule: { mode: 'always', description: '入职工单提交后默认生成增员报岗录入子工单', expression: 'true' }, assignee_role: 'data_entry_leader',
      assignee: { strategy: 'role', role: 'data_entry_leader', module_code: 'data_entry' }, sla_hours: 24,
      reminder: { enabled: true, before_hours: 4, repeat_hours: 8, channels: ['in_app'] },
      return_rule: { allow_return: true, return_to: 'start', require_reason: true, allow_return_completed: true },
      position: { x: 280, y: 60 }, form_schema: { visible_fields: ['employee_name', 'id_card_no', 'mobile'], editable_fields: ['employee_name', 'id_card_no', 'mobile'], action_buttons: ['complete', 'return'] },
    },
    {
      id: 'contract', type: 'approval', label: '劳动合同新签', module_code: 'contract',
      generation_rule: { mode: 'condition', match_mode: 'all', conditions: [{ field: 'need_company_contract', operator: 'eq', value: '是' }], description: '当需要企服发起劳动合同时生成劳动合同新签子工单', expression: 'need_company_contract == "是"', fields: ['need_company_contract'] }, assignee_role: 'labor_contract_member',
      assignee: { strategy: 'role', role: 'labor_contract_member', module_code: 'contract' }, sla_hours: 48,
      reminder: { enabled: true, before_hours: 8, repeat_hours: 12, channels: ['in_app'] },
      return_rule: { allow_return: true, return_to: 'data_entry', require_reason: true, allow_return_completed: true },
      position: { x: 280, y: 220 }, form_schema: { visible_fields: ['employee_name', 'contract_start_date', 'contract_end_date'], editable_fields: ['contract_feedback'], action_buttons: ['complete', 'return'] },
    },
    {
      id: 'onboarding_contact', type: 'process', label: '入职联系', module_code: 'onboarding_contact',
      generation_rule: { mode: 'condition', match_mode: 'all', conditions: [{ field: 'need_onboarding_contact', operator: 'eq', value: '是' }], description: '当入职材料需要集约收集时生成入职联系子工单', expression: 'need_onboarding_contact == "是"', fields: ['need_onboarding_contact'] }, assignee_role: 'onboarding_resignation_member',
      assignee: { strategy: 'role', role: 'onboarding_resignation_member', module_code: 'onboarding_contact' }, sla_hours: 24,
      reminder: { enabled: true, before_hours: 4, repeat_hours: 8, channels: ['in_app'] },
      return_rule: { allow_return: true, return_to: 'data_entry', require_reason: true },
      position: { x: 520, y: 60 }, form_schema: { visible_fields: ['employee_name', 'mobile'], editable_fields: ['onboarding_feedback'], action_buttons: ['complete', 'return'] },
    },
    {
      id: 'social_insurance', type: 'process', label: '社保公积金增员', module_code: 'social_insurance',
      generation_rule: { mode: 'always', description: '入职工单提交后默认生成社保公积金增员子工单', expression: 'true' }, assignee_role: 'social_insurance_specialist',
      assignee: { strategy: 'role', role: 'social_insurance_specialist', module_code: 'social_insurance' }, sla_hours: 48,
      reminder: { enabled: true, before_hours: 8, repeat_hours: 12, channels: ['in_app'] },
      return_rule: { allow_return: true, return_to: 'data_entry', require_reason: true },
      position: { x: 520, y: 220 }, form_schema: { visible_fields: ['employee_name', 'social_location', 'social_base', 'fund_base'], editable_fields: ['social_location', 'social_base', 'fund_base'], action_buttons: ['complete', 'return'] },
    },
    { id: 'end', type: 'end', label: '结束', position: { x: 780, y: 160 }, form_schema: { visible_fields: [], editable_fields: [], action_buttons: [] } },
  ],
  edges: [
    { id: 'start-data_entry', source: 'start', target: 'data_entry', condition: '提交后派发', condition_expression: 'status == "submitted"', priority: 1 },
    { id: 'data_entry-contract', source: 'data_entry', target: 'contract', condition: '需要企服发起劳动合同', condition_expression: 'need_company_contract == "是"', condition_fields: ['need_company_contract'], priority: 10 },
    { id: 'data_entry-onboarding_contact', source: 'data_entry', target: 'onboarding_contact', condition: '需要入职材料集约收集', condition_expression: 'need_onboarding_contact == "是"', condition_fields: ['need_onboarding_contact'], priority: 20 },
    { id: 'data_entry-social_insurance', source: 'data_entry', target: 'social_insurance', condition: '固定生成社保公积金增员', condition_expression: 'true', priority: 30 },
    { id: 'contract-end', source: 'contract', target: 'end', condition: '签约完成', condition_expression: 'node.status == "completed"', priority: 10 },
    { id: 'onboarding_contact-end', source: 'onboarding_contact', target: 'end', condition: '入职联系完成', condition_expression: 'node.status == "completed"', priority: 20 },
    { id: 'social_insurance-end', source: 'social_insurance', target: 'end', condition: '社保公积金增员完成', condition_expression: 'node.status == "completed"', priority: 30 },
  ],
};

let mockWorkflows: WorkflowItem[] = [
  {
    id: 'workflow-onboarding-default',
    name: '入职工单默认流程',
    order_type: 'onboarding',
    version: 1,
    status: 'draft',
    definition_json: DEFAULT_DEFINITION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    published_at: null,
  },
];

function unwrapList(raw: unknown): WorkflowItem[] {
  if (Array.isArray(raw)) return raw.map(normalizeWorkflow);
  const row = (raw || {}) as Record<string, unknown>;
  const list = row.list || row.items || row.data || row.workflows || [];
  return Array.isArray(list) ? list.map(normalizeWorkflow) : [];
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeFieldBinding(raw: unknown): WorkflowFieldBindingConfig {
  const row = (raw || {}) as Record<string, unknown>;
  return {
    ...row,
    visible_fields: normalizeStringArray(row.visible_fields ?? row.visibleFields),
    editable_fields: normalizeStringArray(row.editable_fields ?? row.editableFields),
    action_buttons: normalizeStringArray(row.action_buttons ?? row.actionButtons),
  };
}

function normalizeDefinition(raw: unknown): WorkflowDefinitionJson {
  if (typeof raw === 'string') {
    try { return normalizeDefinition(JSON.parse(raw)); } catch { return { nodes: [], edges: [] }; }
  }
  const value = (raw || {}) as Partial<WorkflowDefinitionJson>;
  return {
    nodes: Array.isArray(value.nodes) ? value.nodes.map((node) => {
      const row = (node || {}) as WorkflowNodeConfig;
      return { ...row, id: String(row.id), type: row.type || 'process', label: String(row.label || row.id || '未命名节点'), form_schema: normalizeFieldBinding(row.form_schema) };
    }) : [],
    edges: Array.isArray(value.edges) ? value.edges.map((edge) => {
      const row = (edge || {}) as WorkflowEdgeConfig;
      return {
        ...row,
        id: String(row.id),
        source: String(row.source),
        target: String(row.target),
        condition: row.condition ? String(row.condition) : '',
        condition_expression: row.condition_expression ? String(row.condition_expression) : undefined,
        condition_fields: normalizeStringArray(row.condition_fields),
        priority: row.priority === undefined ? undefined : Number(row.priority),
      };
    }) : [],
  };
}

function normalizeWorkflow(raw: unknown): WorkflowItem {
  const row = (raw || {}) as Record<string, unknown>;
  return {
    ...(row as WorkflowItem),
    id: String(row.id ?? ''),
    name: String(row.name ?? row.workflow_name ?? row.workflowName ?? '未命名流程'),
    order_type: String(row.order_type ?? row.orderType ?? 'onboarding'),
    version: row.version === undefined ? undefined : Number(row.version),
    status: String(row.status ?? 'draft'),
    description: (row.description ?? null) as string | null,
    definition_json: normalizeDefinition(row.definition_json ?? row.definitionJson ?? row.definition ?? DEFAULT_DEFINITION),
    created_at: (row.created_at ?? row.createdAt) as string | undefined,
    updated_at: (row.updated_at ?? row.updatedAt) as string | undefined,
    published_at: (row.published_at ?? row.publishedAt ?? null) as string | null,
  };
}

export function createDefaultWorkflowDefinition(): WorkflowDefinitionJson {
  return JSON.parse(JSON.stringify(DEFAULT_DEFINITION)) as WorkflowDefinitionJson;
}

export async function getWorkflows(params: PageParams = {}): Promise<PageResult<WorkflowItem>> {
  if (isMockMode) {
    let list = [...mockWorkflows];
    if (params.orderType || params.order_type) {
      const type = String(params.orderType || params.order_type);
      list = list.filter((item) => item.order_type === type);
    }
    if (params.status) {
      const status = String(params.status);
      list = list.filter((item) => item.status === status);
    }
    return mockDelay({ list, total: list.length, page: 1, pageSize: list.length || 20, totalPages: 1, success: true });
  }
  const raw = await request.get('/admin/workflows', { params });
  const list = unwrapList(raw);
  return { list, total: list.length, page: 1, pageSize: list.length || 20, totalPages: 1, success: true };
}

export async function getWorkflow(id: string): Promise<WorkflowItem> {
  if (isMockMode) {
    return mockDelay(mockWorkflows.find((item) => item.id === id) || mockWorkflows[0]);
  }
  return normalizeWorkflow(await request.get(`/admin/workflows/${id}`));
}

export async function createWorkflow(data: Partial<WorkflowItem>): Promise<WorkflowItem> {
  if (isMockMode) {
    const now = new Date().toISOString();
    const item: WorkflowItem = {
      id: `workflow-${Date.now()}`,
      name: data.name || '新建工单流程',
      order_type: data.order_type || 'onboarding',
      version: 1,
      status: 'draft',
      definition_json: data.definition_json || createDefaultWorkflowDefinition(),
      description: data.description ?? null,
      created_at: now,
      updated_at: now,
      published_at: null,
    };
    mockWorkflows = [item, ...mockWorkflows];
    return mockDelay(item);
  }
  return normalizeWorkflow(await request.post('/admin/workflows', {
    name: data.name,
    orderType: data.order_type,
    description: data.description,
    definitionJson: data.definition_json,
  }));
}

export async function updateWorkflow(id: string, data: Partial<WorkflowItem>): Promise<WorkflowItem> {
  if (isMockMode) {
    const idx = mockWorkflows.findIndex((item) => item.id === id);
    const next = normalizeWorkflow({ ...(mockWorkflows[idx] || {}), ...data, id, status: data.status || mockWorkflows[idx]?.status || 'draft', updated_at: new Date().toISOString() });
    if (idx >= 0) mockWorkflows[idx] = next;
    return mockDelay(next);
  }
  return normalizeWorkflow(await request.put(`/admin/workflows/${id}`, {
    name: data.name,
    orderType: data.order_type,
    description: data.description,
    definitionJson: data.definition_json,
  }));
}

export async function publishWorkflow(id: string, definitionJson?: WorkflowDefinitionJson): Promise<WorkflowItem> {
  if (isMockMode) {
    const idx = mockWorkflows.findIndex((item) => item.id === id);
    const now = new Date().toISOString();
    const next = normalizeWorkflow({ ...(mockWorkflows[idx] || {}), id, definition_json: definitionJson || mockWorkflows[idx]?.definition_json, status: 'published', published_at: now, updated_at: now });
    if (idx >= 0) mockWorkflows[idx] = next;
    return mockDelay(next);
  }
  return normalizeWorkflow(await request.post(`/admin/workflows/${id}/publish`, definitionJson ? { definitionJson } : {}));
}

export async function deactivateWorkflow(id: string): Promise<WorkflowItem> {
  if (isMockMode) {
    const idx = mockWorkflows.findIndex((item) => item.id === id);
    const now = new Date().toISOString();
    const next = normalizeWorkflow({ ...(mockWorkflows[idx] || {}), id, status: 'archived', updated_at: now });
    if (idx >= 0) mockWorkflows[idx] = next;
    return mockDelay(next);
  }
  return normalizeWorkflow(await request.post(`/admin/workflows/${id}/deactivate`, {}));
}
