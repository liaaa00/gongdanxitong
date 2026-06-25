import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, EyeOutlined, PauseCircleOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { createDefaultWorkflowDefinition, createWorkflow, deactivateWorkflow, getWorkflows, publishWorkflow } from '@/services/workflows';
import type { WorkflowItem } from '@/services/workflows';

const ORDER_TYPE_OPTIONS = [
  { label: '入职工单', value: 'onboarding' },
  { label: '续签工单', value: 'renewal' },
  { label: '离职工单', value: 'resignation' },
  { label: '待遇申报', value: 'benefit' },
];

const STATUS_COLOR: Record<string, string> = {
  draft: 'default',
  active: 'green',
  published: 'green',
  archived: 'orange',
};

const STATUS_TEXT: Record<string, string> = {
  draft: '草稿',
  active: '已发布',
  published: '已发布',
  archived: '已停用',
};

const AdminWorkflows: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkflowItem[]>([]);
  const [orderType, setOrderType] = useState<string>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async (nextOrderType = orderType) => {
    setLoading(true);
    try {
      const res = await getWorkflows({ page: 1, pageSize: 100, orderType: nextOrderType });
      setData(res.list);
    } catch {
      message.error('加载流程配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      const workflow = await createWorkflow({
        name: values.name,
        order_type: values.order_type,
        description: values.description,
        definition_json: createDefaultWorkflowDefinition(),
      });
      message.success('流程配置已创建');
      setOpen(false);
      form.resetFields();
      navigate(`/admin/workflows/${workflow.id}`);
    } catch {
      message.error('创建流程配置失败');
    }
  };

  const handlePublish = async (record: WorkflowItem) => {
    try {
      await publishWorkflow(record.id, record.definition_json);
      message.success('流程已发布');
      load();
    } catch {
      message.error('发布流程失败');
    }
  };

  const handleDeactivate = async (record: WorkflowItem) => {
    try {
      await deactivateWorkflow(record.id);
      message.success('流程已停用');
      load();
    } catch {
      message.error('停用流程失败；如后端暂未提供停用接口，请联系后端补齐 /admin/workflows/:id/deactivate');
    }
  };

  return (
    <PageContainer
      header={{ title: '工单流程配置', subTitle: '管理员可视化维护工单节点、字段权限、按钮和发布版本' }}
      extra={[
        <Select
          key="filter"
          allowClear
          placeholder="筛选工单类型"
          style={{ width: 160 }}
          value={orderType}
          options={ORDER_TYPE_OPTIONS}
          onChange={(value) => { setOrderType(value); load(value); }}
        />,
        <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建流程</Button>,
      ]}
    >
      <Table<WorkflowItem>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '流程名称', dataIndex: 'name', render: (value) => <Typography.Text strong>{value}</Typography.Text> },
          { title: '工单类型', dataIndex: 'order_type', width: 140, render: (value) => ORDER_TYPE_OPTIONS.find((item) => item.value === value)?.label || value },
          { title: '版本', dataIndex: 'version', width: 90, render: (value) => value ? `v${value}` : '-' },
          { title: '状态', dataIndex: 'status', width: 110, render: (value) => <Tag color={STATUS_COLOR[value] || 'default'}>{STATUS_TEXT[value] || value}</Tag> },
          { title: '节点数', dataIndex: 'definition_json', width: 100, render: (value) => value?.nodes?.length || 0 },
          { title: '连线数', dataIndex: 'definition_json', width: 100, render: (value) => value?.edges?.length || 0 },
          { title: '更新时间', dataIndex: 'updated_at', width: 180, render: (value) => value || '-' },
          {
            title: '操作',
            width: 310,
            render: (_, record) => (
              <Space wrap>
                <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/admin/workflows/${record.id}?mode=view`)}>查看</Button>
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => navigate(`/admin/workflows/${record.id}`)}>编辑</Button>
                <Popconfirm title="发布该流程版本？" description="发布后新工单将按该定义进入流程；历史工单不受影响。" onConfirm={() => handlePublish(record)}>
                  <Button size="small" icon={<RocketOutlined />} disabled={['active', 'published'].includes(record.status)}>发布</Button>
                </Popconfirm>
                <Popconfirm title="停用该流程？" description="停用后不再作为新工单流程配置。" onConfirm={() => handleDeactivate(record)}>
                  <Button size="small" icon={<PauseCircleOutlined />} disabled={record.status === 'archived'}>停用</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新建工单流程配置"
        open={open}
        onOk={handleCreate}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ order_type: 'onboarding' }}>
          <Form.Item name="name" label="流程名称" rules={[{ required: true, message: '请输入流程名称' }]}>
            <Input placeholder="例如：入职工单默认流程" />
          </Form.Item>
          <Form.Item name="order_type" label="工单类型" rules={[{ required: true, message: '请选择工单类型' }]}>
            <Select options={ORDER_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="description" label="流程说明">
            <Input.TextArea rows={3} placeholder="描述适用场景、版本切换说明或生效规则" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminWorkflows;
