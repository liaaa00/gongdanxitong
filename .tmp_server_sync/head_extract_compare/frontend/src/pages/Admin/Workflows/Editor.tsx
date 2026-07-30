import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Alert, App, Button, Card, Checkbox, Divider, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Tag, Typography } from 'antd';
import { PlusOutlined, RocketOutlined, SaveOutlined } from '@ant-design/icons';
import { createDefaultWorkflowDefinition, getWorkflow, publishWorkflow, updateWorkflow } from '@/services/workflows';
import type { WorkflowDefinitionJson, WorkflowEdgeConfig, WorkflowFieldBindingConfig, WorkflowItem, WorkflowNodeConfig, WorkflowNodeType } from '@/services/workflows';
import { getFields, type FieldConfigItem } from '@/services/fields';
import { getModuleFields } from '@/services/moduleConfigs';
import { getRoles, type RoleItem } from '@/services/roles';
import { getUsers, type UserItem } from '@/services/users';

const NODE_TYPE_OPTIONS: Array<{ label: string; value: WorkflowNodeType }> = [
  { label: '开始节点', value: 'start' },
  { label: '处理节点', value: 'process' },
  { label: '审批节点', value: 'approval' },
  { label: '结束节点', value: 'end' },
];

const MODULE_OPTIONS = [
  { label: '增员报岗录入', value: 'data_entry' },
  { label: '劳动合同新签', value: 'contract' },
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '社保公积金增员', value: 'social_insurance' },
  { label: '劳动合同续签', value: 'renewal_contract' },
  { label: '离职材料收集', value: 'resignation_contact' },
  { label: '减员报岗录入', value: 'data_entry_resign' },
  { label: '社保公积金减员', value: 'resignation_social_insurance' },
  { label: '待遇申报', value: 'benefit_apply' },
];

const ACTION_BUTTON_OPTIONS = [
  { label: '提交', value: 'submit' },
  { label: '完成办理', value: 'complete' },
  { label: '退回修改', value: 'return' },
  { label: '撤回审批', value: 'withdraw' },
  { label: '作废审批', value: 'void' },
  { label: '催办', value: 'urge' },
];

const GENERATION_RULE_OPTIONS = [
  { label: '默认生成', value: 'always' },
  { label: '满足条件才生成', value: 'condition' },
  { label: '人工确认后生成', value: 'manual' },
  { label: '暂不生成', value: 'disabled' },
];

const ASSIGNEE_STRATEGY_OPTIONS = [
  { label: '沿用现有派发配置/模块负责人', value: 'module_pool' },
  { label: '按角色/岗位分配', value: 'role' },
  { label: '指定具体人员', value: 'fixed_user' },
  { label: '发起人的上级', value: 'creator_manager' },
];

const CONDITION_OPERATOR_OPTIONS = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '包含', value: 'contains' },
  { label: '已填写', value: 'not_empty' },
  { label: '未填写', value: 'empty' },
];

const REMINDER_CHANNEL_OPTIONS = [
  { label: '站内信', value: 'in_app' },
  { label: '邮件', value: 'email' },
  { label: '短信', value: 'sms' },
];

const NODE_STYLE: Record<WorkflowNodeType, React.CSSProperties> = {
  start: { borderColor: '#52c41a', background: '#f6ffed' },
  process: { borderColor: '#1677ff', background: '#e6f4ff' },
  approval: { borderColor: '#faad14', background: '#fffbe6' },
  end: { borderColor: '#ff4d4f', background: '#fff1f0' },
};

type WorkflowNodeFormValues = Omit<WorkflowNodeConfig, 'form_schema' | 'assignee' | 'reminder' | 'return_rule'> & {
  visible_fields?: string[];
  editable_fields?: string[];
  action_buttons?: string[];
  generation_rule_mode?: 'always' | 'condition' | 'manual' | 'disabled';
  generation_rule_description?: string;
  generation_rule_expression?: string;
  generation_rule_fields?: string[];
  generation_match_mode?: 'all' | 'any';
  generation_conditions?: Array<{
    field?: string;
    operator?: 'eq' | 'ne' | 'contains' | 'not_empty' | 'empty';
    value?: string;
  }>;
  assignee_strategy?: 'role' | 'fixed_user' | 'module_pool' | 'creator_manager';
  fixed_user_id?: string;
  reminder_enabled?: boolean;
  reminder_before_hours?: number;
  reminder_repeat_hours?: number;
  reminder_channels?: string[];
  allow_return?: boolean;
  return_to?: string;
  require_return_reason?: boolean;
  allow_return_completed?: boolean;
};

type WorkflowEdgeFormValues = {
  condition: string;
  condition_expression?: string;
  condition_fields?: string[];
  priority?: number;
};

function nodeToFlowNode(node: WorkflowNodeConfig): Node<WorkflowNodeConfig> {
  const nodeType = node.type || 'process';
  return {
    id: node.id,
    type: 'default',
    position: node.position || { x: 0, y: 0 },
    data: node,
    style: { minWidth: 150, borderWidth: 2, borderStyle: 'solid', ...NODE_STYLE[nodeType] },
  };
}

function edgeToFlowEdge(edge: WorkflowEdgeConfig): Edge<WorkflowEdgeConfig> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: edge,
    label: edge.condition || '默认流转',
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

