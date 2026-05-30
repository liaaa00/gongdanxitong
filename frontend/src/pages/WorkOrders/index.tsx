import { forwardRef, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { App, Badge, Button, Input, Popconfirm, Radio, Space, Tag, Tooltip } from 'antd';
import { ExportOutlined, EyeOutlined, ImportOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import MultiViewTable from '@/components/MultiViewTable';
import { batchDeleteWorkOrders, deleteWorkOrder, getWorkOrders } from '@/services/workOrders';
import type { DispatchedOrderSummary, WorkOrderItem } from '@/services/workOrders';
import { getMyRoleActions, type RoleActionCode } from '@/services/roleActionPermissions';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import { ROLE } from '@/constants/roles';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

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
const STATUS_SEARCH_OPTIONS = STATUS_OPTIONS.map(({ value, label }) => ({ value, label }));

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

const ORDER_TYPE_OPTIONS = [
  { value: 'onboarding', label: '入职' },
  { value: 'renewal', label: '续签' },
  { value: 'resignation', label: '离职' },
  { value: 'benefit', label: '待遇申报' },
];
const ORDER_TYPE_MAP = Object.fromEntries(ORDER_TYPE_OPTIONS.map((item) => [item.value, item.label]));

const textHeaderFilter = (placeholder: string): Pick<ProColumns<WorkOrderItem>, 'filterDropdown' | 'filterIcon'> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div style={{ padding: 8, width: 260 }} onKeyDown={(event) => event.stopPropagation()}>
      <Input
        allowClear
        autoFocus
        placeholder={placeholder}
        value={String(selectedKeys[0] ?? '')}
        onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
        onPressEnter={() => confirm()}
        style={{ marginBottom: 8, display: 'block' }}
      />
      <Space>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
          筛选
        </Button>
        <Button
          size="small"
          onClick={() => {
            clearFilters?.();
            confirm();
          }}
        >
          重置
        </Button>
        <Button size="small" onClick={() => close?.()}>
          取消
        </Button>
      </Space>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
});

const selectHeaderFilter = (
  placeholder: string,
  options: Array<{ label: string; value: string }>,
): Pick<ProColumns<WorkOrderItem>, 'filterDropdown' | 'filterIcon'> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div style={{ padding: 8, width: 220 }} onKeyDown={(event) => event.stopPropagation()}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{placeholder}</div>
      <Space style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8, marginBottom: 8 }}>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
          筛选
        </Button>
        <Button
          size="small"
          onClick={() => {
            clearFilters?.();
            confirm();
          }}
        >
          重置
        </Button>
        <Button size="small" onClick={() => close?.()}>
          取消
        </Button>
      </Space>
      <div style={{ maxHeight: 120, overflowY: 'auto', paddingRight: 4 }}>
        <Radio.Group
          value={selectedKeys[0] as string | undefined}
          onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {options.map((item) => (
              <Radio key={item.value} value={item.value}>{item.label}</Radio>
            ))}
          </Space>
        </Radio.Group>
      </div>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
});

function getStatusMeta(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'draft' || normalized === 'pending' || normalized === 'accepted' || normalized === 'in_progress') {
    return STATUS_MAP.processing;
  }
  if (normalized === 'cancelled') return STATUS_MAP.void;
  return STATUS_MAP[normalized] || { label: '状态未知', color: 'default' };
}

function getDispatchedProgressMeta(child: DispatchedOrderSummary): { label: string; badge: 'success' | 'warning' | 'processing' | 'error' | 'default'; color: string } {
  const status = String(child.status || '').toLowerCase();
  if (child.is_overdue) return { label: '已超时', badge: 'error', color: 'red' };
  if (status === 'completed') return { label: '已完成', badge: 'success', color: 'success' };
  if (status === 'withdraw_pending') return { label: '撤回审批中', badge: 'warning', color: 'gold' };
  if (status === 'withdrawn') return { label: '已撤回', badge: 'default', color: 'default' };
  if (status === 'void_pending') return { label: '作废审批中', badge: 'warning', color: 'gold' };
  if (status === 'void' || child.void_at || child.voidAt) return { label: '已作废', badge: 'default', color: 'default' };
  if (status === 'returned') return { label: '已退回', badge: 'warning', color: 'warning' };
  if (['processing', 'accepted', 'in_progress', 'pending', 'created', 'waiting_dispatch', 'to_dispatch'].includes(status)) {
    return { label: '处理中', badge: 'processing', color: 'processing' };
  }
  return { label: getStatusMeta(status).label, badge: 'default', color: 'default' };
}

