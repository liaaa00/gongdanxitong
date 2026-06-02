import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Space, Tag } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getDispatchedOrdersSafe } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';

const ORDER_TYPE_OPTIONS = [
  { value: 'onboarding', label: '入职' },
  { value: 'renewal', label: '续签' },
  { value: 'resignation', label: '离职' },
  { value: 'benefit', label: '待遇申报' },
];
const ORDER_TYPE_MAP = Object.fromEntries(ORDER_TYPE_OPTIONS.map((item) => [item.value, item.label]));

function normalizeQuery(params: PageParams & Record<string, unknown>): PageParams {
  const readString = (...values: unknown[]) => {
    const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
    return value === undefined ? undefined : String(value);
  };

  return {
    ...params,
    page: Number(params.page ?? (params as { current?: number }).current ?? 1) || 1,
    pageSize: params.pageSize ? Number(params.pageSize) : undefined,
    keyword: readString(params.keyword),
    sort: readString(params.sort),
    orderNo: readString(params.orderNo, params.order_no),
    customerCode: readString(params.customerCode, params.customer_code),
    customerName: readString(params.customerName, params.customer_name),
    employeeName: readString(params.employeeName, params.employee_name),
    idCardNo: readString(params.idCardNo, params.employee_id_card, params.employeeIdCard),
    createdByName: readString(params.createdByName, params.created_by, params.created_by_name),
    orderType: readString(params.orderType, params.order_type),
    status: readString(params.status),
    scope: 'team',
  };
}

const TeamDispatched: React.FC = () => {
  const navigate = useNavigate();

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    {
      title: '子工单编号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 160,
      copyable: true,
      search: { transform: (value) => ({ orderNo: value }) },
    },
    {
      title: '工单类型',
      dataIndex: 'order_type',
      key: 'order_type',
      width: 110,
      valueType: 'select',
      fieldProps: { options: ORDER_TYPE_OPTIONS },
      search: { transform: (value) => ({ orderType: value }) },
      renderText: (value) => ORDER_TYPE_MAP[String(value || '')] || String(value || '-'),
    },
    {
      title: '子工单模块',
      dataIndex: 'module_code',
      key: 'module_code',
      width: 170,
      render: (_, record) => <Tag color="blue">{getModuleLabel(record.module_code)}</Tag>,
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customer_code', width: 120, search: { transform: (value) => ({ customerCode: value }) }, renderText: (value) => value || '-' },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 170, ellipsis: true, search: { transform: (value) => ({ customerName: value }) } },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 110, search: { transform: (value) => ({ employeeName: value }) } },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 180, ellipsis: true, search: { transform: (value) => ({ idCardNo: value }) } },
    {
      title: '发起人',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 120,
      search: { transform: (value) => ({ createdByName: value }) },
      renderText: (value, record) => value || record.created_by || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      valueType: 'select',
      fieldProps: {
        options: [
          { value: 'pending', label: '待处理' },
          { value: 'processing', label: '处理中' },
          { value: 'completed', label: '已完成' },
          { value: 'returned', label: '已退回' },
          { value: 'withdrawn', label: '已撤回' },
          { value: 'void', label: '已作废' },
          { value: 'withdraw_pending', label: '撤回审批中' },
          { value: 'void_pending', label: '作废审批中' },
        ],
      },
      render: (_, record) => <Tag color={getStatusColor(record.void_at ? 'void' : record.status)}>{getStatusText(record.void_at ? 'void' : record.status)}</Tag>,
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 170, valueType: 'dateTime', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 170, valueType: 'dateTime', hideInSearch: true },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      hideInSearch: true,
      render: (_, record) => (
        <a onClick={() => navigate(`/my-dispatched/${record.id}?readonly=1&from=team`)}>
          <Space size={4}><EyeOutlined />只读详情</Space>
        </a>
      ),
    },
  ], [navigate]);

  return (
    <PageContainer
      header={{
        title: '团队工单',
        subTitle: '团队工单按子工单逐条展示，可查看详情但不可执行接单、完成、退回等操作。',
      }}
    >
      <ProTable<DispatchedOrderItem>
        columns={columns}
        request={async (params: PageParams & Record<string, unknown>) => {
          const result = await getDispatchedOrdersSafe(normalizeQuery(params));
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="授权团队范围内子工单"
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        options={false}
        toolBarRender={false}
        scroll={{ x: 1650 }}
      />
    </PageContainer>
  );
};

export default TeamDispatched;
