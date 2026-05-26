import { useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App } from 'antd';
import { EyeOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons';
import { getWorkOrders } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import type { PageParams } from '@/services/mock';
import { STATUS_MAP } from '@/constants/dictionaries';

const RenewalList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);

  const columns: ProColumns<WorkOrderItem>[] = useMemo(() => [
    { title: '工单编号', dataIndex: 'order_no', key: 'order_no', width: 160, copyable: true },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 100 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120 },
    { title: '订单类型', dataIndex: 'order_type', key: 'order_type', width: 100 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (_, record) => {
        const s = STATUS_MAP[record.status] || { color: 'default', label: '未知状态' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 140, valueType: 'dateTime', sorter: true },
    {
      title: '操作', key: 'actions', width: 120, hideInSearch: true,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          onClick={() => navigate('/renewal/' + record.id)}>详情</Button>
      ),
    },
  ], [navigate]);

  return (
    <PageContainer header={{ title: '续签工单' }}>
      <ProTable<WorkOrderItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          const result = await getWorkOrders({ ...params, orderType: 'renewal' });
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="续签工单列表"
        toolBarRender={() => [
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/renewal/new')}>新建续签</Button>,
          <Button key="export" icon={<ExportOutlined />} onClick={() => message.info('导出功能开发中')}>导出</Button>,
        ]}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
      />
    </PageContainer>
  );
};

export default RenewalList;