interface WorkOrdersProps {
  mode?: 'main' | 'initiated';
}

const WorkOrders: React.FC<WorkOrdersProps> = ({ mode = 'main' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const [allowedActions, setAllowedActions] = useState<RoleActionCode[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMyRoleActions()
      .then((actions) => { if (!cancelled) setAllowedActions(actions); })
      .catch(() => { if (!cancelled) setAllowedActions([]); });
    return () => { cancelled = true; };
  }, []);

  const isAdmin = hasRole(ROLE.ADMIN);
  const isBusinessOwner = hasRole(ROLE.BUSINESS_OWNER);
  const isGroupLeader = hasRole(ROLE.BUSINESS_GROUP_LEADER);
  const isGroupMember = hasRole(ROLE.BUSINESS_GROUP_MEMBER);
  const isBackendProcessor = [
    ROLE.DATA_ENTRY_LEADER,
    ROLE.SHARED_TEAM_OWNER,
    ROLE.LABOR_CONTRACT_MEMBER,
    ROLE.ONBOARDING_RESIGNATION_MEMBER,
    ROLE.SOCIAL_INSURANCE_SPECIALIST,
  ].some((role) => hasRole(role));
  const isBackendOnly = isBackendProcessor && !isAdmin && !isBusinessOwner && !isGroupLeader && !isGroupMember;
  const isInitiatedPage = mode === 'initiated' || location.pathname.includes('/my-work/initiated');
  const canDelete = !isInitiatedPage && isAdmin;
  const canCreateWorkOrder = !isInitiatedPage && (isAdmin || allowedActions.includes('work_order.create') || (!allowedActions.length && (isGroupMember || isGroupLeader)));
  const canImportWorkOrder = !isInitiatedPage && (isAdmin || allowedActions.includes('work_order.import') || (!allowedActions.length && (isGroupMember || isGroupLeader)));
  const pageTitle = isInitiatedPage ? '我发起的工单' : '主工单列表';

  const urlFilters = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next: Record<string, string> = {};
    ['orderType', 'status', 'customerCode', 'customerName', 'employeeName', 'idCardNo'].forEach((key) => {
      const value = params.get(key);
      if (value) next[key] = value;
    });
    return next;
  }, [location.search]);

  useEffect(() => {
    if (isBackendOnly) {
      navigate('/my-dispatched', { replace: true });
    }
  }, [isBackendOnly, navigate]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkOrder(id);
      message.success('已删除');
      setRefreshKey((value) => value + 1);
    } catch {
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async (ids: React.Key[], clear: () => void) => {
    try {
      const res = await batchDeleteWorkOrders(ids.map(String));
      message.success(`已删除 ${res.deleted} 条`);
      clear();
      setRefreshKey((value) => value + 1);
    } catch {
      message.error('批量删除失败');
    }
  };

  const handleBatchExport = () => {
    message.info('主工单批量导出暂未开放，请在对应子工单页面按固定模板导出');
  };

  const columns: ProColumns<WorkOrderItem>[] = useMemo(() => {
    const baseColumns: ProColumns<WorkOrderItem>[] = [
    {
      title: '工单编号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 160,
      copyable: true,
      hideInSearch: true,
      ...textHeaderFilter('输入工单编号'),
    },
    {
      title: '客户代码',
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 130,
      search: false,
      ...textHeaderFilter('输入客户代码'),
      renderText: (_, record) => String(record.customer_code || record.extra_data?.customer_code || '-'),
    },
    {
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 190,
      search: false,
      ...textHeaderFilter('输入客户名称'),
    },
    {
      title: '员工姓名',
      dataIndex: 'employee_name',
      key: 'employee_name',
      width: 120,
      search: false,
      ...textHeaderFilter('输入员工姓名'),
    },
    {
      title: '员工证件号',
      dataIndex: 'employee_id_card',
      key: 'employee_id_card',
      width: 190,
      search: false,
      ...textHeaderFilter('输入员工证件号'),
    },
    {
      title: '发起人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 100,
      hideInTable: !(isBusinessOwner || isGroupLeader || isAdmin),
      hideInSearch: true,
      renderText: (value) => value || '-',
    },
    {
      title: '订单类型',
      dataIndex: 'order_type',
      key: 'order_type',
      width: 100,
      valueType: 'select',
      fieldProps: { options: ORDER_TYPE_OPTIONS },
      search: false,
      ...selectHeaderFilter('选择订单类型', ORDER_TYPE_OPTIONS),
      renderText: (value) => ORDER_TYPE_MAP[String(value || '')] || String(value || '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      valueType: 'select',
      fieldProps: { options: STATUS_SEARCH_OPTIONS },
      ...selectHeaderFilter('选择状态', STATUS_SEARCH_OPTIONS),
      render: (_, record) => {
        const status = getStatusMeta(record.status);
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: '子工单进度',
      key: 'dispatched_status',
      width: 260,
      hideInSearch: true,
      render: (_, record) => {
        const children = record.dispatched_orders;
        if (!children || children.length === 0) {
          return <Tag color="default">暂无子工单</Tag>;
        }
        return (
          <Space size={[4, 4]} wrap>
            {children.map((child) => {
              const moduleKey = String(child.module_code || child.module_name || '');
              const moduleLabel = MODULE_LABEL[moduleKey] || child.module_name || '未知子工单';
              const meta = getDispatchedProgressMeta(child);
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
      width: 150,
      valueType: 'dateTime',
      sorter: true,
      hideInSearch: true,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      hideInSearch: true,
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/work-orders/${record.id}`)}>
            详情
          </RefButton>
          {canDelete && (
            <Popconfirm
              title="确定删除此工单？"
              description="删除后不可恢复，相关子工单也将一并清除。"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(record.id)}
            >
              <RefButton type="link" size="small" danger>删除</RefButton>
            </Popconfirm>
          )}
        </Space>
      ),
    },
    ];
    return isInitiatedPage ? baseColumns.filter((column) => column.key !== 'actions') : baseColumns;
  }, [canDelete, isAdmin, isBusinessOwner, isGroupLeader, isInitiatedPage, navigate]);

  const requestFn = async (params: Record<string, unknown>) => {
    const query: Record<string, unknown> = {
      ...urlFilters,
      ...params,
      orderNo: params.orderNo || params.order_no || urlFilters.orderNo,
      customerCode: params.customerCode || params.customer_code || urlFilters.customerCode,
      customerName: params.customerName || params.customer_name || urlFilters.customerName,
      employeeName: params.employeeName || params.employee_name || urlFilters.employeeName,
      idCardNo: params.idCardNo || params.employee_id_card || urlFilters.idCardNo,
      orderType: params.orderType || params.order_type || urlFilters.orderType,
      status: params.status || urlFilters.status,
    };
    Object.keys(query).forEach((key) => {
      if (query[key] === undefined || query[key] === '') delete query[key];
    });
    const result = await getWorkOrders(query as PageParams);
    return { data: result.list, success: true, total: result.total };
  };

  return (
    <PageContainer header={{ title: pageTitle }}>
      <MultiViewTable<WorkOrderItem>
        key={`${refreshKey}-${location.search}`}
        viewId={isInitiatedPage ? 'my-work-initiated-readonly' : 'work-orders-main'}
        columns={columns}
        request={requestFn}
        rowKey="id"
        headerTitle={pageTitle}
        search={false}
        kanbanColumnKey="status"
        kanbanAllowedValues={STATUS_OPTIONS}
        toolBarRender={isInitiatedPage ? undefined : () => [
          canCreateWorkOrder && (
            <RefButton key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/work-orders/new')}>
              新建工单
            </RefButton>
          ),
          canImportWorkOrder && (
            <RefButton key="import" icon={<ImportOutlined />} onClick={() => navigate('/work-orders/import')}>
              批量导入
            </RefButton>
          ),
          <RefButton key="export" icon={<ExportOutlined />} onClick={handleBatchExport}>
            批量导出
          </RefButton>,
        ].filter(Boolean) as React.ReactNode[]}
        proTableOptions={false}
        proTableToolBarRender={false}
        batchActions={!isInitiatedPage && canDelete ? (selectedKeys, clear) => (
          <Space>
            <Popconfirm
              title={`确定删除选中的 ${selectedKeys.length} 条工单？`}
              description="删除后不可恢复，相关子工单也将一并清除。"
              okText="删除"
              okButtonProps={{ danger: true }}
              disabled={selectedKeys.length === 0}
              onConfirm={() => handleBatchDelete(selectedKeys, clear)}
            >
              <RefButton danger disabled={selectedKeys.length === 0}>
                批量删除
              </RefButton>
            </Popconfirm>
            <RefButton onClick={clear}>取消选择</RefButton>
          </Space>
        ) : undefined}
      />
    </PageContainer>
  );
};

export default WorkOrders;