export function buildWorkflowDefinitionForSave(nodes: Node<WorkflowNodeConfig>[], edges: Edge<WorkflowEdgeConfig>[]): WorkflowDefinitionJson {
  return {
    nodes: nodes.map((node) => ({ ...node.data, id: node.id, position: node.position })),
    edges: edges.map((edge) => ({
      ...edge.data,
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: String(edge.label || edge.data?.condition || ''),
    })),
  };
}

function buildRoleOptions(roles: RoleItem[]): Array<{ label: string; value: string }> {
  const result: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();
  const walk = (items: RoleItem[]) => {
    items.forEach((role) => {
      const value = role.code || role.id;
      if (value && !seen.has(value)) {
        seen.add(value);
        result.push({ label: role.name || value, value });
      }
      if (role.children?.length) walk(role.children);
    });
  };
  walk(roles);
  return result;
}

function groupFields(fields: FieldConfigItem[]) {
  const map = new Map<string, FieldConfigItem[]>();
  fields.forEach((field) => {
    const group = field.collection_group?.trim() || '其他字段';
    const current = map.get(group) || [];
    current.push(field);
    map.set(group, current);
  });
  return Array.from(map.entries());
}

function parseConditionValue(expression?: string): string | undefined {
  if (!expression) return undefined;
  const match = expression.match(/(?:==|!=|includes)\s*["']([^"']*)["']/);
  return match?.[1];
}

function parseConditionOperator(expression?: string): NonNullable<WorkflowNodeFormValues['generation_conditions']>[number]['operator'] {
  if (!expression) return 'eq';
  if (expression.includes('!=')) return 'ne';
  if (expression.includes('includes')) return 'contains';
  if (expression.includes('is empty')) return 'empty';
  if (expression.includes('is not empty')) return 'not_empty';
  return 'eq';
}

