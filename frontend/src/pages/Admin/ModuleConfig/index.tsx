import { useRef } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Alert, App, Button, Popconfirm, Space, Switch, Tag } from 'antd';
import { getModuleConfigs, updateModuleConfig } from '@/services/moduleConfigs';
import type { ModuleConfigItem } from '@/services/moduleConfigs';

const AdminModuleConfig: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();

  const toggleModule = async (record: ModuleConfigItem) => {
    const nextActive = !record.is_active;
    try {
      await updateModuleConfig(record.id, { is_active: nextActive });
      message.success(nextActive ? '已启用模块' : '已禁用模块');
      actionRef.current?.reload();
    } catch (err) {
      message.error(nextActive ? '启用模块失败' : '禁用模块失败');
      throw err;
    }
  };

  const columns: ProColumns<ModuleConfigItem>[] = [
    {
      title: '模块名',
      dataIndex: 'module_name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.module_name || record.moduleName || '-'}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{record.module_code || record.moduleCode}</span>
        </Space>
      ),
    },
    {
      title: '启用开关',
      dataIndex: 'is_active',
      width: 140,
      valueEnum: {
        true: { text: '启用', status: 'Success' },
        false: { text: '禁用', status: 'Default' },
      },
      render: (_, record) => {
        const active = record.is_active ?? record.isActive ?? true;
        return <Switch checked={active} disabled checkedChildren="启用" unCheckedChildren="禁用" />;
      },
    },
    {
      title: '类型',
      dataIndex: 'module_type',
      width: 120,
      hideInSearch: true,
      render: (_, record) => record.module_type || record.moduleType ? <Tag>{record.module_type || record.moduleType}</Tag> : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      render: (_, record) => {
        const active = record.is_active ?? record.isActive ?? true;
        return [
          <Popconfirm
            key="toggle"
            title={active ? '确认禁用该模块？' : '确认启用该模块？'}
            description="模块状态会影响对应业务入口和派发处理，请确认后操作。"
            okText={active ? '禁用' : '启用'}
            cancelText="取消"
            onConfirm={() => toggleModule(record)}
          >
            <Button size="small" type={active ? 'default' : 'primary'} danger={active}>
              {active ? '禁用' : '启用'}
            </Button>
          </Popconfirm>,
        ];
      },
    },
  ];

  return (
    <PageContainer header={{ title: '模块化配置' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="该页面用于启用或关闭入职、合同、社保、数据录入等模块。管理员可点击“启用/禁用”按钮进行控制。"
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
        headerTitle="模块列表"
        dateFormatter="string"
      />
    </PageContainer>
  );
};

export default AdminModuleConfig;
