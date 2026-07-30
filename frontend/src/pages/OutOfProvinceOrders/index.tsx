import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Space, Tag, Upload } from 'antd';
import { EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS,
  PROVINCES_27,
} from '@/constants/outOfProvince';
import { ROLE, canonicalRoleCodes } from '@/constants/roles';
import { useUserStore } from '@/stores/userStore';

// TODO: 等后端接口实现后补充service导入
// import { getOutOfProvinceOrders, type OutOfProvinceOrder, type OutOfProvinceOrderListQuery } from '@/services/outOfProvinceOrders';

interface TableParams extends Record<string, unknown> {
  current?: number;
  pageSize?: number;
  keyword?: string;
  province?: string;
  orderType?: string;
  createdAt?: [string, string];
}

const provinceValueEnum = Object.fromEntries(PROVINCES_27.map((value) => [value, { text: value }]));
const orderTypeValueEnum = Object.fromEntries(
  OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS.map((item) => [item.value, { text: item.label }]),
);

export default function OutOfProvinceOrderList() {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>(null);
  const user = useUserStore((state) => state.user);
  const roleCodes = canonicalRoleCodes(user?.roles);
  const canCreate = roleCodes.some((role) => [
    ROLE.ADMIN,
    ROLE.BUSINESS_GROUP_LEADER,
    ROLE.BUSINESS_GROUP_MEMBER,
  ].includes(role as typeof ROLE.ADMIN));

  const columns = useMemo<ProColumns<any>[]>(() => [
    {
      title: '关键词',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '工单号、客户或联系电话' },
    },
    {
      title: '工单编号',
      dataIndex: 'orderNo',
      width: 190,
      copyable: true,
      hideInSearch: true,
      fixed: 'left',
    },
    {
      title: '增减员类型',
      dataIndex: 'orderType',
      width: 130,
      valueEnum: orderTypeValueEnum,
      render: (_, record) => {
        const opt = OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS.find((o) => o.value === record.orderType);
        return <Tag color={record.orderType?.includes('increase') ? 'green' : 'red'}>{opt?.label}</Tag>;
      },
    },
    {
      title: '客户',
      dataIndex: 'customerName',
      width: 170,
      hideInSearch: true,
      render: (_, record) => record.customerName || record.customerCode || record.customerId,
    },
    {
      title: '省份',
      dataIndex: 'province',
      width: 90,
      valueEnum: provinceValueEnum,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      hideInSearch: true,
      render: (_, record) => <Tag>{record.status || 'draft'}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      valueType: 'dateRange',
      hideInTable: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      hideInSearch: true,
      render: (_, record) => record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      hideInSearch: true,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/out-of-province/orders/${record.id}`)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ], [navigate]);

  const toolBarRender = () => [
    canCreate && (
      <Button
        key="import"
        icon={<UploadOutlined />}
        onClick={() => {
          // TODO: 实现导入功能，参考入职/续签导入组件
          console.log('导入省外派单');
        }}
      >
        导入
      </Button>
    ),
    canCreate && (
      <Button
        key="create"
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => navigate('/out-of-province/orders/new')}
      >
        新建
      </Button>
    ),
  ].filter(Boolean);

  return (
    <PageContainer title="省外派单列表">
      <ProTable
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={{ labelWidth: 'auto' }}
        toolBarRender={toolBarRender}
        request={async (params) => {
          // TODO: 调用后端接口获取数据
          console.log('查询参数', params);
          return { data: [], total: 0, success: true };
        }}
      />
    </PageContainer>
  );
}
