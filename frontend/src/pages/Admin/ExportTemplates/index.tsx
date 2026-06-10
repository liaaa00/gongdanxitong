import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, Switch, Select, Popconfirm, App, Tag, Checkbox, Divider, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { getExportTemplates, createExportTemplate, updateExportTemplate, deleteExportTemplate } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';
import { getFields } from '@/services/fields';
import type { FieldConfigItem } from '@/services/fields';
import {
  buildExportFieldOptions,
  buildTemplateFieldPayload,
  createTemplateField,
  normalizeTemplateFields,
  type SelectedField,
} from './fieldList';

const MODULE_GROUPS = [
  {
    label: '入职管理',
    options: [
      { label: '增员报岗录入', value: 'data_entry' },
      { label: '社保公积金增员', value: 'social_insurance' },
      { label: '入职联系', value: 'onboarding_contact' },
      { label: '劳动合同新签', value: 'contract' },
    ],
  },
  {
    label: '在职管理（后台保留，第一阶段界面隐藏）',
    options: [
      { label: '劳动合同续签', value: 'renewal_contract' },
      { label: '待遇申报', value: 'benefit' },
    ],
  },
  {
    label: '离职管理',
    options: [
      { label: '离职材料收集', value: 'resignation_contact' },
      { label: '减员报岗录入', value: 'data_entry_resign' },
      { label: '社保公积金减员', value: 'resignation_social_insurance' },
    ],
  },
];

const MODULES = MODULE_GROUPS.flatMap((g) => g.options);

const FIELD_KIND_LABEL: Record<SelectedField['kind'], string> = {
  field: '业务字段',
  empty: '空值字段',
  default: '默认值字段',
};

const FIELD_KIND_COLOR: Record<SelectedField['kind'], string> = {
  field: 'blue',
  empty: 'default',
  default: 'green',
};

