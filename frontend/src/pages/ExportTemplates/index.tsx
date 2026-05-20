import { useState, useRef, useEffect } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Modal, Form, Input, Select, Switch, Space, App, Tag, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ExportOutlined } from '@ant-design/icons';
import { getExportTemplates, createExportTemplate, updateExportTemplate, deleteExportTemplate } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';
import { getFields } from '@/services/fields';
import type { FieldConfigItem } from '@/services/fields';
import type { PageParams } from '@/services/mock';

const MODULE_OPTIONS = [
  { label: '劳动合同签订', value: 'contract' },
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '数据录入', value: 'data_entry' },
];

const ExportTemplates: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExportTemplateItem | null>(null);
  const [form] = Form.useForm();
  const [availableFields, setAvailableFields] = useState<FieldConfigItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // ★ 安全加载字段，必须有 catch 兜底
  useEffect(() => {
    getFields()
      .then((list) => {
        setAvailableFields(Array.isArray(list) ? list : []);
      })
      .catch((e: any) => {
        console.warn('加载字段列表失败', e);
        setFieldsError(e?.message || '字段列表加载失败');
        setAvailableFields([]);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const selectedFields: string[] = Array.isArray(values.selectedFields) ? values.selectedFields : [];
      const data = {
        ...values,
        field_list: selectedFields.map((fc: string, i: number) => ({ field_code: fc, alias: '', order: i + 1 })),
      };
      if (editing) { await updateExportTemplate(editing.id, data); message.success('已更新'); }
      else { await createExportTemplate(data); message.success('已创建'); }
      setModalOpen(false);
      form.resetFields();
      actionRef.current?.reload();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExportTemplate(id);
      message.success('已删除');
      actionRef.current?.reload();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const columns: ProColumns<ExportTemplateItem>[] = [
    { title: '模板名', dataIndex: 'template_name', key: 'template_name', width: 180 },
    {
      title: '模块', dataIndex: 'module_code', key: 'module_code', width: 120,
      valueType: 'select',
      valueEnum: {
        contract: { text: '劳动合同' },
        onboarding_contact: { text: '入职联系' },
        data_entry: { text: '数据录入' },
      },
    },
    {
      title: '字段数', dataIndex: 'field_list', key: 'field_count', width: 80, hideInSearch: true,
      render: (_: unknown, r: ExportTemplateItem) => {
        const len = Array.isArray(r.field_list) ? r.field_list.length : 0;
        return len;
      },
    },
    {
      title: '共享', dataIndex: 'is_shared', key: 'is_shared', width: 70, hideInSearch: true,
      render: (_: unknown, r: ExportTemplateItem) =>
        r.is_shared ? <Tag color="green">共享</Tag> : <Tag>私有</Tag>,
    },
    { title: '创建人', dataIndex: 'created_by', key: 'created_by', width: 100 },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 140, valueType: 'dateTime' },
    {
      title: '操作', key: 'actions', width: 180, hideInSearch: true,
      render: (_: unknown, r: ExportTemplateItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => {
              setEditing(r);
              form.setFieldsValue({
                ...r,
                selectedFields: Array.isArray(r.field_list) ? r.field_list.map((f) => f.field_code) : [],
              });
              setModalOpen(true);
            }}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}
            onClick={() => handleDelete(r.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  const handleExportClick = () => {
    message.info('导出功能（当前 mock 环境仅演示）');
  };

  return (
    <PageContainer header={{ title: '导出模板管理' }}>
      {fieldsError && (
        <Alert type="warning" message={fieldsError} closable style={{ marginBottom: 12 }}
          onClose={() => setFieldsError(null)} />
      )}

      <ProTable<ExportTemplateItem>
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        request={async (params: PageParams) => {
          try {
            const moduleCode = params.module_code ? String(params.module_code) : undefined;
            const result = await getExportTemplates(moduleCode);
            // ★ 防御：确保 result 是数组
            const data = Array.isArray(result) ? result : [];
            return { data, success: true, total: data.length };
          } catch (e: any) {
            console.error('加载导出模板失败', e);
            message.error(e?.message || '加载导出模板失败');
            return { data: [], success: false, total: 0 };
          }
        }}
        search={{ labelWidth: 'auto' }}
        headerTitle="导出模板"
        toolBarRender={() => [
          <Button key="export" icon={<ExportOutlined />} onClick={handleExportClick}>导出</Button>,
          <Button key="new" type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>新增模板</Button>,
        ]}
        pagination={{ defaultPageSize: 20 }}
        dateFormatter="string"
      />

      <Modal title={editing ? '编辑模板' : '新增模板'} open={modalOpen}
        onOk={handleSave} onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={saving} width={640} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ is_shared: true }}>
          <Form.Item name="template_name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="输入模板名称" />
          </Form.Item>
          <Form.Item name="module_code" label="关联模块" rules={[{ required: true }]}>
            <Select options={MODULE_OPTIONS} placeholder="选择模块" />
          </Form.Item>
          <Form.Item name="is_shared" label="共享" valuePropName="checked">
            <Switch checkedChildren="共享" unCheckedChildren="私有" />
          </Form.Item>
          <Form.Item name="selectedFields" label="选择字段（可多选）"
            rules={[{ required: true, message: '至少选择一个字段' }]}>
            <Select mode="multiple" placeholder="勾选要导出的字段"
              options={(Array.isArray(availableFields) ? availableFields : []).map((f) => ({
                label: f.field_name,
                value: f.field_code,
              }))}
              style={{ width: '100%' }} />
          </Form.Item>
          <span style={{ fontSize: 12, color: '#666' }}>
            提示：勾选字段后将按勾选顺序导出到表格，后端将读取 field_list 生成列。
          </span>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default ExportTemplates;
