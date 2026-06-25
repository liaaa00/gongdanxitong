import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Dayjs } from 'dayjs';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, DatePicker, Space, Tag } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getDispatchedOrdersSafe } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleLabel, getPhaseOneModuleOptions } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { isPhase1VisibleModule, isPhase1VisibleOrderType } from '@/utils/moduleAccess';
import { mergeProTableFiltersIntoParams, selectHeaderFilter, textHeaderFilter } from '@/utils/proTableFilters';
import {
  applyCachedColumnFilters,
  getCachedListPageState,
  getCachedMonthOrNull,
  normalizeCachedFilters,
  toMonthKey,
  updateCachedListPageState,
} from '@/utils/listPageState';
import {
  DISPATCHED_NINE_STATUS_OPTIONS,
  normalizeDispatchedStatusSearchParams,
} from '@/utils/dispatchedStatusFilter';

const WORK_TYPE_OPTIONS = getPhaseOneModuleOptions().map((option) => ({
  label: `${option.label}子工单`,
  value: option.value,
}));

const TEAM_STATUS_OPTIONS = [
  ...DISPATCHED_NINE_STATUS_OPTIONS,
];

const PAGE_STATE_KEY = 'team-work';

function getOperatorDisplay(record: DispatchedOrderItem) {
  const configured = record.configured_handler_names || record.configuredHandlerNames || [];
  if (record.handler_name) return record.handler_name;
  if (configured.length > 0) return configured.join('、');
  return '负责人未配置';
}

function normalizeQuery(params: PageParams & Record<string, unknown>, month: Dayjs | null): PageParams {
  const readString = (...values: unknown[]) => {
    const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
    return value === undefined ? undefined : String(value);
  };
  const orderMonthRaw = params.orderMonth;
  const orderMonth = orderMonthRaw && typeof (orderMonthRaw as { format?: unknown }).format === 'function'
    ? (orderMonthRaw as { format: (format: string) => string }).format('YYYY-MM')
    : String(orderMonthRaw || '');

  return normalizeDispatchedStatusSearchParams({
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
    handlerName: readString(params.handlerName, params.handler_name),
    moduleCode: readString(params.moduleCode, params.module_code),
    status: readString(params.status),
    orderMonth: orderMonth || (month ? month.format('YYYY-MM') : undefined),
    scope: 'team',
  });
}

const TeamDispatched: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>();
  const cachedPageState = getCachedListPageState(PAGE_STATE_KEY);
  const [month, setMonth] = useState<Dayjs | null>(() => getCachedMonthOrNull(PAGE_STATE_KEY));

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => applyCachedColumnFilters<DispatchedOrderItem>([
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'left',
      hideInSearch: true,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/my-dispatched/${record.id}`)}>
          详情
        </Button>
      ),
    },
    {
      title: '编号',
      dataIndex: 'order_no',
      key: 'orderNo',
      width: 150,
      copyable: true,
      ...textHeaderFilter('输入编号'),
    },
    {
      title: '工单类型',
      dataIndex: 'module_code',
      key: 'moduleCode',
      width: 160,
      valueType: 'select',
      fieldProps: { options: WORK_TYPE_OPTIONS, placeholder: '下拉选择' },
      ...selectHeaderFilter('选择工单类型', WORK_TYPE_OPTIONS),
      render: (_, record) => <Tag color="blue">{getModuleLabel(record.module_code, record.order_type)}</Tag>,
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customerCode', width: 110, ...textHeaderFilter('输入客户代码'), renderText: (value) => value || '-' },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customerName', width: 150, ellipsis: true, ...textHeaderFilter('输入客户名称') },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employeeName', width: 100, ...textHeaderFilter('输入员工姓名') },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'idCardNo', width: 170, ellipsis: true, ...textHeaderFilter('输入证件号') },
    {
      title: '发起人',
      dataIndex: 'created_by_name',
      key: 'createdByName',
      width: 120,
      ...textHeaderFilter('输入发起人'),
      renderText: (value, record) => value || record.created_by || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      valueType: 'select',
      fieldProps: { options: TEAM_STATUS_OPTIONS, placeholder: '请选择状态' },
      ...selectHeaderFilter('选择状态', TEAM_STATUS_OPTIONS),
      render: (_, record) => <Tag color={getStatusColor(record.void_at ? 'void' : record.status)}>{getStatusText(record.void_at ? 'void' : record.status)}</Tag>,
    },
    { title: '实际操作人/配置负责人', dataIndex: 'handler_name', key: 'handlerName', width: 190, hideInSearch: true, ...textHeaderFilter('输入负责人'),
      render: (_, record) => {
        const text = getOperatorDisplay(record);
        return record.status === 'completed' ? text : <Tag color={text === '负责人未配置' ? 'orange' : 'blue'}>{text}</Tag>;
      },
    },
    { title: '工单所属月份', dataIndex: 'orderMonth', key: 'orderMonth', valueType: 'dateMonth', hideInTable: true, hideInSearch: true },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 150, valueType: 'dateTime', hideInSearch: true },
  ], cachedPageState.filters || {}), [navigate, cachedPageState.filters]);

  return (
    <PageContainer
      header={{
        title: '团队工单',
        extra: [
          <Space key="month">
            <span>工单月份：</span>
            <DatePicker
              picker="month"
              allowClear
              placeholder="全部月份"
              value={month}
              onChange={(value) => {
                setMonth(value);
                updateCachedListPageState(PAGE_STATE_KEY, { month: value ? toMonthKey(value) : '', current: 1 });
                actionRef.current?.reload();
              }}
            />
          </Space>,
        ],
      }}
    >
      <ProTable<DispatchedOrderItem>
        getPopupContainer={() => document.body}
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams & Record<string, unknown>, _sort, filters) => {
          updateCachedListPageState(PAGE_STATE_KEY, {
            current: Number((params as { current?: number }).current || params.page || cachedPageState.current || 1),
            pageSize: Number(params.pageSize || cachedPageState.pageSize || 20),
            filters: normalizeCachedFilters(filters),
          });
          const mergedParams = mergeProTableFiltersIntoParams(params, filters);
          const result = await getDispatchedOrdersSafe(normalizeQuery({
            ...mergedParams,
            page: (params as { current?: number }).current || params.page || 1,
          } as PageParams & Record<string, unknown>, month));
          const list = result.list.filter((row) => isPhase1VisibleModule(row.module_code) && (!row.order_type || isPhase1VisibleOrderType(row.order_type)));
          return { data: list, success: true, total: result.total };
        }}
        rowKey="id"
        search={false}
        headerTitle="授权团队范围内子工单"
        pagination={{ defaultCurrent: cachedPageState.current || 1, defaultPageSize: cachedPageState.pageSize || 20, showSizeChanger: true }}
        dateFormatter="string"
        options={false}
        toolBarRender={false}
        scroll={{ x: 1650 }}
      />
    </PageContainer>
  );
};

export default TeamDispatched;
