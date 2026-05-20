import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, Popconfirm, App, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getFields, createField, updateField, deleteField } from '@/services/fields';
import type { FieldConfigItem } from '@/services/fields';
import { useAuth } from '@/hooks/useAuth';

const TYPE_OPT = [
  { label: '文本', value: 'text' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '下拉', value: 'dropdown' },
  { label: '多行文本', value: 'textarea' },
];

const ORDER_OPT = [
  { label: '全部工单', value: '' },
  { label: '入职', value: 'onboarding' },
  { label: '续签', value: 'renewal' },
  { label: '离职', value: 'resignation' },
  { label: '待遇申报', value: 'benefit' },
];

const SOURCE_CATEGORY_OPT = [
  { label: '全部来源', value: '' },
  { label: '👤 客户填报', value: 'customer_filled' },
  { label: '📋 业务员补充', value: 'agent_supplemented' },
  { label: '⚡ 流程判断', value: 'process_judgment' },
];

const SUB_TICKET_SCOPE_OPT = [
  { label: '全部范围', value: '' },
  { label: '全局可见', value: 'all' },
  { label: '数据录入', value: 'data_entry' },
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '劳动合同签订', value: 'contract' },
];

const COLLECTION_GROUP_OPT = [
  { label: '全部分组', value: '' },
  { label: '基本信息', value: '基本信息' },
  { label: '劳动合同签订', value: '劳动合同签订' },
  { label: '入职联系', value: '入职联系' },
  { label: '发薪信息', value: '发薪信息' },
  { label: '社保公积金类', value: '社保公积金类' },
];

const getSelectPopupContainer = (triggerNode: HTMLElement) => triggerNode.parentElement || document.body;

const SOURCE_TAG: Record<string, { color: string; label: string }> = {
  customer_filled: { color: 'blue', label: '客户填报' },
  agent_supplemented: { color: 'orange', label: '业务员补充' },
  process_judgment: { color: 'red', label: '流程判断' },
};

const SCOPE_TAG: Record<string, { color: string; label: string }> = {
  all: { color: 'green', label: '全局' },
  data_entry: { color: 'cyan', label: '数据录入' },
  onboarding_contact: { color: 'purple', label: '入职联系' },
  contract: { color: 'gold', label: '劳动合同签订' },
};

