import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, DatePicker, Space, Tag } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getDispatchedOrdersSafe } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useRef } from 'react';

const HISTORY_STATUSES = new Set(['completed', 'returned', 'withdrawn', 'void']);

const MODULE_OPTIONS = [
  { label: '数据录入', value: 'data_entry' },
  { label: '入职社保公积金办理', value: 'social_insurance' },
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '劳动合同签订', value: 'contract' },
  { label: '劳动合同续签', value: 'renewal_contract' },
  { label: '离职材料收集', value: 'resignation_contact' },
  { label: '离职证明', value: 'resignation_cert' },
  { label: '待遇申报', value: 'benefit_apply' },
];

const STATUS_OPTIONS = [
  { label: '已完成', value: 'completed' },
  { label: '已退回', value: 'returned' },
  { label: '已撤回', value: 'withdrawn' },
  { label: '已作废', value: 'void' },
];

function normalizeQuery(params: PageParams & Record<string, unknown>): PageParams & Record<string, unknown> {
  const readString = (...values: unknown[]) => {
    const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
    return value === undefined ? undefined : String(value);
  };
  return {
    ...params,
    page: Number(params.page ?? (params as { current?: number }).current ?? 1) || 1,
    pageSize: params.pageSize ? Number(params.pageSize) : undefined,
    orderNo: readString(params.orderNo, params.order_no),
    moduleCode: readString(params.moduleCode, params.module_code),
    customerCode: readString(params.customerCode, params.customer_code),
    customerName: readString(params.customerName, params.customer_name),
    employeeName: readString(params.employeeName, params.employee_name),
    idCardNo: readString(params.idCardNo, params.employee_id_card, params.employeeIdCard),
    status: readString(params.status),
  };
}

const HistoryWorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>();
  const [month, setMonth] = useState<Dayjs | null>(dayjs());

  const columns = useMemo<ProColumns<DispatchedOrderItem>[]>(() => [
    { title: '工单编号', dataIndex: 'order_no', width: 160, copyable: true, search: { transform: (value) => ({ orderNo: value }) } },
    { title: '子工单类型', dataIndex: 'module_code', width: 150, valueType: 'select', fieldProps: { options: MODULE_OPTIONS }, search: { transform: (value) => ({ moduleCode: value }) }, render: (_, row) => <Tag>{getModuleLabel(row.module_code)}</Tag> },
    { title: '员工姓名', dataIndex: 'employee_name', width: 110, search: { transform: (value) => ({ employeeName: value }) } },
    { title: '员工证件号', dataIndex: 'employee_id_card', width: 170, ellipsis: true, search: { transform: (value) => ({ idCardNo: value }) } },
    { title: '客户代码', dataIndex: 'customer_code', width: 120, search: { transform: (value) => ({ customerCode: value }) } },
    { title: '客户名称', dataIndex: 'customer_name', width: 160, ellipsis: true, search: { transform: (value) => ({ customerName: value }) } },
    { title: '状态', dataIndex: 'status', width: 110, valueType: 'select', fieldProps: { options: STATUS_OPTIONS }, render: (_, row) => <Tag color={getStatusColor(row.void_at ? 'void' : row.status)}>{getStatusText(row.void_at ? 'void' : row.status)}</Tag> },
    { title: '派发时间', dataIndex: 'dispatched_at', valueType: 'dateTime', width: 170 },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 170 },
    {
      title: '操作', valueType: 'option', width: 90,
      render: (_, row) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/my-dispatched/${row.id}`)}>详情</Button>,
    },
  ], [navigate]);

  return (
    <PageContainer
      header={{
        title: '历史工单',
        subTitle: '默认显示所选月份已完成、已退回、已撤回、已作废的子工单',
        extra: [
          <Space key="month">
            <span>工单月份：</span>
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(value) => { setMonth(value || dayjs()); actionRef.current?.reload(); }}
            />
          </Space>,
        ],
      }}
    >
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        options={false}
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['20', '50', '100'], showSizeChanger: true }}
        dateFormatter="string"
        request={async (params: PageParams & Record<string, unknown>) => {
          const query = normalizeQuery(params);
          const result = await getDispatchedOrdersSafe({
            ...query,
            pageSize: Math.min(Number(query.pageSize || 20), 100),
            includeReturned: true,
            orderMonth: (month || dayjs()).format('YYYY-MM'),
            statuses: query.status ? undefined : Array.from(HISTORY_STATUSES).join(','),
          });
          const list = result.list.filter((row) => HISTORY_STATUSES.has(row.status) || Boolean(row.void_at));
          return { data: list, success: true, total: query.status ? result.total : list.length };
        }}
      />
    </PageContainer>
  );
};

export default HistoryWorkOrders;
