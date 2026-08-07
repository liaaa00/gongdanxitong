import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, Popconfirm, App, Tag, Alert } from 'antd';
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

const TEMPLATE_INCLUSION_OPT = [
  { label: '全部字段', value: '' },
  { label: '标准字段', value: 'true' },
  { label: '可选字段', value: 'false' },
];

const COLLECTION_GROUP_OPT = [
  { label: '全部分组', value: '' },
  { label: '基本信息', value: '基本信息' },
  { label: '劳动合同新签', value: '劳动合同新签' },
  { label: '入职联系', value: '入职联系' },
  { label: '离职材料收集', value: '离职材料收集' },
  { label: '发薪信息', value: '发薪信息' },
  { label: '社保公积金类', value: '社保公积金类' },
];

const getSelectPopupContainer = (triggerNode: HTMLElement) => triggerNode.parentElement || document.body;

const AdminFields: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [data, setData] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterTemplateInclusion, setFilterTemplateInclusion] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldConfigItem | null>(null);
  const [form] = Form.useForm();
  const fieldType = Form.useWatch('field_type', form);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFields(filterType || undefined);
      let all: FieldConfigItem[] = Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? [];
      if (filterGroup) {
        all = all.filter((field) => field.collection_group === filterGroup);
      }
      if (filterTemplateInclusion) {
        const included = filterTemplateInclusion === 'true';
        all = all.filter((field) => field.is_included_in_template === included);
      }
      setData(all);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterType, filterGroup, filterTemplateInclusion]);

  const onSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      default_required: values.is_required,
      dropdown_options: values.field_type === 'dropdown' ? values.dropdown_options : null,
    };
    try {
      if (editing) {
        await updateField(editing.id, payload);
      } else {
        await createField(payload);
      }
      message.success('保存成功');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch {
      message.error('保存失败');
    }
  };

  const onDel = async (id: string) => {
    try {
      await deleteField(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (field: FieldConfigItem) => {
    setEditing(field);
    form.setFieldsValue({
      ...field,
      dropdown_options: field.dropdown_options?.map((option) => option.value) ?? undefined,
    });
    setOpen(true);
  };

  return (
    <PageContainer header={{ title: '表单字段管理' }} extra={[
      <Select
        key="ot"
        style={{ width: 160 }}
        value={filterType}
        onChange={setFilterType}
        options={ORDER_OPT}
        placeholder="适用工单/模板"
        getPopupContainer={getSelectPopupContainer}
      />,
      <Select
        key="cg"
        style={{ width: 160 }}
        value={filterGroup}
        onChange={setFilterGroup}
        options={COLLECTION_GROUP_OPT}
        placeholder="表单分组"
        getPopupContainer={getSelectPopupContainer}
      />,
      <Select
        key="ti"
        style={{ width: 140 }}
        value={filterTemplateInclusion}
        onChange={setFilterTemplateInclusion}
        options={TEMPLATE_INCLUSION_OPT}
        placeholder="模板包含"
        getPopupContainer={getSelectPopupContainer}
      />,
      <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        新增表单字段
      </Button>,
    ]}>
      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="这里维护字段名称、类型、适用工单和模板。角色填写权限请到“字段填写权限”设置。"
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '系统标识', dataIndex: 'field_code', width: 180 },
          { title: '字段名称', dataIndex: 'field_name', width: 160 },
          {
            title: '类型',
            dataIndex: 'field_type',
            width: 90,
            render: (value) => TYPE_OPT.find((item) => item.value === value)?.label || value,
          },
          {
            title: '包含在标准模板',
            dataIndex: 'is_included_in_template',
            width: 140,
            render: (value, record) => (
              <Switch
                checked={value ?? true}
                onChange={async (checked) => {
                  try {
                    await updateField(record.id, { is_included_in_template: checked });
                    message.success('已更新');
                    load();
                  } catch {
                    message.error('更新失败');
                  }
                }}
              />
            ),
          },
          {
            title: '表单分组',
            dataIndex: 'collection_group',
            width: 120,
            render: (value) => value ? <Tag>{value}</Tag> : '—',
          },
          {
            title: '适用工单/模板',
            dataIndex: 'order_type',
            width: 130,
            render: (value) => ORDER_OPT.find((item) => item.value === (value || ''))?.label || '—',
          },
          {
            title: '必填',
            dataIndex: 'is_required',
            width: 70,
            render: (value) => value ? <Tag color="red">必填</Tag> : <Tag>选填</Tag>,
          },
          { title: '排序', dataIndex: 'display_order', width: 60 },
          {
            title: '启用',
            dataIndex: 'is_active',
            width: 70,
            render: (value) => value ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          {
            title: '操作',
            width: 160,
            fixed: 'right',
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  编辑
                </Button>
                {isAdmin && (
                  <Popconfirm title="确定删除？" onConfirm={() => onDel(record.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑表单字段' : '新增表单字段'}
        open={open}
        width={640}
        onOk={onSave}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            field_type: 'text',
            is_required: false,
            is_active: true,
            is_included_in_template: true,
            display_order: 1,
          }}
        >
          {editing && (
            <Form.Item name="field_code" label="系统标识">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item name="field_name" label="字段名称" rules={[{ required: true, message: '请输入字段名称' }]}>
            <Input placeholder="如 员工姓名" />
          </Form.Item>
          <Form.Item name="field_type" label="字段类型" rules={[{ required: true, message: '请选择字段类型' }]}>
            <Select options={TYPE_OPT} getPopupContainer={getSelectPopupContainer} />
          </Form.Item>
          {fieldType === 'dropdown' && (
            <Form.Item
              name="dropdown_options"
              label="下拉选项"
              rules={[{ required: true, type: 'array', min: 1, message: '请至少输入一个下拉选项' }]}
            >
              <Select
                mode="tags"
                tokenSeparators={[',', '，']}
                placeholder="输入选项后按回车，可输入多个"
                getPopupContainer={getSelectPopupContainer}
              />
            </Form.Item>
          )}
          <Form.Item name="order_type" label="适用工单/模板">
            <Select
              allowClear
              options={ORDER_OPT.filter((item) => item.value !== '')}
              placeholder="不限定"
              getPopupContainer={getSelectPopupContainer}
            />
          </Form.Item>
          <Form.Item name="collection_group" label="表单分组">
            <Select
              allowClear
              options={COLLECTION_GROUP_OPT.filter((item) => item.value !== '')}
              placeholder="不限定"
              getPopupContainer={getSelectPopupContainer}
            />
          </Form.Item>
          <Form.Item name="is_required" label="是否必填" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="is_included_in_template"
            label="包含在标准模板"
            valuePropName="checked"
            tooltip="开启后字段会出现在 Excel 导入模板的标准列中；关闭后作为可选字段。"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="display_order" label="显示顺序">
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="placeholder" label="占位提示">
            <Input />
          </Form.Item>
          <Form.Item name="help_text" label="字段说明">
            <Input placeholder="给填写人看的简短说明，可不填" />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminFields;
