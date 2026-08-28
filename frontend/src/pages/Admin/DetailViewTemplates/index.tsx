import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, Switch, Select, Popconfirm, App, Segmented, Tag, Checkbox, Divider, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { getDetailViewTemplates, createDetailViewTemplate, updateDetailViewTemplate, deleteDetailViewTemplate, type DetailViewTemplateItem } from '../../../services/detailViewTemplates';
import { getFields, type FieldConfigItem } from '../../../services/fields';
import { getExportTemplates } from '../../../services/exportTemplates';
import { getImportTemplateConfig, getAvailableImportTemplateFields } from '../../../services/importTemplates';
import { getModuleFields as getConfiguredModuleFields } from '../../../services/moduleConfigs';
import type { BusinessScope } from '@/utils/businessScope';
import {
  buildDetailTemplateFieldList,
  getDefaultDetailFieldGroups,
  getDetailTemplateFieldCodes,
  parseDetailTemplateGroups,
  type DetailTemplateFieldGroup,
} from '@/utils/detailViewTemplateLayout';

const DEFAULT_MODULE_CODE = 'onboarding';
const MAIN_ORDER_MODULE_CODES = new Set(['onboarding', 'resignation']);

export const MODULE_SELECT_GROUPS = [
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
      { label: '薪酬银行卡', value: 'payroll_bank_card' },
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
      { label: '离职证明', value: 'resignation_cert' },
    ],
  },
  {
    label: '在职管理',
    options: [
      { label: '单项业务办理', value: 'in_service_single_business' },
      { label: '劳动合同续签', value: 'renewal_contract' },
      { label: '证明开具', value: 'in_service_certificate' },
    ],
  },
  {
    label: '省外工单',
    options: [
      { label: '省外增员', value: 'out_of_province_increase' },
      { label: '省外减员', value: 'out_of_province_decrease' },
      { label: '省外单项业务', value: 'out_of_province_single_business' },
    ],
  },
];

const MODULES = MODULE_SELECT_GROUPS.flatMap((g) => g.options);
const MODULE_SELECT_GROUPS_BY_SCOPE: Record<BusinessScope, typeof MODULE_SELECT_GROUPS> = {
  beilun: MODULE_SELECT_GROUPS.filter((group) => group.label !== '省外工单'),
  out_of_province: MODULE_SELECT_GROUPS.filter((group) => group.label === '省外工单'),
};

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

