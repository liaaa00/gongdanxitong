import React, { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, App, Button, Card, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons';
import {
  getAvailableImportTemplateFields,
  getImportTemplateConfig,
  replaceImportTemplateConfig,
  type ImportTemplateFieldItem,
} from '@/services/importTemplates';
import { downloadServerImportTemplate } from '@/services/workOrders';

const { Text } = Typography;

const ORDER_OPTIONS = [
  { label: '入职导入模板', value: 'onboarding' },
  { label: '离职导入模板', value: 'resignation' },
];

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const option = item as { label?: unknown; value?: unknown; name?: unknown };
      return String(option.label ?? option.value ?? option.name ?? '').trim();
    }
    return String(item ?? '').trim();
  }).filter(Boolean);
}

function getHeaderName(field: ImportTemplateFieldItem): string {
  return (field.header_alias || field.field_name || field.field_code).trim();
}

function getRequiredText(field: ImportTemplateFieldItem): string {
  if (field.is_required_override === true) return '强制必填';
  if (field.is_required_override === false) return '强制非必填';
  if (field.is_required || field.default_required) return '必填';
  if (field.conditional_required) return '条件必填';
  return '非必填';
}

function requiredTagColor(text: string): string {
  if (text === '必填' || text === '强制必填') return 'red';
  if (text === '条件必填') return 'orange';
  if (text === '强制非必填') return 'blue';
  return 'default';
}

function reorder(items: ImportTemplateFieldItem[]): ImportTemplateFieldItem[] {
  return items.map((item, index) => ({ ...item, display_order: index + 1 }));
}