const AdminExportTemplates = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<ExportTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [systemFields, setSystemFields] = useState<FieldConfigItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExportTemplateItem | null>(null);
  const [form] = Form.useForm();
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);

  const watchedModuleCode = Form.useWatch('module_code', form);
  const activeModuleCode = watchedModuleCode || editing?.module_code || 'contract';
  const fieldGroups = useMemo(
    () => buildExportFieldOptions(systemFields, activeModuleCode),
    [systemFields, activeModuleCode],
  );
  const allFields = useMemo(
    () => fieldGroups.flatMap((group) => group.fields),
    [fieldGroups],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await getExportTemplates();
      setData(Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? []);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSystemFields = async () => {
    setFieldLoading(true);
    try {
      const list = await getFields();
      setSystemFields(list);
    } catch {
      message.error('加载系统字段失败');
      setSystemFields([]);
    } finally {
      setFieldLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadSystemFields();
  }, []);

  const resetModalState = () => {
    setEditing(null);
    form.resetFields();
    setSelectedFields([]);
  };

  const openModal = (record?: ExportTemplateItem) => {
    setEditing(record || null);
    if (record) {
      form.setFieldsValue({
        template_name: record.template_name,
        module_code: record.module_code,
        is_shared: record.is_shared,
        sign_platform: record.sign_platform ?? undefined,
      });
      const fieldsForRecord = buildExportFieldOptions(systemFields, record.module_code).flatMap((group) => group.fields);
      setSelectedFields(normalizeTemplateFields(record.field_list || [], fieldsForRecord));
    } else {
      form.resetFields();
      setSelectedFields([]);
    }
    setOpen(true);
  };

  const toggleField = (code: string, name: string) => {
    setSelectedFields((prev) => {
      const exists = prev.find((f) => f.kind === 'field' && f.field_code === code);
      if (exists) return prev.filter((f) => f.id !== exists.id).map((f, i) => ({ ...f, order: i + 1 }));
      return [...prev, { id: `field-${code}-${Date.now()}`, kind: 'field', field_code: code, alias: name, original_alias: name, order: prev.length + 1 }];
    });
  };

  const addTemplateColumn = (kind: 'empty' | 'default') => {
    setSelectedFields((prev) => [...prev, createTemplateField(kind, prev.length + 1)]);
  };

  const removeSelectedField = (id: string) => {
    setSelectedFields((prev) => prev.filter((field) => field.id !== id).map((field, i) => ({ ...field, order: i + 1 })));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setSelectedFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  };

  const updateSelectedField = (index: number, patch: Partial<SelectedField>) => {
    setSelectedFields((prev) => prev.map((field, i) => i === index ? { ...field, ...patch } : field));
  };

  const onSave = async () => {
    const v = await form.validateFields();
    if (selectedFields.length === 0) {
      message.warning('请至少选择一个导出字段');
      return;
    }
    const invalid = selectedFields.find((field) => !field.alias.trim());
    if (invalid) {
      message.warning('导出列名不能为空');
      return;
    }
    const fieldList = buildTemplateFieldPayload(selectedFields);
    const payload: Partial<ExportTemplateItem> = {
      template_name: v.template_name,
      module_code: v.module_code,
      field_list: fieldList,
      is_shared: v.is_shared,
      sign_platform: v.module_code === 'contract' ? (v.sign_platform ?? null) : null,
    };
    try {
      if (editing) await updateExportTemplate(editing.id, payload);
      else await createExportTemplate(payload);
      message.success('保存成功');
      setOpen(false);
      resetModalState();
      load();
    } catch {
      message.error('保存失败');
    }
  };

  const onDel = async (id: string) => {
    try {
      await deleteExportTemplate(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <PageContainer header={{ title: '导出模板配置' }} extra={[
      <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建模板</Button>,
    ]}>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '模板名', dataIndex: 'template_name' },
          { title: '适用模块', dataIndex: 'module_code', width: 150, render: (v) => MODULES.find((m) => m.value === v)?.label || v },
          { title: '字段数', dataIndex: 'field_list', width: 100, render: (v: unknown[]) => v?.length || 0 },
          { title: '创建人', dataIndex: 'created_by', width: 120 },
          { title: '共享', dataIndex: 'is_shared', width: 90, render: (v) => v ? <Tag color="blue">共享</Tag> : <Tag>私有</Tag> },
          { title: '创建时间', dataIndex: 'created_at', width: 180 },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>编辑</Button>
                <Popconfirm title="确定删除？" onConfirm={() => onDel(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑模板' : '新建模板'}
        open={open}
        width={1040}
        onOk={onSave}
        onCancel={() => { setOpen(false); resetModalState(); }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ is_shared: false, module_code: 'contract' }}>
          <Space style={{ width: '100%' }} align="start" size={24}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Form.Item name="template_name" label="模板名" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="module_code" label="适用模块" rules={[{ required: true }]}>
                <Select options={MODULE_GROUPS as any} placeholder="选择模块" />
              </Form.Item>
              <Form.Item
                name="sign_platform"
                label="电子签平台（仅劳动合同新签）"
                tooltip="区分速创 / E签宝两套导出模板；非劳动合同新签模块无需选择"
              >
                <Select allowClear placeholder="不限平台" options={[{ label: '速创', value: '速创' }, { label: 'E签宝', value: 'E签宝' }]} />
              </Form.Item>
              <Form.Item name="is_shared" label="团队共享" valuePropName="checked"><Switch /></Form.Item>
            </div>
          </Space>
        </Form>

        <Divider orientation="left">选择导出字段（勾选后可调整顺序、别名和模板自带列）</Divider>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1, maxHeight: 420, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
            {fieldLoading && <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>正在加载系统字段...</div>}
            {!fieldLoading && systemFields.length === 0 && (
              <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>系统字段库暂无可用字段，当前仅显示导出专用字段。</div>
            )}
            {!fieldLoading && fieldGroups.map((group) => (
              <div key={group.group}>
                <Typography.Text strong style={{ fontSize: 12, color: '#666' }}>{group.group}</Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 0', marginBottom: 8, marginTop: 4 }}>
                  {group.fields.map((f) => (
                    <div key={f.code} style={{ width: '50%' }}>
                      <Checkbox
                        checked={selectedFields.some((sf) => sf.kind === 'field' && sf.field_code === f.code)}
                        onChange={() => toggleField(f.code, f.name)}
                      >
                        <span style={{ fontSize: 12 }}>{f.name}</span>
                      </Checkbox>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ width: 420, maxHeight: 420, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} align="center">
              <Typography.Text strong style={{ fontSize: 12, color: '#666' }}>
                已选字段（{selectedFields.length}个，可调整顺序）
              </Typography.Text>
              <Space size={4}>
                <Button size="small" onClick={() => addTemplateColumn('empty')}>添加空值列</Button>
                <Button size="small" onClick={() => addTemplateColumn('default')}>添加默认值列</Button>
              </Space>
            </Space>
            {selectedFields.length === 0 && (
              <div style={{ color: '#bbb', fontSize: 12, marginTop: 8 }}>请在左侧勾选字段，或添加空值/默认值列</div>
            )}
            {selectedFields.map((field, index) => {
              const fieldMeta = field.kind === 'field' ? allFields.find((af) => af.code === field.field_code) : null;
              return (
                <div key={field.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6, padding: '6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 11, color: '#999', width: 18, textAlign: 'center', paddingTop: 2 }}>{index + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={4} style={{ marginBottom: 4 }}>
                      <Tag color={FIELD_KIND_COLOR[field.kind]} style={{ marginInlineEnd: 0 }}>{FIELD_KIND_LABEL[field.kind]}</Tag>
                      <Typography.Text style={{ fontSize: 11, color: '#666' }} ellipsis>
                        {field.kind === 'field' ? (fieldMeta?.name || field.field_code) : (field.kind === 'empty' ? '导出固定空白值' : '导出固定默认值')}
                      </Typography.Text>
                    </Space>
                    <Input
                      size="small"
                      value={field.alias}
                      onChange={(e) => updateSelectedField(index, { alias: e.target.value })}
                      placeholder="导出列名（别名）"
                      style={{ fontSize: 11, marginBottom: field.kind === 'default' ? 4 : 0 }}
                    />
                    {field.kind === 'default' && (
                      <Input
                        size="small"
                        value={field.const_value}
                        onChange={(e) => updateSelectedField(index, { const_value: e.target.value })}
                        placeholder="默认值，例如：新签、甲方、待确认"
                        style={{ fontSize: 11 }}
                      />
                    )}
                  </div>
                  <Space size={2} direction="vertical">
                    <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveField(index, -1)} style={{ padding: '0 4px', height: 20 }} />
                    <Button size="small" icon={<ArrowDownOutlined />} disabled={index === selectedFields.length - 1} onClick={() => moveField(index, 1)} style={{ padding: '0 4px', height: 20 }} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSelectedField(field.id)} style={{ padding: '0 4px', height: 20 }} />
                  </Space>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};

export default AdminExportTemplates;
