import { useMemo, useRef, useState } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Alert, App, Button, Checkbox, Divider, Modal, Popconfirm, Space, Spin, Switch, Tag, Typography } from 'antd';
import { getModuleConfigs, getModuleFields, replaceModuleFields, updateModuleConfig } from '@/services/moduleConfigs';
import type { ModuleConfigItem } from '@/services/moduleConfigs';
import { getFields, type FieldConfigItem } from '@/services/fields';

const { Text } = Typography;

function getModuleCode(record?: ModuleConfigItem | null) {
  return record?.module_code || record?.moduleCode || '';
}

function getModuleName(record?: ModuleConfigItem | null) {
  return record?.module_name || record?.moduleName || '';
}

function groupFields(fields: FieldConfigItem[]) {
  const map = new Map<string, FieldConfigItem[]>();
  fields.forEach((field) => {
    const group = field.collection_group || '常用信息';
    const list = map.get(group) || [];
    list.push(field);
    map.set(group, list);
  });
  return Array.from(map.entries());
}

function getModuleTypeLabel(record: ModuleConfigItem) {
  const type = record.module_type || record.moduleType;
  if (type === 'business_module') return '主业务';
  if (type === 'sub_module') return '办理环节';
  if (type === 'main') return '主业务';
  if (type === 'sub') return '办理环节';
  return type || '-';
}

const AdminModuleConfig: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleConfigItem | null>(null);
  const [allFields, setAllFields] = useState<FieldConfigItem[]>([]);
  const [selectedFieldCodes, setSelectedFieldCodes] = useState<string[]>([]);

  const groupedFields = useMemo(() => groupFields(allFields), [allFields]);

  const toggleModule = async (record: ModuleConfigItem) => {
    const nextActive = !record.is_active;
    try {
      await updateModuleConfig(record.id, { is_active: nextActive });
      message.success(nextActive ? '已启用' : '已停用');
      actionRef.current?.reload();
    } catch (err) {
      message.error(nextActive ? '启用失败' : '停用失败');
      throw err;
    }
  };

  const openFieldConfig = async (record: ModuleConfigItem) => {
    const moduleCode = getModuleCode(record);
    if (!moduleCode) {
      message.error('当前环节信息不完整，无法设置办理字段');
      return;
    }
    setSelectedModule(record);
    setFieldModalOpen(true);
    setFieldLoading(true);
    try {
      const [fields, moduleFields] = await Promise.all([
        getFields(),
        getModuleFields(moduleCode),
      ]);
      setAllFields(fields);
      setSelectedFieldCodes(moduleFields.map((item) => item.field_code).filter(Boolean));
    } catch (err: any) {
      message.error(err?.message || '加载字段失败');
      setAllFields([]);
      setSelectedFieldCodes([]);
    } finally {
      setFieldLoading(false);
    }
  };

  const saveFieldConfig = async () => {
    const moduleCode = getModuleCode(selectedModule);
    const moduleName = getModuleName(selectedModule);
    if (!moduleCode) return;
    setFieldSaving(true);
    try {
      await replaceModuleFields(moduleCode, selectedFieldCodes.map((fieldCode, index) => ({
        field_code: fieldCode,
        group_name: moduleName ? `${moduleName}字段` : null,
        display_order: index + 1,
        is_active: true,
      })));
      message.success('办理字段已保存');
      setFieldModalOpen(false);
      setSelectedModule(null);
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setFieldSaving(false);
    }
  };

  const columns: ProColumns<ModuleConfigItem>[] = [
    {
      title: '办理环节',
      dataIndex: 'module_name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{getModuleName(record) || '-'}</span>
          {record.description && <span style={{ color: '#999', fontSize: 12 }}>{record.description}</span>}
        </Space>
      ),
    },
    {
      title: '是否启用',
      dataIndex: 'is_active',
      width: 120,
      valueEnum: {
        true: { text: '启用', status: 'Success' },
        false: { text: '停用', status: 'Default' },
      },
      render: (_, record) => {
        const active = record.is_active ?? record.isActive ?? true;
        return <Switch checked={active} disabled checkedChildren="启用" unCheckedChildren="停用" />;
      },
    },
    {
      title: '类型',
      dataIndex: 'module_type',
      width: 110,
      hideInSearch: true,
      render: (_, record) => <Tag>{getModuleTypeLabel(record)}</Tag>,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 220,
      render: (_, record) => {
        const active = record.is_active ?? record.isActive ?? true;
        return [
          <Button key="fields" size="small" type="primary" onClick={() => openFieldConfig(record)}>
            设置办理字段
          </Button>,
          <Popconfirm
            key="toggle"
            title={active ? '确认停用该环节？' : '确认启用该环节？'}
            description="停用后可能影响对应工单的派发和办理，请确认后操作。"
            okText={active ? '停用' : '启用'}
            cancelText="取消"
            onConfirm={() => toggleModule(record)}
          >
            <Button size="small" type={active ? 'default' : 'primary'} danger={active}>
              {active ? '停用' : '启用'}
            </Button>
          </Popconfirm>,
        ];
      },
    },
  ];

  return (
    <PageContainer header={{ title: '办理环节设置' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里不用懂代码。只需要进入某个办理环节，勾选这个环节办理人员需要看到和处理的信息即可。"
      />
      <ProTable<ModuleConfigItem>
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        search={false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        request={async () => {
          const list = await getModuleConfigs();
          return { data: list, success: true, total: list.length };
        }}
        headerTitle="办理环节列表"
        dateFormatter="string"
      />

      <Modal
        title={selectedModule ? `设置“${getModuleName(selectedModule)}”需要处理的信息` : '设置办理字段'}
        open={fieldModalOpen}
        width={900}
        okText="保存"
        cancelText="取消"
        confirmLoading={fieldSaving}
        onOk={saveFieldConfig}
        onCancel={() => {
          setFieldModalOpen(false);
          setSelectedModule(null);
        }}
        destroyOnHidden
      >
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="勾选后，该办理环节的处理人就会看到这些信息。比如“数据录入”只勾选姓名、证件号、社保、公积金、银行卡等需要录入的信息。"
        />
        <Spin spinning={fieldLoading}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">已选择 {selectedFieldCodes.length} 项信息</Text>
              <Space>
                <Button size="small" onClick={() => setSelectedFieldCodes(allFields.map((field) => field.field_code))}>全部选择</Button>
                <Button size="small" onClick={() => setSelectedFieldCodes([])}>全部取消</Button>
              </Space>
            </Space>

            {groupedFields.map(([groupName, fields]) => (
              <div key={groupName}>
                <Divider orientation="left" style={{ margin: '8px 0 12px' }}>{groupName}</Divider>
                <Checkbox.Group
                  value={selectedFieldCodes}
                  onChange={(values) => setSelectedFieldCodes(values.map(String))}
                  style={{ width: '100%' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    {fields.map((field) => (
                      <Checkbox key={field.field_code} value={field.field_code} style={{ padding: '6px 8px', border: '1px solid #f0f0f0', borderRadius: 6, marginInlineStart: 0 }}>
                        {field.field_name}
                      </Checkbox>
                    ))}
                  </div>
                </Checkbox.Group>
              </div>
            ))}

            {!fieldLoading && allFields.length === 0 && <Text type="secondary">暂无可选择的信息，请先在字段管理中维护。</Text>}
          </Space>
        </Spin>
      </Modal>
    </PageContainer>
  );
};

export default AdminModuleConfig;
