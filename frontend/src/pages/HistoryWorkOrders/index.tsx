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
import { isPhase1VisibleModule, isPhase1VisibleOrderType } from '@/utils/moduleAccess';
import { mergeProTableFiltersIntoParams, selectHeaderFilter, textHeaderFilter } from '@/utils/proTableFilters';
import {
  applyCachedColumnFilters,
  getCachedListPageState,
  getCachedMonth,
  normalizeCachedFilters,
  toMonthKey,
  updateCachedListPageState,
} from '@/utils/listPageState';
import { useRef } from 'react';

const MODULE_OPTIONS = [
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '劳动合同新签', value: 'contract' },
  { label: '增员报岗录入', value: 'data_entry' },
  { label: '社保公积金增员', value: 'social_insurance' },
  { label: '离职材料收集', value: 'resignation_contact' },
  { label: '减员报岗录入', value: 'data_entry_resign' },
  { label: '社保公积金减员', value: 'social_insurance_resign' },
];

const STATUS_OPTIONS = [
  { label: '未接单', value: 'pending' },
  { label: '已接单', value: 'processing' },
  { label: '修改审批中', value: 'modify_pending' },
  { label: '撤回审批中', value: 'withdraw_pending' },
  { label: '作废审批中', value: 'void_pending' },
  { label: '已完成', value: 'completed' },
  { label: '已作废', value: 'void' },
  { label: '已撤回', value: 'withdrawn' },
  { label: '已退回', value: 'returned' },
];

function getHistoryDetailUrl(row: DispatchedOrderItem): string {
  return `/my-dispatched/${row.id}`;
}

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
    handlerName: readString(params.handlerName, params.handler_name),
  };
}

const HistoryWorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>();
  const pageStateKey = 'my-work:history';
  const cachedPageState = getCachedListPageState(pageStateKey);
  const [month, setMonth] = useState<Dayjs | null>(() => getCachedMonth(pageStateKey));

  const columns = useMemo<ProColumns<DispatchedOrderItem>[]>(() => applyCachedColumnFilters<DispatchedOrderItem>([
    { title: '工单编号', dataIndex: 'order_no', width: 160, copyable: true, search: { transform: (value) => ({ orderNo: value }) }, ...textHeaderFilter('输入工单编号') },
    { title: '子工单类型', dataIndex: 'module_code', width: 150, valueType: 'select', fieldProps: { options: MODULE_OPTIONS }, search: { transform: (value) => ({ moduleCode: value }) }, ...selectHeaderFilter('选择子工单类型', MODULE_OPTIONS), render: (_, row) => <Tag>{getModuleLabel(row.module_code, row.order_type)}</Tag> },
    { title: '员工姓名', dataIndex: 'employee_name', width: 110, search: { transform: (value) => ({ employeeName: value }) }, ...textHeaderFilter('输入员工姓名') },
    { title: '员工证件号', dataIndex: 'employee_id_card', width: 170, ellipsis: true, search: { transform: (value) => ({ idCardNo: value }) }, ...textHeaderFilter('输入员工证件号') },
    { title: '客户代码', dataIndex: 'customer_code', width: 120, search: { transform: (value) => ({ customerCode: value }) }, ...textHeaderFilter('输入客户代码') },
    { title: '客户名称', dataIndex: 'customer_name', width: 160, ellipsis: true, search: { transform: (value) => ({ customerName: value }) }, ...textHeaderFilter('输入客户名称') },
    { title: '状态', dataIndex: 'status', width: 110, valueType: 'select', fieldProps: { options: STATUS_OPTIONS }, ...selectHeaderFilter('选择状态', STATUS_OPTIONS), render: (_, row) => <Tag color={getStatusColor(row.void_at ? 'void' : row.status)}>{getStatusText(row.void_at ? 'void' : row.status)}</Tag> },
    { title: '实际操作人/配置负责人', dataIndex: 'handler_name', key: 'handlerName', width: 190, hideInSearch: true, ...textHeaderFilter('输入负责人'), renderText: (_, row) => row.handler_name || row.configured_handler_names?.join('、') || '-' },
    { title: '派发时间', dataIndex: 'dispatched_at', valueType: 'dateTime', width: 170, hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 170, hideInSearch: true },
    {
      title: '操作', valueType: 'option', width: 90,
      render: (_, row) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(getHistoryDetailUrl(row))}>详情</Button>,
    },
  ], cachedPageState.filters || {}), [navigate, cachedPageState.filters]);

  return (
    <PageContainer
      header={{
        title: '历史工单',
        extra: [
          <Space key="month">
            <span>工单月份：</span>
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(value) => {
                const nextMonth = value || dayjs();
                setMonth(nextMonth);
                updateCachedListPageState(pageStateKey, { month: toMonthKey(nextMonth), current: 1 });
                actionRef.current?.reload();
              }}
            />
          </Space>,
        ],
      }}
    >
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        pagination={{ defaultCurrent: cachedPageState.current || 1, defaultPageSize: cachedPageState.pageSize || 50, pageSizeOptions: ['20', '50', '100'], showSizeChanger: true }}
        dateFormatter="string"
        request={async (params: PageParams & Record<string, unknown>, _sort, filters) => {
          updateCachedListPageState(pageStateKey, {
            current: Number((params as { current?: number }).current || params.page || cachedPageState.current || 1),
            pageSize: Number(params.pageSize || cachedPageState.pageSize || 50),
            filters: normalizeCachedFilters(filters),
          });
          const query = normalizeQuery(mergeProTableFiltersIntoParams(params, filters) as PageParams & Record<string, unknown>);
          const result = await getDispatchedOrdersSafe({
            ...query,
            pageSize: Math.min(Number(query.pageSize || 50), 100),
            includeReturned: true,
            orderMonth: (month || dayjs()).format('YYYY-MM'),
          });
          const list = result.list.filter((row) => isPhase1VisibleModule(row.module_code) && (!row.order_type || isPhase1VisibleOrderType(row.order_type)));
          return { data: list, success: true, total: result.total };
        }}
      />
    </PageContainer>
  );
};

export default HistoryWorkOrders;