async function resolveMainOrderFieldCodes(orderType: string, businessScope: BusinessScope): Promise<{ codes: string[]; source: string }> {
  const source = orderType === 'resignation' ? '离职批导入模板' : '入职批导入模板';
  try {
    const configured = await getImportTemplateConfig(orderType, businessScope);
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

async function resolveSubOrderFieldCodes(moduleCode: string, businessScope: BusinessScope): Promise<{ codes: string[]; source: string }> {
  const templates = await getExportTemplates(moduleCode, businessScope);
  const exportCodes = uniqueCodes(
    templates.flatMap((template) => (template.field_list || []).map((field) => resolveTemplateFieldCode(field as Record<string, unknown>))),
  );
  if (exportCodes.length > 0) {
    return { codes: exportCodes, source: '批导出模板' };
  }

  const configuredFields = await getConfiguredModuleFields(moduleCode, businessScope);
  return {
    codes: uniqueCodes(configuredFields.map((field) => field.field_code)),
    source: '模块字段配置（未找到批导出模板时兜底）',
  };
}

async function resolveDetailFieldCodes(moduleCode: string, businessScope: BusinessScope): Promise<{ codes: string[]; source: string }> {
  if (MAIN_ORDER_MODULE_CODES.has(moduleCode)) {
    return resolveMainOrderFieldCodes(moduleCode, businessScope);
  }
  return resolveSubOrderFieldCodes(moduleCode, businessScope);
}

export function createInitialFieldGroups(
  moduleCode: string,
  selectedFieldCodes: string[],
  systemFields: FieldConfigItem[],
  fieldList: Array<Record<string, unknown>> = [],
): DetailTemplateFieldGroup[] {
  const selected = new Set(selectedFieldCodes);
  const storedGroups = parseDetailTemplateGroups(fieldList);
  if (storedGroups.length > 0) {
    return storedGroups.map((group) => ({
      title: group.title,
      fieldCodes: group.fieldCodes.filter((code) => selected.has(code)),
    }));
  }

  const assigned = new Set<string>();
  const groups = getDefaultDetailFieldGroups(moduleCode).flatMap((group) => {
    const fieldCodes = group.fieldCodes.filter((code) => selected.has(code) && !assigned.has(code));
    fieldCodes.forEach((code) => assigned.add(code));
    return fieldCodes.length > 0 ? [{ title: group.title, fieldCodes }] : [];
  });

  const fieldMap = new Map(systemFields.map((field) => [field.field_code, field]));
  selectedFieldCodes.forEach((code) => {
    if (assigned.has(code)) return;
    const title = String(fieldMap.get(code)?.collection_group || '其他字段').trim() || '其他字段';
    let group = groups.find((item) => item.title === title);
    if (!group) {
      group = { title, fieldCodes: [] };
      groups.push(group);
    }
    group.fieldCodes.push(code);
    assigned.add(code);
  });

  return groups;
}

const AdminDetailViewTemplates = () => {
  const { message } = App.useApp();
  const [businessScope, setBusinessScope] = useState<BusinessScope>('beilun');
  const moduleSelectGroups = MODULE_SELECT_GROUPS_BY_SCOPE[businessScope];
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
  const [fieldGroups, setFieldGroups] = useState<DetailTemplateFieldGroup[]>([]);

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
      const res = await getDetailViewTemplates({ businessScope });
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
  }, [businessScope]);

  useEffect(() => {
    if (!open || !currentModuleCode) return;
    let cancelled = false;
    setAvailableFieldLoading(true);
    resolveDetailFieldCodes(currentModuleCode, businessScope)
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
  }, [businessScope, currentModuleCode, message, open]);

  const handleCreate = () => {
    setEditing(null);
    setSelectedFieldCodes([]);
    setFieldGroups(getDefaultDetailFieldGroups(moduleSelectGroups.flatMap((group) => group.options)[0]?.value || DEFAULT_MODULE_CODE).map((group) => ({ ...group, fieldCodes: [] })));
    setAvailableFieldCodes([]);
    setAvailableFieldSource('');
    form.resetFields();
    form.setFieldsValue({ is_active: true, module_code: moduleSelectGroups.flatMap((group) => group.options)[0]?.value || DEFAULT_MODULE_CODE });
    setOpen(true);
  };

  const handleEdit = (record: DetailViewTemplateItem) => {
    setEditing(record);
    const fieldList = record.field_list ?? record.fieldList ?? [];
    const codes = uniqueCodes(fieldList.map((field: any) => resolveTemplateFieldCode(field)));
    setSelectedFieldCodes(codes);
    setFieldGroups(createInitialFieldGroups(
      record.module_code ?? record.moduleCode,
      codes,
      systemFields,
      fieldList as Array<Record<string, unknown>>,
    ));
    form.setFieldsValue({
      template_name: record.template_name ?? record.templateName,
      module_code: record.module_code ?? record.moduleCode,
      is_active: record.is_active ?? record.isActive,
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDetailViewTemplate(id, businessScope);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const normalizedTitles = fieldGroups.map((group) => group.title.trim());
      if (normalizedTitles.some((title) => !title)) {
        message.error('分组名称不能为空');
        return;
      }
      if (new Set(normalizedTitles).size !== normalizedTitles.length) {
        message.error('分组名称不能重复');
        return;
      }
      const payload = {
        templateName: values.template_name,
        moduleCode: values.module_code,
        fieldList: buildDetailTemplateFieldList(selectedFieldCodes, fieldGroups),
        isActive: values.is_active ?? true,
        businessScope,
      };

      if (editing) {
        await updateDetailViewTemplate(editing.id, payload, businessScope);
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
      setFieldGroups(fieldGroups.map((group) => ({
        ...group,
        fieldCodes: group.fieldCodes.filter((code) => code !== fieldCode),
      })));
    } else {
      setSelectedFieldCodes([...selectedFieldCodes, fieldCode]);
      const defaultGroup = getDefaultDetailFieldGroups(currentModuleCode)
        .find((group) => group.fieldCodes.includes(fieldCode));
      if (defaultGroup) {
        const targetIndex = fieldGroups.findIndex((group) => group.title === defaultGroup.title);
        if (targetIndex >= 0) {
          assignFieldToGroup(fieldCode, targetIndex);
        }
      }
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
    const fieldCode = selectedFieldCodes[index];
    setSelectedFieldCodes(selectedFieldCodes.filter((_, i) => i !== index));
    setFieldGroups(fieldGroups.map((group) => ({
      ...group,
      fieldCodes: group.fieldCodes.filter((code) => code !== fieldCode),
    })));
  };

  const addFieldGroup = () => {
    const existing = new Set(fieldGroups.map((group) => group.title));
    let suffix = fieldGroups.length + 1;
    let title = `新分组${suffix}`;
    while (existing.has(title)) {
      suffix += 1;
      title = `新分组${suffix}`;
    }
    setFieldGroups([...fieldGroups, { title, fieldCodes: [] }]);
  };

  const renameFieldGroup = (index: number, title: string) => {
    setFieldGroups(fieldGroups.map((group, groupIndex) => (
      groupIndex === index ? { ...group, title } : group
    )));
  };

  const moveFieldGroup = (index: number, direction: 'up' | 'down') => {
    const next = [...fieldGroups];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFieldGroups(next);
  };

  const removeFieldGroup = (index: number) => {
    setFieldGroups(fieldGroups.filter((_, groupIndex) => groupIndex !== index));
  };

  const assignFieldToGroup = (fieldCode: string, targetGroupIndex?: number) => {
    setFieldGroups(fieldGroups.map((group, groupIndex) => {
      const fieldCodes = group.fieldCodes.filter((code) => code !== fieldCode);
      if (groupIndex === targetGroupIndex) fieldCodes.push(fieldCode);
      return { ...group, fieldCodes };
    }));
  };

  const moveFieldInGroup = (groupIndex: number, fieldIndex: number, direction: 'up' | 'down') => {
    setFieldGroups(fieldGroups.map((group, currentGroupIndex) => {
      if (currentGroupIndex !== groupIndex) return group;
      const fieldCodes = [...group.fieldCodes];
      const target = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
      if (target < 0 || target >= fieldCodes.length) return group;
      [fieldCodes[fieldIndex], fieldCodes[target]] = [fieldCodes[target], fieldCodes[fieldIndex]];
      return { ...group, fieldCodes };
    }));
  };

  const groupedFieldCodes = new Set(fieldGroups.flatMap((group) => group.fieldCodes));
  const ungroupedFields = selectedFields.filter((field) => !groupedFieldCodes.has(field.field_code));

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
      render: (_: any, record: DetailViewTemplateItem) => getDetailTemplateFieldCodes(record.field_list ?? record.fieldList).length,
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
        <Space style={{ marginBottom: 16 }}>
          <Segmented value={businessScope} options={[{ label: '北仑配置', value: 'beilun' }, { label: '省外配置', value: 'out_of_province' }]} onChange={(value) => setBusinessScope(value as BusinessScope)} />
        </Space>
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
              setFieldGroups(getDefaultDetailFieldGroups(changed.module_code).map((group) => ({ ...group, fieldCodes: [] })));
            }
          }}
        >
          <Form.Item label="配置名称" name="template_name" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如：入职主工单详情页字段" />
          </Form.Item>
          <Form.Item label="模块" name="module_code" rules={[{ required: true, message: '请选择模块' }]}>
            <Select
              placeholder="请选择模块"
              options={moduleSelectGroups}
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

        <Divider>详情分组（{fieldGroups.length}）</Divider>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          分组顺序和字段归属会同步到详情页；未归组字段将显示在“其他字段”中。
        </Typography.Text>
        <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid #f0f0f0', padding: 16 }}>
          {fieldGroups.map((group, groupIndex) => (
            <div
              key={`group-${groupIndex}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const fieldCode = event.dataTransfer.getData('text/plain');
                if (fieldCode) assignFieldToGroup(fieldCode, groupIndex);
              }}
              style={{ border: '1px solid #d9d9d9', padding: 12, marginBottom: 12, borderRadius: 4 }}
            >
              <Space style={{ width: '100%', marginBottom: 8 }} align="start">
                <Input
                  value={group.title}
                  onChange={(event) => renameFieldGroup(groupIndex, event.target.value)}
                  placeholder="分组名称"
                  style={{ width: 240 }}
                />
                <Button type="text" icon={<ArrowUpOutlined />} disabled={groupIndex === 0} onClick={() => moveFieldGroup(groupIndex, 'up')} />
                <Button type="text" icon={<ArrowDownOutlined />} disabled={groupIndex === fieldGroups.length - 1} onClick={() => moveFieldGroup(groupIndex, 'down')} />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeFieldGroup(groupIndex)} />
              </Space>
              {group.fieldCodes.map((code, fieldIndex) => {
                const field = selectedFields.find((item) => item.field_code === code);
                if (!field) return null;
                return (
                  <div
                    key={`${code}-${fieldIndex}`}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', code)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#fafafa', marginBottom: 6, cursor: 'grab' }}
                  >
                    <span>{field.field_name ?? code}</span>
                    <Space size="small">
                      <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={fieldIndex === 0} onClick={() => moveFieldInGroup(groupIndex, fieldIndex, 'up')} />
                      <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={fieldIndex === group.fieldCodes.length - 1} onClick={() => moveFieldInGroup(groupIndex, fieldIndex, 'down')} />
                      <Select
                        size="small"
                        value={groupIndex}
                        options={fieldGroups.map((item, index) => ({ value: index, label: item.title || `分组${index + 1}` }))}
                        onChange={(value) => assignFieldToGroup(code, Number(value))}
                        style={{ width: 150 }}
                      />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeSelectedField(selectedFieldCodes.indexOf(code))} />
                    </Space>
                  </div>
                );
              })}
            </div>
          ))}
          {ungroupedFields.map((field) => (
            <div
              key={`ungrouped-${field.field_code}`}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', field.field_code)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#fffbe6', marginBottom: 6, cursor: 'grab' }}
            >
              <span>{field.field_name ?? field.field_code}</span>
              <Select
                size="small"
                value={undefined}
                placeholder="选择分组"
                options={fieldGroups.map((item, index) => ({ value: index, label: item.title || `分组${index + 1}` }))}
                onChange={(value) => assignFieldToGroup(field.field_code, Number(value))}
                style={{ width: 150 }}
              />
            </div>
          ))}
        </div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addFieldGroup} style={{ marginTop: 8 }}>
          新增分组
        </Button>
      </Modal>
    </PageContainer>
  );
};

export default AdminDetailViewTemplates;