const AdminImportTemplates: React.FC = () => {
  const { message } = App.useApp();
  const [orderType, setOrderType] = useState('onboarding');
  const [fields, setFields] = useState<ImportTemplateFieldItem[]>([]);
  const [availableFields, setAvailableFields] = useState<ImportTemplateFieldItem[]>([]);
  const [addingField, setAddingField] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedCodes = useMemo(() => new Set(fields.map((field) => field.field_code)), [fields]);
  const addOptions = useMemo(
    () => availableFields
      .filter((field) => !selectedCodes.has(field.field_code))
      .map((field) => ({
        label: `${field.field_name || field.field_code}（${field.field_code}）`,
        value: field.field_code,
      })),
    [availableFields, selectedCodes],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [configured, available] = await Promise.all([
        getImportTemplateConfig(orderType),
        getAvailableImportTemplateFields(orderType),
      ]);
      setFields(reorder([...configured].sort((a, b) => (a.display_order || 0) - (b.display_order || 0))));
      setAvailableFields(available.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
      setAddingField(undefined);
    } catch (error: any) {
      message.error(error?.message || '加载导入模板配置失败');
      setFields([]);
      setAvailableFields([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [orderType]);

  const updateField = (index: number, patch: Partial<ImportTemplateFieldItem>) => {
    setFields((prev) => prev.map((field, i) => i === index ? { ...field, ...patch } : field));
  };

  const addField = (fieldCode?: string) => {
    if (!fieldCode) return;
    const field = availableFields.find((item) => item.field_code === fieldCode);
    if (!field || selectedCodes.has(fieldCode)) return;
    setFields((prev) => reorder([
      ...prev,
      {
        ...field,
        header_alias: null,
        is_required_override: null,
        source: 'configured',
      },
    ]));
    setAddingField(undefined);
  };

  const removeField = (index: number) => {
    setFields((prev) => reorder(prev.filter((_, i) => i !== index)));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return reorder(next);
    });
  };

  const save = async () => {
    if (fields.length === 0) {
      message.warning('请至少配置一个导入字段');
      return;
    }
    const headers = fields.map(getHeaderName).filter(Boolean);
    if (new Set(headers).size !== headers.length) {
      message.warning('Excel 表头不能重复，请调整表头别名');
      return;
    }

    setSaving(true);
    try {
      const saved = await replaceImportTemplateConfig(orderType, fields.map((field, index) => ({
        fieldCode: field.field_code,
        displayOrder: index + 1,
        headerAlias: field.header_alias?.trim() || null,
        isRequiredOverride: field.is_required_override ?? null,
        isActive: true,
      })));
      setFields(reorder(saved));
      message.success('导入模板字段配置已保存');
    } catch (error: any) {
      message.error(error?.message || '保存导入模板配置失败');
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const result = await downloadServerImportTemplate(orderType);
      message.success(`已下载${ORDER_OPTIONS.find((item) => item.value === orderType)?.label || '导入模板'}（${result.fieldCount || fields.length} 个字段）`);
    } catch (error: any) {
      message.error(error?.message || '下载导入模板失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <PageContainer
      header={{
        title: '导入模板配置',
        extra: [
          <Select key="orderType" style={{ width: 180 }} value={orderType} options={ORDER_OPTIONS} onChange={setOrderType} />,
          <Button key="reload" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>保存配置</Button>,
          <Button key="download" icon={<DownloadOutlined />} loading={downloading} onClick={downloadTemplate}>下载当前模板</Button>,
        ],
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里配置真正用于导入 Excel 的字段清单。保存后，模板下载、导入预览候选字段、导入确认校验都会优先读取这张配置表；无配置时才回退系统默认规则。"
        description="系统字段基础信息来自“系统字段库”；本页只管理导入模板中的字段是否出现、Excel 表头别名、字段顺序和导入必填覆盖。"
      />

      <Card
        title={<Space><SettingOutlined />当前模板字段配置</Space>}
        extra={(
          <Space>
            <Text type="secondary">已选 {fields.length} 个，可选 {addOptions.length} 个</Text>
            <Select
              showSearch
              allowClear
              value={addingField}
              placeholder="添加字段到导入模板"
              style={{ width: 320 }}
              optionFilterProp="label"
              options={addOptions}
              onChange={(value) => { setAddingField(value); addField(value); }}
              notFoundContent="没有可添加字段"
            />
            <Button icon={<PlusOutlined />} disabled={!addingField} onClick={() => addField(addingField)}>添加</Button>
          </Space>
        )}
      >
        <Table<ImportTemplateFieldItem>
          rowKey="field_code"
          loading={loading}
          dataSource={fields}
          pagination={false}
          scroll={{ x: 1180 }}
          columns={[
            { title: '顺序', width: 76, fixed: 'left', render: (_, _record, index) => index + 1 },
            {
              title: 'Excel表头',
              width: 210,
              fixed: 'left',
              render: (_, record, index) => (
                <Input
                  size="small"
                  value={record.header_alias ?? ''}
                  placeholder={record.field_name || record.field_code}
                  onChange={(event) => updateField(index, { header_alias: event.target.value })}
                />
              ),
            },
            { title: '系统字段名', dataIndex: 'field_name', width: 170, render: (v, r) => v || r.field_code },
            { title: '字段编码', dataIndex: 'field_code', width: 180 },
            { title: '字段类型', dataIndex: 'field_type', width: 100 },
            {
              title: '必填覆盖',
              width: 160,
              render: (_, record, index) => (
                <Select
                  size="small"
                  style={{ width: 132 }}
                  value={record.is_required_override === true ? 'true' : record.is_required_override === false ? 'false' : 'inherit'}
                  options={[
                    { label: '跟随系统', value: 'inherit' },
                    { label: '强制必填', value: 'true' },
                    { label: '强制非必填', value: 'false' },
                  ]}
                  onChange={(value) => updateField(index, { is_required_override: value === 'inherit' ? null : value === 'true' })}
                />
              ),
            },
            {
              title: '当前必填规则',
              width: 130,
              render: (_, record) => {
                const text = getRequiredText(record);
                return <Tag color={requiredTagColor(text)}>{text}</Tag>;
              },
            },
            {
              title: '下拉选项',
              width: 260,
              render: (_, record) => {
                const options = normalizeOptions(record.dropdown_options);
                if (!options.length) return <Text type="secondary">无</Text>;
                return <Space wrap size={[4, 4]}>{options.slice(0, 8).map((item) => <Tag key={item}>{item}</Tag>)}{options.length > 8 && <Tag>+{options.length - 8}</Tag>}</Space>;
              },
            },
            { title: '提示文案', dataIndex: 'help_text', width: 220, ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
            {
              title: '来源',
              dataIndex: 'source',
              width: 92,
              render: (v) => v === 'fallback' ? <Tag>默认回退</Tag> : <Tag color="green">配置表</Tag>,
            },
            {
              title: '操作',
              width: 160,
              fixed: 'right',
              render: (_, _record, index) => (
                <Space size={4}>
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveField(index, -1)} />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} />
                  <Popconfirm title="确认从导入模板移除该字段？" onConfirm={() => removeField(index)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminImportTemplates;