function escapeConditionValue(value?: string): string {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function legacyConditionFromRule(node: WorkflowNodeConfig): NonNullable<WorkflowNodeFormValues['generation_conditions']> {
  if (node.generation_rule?.conditions?.length) return node.generation_rule.conditions;
  const field = node.generation_rule?.fields?.[0];
  if (!field) return [{ operator: 'eq' }];
  return [{
    field,
    operator: parseConditionOperator(node.generation_rule?.expression),
    value: parseConditionValue(node.generation_rule?.expression),
  }];
}

function formValuesFromNode(node: WorkflowNodeConfig): WorkflowNodeFormValues {
  return {
    ...node,
    generation_rule_mode: node.generation_rule?.mode || (node.type === 'start' || node.type === 'end' ? 'disabled' : 'condition'),
    generation_rule_description: node.generation_rule?.description,
    generation_rule_expression: node.generation_rule?.expression,
    generation_rule_fields: node.generation_rule?.fields || [],
    generation_match_mode: node.generation_rule?.match_mode || 'all',
    generation_conditions: legacyConditionFromRule(node),
    assignee_strategy: node.assignee?.strategy || (node.assignee_role ? 'role' : 'module_pool'),
    fixed_user_id: node.assignee?.user_id,
    reminder_enabled: node.reminder?.enabled ?? Boolean(node.sla_hours),
    reminder_before_hours: node.reminder?.before_hours,
    reminder_repeat_hours: node.reminder?.repeat_hours,
    reminder_channels: node.reminder?.channels || ['in_app'],
    allow_return: node.return_rule?.allow_return ?? node.form_schema?.action_buttons?.includes('return') ?? false,
    return_to: node.return_rule?.return_to,
    require_return_reason: node.return_rule?.require_reason ?? true,
    allow_return_completed: node.return_rule?.allow_return_completed ?? false,
    visible_fields: node.form_schema?.visible_fields || [],
    editable_fields: node.form_schema?.editable_fields || [],
    action_buttons: node.form_schema?.action_buttons || [],
  };
}

const AdminWorkflowEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const readOnly = searchParams.get('mode') === 'view';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowItem | null>(null);
  const [fields, setFields] = useState<FieldConfigItem[]>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [userOptions, setUserOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [moduleFieldCodes, setModuleFieldCodes] = useState<Record<string, string[]>>({});
  const [editingModuleCode, setEditingModuleCode] = useState<string>();
  const [nodes, setNodes] = useState<Node<WorkflowNodeConfig>[]>([]);
  const [edges, setEdges] = useState<Edge<WorkflowEdgeConfig>[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [nodeModalOpen, setNodeModalOpen] = useState(false);
  const [nodeForm] = Form.useForm<WorkflowNodeFormValues>();
  const [edgeForm] = Form.useForm<WorkflowEdgeFormValues>();
  const generationRuleMode = Form.useWatch('generation_rule_mode', nodeForm);
  const generationConditions = Form.useWatch('generation_conditions', nodeForm) || [];
  const assigneeStrategy = Form.useWatch('assignee_strategy', nodeForm);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId), [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId), [edges, selectedEdgeId]);
  const availableFieldsForEditingNode = useMemo(() => {
    const codes = editingModuleCode ? moduleFieldCodes[editingModuleCode] : undefined;
    if (!codes || codes.length === 0) return fields;
    const codeSet = new Set(codes);
    return fields.filter((field) => codeSet.has(field.field_code));
  }, [editingModuleCode, fields, moduleFieldCodes]);
  const groupedFields = useMemo(() => groupFields(availableFieldsForEditingNode), [availableFieldsForEditingNode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const item = await getWorkflow(id);
        const [fieldList, moduleFieldEntries, roles, usersResult] = await Promise.all([
          getFields(item.order_type || 'onboarding').catch(() => [] as FieldConfigItem[]),
          Promise.all(MODULE_OPTIONS.map(async (module) => {
            const rows = await getModuleFields(module.value).catch(() => []);
            return [module.value, rows.map((row) => row.field_code).filter(Boolean)] as const;
          })),
          getRoles().catch(() => [] as RoleItem[]),
          getUsers({ page: 1, pageSize: 100 }).catch(() => ({ list: [] as UserItem[] })),
        ]);
        const definition = item.definition_json || createDefaultWorkflowDefinition();
        if (cancelled) return;
        setWorkflow(item);
        setFields(fieldList);
        setRoleOptions(buildRoleOptions(roles));
        setUserOptions((usersResult.list || []).filter((user) => user.is_active).map((user) => ({
          label: `${user.real_name || user.username}${user.group_name ? `（${user.group_name}）` : ''}`,
          value: user.id,
        })));
        setModuleFieldCodes(Object.fromEntries(moduleFieldEntries));
        setNodes(definition.nodes.map(nodeToFlowNode));
        setEdges(definition.edges.map(edgeToFlowEdge));
      } catch {
        message.error('加载流程配置失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, message]);

  useEffect(() => {
    if (selectedEdge) {
      edgeForm.setFieldsValue({
        condition: String(selectedEdge.label || selectedEdge.data?.condition || ''),
        condition_expression: selectedEdge.data?.condition_expression,
        condition_fields: selectedEdge.data?.condition_fields || [],
        priority: selectedEdge.data?.priority,
      });
    }
  }, [selectedEdge, edgeForm]);

  const onNodesChange = (changes: NodeChange[]) => {
    if (readOnly) return;
    setNodes((items) => applyNodeChanges(changes, items));
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readOnly) return;
    setEdges((items) => applyEdgeChanges(changes, items));
  };

  const onConnect = (connection: Connection) => {
    if (readOnly || !connection.source || !connection.target) return;
    const idValue = `${connection.source}-${connection.target}-${Date.now()}`;
    setEdges((items) => addEdge({ ...connection, id: idValue, label: '默认流转', data: { id: idValue, source: connection.source!, target: connection.target!, condition: '默认流转' }, markerEnd: { type: MarkerType.ArrowClosed } }, items));
  };

  const openNodeModal = (node?: Node<WorkflowNodeConfig>) => {
    if (readOnly) return;
    if (node) {
      nodeForm.setFieldsValue(formValuesFromNode(node.data));
      setEditingModuleCode(node.data.module_code);
      setSelectedNodeId(node.id);
    } else {
      nodeForm.setFieldsValue({
        id: `node_${Date.now()}`,
        type: 'process',
        label: '新节点',
        module_code: 'data_entry',
        position: { x: 120, y: 120 },
        generation_rule_mode: 'condition',
        generation_rule_description: '请配置该子工单在什么情况下生成',
        generation_rule_expression: '',
        generation_rule_fields: [],
        generation_match_mode: 'all',
        generation_conditions: [{ operator: 'eq' }],
        assignee_strategy: 'module_pool',
        reminder_enabled: true,
        reminder_channels: ['in_app'],
        allow_return: true,
        require_return_reason: true,
        visible_fields: [],
        editable_fields: [],
        action_buttons: ['complete', 'return'],
      });
      setEditingModuleCode('data_entry');
      setSelectedNodeId(undefined);
    }
    setNodeModalOpen(true);
  };

  const saveNode = async () => {
    const values = await nodeForm.validateFields();
    const targetId = selectedNodeId || values.id;
    const previousNode = nodes.find((item) => item.id === targetId)?.data;
    const formSchema: WorkflowFieldBindingConfig = {
      visible_fields: values.visible_fields || [],
      editable_fields: values.editable_fields || [],
      action_buttons: values.action_buttons || [],
    };
    const generationMode = values.generation_rule_mode || 'condition';
    const matchMode = values.generation_match_mode || 'all';
    const assigneeStrategyValue = values.assignee_strategy || previousNode?.assignee?.strategy || 'module_pool';
    const conditions = (values.generation_conditions || [])
      .filter((item) => item?.field && item?.operator)
      .map((item) => ({ field: item.field, operator: item.operator || 'eq', value: item.value }));
    let generatedExpression = values.generation_rule_expression;
    let generatedFields = values.generation_rule_fields || [];
    let generatedDescription = values.generation_rule_description;

    const buildConditionExpression = (condition: NonNullable<WorkflowNodeFormValues['generation_conditions']>[number]) => {
      const field = condition.field || '';
      const operator = condition.operator || 'eq';
      const escapedValue = escapeConditionValue(condition.value);
      if (operator === 'ne') return `${field} != "${escapedValue}"`;
      if (operator === 'contains') return `${field} includes "${escapedValue}"`;
      if (operator === 'not_empty') return `${field} is not empty`;
      if (operator === 'empty') return `${field} is empty`;
      return `${field} == "${escapedValue}"`;
    };

    const buildConditionDescription = (condition: NonNullable<WorkflowNodeFormValues['generation_conditions']>[number]) => {
      const fieldLabel = fields.find((field) => field.field_code === condition.field)?.field_name || condition.field || '指定字段';
      const operator = condition.operator || 'eq';
      const operatorLabel = CONDITION_OPERATOR_OPTIONS.find((item) => item.value === operator)?.label || '等于';
      const valueText = ['empty', 'not_empty'].includes(operator) ? '' : `“${condition.value || ''}”`;
      return `${fieldLabel}${operatorLabel}${valueText}`;
    };

    if (generationMode === 'always') {
      generatedExpression = 'true';
      generatedFields = [];
      generatedDescription = generatedDescription || '该子工单默认生成';
    } else if (generationMode === 'disabled') {
      generatedExpression = 'false';
      generatedFields = [];
      generatedDescription = generatedDescription || '该子工单暂不生成';
    } else if (generationMode === 'manual') {
      generatedExpression = 'manual_confirm';
      generatedFields = [];
      generatedDescription = generatedDescription || '由办理人员人工确认后生成';
    } else {
      const joiner = matchMode === 'any' ? ' OR ' : ' AND ';
      const descriptionJoiner = matchMode === 'any' ? ' 或 ' : ' 且 ';
      generatedFields = Array.from(new Set(conditions.map((item) => item.field).filter(Boolean))) as string[];
      generatedExpression = conditions.map(buildConditionExpression).join(joiner);
      generatedDescription = generatedDescription || (conditions.length > 0 ? `当${conditions.map(buildConditionDescription).join(descriptionJoiner)}时生成` : '满足配置条件时生成');
    }

    const nextConfig: WorkflowNodeConfig = {
      id: targetId,
      type: values.type,
      label: values.label,
      module_code: values.module_code,
      generation_rule: {
        mode: generationMode,
        match_mode: matchMode,
        conditions,
        description: generatedDescription,
        expression: generatedExpression,
        fields: generatedFields,
      },
      assignee_role: assigneeStrategyValue === 'role' ? values.assignee_role : undefined,
      assignee: {
        strategy: assigneeStrategyValue,
        role: assigneeStrategyValue === 'role' ? values.assignee_role : undefined,
        user_id: assigneeStrategyValue === 'fixed_user' ? values.fixed_user_id : undefined,
        module_code: values.module_code,
      },
      auto_dispatch: values.auto_dispatch ?? previousNode?.auto_dispatch,
      sla_hours: values.sla_hours,
      reminder: {
        enabled: values.reminder_enabled,
        before_hours: values.reminder_before_hours,
        repeat_hours: values.reminder_repeat_hours,
        channels: values.reminder_channels || [],
      },
      return_rule: {
        allow_return: values.allow_return,
        return_to: values.return_to,
        require_reason: values.require_return_reason,
        allow_return_completed: values.allow_return_completed,
      },
      form_schema: formSchema,
    };
    setNodes((items) => {
      const exists = items.some((item) => item.id === targetId);
      if (!exists) return [...items, nodeToFlowNode({ ...nextConfig, position: { x: 120 + items.length * 30, y: 120 + items.length * 20 } })];
      return items.map((item) => item.id === targetId ? nodeToFlowNode({ ...nextConfig, position: item.position }) : item);
    });
    setNodeModalOpen(false);
  };

  const deleteSelectedNode = () => {
    if (readOnly || !selectedNodeId) return;
    setNodes((items) => items.filter((item) => item.id !== selectedNodeId));
    setEdges((items) => items.filter((item) => item.source !== selectedNodeId && item.target !== selectedNodeId));
    setSelectedNodeId(undefined);
  };

  const updateSelectedEdge = async () => {
    if (readOnly || !selectedEdgeId) return;
    const values = await edgeForm.validateFields();
    setEdges((items) => items.map((item) => item.id === selectedEdgeId
      ? {
        ...item,
        label: values.condition,
        data: {
          id: item.id,
          source: item.source,
          target: item.target,
          condition: values.condition,
          condition_expression: values.condition_expression,
          condition_fields: values.condition_fields || [],
          priority: values.priority,
        },
      }
      : item));
    message.success('连线条件已更新');
  };

  const deleteSelectedEdge = () => {
    if (readOnly || !selectedEdgeId) return;
    setEdges((items) => items.filter((item) => item.id !== selectedEdgeId));
    setSelectedEdgeId(undefined);
  };

  const saveWorkflow = async () => {
    if (!id || !workflow) return null;
    if (!nodes.some((node) => node.data.type === 'start') || !nodes.some((node) => node.data.type === 'end')) {
      message.warning('流程必须至少包含开始节点和结束节点');
      return null;
    }
    setSaving(true);
    try {
      const definition = buildWorkflowDefinitionForSave(nodes, edges);
      const updated = await updateWorkflow(id, {
        name: workflow.name,
        order_type: workflow.order_type,
        description: workflow.description,
        definition_json: definition,
      });
      setWorkflow(updated);
      message.success('流程定义已保存');
      return definition;
    } catch {
      message.error('保存流程定义失败');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id) return;
    const definition = await saveWorkflow();
    if (!definition) return;
    try {
      const published = await publishWorkflow(id, definition);
      setWorkflow(published);
      message.success('流程已发布');
    } catch {
      message.error('发布流程失败');
    }
  };

  if (loading) return <PageContainer loading />;
  if (!workflow) return <PageContainer header={{ title: '工单流程配置' }}><Empty description="流程配置不存在" /></PageContainer>;

  return (
    <PageContainer
      header={{
        title: workflow.name,
        subTitle: readOnly ? '查看模式' : '新版流程引擎预配置：先配置子工单生成条件、办理字段、SLA 与通知，暂不影响现有派发',
        tags: <Tag color={['active', 'published'].includes(workflow.status) ? 'green' : 'default'}>{['active', 'published'].includes(workflow.status) ? '已发布' : '草稿'}</Tag>,
        extra: [
          <Button key="back" onClick={() => navigate('/admin/workflows')}>返回列表</Button>,
          !readOnly && <Button key="add" icon={<PlusOutlined />} onClick={() => openNodeModal()}>新增节点</Button>,
          !readOnly && <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveWorkflow}>保存</Button>,
          !readOnly && <Button key="publish" icon={<RocketOutlined />} onClick={handlePublish}>发布</Button>,
        ].filter(Boolean),
      }}
    >
      <Alert
        showIcon
        type="warning"
        style={{ marginBottom: 16 }}
        message="新版流程配置暂不接管正式派发"
        description="这里先用于配置未来流程引擎：子工单生成条件、办理字段、SLA、通知和退回规则。当前新建/导入工单仍以“派发配置”为准，等该配置成熟后再逐步替换旧派发配置。"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(520px, 1fr) 460px', gap: 16, alignItems: 'start' }}>
        <Card
          title="流程步骤"
          extra={!readOnly && <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => openNodeModal()}>新增</Button>}
          styles={{ body: { maxHeight: 720, overflowY: 'auto' } }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {nodes.map((node, index) => {
              const active = selectedNodeId === node.id;
              const typeLabel = NODE_TYPE_OPTIONS.find((item) => item.value === node.data.type)?.label || node.data.type;
              return (
                <Card
                  key={node.id}
                  size="small"
                  hoverable
                  onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeId(undefined); }}
                  style={{ borderColor: active ? '#1677ff' : undefined, background: active ? '#f0f7ff' : undefined }}
                  styles={{ body: { padding: 12 } }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Typography.Text strong>{index + 1}. {node.data.label}</Typography.Text>
                      <Tag color={active ? 'blue' : undefined}>{typeLabel}</Tag>
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>节点编码：{node.id}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>模块：{node.data.module_code || '-'}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      生成：{GENERATION_RULE_OPTIONS.find((item) => item.value === node.data.generation_rule?.mode)?.label || '未配置'}
                    </Typography.Text>
                  </Space>
                </Card>
              );
            })}
            {nodes.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点" />}
          </Space>
        </Card>

        <Card title="流程预览" styles={{ body: { padding: 0 } }}>
          <div style={{ height: 720 }} data-testid="workflow-canvas">
            <ReactFlow
              nodes={nodes.map((node) => ({ ...node, data: { ...node.data, label: (
                <Space direction="vertical" size={2} style={{ textAlign: 'center' }}>
                  <Typography.Text strong>{node.data.label}</Typography.Text>
                  <Tag>{NODE_TYPE_OPTIONS.find((item) => item.value === node.data.type)?.label || node.data.type}</Tag>
                  {node.data.module_code && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{node.data.module_code}</Typography.Text>}
                  {node.data.generation_rule?.mode && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {GENERATION_RULE_OPTIONS.find((item) => item.value === node.data.generation_rule?.mode)?.label || node.data.generation_rule.mode}
                    </Typography.Text>
                  )}
                </Space>
              ) } }))}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(undefined); }}
              onNodeDoubleClick={(_, node) => openNodeModal(node as Node<WorkflowNodeConfig>)}
              onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(undefined); }}
              fitView
            >
              <MiniMap />
              <Controls />
              <Background />
            </ReactFlow>
          </div>
        </Card>

        <Card
          title={selectedNode ? '节点配置详情' : selectedEdge ? '流转条件详情' : '配置详情'}
          style={{ width: 460 }}
          styles={{ body: { maxHeight: 720, overflowY: 'auto' } }}
        >
          <Spin spinning={saving}>
            {selectedNode && (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space direction="vertical" size={2}>
                    <Typography.Text strong style={{ fontSize: 16 }}>{selectedNode.data.label}</Typography.Text>
                    <Typography.Text type="secondary">{selectedNode.id}</Typography.Text>
                  </Space>
                  <Tag color="blue">{NODE_TYPE_OPTIONS.find((item) => item.value === selectedNode.data.type)?.label || selectedNode.data.type}</Tag>
                </Space>

                <Divider orientation="left">基础信息</Divider>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Typography.Text>关联子工单：{MODULE_OPTIONS.find((item) => item.value === selectedNode.data.module_code)?.label || selectedNode.data.module_code || '-'}</Typography.Text>
                </Space>

                <Divider orientation="left">子工单生成条件</Divider>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text>生成方式：{GENERATION_RULE_OPTIONS.find((item) => item.value === selectedNode.data.generation_rule?.mode)?.label || '未配置'}</Typography.Text>
                  <Typography.Text>业务说明：{selectedNode.data.generation_rule?.description || '-'}</Typography.Text>
                  {selectedNode.data.generation_rule?.mode === 'condition' && (
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Typography.Text>
                        条件关系：{selectedNode.data.generation_rule?.match_mode === 'any' ? '任一满足就生成' : '全部满足才生成'}
                      </Typography.Text>
                      {(selectedNode.data.generation_rule?.conditions || []).length > 0
                        ? selectedNode.data.generation_rule?.conditions?.map((condition, index) => {
                          const fieldLabel = fields.find((field) => field.field_code === condition.field)?.field_name || condition.field || '指定字段';
                          const operatorLabel = CONDITION_OPERATOR_OPTIONS.find((item) => item.value === condition.operator)?.label || '等于';
                          const valueText = ['empty', 'not_empty'].includes(condition.operator || '') ? '' : `“${condition.value || ''}”`;
                          return <Tag key={`${condition.field}-${index}`} style={{ marginBottom: 6 }}>条件 {index + 1}：{fieldLabel}{operatorLabel}{valueText}</Tag>;
                        })
                        : <Typography.Text type="secondary">未配置具体条件</Typography.Text>}
                    </Space>
                  )}
                  <Typography.Text type="secondary">系统会自动保存底层条件，业务人员无需填写表达式。</Typography.Text>
                </Space>

                <Divider orientation="left">办理负责人</Divider>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    showIcon
                    type="info"
                    message="当前正式派发仍以“派发配置”为准"
                    description="以下是未来流程引擎的负责人预配置，当前不会改变正式派发结果。"
                  />
                  <Typography.Text>
                    负责人来源：{ASSIGNEE_STRATEGY_OPTIONS.find((item) => item.value === selectedNode.data.assignee?.strategy)?.label || '沿用现有派发配置/模块负责人'}
                  </Typography.Text>
                  {selectedNode.data.assignee?.strategy === 'role' && (
                    <Typography.Text>
                      指定角色：{roleOptions.find((item) => item.value === selectedNode.data.assignee_role)?.label || selectedNode.data.assignee_role || '-'}
                    </Typography.Text>
                  )}
                  {selectedNode.data.assignee?.strategy === 'fixed_user' && (
                    <Typography.Text>
                      指定人员：{userOptions.find((item) => item.value === selectedNode.data.assignee?.user_id)?.label || selectedNode.data.assignee?.user_id || '-'}
                    </Typography.Text>
                  )}
                </Space>

                <Divider orientation="left">办理字段</Divider>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div>
                    <Typography.Text type="secondary">本环节需要展示的信息（{selectedNode.data.form_schema?.visible_fields?.length || 0}）</Typography.Text>
                    <div style={{ marginTop: 6 }}>
                      {(selectedNode.data.form_schema?.visible_fields || []).length > 0
                        ? selectedNode.data.form_schema?.visible_fields?.map((code) => <Tag key={code} style={{ marginBottom: 6 }}>{code}</Tag>)
                        : <Typography.Text type="secondary">未配置</Typography.Text>}
                    </div>
                  </div>
                  <div>
                    <Typography.Text type="secondary">本环节需要填写/修改的信息（{selectedNode.data.form_schema?.editable_fields?.length || 0}）</Typography.Text>
                    <div style={{ marginTop: 6 }}>
                      {(selectedNode.data.form_schema?.editable_fields || []).length > 0
                        ? selectedNode.data.form_schema?.editable_fields?.map((code) => <Tag key={code} color="processing" style={{ marginBottom: 6 }}>{code}</Tag>)
                        : <Typography.Text type="secondary">未配置</Typography.Text>}
                    </div>
                  </div>
                </Space>

                <Divider orientation="left">按钮权限/退回规则</Divider>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div>
                    {(selectedNode.data.form_schema?.action_buttons || []).length > 0
                      ? selectedNode.data.form_schema?.action_buttons?.map((code) => (
                        <Tag key={code} color="geekblue" style={{ marginBottom: 6 }}>
                          {ACTION_BUTTON_OPTIONS.find((item) => item.value === code)?.label || code}
                        </Tag>
                      ))
                      : <Typography.Text type="secondary">未配置按钮</Typography.Text>}
                  </div>
                  <Typography.Text>允许退回：{selectedNode.data.return_rule?.allow_return ? '允许' : '不允许'}</Typography.Text>
                  <Typography.Text>退回目标：{selectedNode.data.return_rule?.return_to || '-'}</Typography.Text>
                  <Typography.Text>退回原因：{selectedNode.data.return_rule?.require_reason ? '必填' : '选填'}</Typography.Text>
                </Space>

                <Divider orientation="left">SLA/通知</Divider>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Typography.Text>SLA：{selectedNode.data.sla_hours ?? '-'} 小时</Typography.Text>
                  <Typography.Text>提醒：{selectedNode.data.reminder?.enabled ? '开启' : '关闭'}</Typography.Text>
                  <Typography.Text>提前提醒：{selectedNode.data.reminder?.before_hours ?? '-'} 小时</Typography.Text>
                  <Typography.Text>重复间隔：{selectedNode.data.reminder?.repeat_hours ?? '-'} 小时</Typography.Text>
                  <Typography.Text>提醒渠道：{selectedNode.data.reminder?.channels?.join('、') || '-'}</Typography.Text>
                </Space>

                {!readOnly && (
                  <Space style={{ width: '100%' }}>
                    <Button type="primary" block onClick={() => openNodeModal(selectedNode)}>编辑节点完整配置</Button>
                    <Button danger onClick={deleteSelectedNode}>删除</Button>
                  </Space>
                )}
              </Space>
            )}

            {selectedEdge && (
              <Form form={edgeForm} layout="vertical">
                <Typography.Text strong>连线：{selectedEdge.source} → {selectedEdge.target}</Typography.Text>
                <Form.Item name="condition" label="条件名称" style={{ marginTop: 12 }} rules={[{ required: true, message: '请输入条件名称' }]}>
                  <Input disabled={readOnly} placeholder="例如：需要合同 / 审批通过" />
                </Form.Item>
                <Form.Item name="condition_expression" label="条件表达式">
                  <Input disabled={readOnly} placeholder={'例如：need_company_contract == "是"；固定流转可填 true'} />
                </Form.Item>
                <Form.Item name="condition_fields" label="依赖字段">
                  <Select
                    mode="multiple"
                    allowClear
                    disabled={readOnly}
                    options={fields.map((field) => ({ label: `${field.field_name}（${field.field_code}）`, value: field.field_code }))}
                    placeholder="选择表达式依赖的字段"
                  />
                </Form.Item>
                <Form.Item name="priority" label="流转优先级">
                  <InputNumber min={0} precision={0} disabled={readOnly} style={{ width: '100%' }} placeholder="数值越小优先级越高" />
                </Form.Item>
                {!readOnly && <Space>
                  <Button type="primary" onClick={updateSelectedEdge}>保存条件</Button>
                  <Button danger onClick={deleteSelectedEdge}>删除连线</Button>
                </Space>}
              </Form>
            )}

            {!selectedNode && !selectedEdge && <Empty description="点击左侧步骤、画布节点或连线查看完整配置" />}
          </Spin>

          <Divider />
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            当前页面用于沉淀新版流程引擎配置：节点、子工单生成条件、办理字段、SLA、通知和退回规则都会写入 definition_json；但当前正式新建/导入工单仍按“派发配置”执行。
          </Typography.Paragraph>
        </Card>
      </div>

      <Modal title={selectedNodeId ? '编辑节点' : '新增节点'} open={nodeModalOpen} onOk={saveNode} onCancel={() => setNodeModalOpen(false)} destroyOnHidden width={760}>
        <Form
          form={nodeForm}
          layout="vertical"
          onValuesChange={(changed) => {
            if (Object.prototype.hasOwnProperty.call(changed, 'module_code')) {
              setEditingModuleCode(changed.module_code);
            }
          }}
        >
          <Form.Item name="id" label="节点编码" rules={[{ required: true, message: '请输入节点编码' }]}>
            <Input disabled={Boolean(selectedNodeId)} placeholder="如 data_entry" />
          </Form.Item>
          <Form.Item name="label" label="节点名称" rules={[{ required: true, message: '请输入节点名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="节点类型" rules={[{ required: true, message: '请选择节点类型' }]}>
            <Select options={NODE_TYPE_OPTIONS} />
          </Form.Item>
          <Divider orientation="left">子工单生成条件</Divider>
          <Alert
            showIcon
            type="info"
            style={{ marginBottom: 12 }}
            message="当前只配置未来流程引擎，不改变现有派发结果"
            description="正式生成子工单和分配处理人暂时仍由“派发配置”控制。这里先把条件沉淀下来，后续成熟后再接入运行时。"
          />
          <Form.Item name="module_code" label="关联子工单">
            <Select allowClear options={MODULE_OPTIONS} placeholder="选择这个节点代表哪个子工单" />
          </Form.Item>
          <Form.Item name="generation_rule_mode" label="生成方式" rules={[{ required: true, message: '请选择生成方式' }]}>
            <Select options={GENERATION_RULE_OPTIONS} placeholder="选择该子工单什么时候生成" />
          </Form.Item>
          <Form.Item name="generation_rule_description" label="业务说明">
            <Input placeholder="例如：当入职材料需要集约收集时生成入职联系子工单" />
          </Form.Item>
          {generationRuleMode === 'condition' && (
            <Card size="small" title="生成条件" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Typography.Text type="secondary">可以配置多条判断，系统会自动转换成底层条件，业务人员不需要写表达式。</Typography.Text>
                <Form.Item name="generation_match_mode" label="多条条件关系" rules={[{ required: true, message: '请选择条件关系' }]}>
                  <Select
                    options={[
                      { label: '全部满足才生成', value: 'all' },
                      { label: '任一满足就生成', value: 'any' },
                    ]}
                  />
                </Form.Item>
                <Form.List name="generation_conditions">
                  {(conditionFields, { add, remove }) => (
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      {conditionFields.map((conditionField, index) => {
                        const operator = generationConditions?.[index]?.operator;
                        return (
                          <Card
                            key={conditionField.key}
                            size="small"
                            title={`条件 ${index + 1}`}
                            extra={conditionFields.length > 1 && <Button type="link" danger onClick={() => remove(conditionField.name)}>删除</Button>}
                          >
                            <Form.Item name={[conditionField.name, 'field']} label="当这个字段" rules={[{ required: true, message: '请选择判断字段' }]}>
                              <Select
                                showSearch
                                allowClear
                                optionFilterProp="label"
                                options={fields.map((field) => ({ label: field.field_name, value: field.field_code }))}
                                placeholder="选择导入/录入表单中的字段"
                              />
                            </Form.Item>
                            <Form.Item name={[conditionField.name, 'operator']} label="满足关系" rules={[{ required: true, message: '请选择判断关系' }]}>
                              <Select options={CONDITION_OPERATOR_OPTIONS} placeholder="选择判断关系" />
                            </Form.Item>
                            {!['empty', 'not_empty'].includes(operator || '') && (
                              <Form.Item name={[conditionField.name, 'value']} label="字段值" rules={[{ required: true, message: '请输入字段值' }]}>
                                <Input placeholder="例如：是、否、已办理、未办理" />
                              </Form.Item>
                            )}
                          </Card>
                        );
                      })}
                      <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ operator: 'eq' })}>添加条件</Button>
                    </Space>
                  )}
                </Form.List>
              </Space>
            </Card>
          )}

          <Divider orientation="left">办理负责人（预配置）</Divider>
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 12 }}
            message="当前不会改变正式派发"
            description="这里先配置未来流程引擎的负责人规则；正式处理人目前仍以“派发配置”为准。"
          />
          <Form.Item name="assignee_strategy" label="负责人来源" rules={[{ required: true, message: '请选择负责人来源' }]}>
            <Select options={ASSIGNEE_STRATEGY_OPTIONS} placeholder="选择这个子工单未来由谁负责" />
          </Form.Item>
          {assigneeStrategy === 'role' && (
            <Form.Item name="assignee_role" label="指定角色/岗位" rules={[{ required: true, message: '请选择角色/岗位' }]}>
              <Select showSearch allowClear optionFilterProp="label" options={roleOptions} placeholder="选择角色/岗位" />
            </Form.Item>
          )}
          {assigneeStrategy === 'fixed_user' && (
            <Form.Item name="fixed_user_id" label="指定人员" rules={[{ required: true, message: '请选择办理人员' }]}>
              <Select showSearch allowClear optionFilterProp="label" options={userOptions} placeholder="选择具体办理人员" />
            </Form.Item>
          )}

          <Divider orientation="left">SLA 与提醒</Divider>
          <Form.Item name="sla_hours" label="SLA 小时">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reminder_enabled" label="开启超时提醒" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="reminder_before_hours" label="提前提醒小时">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="例如：4 表示到期前 4 小时提醒" />
          </Form.Item>
          <Form.Item name="reminder_repeat_hours" label="重复提醒间隔小时">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="为空表示不重复" />
          </Form.Item>
          <Form.Item name="reminder_channels" label="提醒渠道">
            <Checkbox.Group options={REMINDER_CHANNEL_OPTIONS} />
          </Form.Item>

          <Divider orientation="left">退回规则与按钮</Divider>
          <Form.Item name="allow_return" label="允许退回" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="禁止" />
          </Form.Item>
          <Form.Item name="return_to" label="退回目标节点">
            <Select allowClear options={nodes.map((node) => ({ label: `${node.data.label}（${node.id}）`, value: node.id }))} placeholder="选择退回到哪个节点" />
          </Form.Item>
          <Form.Item name="require_return_reason" label="退回原因必填" valuePropName="checked">
            <Switch checkedChildren="必填" unCheckedChildren="选填" />
          </Form.Item>
          <Form.Item name="allow_return_completed" label="允许退回已完成节点" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="禁止" />
          </Form.Item>
          <Form.Item name="action_buttons" label="节点按钮权限">
            <Checkbox.Group options={ACTION_BUTTON_OPTIONS} />
          </Form.Item>
          <Form.Item label="办理字段（按业务分类分组）">
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {groupedFields.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字段配置" />}
              {groupedFields.map(([groupName, groupFields]) => (
                <Card key={groupName} size="small" title={groupName} styles={{ body: { padding: 12 } }}>
                  <Form.Item name="visible_fields" label="本环节需要展示的信息" style={{ marginBottom: 12 }}>
                    <Checkbox.Group
                      options={groupFields.map((field) => ({ label: `${field.field_name}（${field.field_code}）`, value: field.field_code }))}
                    />
                  </Form.Item>
                  <Form.Item name="editable_fields" label="本环节需要填写/修改的信息" style={{ marginBottom: 0 }}>
                    <Checkbox.Group
                      options={groupFields.map((field) => ({ label: `${field.field_name}（${field.field_code}）`, value: field.field_code }))}
                    />
                  </Form.Item>
                </Card>
              ))}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminWorkflowEditor;
