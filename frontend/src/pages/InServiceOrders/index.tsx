import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  IN_SERVICE_BUSINESS_TYPE_OPTIONS,
  IN_SERVICE_HANDLE_CHANNEL_META,
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_ORDER_KIND_META,
  IN_SERVICE_STATUS_META,
  PROVINCES_27,
  getInServiceCategoryPath,
  type InServiceBusinessType,
  type InServiceOrderKind,
  type InServiceOrderStatus,
} from '@/constants/inService';
import { getInServiceOrders, type InServiceOrder, type InServiceOrderListQuery } from '@/services/inServiceOrders';
import { ROLE, canonicalRoleCodes } from '@/constants/roles';
import { useUserStore } from '@/stores/userStore';

interface TableParams extends Record<string, unknown> {
  current?: number;
  pageSize?: number;
  keyword?: string;
  province?: string;
  status?: string;
  businessType?: string;
  createdAt?: [string, string];
}

interface InServiceOrderListProps {
  orderKind?: InServiceOrderKind;
  createPath?: string;
  businessScope?: 'beilun' | 'out_of_province';
}

const statusValueEnum = Object.fromEntries(
  Object.entries(IN_SERVICE_STATUS_META).map(([value, item]) => [value, { text: item.label }]),
);
const provinceValueEnum = Object.fromEntries(PROVINCES_27.map((value) => [value, { text: value }]));
const businessTypeValueEnum = Object.fromEntries(
  IN_SERVICE_BUSINESS_TYPE_OPTIONS.map((item) => [item.value, { text: item.label }]),
);

export function buildInServiceListQuery(
  params: TableParams,
  orderKind?: InServiceOrderKind,
  businessScope?: 'beilun' | 'out_of_province',
): InServiceOrderListQuery {
  const [createdFrom, createdTo] = params.createdAt || [];
  return {
    page: Number(params.current || 1),
    pageSize: Number(params.pageSize || 20),
    orderKind,
    businessScope,
    keyword: params.keyword ? String(params.keyword) : undefined,
    province: params.province as InServiceOrderListQuery['province'],
    status: params.status as InServiceOrderStatus | undefined,
    businessType: params.businessType as InServiceBusinessType | undefined,
    createdFrom: createdFrom ? dayjs(createdFrom).startOf('day').toISOString() : undefined,
    createdTo: createdTo ? dayjs(createdTo).endOf('day').toISOString() : undefined,
  };
}

export default function InServiceOrderList({
  orderKind = IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS,
  createPath = '/in-service/new',
  businessScope,
}: InServiceOrderListProps) {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>(null);
  const user = useUserStore((state) => state.user);
  const roleCodes = canonicalRoleCodes(user?.roles);
  const meta = IN_SERVICE_ORDER_KIND_META[orderKind];
  const isSingleBusiness = orderKind === IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const canCreate = roleCodes.some((role) => [
    ROLE.ADMIN,
    ROLE.BUSINESS_GROUP_LEADER,
    ROLE.BUSINESS_GROUP_MEMBER,
  ].includes(role as typeof ROLE.ADMIN));

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(createPath)}>
      {meta.createTitle}
    </Button>
  );

  const columns = useMemo<ProColumns<InServiceOrder>[]>(() => {
    const result: ProColumns<InServiceOrder>[] = [
      {
        title: '关键词',
        dataIndex: 'keyword',
        hideInTable: true,
        fieldProps: { placeholder: '工单号、姓名、证件号、客户或发起人' },
      },
      {
        title: '工单编号',
        dataIndex: 'orderNo',
        width: 190,
        copyable: true,
        hideInSearch: true,
        fixed: 'left',
      },
    ];
    if (!isSingleBusiness) {
      result.push({
        title: '员工',
        dataIndex: 'employeeName',
        width: 150,
        hideInSearch: true,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.employeeName || '-'}</Typography.Text>
            <Typography.Text type="secondary">{record.idCardNo || '-'}</Typography.Text>
          </Space>
        ),
      });
    }
    result.push(
      {
        title: '客户全称',
        dataIndex: 'customerName',
        width: 190,
        hideInSearch: true,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.customerName || record.customerId}</Typography.Text>
            {record.customerCode ? <Typography.Text type="secondary">{record.customerCode}</Typography.Text> : null}
          </Space>
        ),
      },
    );
    if (isSingleBusiness) {
      result.push(
        {
          title: '办理事由',
          dataIndex: 'businessReason',
          width: 190,
          hideInSearch: true,
          ellipsis: true,
        },
        {
          title: '业务分类',
          dataIndex: 'businessType',
          width: 240,
          valueEnum: businessTypeValueEnum,
          render: (_, record) => getInServiceCategoryPath(record.businessType, record.processType, record.requirementType),
        },
      );
    }
    result.push(
      {
        title: businessScope === 'out_of_province' ? '参保地' : '办理地',
        dataIndex: 'province',
        width: 160,
        valueEnum: provinceValueEnum,
        render: (_, record) => [record.province, record.city, record.district].filter(Boolean).join(' / ') || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 170,
        valueEnum: statusValueEnum,
        render: (_, record) => {
          const item = IN_SERVICE_STATUS_META[record.status] || { label: record.status, color: 'default' };
          return <Tag color={item.color}>{item.label}</Tag>;
        },
      },
      {
        title: '办理渠道',
        dataIndex: 'handleChannel',
        width: 110,
        hideInSearch: true,
        render: (_, record) => {
          if (!['processing', 'completed', 'failed'].includes(record.status)) return '-';
          const item = IN_SERVICE_HANDLE_CHANNEL_META[record.handleChannel];
          return <Tag color={item.color}>{item.label}</Tag>;
        },
      },
      {
        title: '配置负责人',
        dataIndex: 'handlerName',
        width: 130,
        hideInSearch: true,
        render: (_, record) => record.handlerName || record.handlerId || '待配置',
      },
      {
        title: '发起人',
        dataIndex: 'createdByName',
        width: 120,
        hideInSearch: true,
        render: (_, record) => record.createdByName || record.createdBy,
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 165,
        valueType: 'dateRange',
        render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 96,
        hideInSearch: true,
        fixed: 'right',
        render: (_, record) => (
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/in-service/' + record.id)}>
            详情
          </Button>
        ),
      },
    );
    return result;
  }, [businessScope, isSingleBusiness, navigate]);

  return (
    <PageContainer header={{ title: meta.listTitle }}>
      <ProTable<InServiceOrder, TableParams>
        actionRef={actionRef}
        rowKey="id"
        headerTitle={meta.label + '工单'}
        columns={columns}
        request={async (params) => {
          const result = await getInServiceOrders(buildInServiceListQuery(params, orderKind, businessScope));
          return { data: result.items, total: result.total, success: true };
        }}
        search={{ labelWidth: 'auto', defaultCollapsed: false }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        scroll={{ x: isSingleBusiness ? 1900 : 1500 }}
        options={{ reload: true, density: true, setting: true }}
        locale={{
          emptyText: (
            <Empty description={'暂无' + meta.label + '工单'}>
              {canCreate ? createButton : null}
            </Empty>
          ),
        }}
        toolBarRender={() => canCreate ? [<span key="new">{createButton}</span>] : []}
      />
    </PageContainer>
  );
}
