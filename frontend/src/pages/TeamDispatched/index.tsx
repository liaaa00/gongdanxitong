import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Badge, Button, Space, Tag, Tooltip } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getWorkOrders } from '@/services/workOrders';
import type { DispatchedOrderSummary, WorkOrderItem } from '@/services/workOrders';
import type { PageParams } from '@/services/mock';

const STATUS_OPTIONS = [
  { value: 'processing', label: '未办结', color: 'blue' },
  { value: 'completed', label: '已完成', color: 'success' },
  { value: 'returned', label: '已退回', color: 'warning' },
  { value: 'withdrawn', label: '已撤回', color: 'default' },
  { value: 'void', label: '已作废', color: 'default' },
  { value: 'withdraw_pending', label: '撤回审批中', color: 'gold' },
  { value: 'void_pending', label: '作废审批中', color: 'gold' },
];
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item]));

const ORDER_TYPE_OPTIONS = [
  { value: 'onboarding', label: '入职' },
  { value: 'renewal', label: '续签' },
  { value: 'resignation', label: '离职' },
  { value: 'benefit', label: '待遇申报' },
];
const ORDER_TYPE_MAP = Object.fromEntries(ORDER_TYPE_OPTIONS.map((item) => [item.value, item.label]));

const MODULE_LABEL: Record<string, string> = {
  contract: '劳动合同签订',
  contract_signing: '劳动合同签订',
  onboarding_contact: '入职联系',
  data_entry: '数据录入',
  social_insurance: '社保公积金办理',
  renewal_contract: '续签合同',
  resignation_contact: '离职联系',
  resignation_cert: '离职证明',
  data_entry_resign: '社保停保',
  benefit: '待遇申报',
  benefit_apply: '待遇申报',
};

function normalizeStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['draft', 'pending', 'processing', 'accepted', 'in_progress'].includes(normalized)) return 'processing';
  if (normalized === 'cancelled') return 'void';
  return normalized;
}

function getStatusMeta(status?: string | null) {
  const normalized = normalizeStatus(status);
  return STATUS_MAP[normalized] || { label: '状态未知', color: 'default' };
}

function getSubOrderProgressMeta(child: DispatchedOrderSummary): { label: string; badge: 'success' | 'warning' | 'processing' | 'error' | 'default'; color: string } {
  const status = normalizeStatus(child.status);
  if (child.is_overdue) return { label: '已超时', badge: 'error', color: 'red' };
  if (status === 'completed') return { label: '已完成', badge: 'success', color: 'success' };
  if (status === 'withdraw_pending') return { label: '撤回审批中', badge: 'warning', color: 'gold' };
  if (status === 'withdrawn') return { label: '已撤回', badge: 'default', color: 'default' };
  if (status === 'void_pending') return { label: '作废审批中', badge: 'warning', color: 'gold' };
  if (status === 'void' || child.void_at || child.voidAt) return { label: '已作废', badge: 'default', color: 'default' };
  if (status === 'returned') return { label: '已退回', badge: 'warning', color: 'warning' };
  if (status === 'processing') return { label: '待办理/办理中', badge: 'processing', color: 'processing' };
  return { label: getStatusMeta(status).label, badge: 'default', color: 'default' };
}

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
    createdByName: readString(params.createdByName, params.created_by),
    orderType: readString(params.orderType, params.order_type),
    status: readString(params.status),
  };
}

const TeamDispatched: React.FC = () => {
  const navigate = useNavigate();

  const columns: ProColumns<WorkOrderItem>[] = useMemo(() => [
    {
      title: '主工单编号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 160,
      copyable: true,
      search: { transform: (value) => ({ orderNo: value }) },
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customer_code', width: 120, search: { transform: (value) => ({ customerCode: value }) }, renderText: (_, record) => String(record.customer_code || record.extra_data?.customer_code || '-') },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 180, ellipsis: true, search: { transform: (value) => ({ customerName: value }) } },
    { title: '员工', dataIndex: 'employee_name', key: 'employee_name', width: 110, search: { transform: (value) => ({ employeeName: value }) } },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 180, ellipsis: true, search: { transform: (value) => ({ idCardNo: value }) } },
    { title: '发起人', dataIndex: 'created_by', key: 'created_by', width: 120, search: { transform: (value) => ({ createdByName: value }) }, renderText: (value) => value || '-' },
    {
      title: '订单类型',
      dataIndex: 'order_type',
      key: 'order_type',
      width: 110,
      valueType: 'select',
      fieldProps: { options: ORDER_TYPE_OPTIONS },
      search: { transform: (value) => ({ orderType: value }) },
      renderText: (value) => ORDER_TYPE_MAP[String(value || '')] || String(value || '-'),
    },
    {
      title: '主状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      valueType: 'select',
      fieldProps: { options: STATUS_OPTIONS.map(({ value, label }) => ({ value, label })) },
      render: (_, record) => {
        const status = getStatusMeta(record.status);
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: '子工单进度',
      key: 'dispatched_status',
      width: 300,
      hideInSearch: true,
      render: (_, record) => {
        const children = record.dispatched_orders || [];
        if (children.length === 0) return <Tag color="default">暂无子工单</Tag>;
        return (
          <Space size={[4, 4]} wrap>
            {children.map((child) => {
              const moduleKey = String(child.module_code || child.module_name || '');
              const moduleLabel = MODULE_LABEL[moduleKey] || child.module_name || '未知子工单';
              const meta = getSubOrderProgressMeta(child);
              const details = [
                `${moduleLabel}：${meta.label}`,
                child.handler_name ? `实际操作人/负责人：${child.handler_name}` : '实际操作人/负责人：未配置',
                child.dispatched_at ? `派发：${child.dispatched_at}` : undefined,
                child.completed_at ? `完成：${child.completed_at}` : undefined,
                child.due_at ? `时限：${child.due_at}` : undefined,
              ].filter(Boolean).join('；');
              return (
                <Tooltip key={child.id} title={details}>
                  <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                    <Badge status={meta.badge} text={`${moduleLabel} · ${meta.label}`} />
                  </Tag>
                </Tooltip>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      valueType: 'dateTime',
      sorter: true,
      defaultSortOrder: 'descend',
      hideInSearch: true,
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      hideInSearch: true,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/work-orders/${record.id}`)}>
          <Space size={4}><EyeOutlined />详情</Space>
        </Button>
      ),
    },
  ], [navigate]);

  return (
    <PageContainer header={{ title: '团队工单' }}>
      <ProTable<WorkOrderItem>
        columns={columns}
        request={async (params: PageParams & Record<string, unknown>) => {
          const result = await getWorkOrders(normalizeQuery(params));
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="授权团队范围内主工单"
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        options={false}
        toolBarRender={false}
        scroll={{ x: 1500 }}
      />
    </PageContainer>
  );
};

export default TeamDispatched;