const AdminFields: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [data, setData] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [filterScope, setFilterScope] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldConfigItem | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFields(filterType || undefined);
      let all: FieldConfigItem[] = Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? [];
      // 前端分类过滤（当选择来源或子工单范围时）
      if (filterSource) {
        all = all.filter((f) => f.source_category === filterSource);
      }
      if (filterScope) {
        all = all.filter((f) => f.sub_ticket_scope === filterScope);
      }
      if (filterGroup) {
        all = all.filter((f) => f.collection_group === filterGroup);
      }
      setData(all);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterType, filterSource, filterScope, filterGroup]);

  const onSave = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await updateField(editing.id, v);
      else await createField(v);
      message.success('保存成功');
      setOpen(false); setEditing(null); form.resetFields(); load();
    } catch { message.error('保存失败'); }
  };

  const onDel = async (id: string) => {
    try { await deleteField(id); message.success('已删除'); load(); }
    catch { message.error('删除失败'); }
  };

  return (
    <PageContainer header={{ title: '字段配置' }} extra={[
      <Select key="ot" style={{ width: 140 }} value={filterType} onChange={(v) => { setFilterType(v); }} options={ORDER_OPT} placeholder="工单类型" getPopupContainer={getSelectPopupContainer} />,
      <Select key="sc" style={{ width: 140 }} value={filterSource} onChange={(v) => { setFilterSource(v); }} options={SOURCE_CATEGORY_OPT} placeholder="来源分类" getPopupContainer={getSelectPopupContainer} />,
      <Select key="ss" style={{ width: 140 }} value={filterScope} onChange={(v) => { setFilterScope(v); }} options={SUB_TICKET_SCOPE_OPT} placeholder="子工单范围" getPopupContainer={getSelectPopupContainer} />,
      <Select key="cg" style={{ width: 160 }} value={filterGroup} onChange={(v) => { setFilterGroup(v); }} options={COLLECTION_GROUP_OPT} placeholder="采集分组" getPopupContainer={getSelectPopupContainer} />,
      <Button key="add" type="primary" icon={<PlusOutlined />}
        onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>新建字段</Button>,
    ]}>
      <Table rowKey="id" loading={loading} dataSource={data} pagination={{ pageSize: 20 }}
        columns={[
          { title: '字段代码', dataIndex: 'field_code', width: 180 },
          { title: '字段名称', dataIndex: 'field_name', width: 160 },
          { title: '类型', dataIndex: 'field_type', width: 90,
            render: (v) => TYPE_OPT.find((t) => t.value === v)?.label || v },
          { title: '来源分类', dataIndex: 'source_category', width: 110,
            render: (v) => {
              const cfg = SOURCE_TAG[v];
              return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>通用</Tag>;
            } },
          { title: '子工单范围', dataIndex: 'sub_ticket_scope', width: 120,
            render: (v) => {
              const cfg = SCOPE_TAG[v];
              return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>通用</Tag>;
            } },
          { title: '采集分组', dataIndex: 'collection_group', width: 100,
            render: (v) => v ? <Tag>{v}</Tag> : '—' },
          { title: '所属工单', dataIndex: 'order_type', width: 90,
            render: (v) => ORDER_OPT.find((o) => o.value === (v || ''))?.label || '—' },
          { title: '必填', dataIndex: 'is_required', width: 70,
            render: (v) => v ? <Tag color="red">必填</Tag> : <Tag>选填</Tag> },
          { title: '排序', dataIndex: 'display_order', width: 60 },
          { title: '启用', dataIndex: 'is_active', width: 70,
            render: (v) => v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag> },
          { title: '操作', width: 160, fixed: 'right', render: (_, r) => (
            <Space>
              <Button size="small" icon={<EditOutlined />}
                onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>编辑</Button>
              {isAdmin && (
                <Popconfirm title="确定删除？" onConfirm={() => onDel(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </Space>
          ) },
        ]}
      />
      <Modal title={editing ? '编辑字段' : '新建字段'} open={open} width={640}
        onOk={onSave} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ field_type: 'text', is_required: false, is_active: true, display_order: 1 }}>
          <Form.Item name="field_code" label="字段代码" rules={[{ required: true }]}><Input placeholder="请输入字段英文标识" /></Form.Item>
          <Form.Item name="field_name" label="字段名称" rules={[{ required: true }]}><Input placeholder="如 员工姓名" /></Form.Item>
          <Form.Item name="field_type" label="字段类型" rules={[{ required: true }]}>
            <Select options={TYPE_OPT} getPopupContainer={getSelectPopupContainer} />
          </Form.Item>
          <Form.Item name="order_type" label="所属工单类型">
            <Select allowClear options={ORDER_OPT.filter((o) => o.value !== '')} placeholder="不限定" getPopupContainer={getSelectPopupContainer} />
          </Form.Item>
          <Form.Item name="source_category" label="来源分类">
            <Select allowClear options={[
              { label: '👤 客户填报', value: 'customer_filled' },
              { label: '📋 业务员补充', value: 'agent_supplemented' },
              { label: '⚡ 流程判断', value: 'process_judgment' },
            ]} placeholder="不限定" getPopupContainer={getSelectPopupContainer} />
          </Form.Item>
          <Form.Item name="sub_ticket_scope" label="子工单可见范围">
            <Select allowClear options={[
              { label: '全局可见', value: 'all' },
              { label: '数据录入子工单', value: 'data_entry' },
              { label: '社保公积金办理子工单', value: 'social_insurance' },
              { label: '入职联系子工单', value: 'onboarding_contact' },
              { label: '劳动合同签订子工单', value: 'contract' },
            ]} placeholder="不限定" getPopupContainer={getSelectPopupContainer} />
          </Form.Item>
          <Form.Item name="collection_group" label="采集分组">
            <Select
              allowClear
              options={COLLECTION_GROUP_OPT.filter((o) => o.value !== '')}
              placeholder="不限定"
              getPopupContainer={getSelectPopupContainer}
            />
          </Form.Item>
          <Form.Item name="is_required" label="是否必填" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="display_order" label="显示顺序"><InputNumber min={1} /></Form.Item>
          <Form.Item name="placeholder" label="占位提示"><Input /></Form.Item>
          <Form.Item name="help_text" label="帮助文案"><Input /></Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminFields;
