import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, Switch, Select, Popconfirm, App, Tag, Checkbox, Divider, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { getDetailViewTemplates, createDetailViewTemplate, updateDetailViewTemplate, deleteDetailViewTemplate, type DetailViewTemplateItem } from '../../../services/detailViewTemplates';
import { getFields, type FieldConfigItem } from '../../../services/fields';
import { getExportTemplates } from '../../../services/exportTemplates';
import { getImportTemplateConfig, getAvailableImportTemplateFields } from '../../../services/importTemplates';
import { getModuleFields as getConfiguredModuleFields } from '../../../services/moduleConfigs';

const DEFAULT_MODULE_CODE = 'onboarding';
const MAIN_ORDER_MODULE_CODES = new Set(['onboarding', 'resignation']);

const MODULE_GROUPS = [
  {
    label: '主工单',
    options: [
      { label: '入职主工单', value: 'onboarding' },
      { label: '离职主工单', value: 'resignation' },
    ],
  },
  {
    label: '入职管理',
    options: [
      { label: '入职联系', value: 'onboarding_contact' },
      { label: '劳动合同新签', value: 'contract' },
      { label: '增员报岗录入', value: 'data_entry' },
      { label: '社保公积金增员', value: 'social_insurance' },
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueCodes(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const code = String(value ?? '').trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    result.push(code);
  });
  return result;
}

function resolveTemplateFieldCode(item: Record<string, unknown>): string | undefined {
  return readString(item.fieldCode)
    ?? readString(item.field_code)
    ?? readString(item.code)
    ?? readString(item.sameAs);
}

async function resolveMainOrderFieldCodes(orderType: string): Promise<{ codes: string[]; source: string }> {
  const source = orderType === 'resignation' ? '离职批导入模板' : '入职批导入模板';
  try {
    const configured = await getImportTemplateConfig(orderType);
    const codes = uniqueCodes(configured.map((field) => field.field_code));
    if (codes.length > 0) return { codes, source };
  } catch {
    // 配置接口不可用时继续尝试可选字段接口。
  }

  try {
    const available = await getAvailableImportTemplateFields(orderType);
    return { codes: uniqueCodes(available.map((field) => field.field_code)), source: `${source}可用字段` };
  } catch {
    return { codes: [], source };
  }
}

async function resolveSubOrderFieldCodes(moduleCode: string): Promise<{ codes: string[]; source: string }> {
  const templates = await getExportTemplates(moduleCode);
  const exportCodes = uniqueCodes(
    templates.flatMap((template) => (template.field_list || []).map((field) => resolveTemplateFieldCode(field as Record<string, unknown>))),
  );
  if (exportCodes.length > 0) {
    return { codes: exportCodes, source: '批导出模板' };
  }

  const configuredFields = await getConfiguredModuleFields(moduleCode);
  return {
    codes: uniqueCodes(configuredFields.map((field) => field.field_code)),
    source: '模块字段配置（未找到批导出模板时兜底）',
  };
}

async function resolveDetailFieldCodes(moduleCode: string): Promise<{ codes: string[]; source: string }> {
  if (MAIN_ORDER_MODULE_CODES.has(moduleCode)) {
    return resolveMainOrderFieldCodes(moduleCode);
  }
  return resolveSubOrderFieldCodes(moduleCode);
}

const AdminDetailViewTemplates = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<DetailViewTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [systemFieldLoading, setSystemFieldLoading] = useState(false);
  const [availableFieldLoading, setAvailableFieldLoading] = useState(false);
  const [systemFields, setSystemFields] = useState<FieldConfigItem[]>([]);
  const [availableFieldCodes, setAvailableFieldCodes] = useState<string[]>([]);
  const [availableFieldSource, setAvailableFieldSource] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DetailViewTemplateItem | null>(null);
  const [form] = Form.useForm();
  const [selectedFieldCodes, setSelectedFieldCodes] = useState<string[]>([]);

  const watchedModuleCode = Form.useWatch('module_code', form);
  const currentModuleCode = watchedModuleCode || editing?.module_code || editing?.moduleCode || DEFAULT_MODULE_CODE;
  const fieldLoading = systemFieldLoading || availableFieldLoading;

  const systemFieldMap = useMemo(
    () => new Map(systemFields.map((field) => [field.field_code, field])),
    [systemFields],
  );

  const availableFields = useMemo(
    () => availableFieldCodes
      .map((code) => systemFieldMap.get(code))
      .filter((field): field is FieldConfigItem => Boolean(field)),
    [availableFieldCodes, systemFieldMap],
  );

  const selectedFields = useMemo(
    () => selectedFieldCodes.map((code) => systemFieldMap.get(code) ?? ({ field_code: code, field_name: code } as FieldConfigItem)),
    [selectedFieldCodes, systemFieldMap],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await getDetailViewTemplates();
      setData(Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? []);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSystemFields = async () => {
    setSystemFieldLoading(true);
    try {
      const list = await getFields();
      setSystemFields(list);
    } catch {
      message.error('加载系统字段失败');
      setSystemFields([]);
    } finally {
      setSystemFieldLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadSystemFields();
  }, []);

  useEffect(() => {
    if (!open || !currentModuleCode) return;
    let cancelled = false;
    setAvailableFieldLoading(true);
    resolveDetailFieldCodes(currentModuleCode)
      .then((result) => {
        if (cancelled) return;
        setAvailableFieldCodes(result.codes);
        setAvailableFieldSource(result.source);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableFieldCodes([]);
        setAvailableFieldSource('');
        message.error('加载模块可用字段失败');
      })
      .finally(() => {
        if (!cancelled) setAvailableFieldLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentModuleCode, message, open]);

  const handleCreate = () => {
    setEditing(null);
    setSelectedFieldCodes([]);
    setAvailableFieldCodes([]);
    setAvailableFieldSource('');
    form.resetFields();
    form.setFieldsValue({ is_active: true, module_code: DEFAULT_MODULE_CODE });
    setOpen(true);
  };

  const handleEdit = (record: DetailViewTemplateItem) => {
    setEditing(record);
    const fieldList = record.field_list ?? record.fieldList ?? [];
    const codes = uniqueCodes(fieldList.map((field: any) => resolveTemplateFieldCode(field)));
    setSelectedFieldCodes(codes);
    form.setFieldsValue({
      template_name: record.template_name ?? record.templateName,
      module_code: record.module_code ?? record.moduleCode,
      is_active: record.is_active ?? record.isActive,
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDetailViewTemplate(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        templateName: values.template_name,
        moduleCode: values.module_code,
        fieldList: selectedFieldCodes.map((code) => ({ fieldCode: code, kind: 'field' })),
        isActive: values.is_active ?? true,
      };

      if (editing) {
        await updateDetailViewTemplate(editing.id, payload);
        message.success('更新成功');
      } else {
        await createDetailViewTemplate(payload);
        message.success('创建成功');
      }
      setOpen(false);
      load();
    } catch (error: any) {
      if (error?.errorFields) {
        message.error('请检查表单');
      } else {
        message.error(editing ? '更新失败' : '创建失败');
      }
    }
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const handleFieldToggle = (fieldCode: string) => {
    if (selectedFieldCodes.includes(fieldCode)) {
      setSelectedFieldCodes(selectedFieldCodes.filter((c) => c !== fieldCode));
    } else {
      setSelectedFieldCodes([...selectedFieldCodes, fieldCode]);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newList = [...selectedFieldCodes];
    if (direction === 'up' && index > 0) {
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    } else if (direction === 'down' && index < newList.length - 1) {
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    }
    setSelectedFieldCodes(newList);
  };

  const removeSelectedField = (index: number) => {
    setSelectedFieldCodes(selectedFieldCodes.filter((_, i) => i !== index));
  };

  const columns = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name',
      render: (_: any, record: DetailViewTemplateItem) => record.template_name ?? record.templateName,
    },
    {
      title: '模块',
      dataIndex: 'module_code',
      key: 'module_code',
      render: (_: any, record: DetailViewTemplateItem) => {
        const code = record.module_code ?? record.moduleCode;
        return MODULES.find((m) => m.value === code)?.label || code;
      },
    },
    {
      title: '字段数量',
      dataIndex: 'field_list',
      key: 'field_count',
      render: (_: any, record: DetailViewTemplateItem) => (record.field_list ?? record.fieldList)?.length || 0,
    },
    {
      title: '是否启用',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (_: any, record: DetailViewTemplateItem) => (
        <Tag color={(record.is_active ?? record.isActive) ? 'green' : 'default'}>
          {(record.is_active ?? record.isActive) ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DetailViewTemplateItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title="详情页字段配置">
      <div style={{ background: '#fff', padding: 24 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ marginBottom: 16 }}>
          新建配置
        </Button>
        <Table
          loading={loading}
          columns={columns}
          dataSource={data}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </div>

      <Modal
        title={editing ? '编辑详情页字段配置' : '新建详情页字段配置'}
        open={open}
        onOk={handleOk}
        onCancel={handleCancel}
        width={1000}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changed) => {
            if (!editing && Object.prototype.hasOwnProperty.call(changed, 'module_code')) {
              setSelectedFieldCodes([]);
            }
          }}
        >
          <Form.Item label="配置名称" name="template_name" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如：入职主工单详情页字段" />
          </Form.Item>
          <Form.Item label="模块" name="module_code" rules={[{ required: true, message: '请选择模块' }]}>
            <Select
              placeholder="请选择模块"
              options={MODULE_GROUPS}
              disabled={!!editing}
            />
          </Form.Item>
          <Form.Item label="是否启用" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        <Divider>字段选择</Divider>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          字段来源：{availableFieldSource || '请先选择模块'}；主工单取批导入模板，子工单优先取批导出模板。
        </Typography.Text>
        <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', padding: 16 }}>
          {fieldLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>加载字段中...</div>
          ) : availableFields.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>该模块暂无可用字段</div>
          ) : (
            availableFields.map((field) => {
              const code = field.field_code ?? '';
              const name = field.field_name ?? code;
              return (
                <Checkbox
                  key={code}
                  checked={selectedFieldCodes.includes(code)}
                  onChange={() => handleFieldToggle(code)}
                  style={{ display: 'block', marginBottom: 8 }}
                >
                  {name}
                </Checkbox>
              );
            })
          )}
        </div>

        <Divider>已选字段（{selectedFieldCodes.length}）</Divider>
        <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', padding: 16 }}>
          {selectedFieldCodes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>尚未选择字段</div>
          ) : (
            selectedFields.map((field, index) => {
              const code = field.field_code;
              const name = field.field_name ?? code;
              return (
                <div
                  key={`${code}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    marginBottom: 8,
                    background: '#fafafa',
                    borderRadius: 4,
                  }}
                >
                  <span>{name}</span>
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={index === 0}
                      onClick={() => moveField(index, 'up')}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={index === selectedFieldCodes.length - 1}
                      onClick={() => moveField(index, 'down')}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeSelectedField(index)}
                    />
                  </Space>
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};

export default AdminDetailViewTemplates;
