import { Button, Select, Input, Space, Card, Divider, Radio, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, GroupOutlined } from '@ant-design/icons';

export interface FieldOption {
  field_code: string;
  field_name: string;
}

export interface LeafCondition {
  type: 'leaf';
  field: string;
  operator: string;
  value: string;
}

export interface GroupCondition {
  type: 'group';
  operator: 'AND' | 'OR';
  conditions: ConditionNode[];
}

export type ConditionNode = LeafCondition | GroupCondition;

const OPERATOR_OPTIONS = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '包含', value: 'in' },
  { label: '包含文本', value: 'contains' },
];

interface ConditionNodeEditorProps {
  node: ConditionNode;
  fields: FieldOption[];
  depth: number;
  onChange: (node: ConditionNode) => void;
  onDelete?: () => void;
  maxDepth?: number;
}

function ConditionNodeEditor({
  node,
  fields,
  depth,
  onChange,
  onDelete,
  maxDepth = 4,
}: ConditionNodeEditorProps) {
  if (node.type === 'leaf') {
    return (
      <Space align="start" style={{ marginBottom: 4 }}>
        <Select
          value={node.field}
          onChange={(val) => onChange({ ...node, field: val })}
          options={fields.map((f) => ({ label: f.field_name, value: f.field_code }))}
          placeholder="选择字段"
          style={{ width: 160 }}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.includes(input) ?? false
          }
        />
        <Select
          value={node.operator}
          onChange={(val) => onChange({ ...node, operator: val })}
          options={OPERATOR_OPTIONS}
          style={{ width: 130 }}
        />
        <Input
          value={node.value}
          onChange={(e) => onChange({ ...node, value: e.target.value })}
          placeholder="输入值"
          style={{ width: 160 }}
        />
        {onDelete && (
          <Popconfirm title="确认删除此条件？" onConfirm={onDelete}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        )}
      </Space>
    );
  }

  const isMaxDepth = depth >= maxDepth;

  const addCondition = () => {
    const newCond: LeafCondition = {
      type: 'leaf',
      field: '',
      operator: 'eq',
      value: '',
    };
    onChange({ ...node, conditions: [...node.conditions, newCond] });
  };

  const addGroup = () => {
    if (isMaxDepth) return;
    const newGroup: GroupCondition = {
      type: 'group',
      operator: 'AND',
      conditions: [],
    };
    onChange({ ...node, conditions: [...node.conditions, newGroup] });
  };

  const updateChild = (index: number, child: ConditionNode) => {
    const newConditions = [...node.conditions];
    newConditions[index] = child;
    onChange({ ...node, conditions: newConditions });
  };

  const deleteChild = (index: number) => {
    const newConditions = node.conditions.filter((_, i) => i !== index);
    onChange({ ...node, conditions: newConditions });
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 8, borderColor: '#1890ff33' }}
      title={
        <Radio.Group
          value={node.operator}
          onChange={(e) => onChange({ ...node, operator: e.target.value })}
          size="small"
        >
          <Radio.Button value="AND">且</Radio.Button>
          <Radio.Button value="OR">或</Radio.Button>
        </Radio.Group>
      }
      extra={
        onDelete && (
          <Popconfirm title="确认删除此条件组？" onConfirm={onDelete}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        )
      }
    >
      {node.conditions.length === 0 && (
        <div style={{ color: '#999', padding: 8, textAlign: 'center' }}>
          暂无条件，请点击下方按钮添加
        </div>
      )}
      {node.conditions.map((child, index) => (
        <ConditionNodeEditor
          key={index}
          node={child}
          fields={fields}
          depth={depth + 1}
          onChange={(updated) => updateChild(index, updated)}
          onDelete={() => deleteChild(index)}
          maxDepth={maxDepth}
        />
      ))}
      <Divider style={{ margin: '8px 0' }} dashed />
      <Space size="small">
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addCondition}
        >
          添加条件
        </Button>
        {!isMaxDepth && (
          <Button
            size="small"
            type="dashed"
            icon={<GroupOutlined />}
            onClick={addGroup}
          >
            添加条件组
          </Button>
        )}
      </Space>
    </Card>
  );
}

interface AstConditionEditorProps {
  value?: GroupCondition;
  onChange?: (value: GroupCondition) => void;
  fields: FieldOption[];
  maxDepth?: number;
}

function AstConditionEditor({
  value,
  onChange,
  fields,
  maxDepth = 4,
}: AstConditionEditorProps) {
  const root: GroupCondition = value || {
    type: 'group',
    operator: 'AND',
    conditions: [],
  };

  const handleChange = (node: GroupCondition) => {
    onChange?.(node);
  };

  return (
    <div>
      {fields.length === 0 && (
        <div style={{ color: '#999', marginBottom: 8 }}>
          请先配置可用字段
        </div>
      )}
      <ConditionNodeEditor
        node={root}
        fields={fields}
        depth={0}
        onChange={handleChange as (n: ConditionNode) => void}
        maxDepth={maxDepth}
      />
    </div>
  );
}

export default AstConditionEditor;
