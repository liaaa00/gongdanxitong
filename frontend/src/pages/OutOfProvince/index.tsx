import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Space, Tag } from 'antd';
import { ImportOutlined, PlusOutlined } from '@ant-design/icons';
import MultiViewTable from '@/components/MultiViewTable';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import {
  getOutOfProvinceOrders,
  OUT_OF_PROVINCE_ORDER_TYPE,
  type OutOfProvinceOrderItem,
} from '@/services/outOfProvince';

const ORDER_TYPE_LABEL: Record<string, string> = {
  [OUT_OF_PROVINCE_ORDER_TYPE.INCREASE]: '省外增员',
  [OUT_OF_PROVINCE_ORDER_TYPE.DECREASE]: '省外减员',
};

const OutOfProvinceList: React.FC = () => {
  const navigate = useNavigate();
  const columns = useMemo<ProColumns<OutOfProvinceOrderItem>[]>(() => [
    { title: '工单编号', dataIndex: 'order_no', key: 'orderNo', width: 180 },
    {
      title: '类型',
      dataIndex: 'order_type',
      key: 'orderType',
      width: 110,
      valueType: 'select',
      fieldProps: {
        options: Object.entries(ORDER_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      renderText: (value) => ORDER_TYPE_LABEL[String(value || '')] || String(value || '-'),
    },
    { title: '省份', dataIndex: 'province', key: 'province', width: 90 },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customerCode', width: 120 },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customerName', width: 160 },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employeeName', width: 110 },
    { title: '证件号码', dataIndex: 'employee_id_card', key: 'idCardNo', width: 190 },
    { title: '发起人', dataIndex: 'created_by_name', key: 'createdByName', width: 110 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'createdAt', valueType: 'dateTime', width: 170 },
  ], []);

  return (
    <PageContainer header={{ title: '省外增减员列表' }}>
      <MultiViewTable<OutOfProvinceOrderItem>
        viewId="out-of-province-orders"
        listStateKey="out-of-province-orders"
        columns={columns}
        rowKey="id"
        headerTitle="省外增减员"
        search={false}
        request={async (params) => {
          const result = await getOutOfProvinceOrders(params);
          return { data: result.list, success: true, total: result.total };
        }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        toolBarRender={() => [
          <Space key="actions">
            <Button icon={<ImportOutlined />} onClick={() => navigate('/out-of-province/import')}>
              省外增减员导入
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/out-of-province/new')}>
              新建省外工单
            </Button>
          </Space>,
        ]}
        proTableOptions={false}
        proTableToolBarRender={false}
      />
    </PageContainer>
  );
};

export default OutOfProvinceList;
