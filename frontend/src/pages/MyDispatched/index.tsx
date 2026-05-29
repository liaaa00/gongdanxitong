import { forwardRef, useRef, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Modal, Select, Badge, Form, Input, Tooltip, Alert } from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, ExportOutlined, ClockCircleOutlined,
  WarningOutlined, RollbackOutlined, UploadOutlined, BellOutlined,
} from '@ant-design/icons';
import {
  getDispatchedOrders,
  acceptDispatchedOrder,
  batchExportDispatchedOrders,
  batchCompleteDispatchedOrders,
  batchReturnDispatchedOrders,
  batchUrgeDispatchedOrders,
  reassignDispatchedOrder,
  downloadDispatchedExport,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import DispatchedBatchImportModal from '@/components/DispatchedBatchImportModal';
import type { DispatchedBatchImportMode } from '@/components/DispatchedBatchImportModal';
import type { PageParams } from '@/services/mock';
import { getUsersByTeam } from '@/services/users';
import type { UserItem } from '@/services/users';
import { getWorkOrders } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { useAuth } from '@/hooks/useAuth';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { ROLE } from '@/constants/roles';
import {
  DISPATCHED_PROCESSING_STATUS_OPTION,
  DISPATCHED_PROCESSING_STATUS_FILTER_VALUE,
  normalizeDispatchedStatusSearchParams,
} from '@/utils/dispatchedStatusFilter';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const getSelectPopupContainer = (triggerNode: HTMLElement) => triggerNode.parentElement || document.body;

type MyDispatchedMode = 'pending' | 'done';

interface MyDispatchedProps {
  mode?: MyDispatchedMode;
}

const ACTIVE_DISPATCHED_STATUSES = new Set(['pending', 'processing']);

const WORK_TYPE_OPTIONS = [
  { label: '数据录入子工单', value: 'data_entry' },
  { label: '社保公积金办理子工单', value: 'social_insurance' },
  { label: '入职联系子工单', value: 'onboarding_contact' },
  { label: '劳动合同签订子工单', value: 'contract' },
  { label: '续签合同子工单', value: 'renewal_contract' },
  { label: '离职联系子工单', value: 'resignation_contact' },
  { label: '离职证明子工单', value: 'resignation_cert' },
  { label: '待遇申报子工单', value: 'benefit_apply' },
];

function currentMonthCompletedRange(): { completedFrom: string; completedTo: string } {
  const now = dayjs();
  return {
    completedFrom: now.startOf('month').toISOString(),
    completedTo: now.endOf('month').toISOString(),
  };
}

function getSlaStatus(status: string, dueAt?: string | null, reminderBeforeHours?: number | null): { label: string; color: string; overdue: boolean } | null {
  if (status === 'completed' || status === 'returned' || !dueAt) return null;
  const remainHours = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (remainHours < 0) return { label: '已超时', color: 'red', overdue: true };
  const warningHours = reminderBeforeHours ?? 4;
  if (warningHours > 0 && remainHours <= warningHours) return { label: '即将超时', color: 'orange', overdue: false };
  return null;
}

function getTeamCode(record?: DispatchedOrderItem | null) {
  return record?.team_code || record?.module_code || 'shared_team';
}

function getOperatorDisplay(record: DispatchedOrderItem) {
  if (record.status === 'completed') return record.handler_name || '实际操作人未记录';
  const configured = record.configured_handler_names || record.configuredHandlerNames || [];
  if (configured.length > 0) return configured.join('、');
  return record.handler_name || '负责人未配置';
}

const MyDispatched: React.FC<MyDispatchedProps> = ({ mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { hasAnyRole } = useAuth();
  const actionRef = useRef<ActionType>();
  const isReturnedRoute = location.pathname.includes('/my-work/returned');
  const routeMode: MyDispatchedMode = location.pathname.includes('/my-work/done') ? 'done' : 'pending';
  const currentMode = mode || routeMode;
  const isDoneMode = currentMode === 'done';
  const isBusinessInitiator = hasAnyRole([ROLE.BUSINESS_GROUP_MEMBER, ROLE.BUSINESS_GROUP_LEADER]);
  const showReturnedMainOrders = (isReturnedRoute || currentMode === 'pending') && isBusinessInitiator;
  const headerTitle = isDoneMode ? '我的已办' : (isReturnedRoute ? '我的退回' : '我的待办');
  const childTableTitle = isDoneMode ? '当月已办子工单' : (isBusinessInitiator ? '退回待处理子工单' : '待办子工单');
  const emptyText = isDoneMode ? '本月暂无已办子工单' : (isBusinessInitiator ? '暂无退回待处理子工单' : '暂无待办子工单');
  const [exporting, setExporting] = useState(false);
  const [batchImportMode, setBatchImportMode] = useState<DispatchedBatchImportMode | null>(null);
  const [slaWarningCount, setSlaWarningCount] = useState(0);
  const [slaBreachedCount, setSlaBreachedCount] = useState(0);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<DispatchedOrderItem | null>(null);
  const [teamUsers, setTeamUsers] = useState<UserItem[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [batchCompleteVisible, setBatchCompleteVisible] = useState(false);
  const [batchCompleteIds, setBatchCompleteIds] = useState<string[]>([]);
  const [batchCompleteRemark, setBatchCompleteRemark] = useState('');
  const [batchCompleteLoading, setBatchCompleteLoading] = useState(false);
  const [batchReturnVisible, setBatchReturnVisible] = useState(false);
  const [batchReturnIds, setBatchReturnIds] = useState<string[]>([]);
  const [batchReturnReason, setBatchReturnReason] = useState('');
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);
  const [batchUrgeVisible, setBatchUrgeVisible] = useState(false);
  const [batchUrgeIds, setBatchUrgeIds] = useState<string[]>([]);
  const [batchUrgeReason, setBatchUrgeReason] = useState('');
  const [batchUrgeLoading, setBatchUrgeLoading] = useState(false);
  const [batchCleanFn, setBatchCleanFn] = useState<(() => void) | null>(null);
  const [reassignForm] = Form.useForm<{ handlerId: string; reason: string }>();

  const handleAccept = async (id: string) => {
    try {
      await acceptDispatchedOrder(id);
      message.success('已接单');
      actionRef.current?.reload();
    } catch { message.error('接单失败'); }
  };

  const handleBatchComplete = async () => {
    const remark = batchCompleteRemark.trim();
    if (!remark) {
      message.warning('请填写批量完成备注');
      return;
    }
    if (batchCompleteIds.length === 0) {
      message.warning('未选择任何可办理子工单');
      return;
    }
    setBatchCompleteLoading(true);
    try {
      const res = await batchCompleteDispatchedOrders(batchCompleteIds, remark);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) {
        message.warning(`成功完成 ${res.completed} 条，${skipped} 条跳过`);
      } else {
        message.success(`已批量完成 ${res.completed} 条子工单`);
      }
      setBatchCompleteVisible(false);
      setBatchCompleteRemark('');
      setBatchCompleteIds([]);
      batchCleanFn?.();
      actionRef.current?.reload();
    } catch {
      message.error('批量完成失败');
    } finally {
      setBatchCompleteLoading(false);
    }
  };

  const handleBatchReturn = async () => {
    const reason = batchReturnReason.trim();
    if (!reason) {
      message.warning('请填写批量退回原因');
      return;
    }
    if (batchReturnIds.length === 0) {
      message.warning('未选择任何可退回子工单');
      return;
    }
    setBatchReturnLoading(true);
    try {
      const res = await batchReturnDispatchedOrders(batchReturnIds, reason);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`成功退回 ${res.returned} 条，${skipped} 条跳过`);
      else message.success(`已批量退回 ${res.returned} 条子工单`);
      setBatchReturnVisible(false);
      setBatchReturnReason('');
      setBatchReturnIds([]);
      batchCleanFn?.();
      actionRef.current?.reload();
    } catch {
      message.error('批量退回失败');
    } finally {
      setBatchReturnLoading(false);
    }
  };

  const handleBatchUrge = async () => {
    if (batchUrgeIds.length === 0) {
      message.warning('未选择任何可催办子工单');
      return;
    }
    setBatchUrgeLoading(true);
    try {
      const reason = batchUrgeReason.trim();
      const res = await batchUrgeDispatchedOrders(batchUrgeIds, reason || undefined);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`成功催办 ${res.urged} 条，${skipped} 条跳过`);
      else message.success(`已批量催办 ${res.urged} 条子工单`);
      setBatchUrgeVisible(false);
      setBatchUrgeReason('');
      setBatchUrgeIds([]);
      batchCleanFn?.();
      actionRef.current?.reload();
    } catch {
      message.error('批量催办失败');
    } finally {
      setBatchUrgeLoading(false);
    }
  };

  const openReassign = async (record: DispatchedOrderItem) => {
    setReassignTarget(record);
    setReassignOpen(true);
    reassignForm.resetFields();
    try {
      const users = await getUsersByTeam(getTeamCode(record));
      setTeamUsers(users.filter((u) => u.id !== record.handler_id));
    } catch {
      setTeamUsers([]);
      message.warning('同组成员加载失败，可稍后重试');
    }
  };

  const handleReassign = async () => {
    if (!reassignTarget) return;
    const values = await reassignForm.validateFields();
    setReassignLoading(true);
    try {
      await reassignDispatchedOrder(reassignTarget.id, values.handlerId, values.reason.trim());
      message.success('转交成功');
      setReassignOpen(false);
      setReassignTarget(null);
      actionRef.current?.reload();
    } catch {
      message.error('转交失败');
    } finally {
      setReassignLoading(false);
    }
  };

  const handleBatchExport = async (ids: string[]) => {
    if (ids.length === 0) {
      message.warning('请先选择要导出的子工单');
      return;
    }
    setExporting(true);
    try {
      const result = await batchExportDispatchedOrders(ids);
      downloadDispatchedExport(result, '批量导出子工单.xlsx');
      message.success('导出成功');
    } catch { message.error('导出失败'); }
    finally { setExporting(false); }
  };

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    {
      title: '操作', key: 'actions', width: 130, fixed: 'left', hideInSearch: true,
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/my-dispatched/' + record.id)}>详情</RefButton>
          {record.status === 'pending' && (
            <RefButton type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleAccept(record.id)}>接单</RefButton>
          )}
        </Space>
      ),
    },
    { title: '编号', dataIndex: 'order_no', key: 'order_no', width: 150, copyable: true },
    {
      title: '工单类型',
      dataIndex: 'moduleCode',
      key: 'moduleCode',
      width: 160,
      valueType: 'select',
      fieldProps: { options: WORK_TYPE_OPTIONS, placeholder: '下拉选择' },
      render: (_, r) => (
        <Space size={4} wrap>
          {r.has_unread_dirty && <Badge color="red" />}
          <Tag color="blue">{getModuleLabel(r.module_code)}</Tag>
          {r.has_unread_dirty && <Tag color="red">字段变更</Tag>}
        </Space>
      ),
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customerCode', width: 110 },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customerName', width: 150, ellipsis: true },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employeeName', width: 100 },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'idCardNo', width: 170, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100, valueType: 'select',
      fieldProps: {
        options: isDoneMode
          ? [{ label: '已完成', value: 'completed' }]
          : isBusinessInitiator
            ? [{ label: '已退回', value: 'returned' }]
            : [DISPATCHED_PROCESSING_STATUS_OPTION],
        placeholder: isDoneMode ? '已完成' : (isBusinessInitiator ? '已退回' : '待办理/办理中'),
      },
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    { title: '工单所属月份', dataIndex: 'orderMonth', key: 'orderMonth', valueType: 'dateMonth', hideInTable: true },
    {
      title: '超时状态', key: 'sla', width: 110, hideInSearch: true,
      render: (_, record) => {
        const sla = getSlaStatus(record.status, record.due_at, record.sla_reminder_before_hours ?? record.slaReminderBeforeHours ?? null);
        if (!sla) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <Tooltip title={sla.overdue ? '该待办已超过处理时限' : '该待办即将超过处理时限'}>
            <Tag color={sla.color} icon={sla.overdue ? <WarningOutlined /> : <ClockCircleOutlined />}>{sla.label}</Tag>
          </Tooltip>
        );
      },
    },
    { title: '实际操作人/配置负责人', dataIndex: 'handler_name', key: 'handler_name', width: 190, hideInSearch: true,
      render: (_, r) => {
        const text = getOperatorDisplay(r);
        return r.status === 'completed' ? text : <Tag color={text === '负责人未配置' ? 'orange' : 'blue'}>{text}</Tag>;
      },
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '派发时间', dataIndex: 'dispatchedRange', key: 'dispatchedRange', valueType: 'dateTimeRange', hideInTable: true },
    { title: '完成时间', dataIndex: 'completedRange', key: 'completedRange', valueType: 'dateTimeRange', hideInTable: true },

  ], [navigate, isDoneMode, isBusinessInitiator]);

  const returnedWorkOrderColumns: ProColumns<WorkOrderItem>[] = useMemo(() => [
    { title: '工单编号', dataIndex: 'order_no', key: 'order_no', width: 150, copyable: true },
    { title: '工单类型', dataIndex: 'order_type', key: 'order_type', width: 100 },
    { title: '员工', dataIndex: 'employee_name', key: 'employee_name', width: 100 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 140, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 150, valueType: 'dateTime' },
    {
      title: '操作', key: 'actions', width: 100, hideInSearch: true,
      render: (_, record) => (
        <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/work-orders/' + record.id)}>处理</RefButton>
      ),
    },
  ], [navigate]);

  const requestReturnedMainOrders = async (params: PageParams) => {
    const result = await getWorkOrders({ ...params, status: 'returned' });
    return { data: result.list, success: true, total: result.total };
  };

  const updateSlaCounts = (list: DispatchedOrderItem[]) => {
    let warning = 0;
    let breached = 0;
    for (const item of list) {
      const sla = getSlaStatus(item.status, item.due_at, item.sla_reminder_before_hours ?? item.slaReminderBeforeHours ?? null);
      if (!sla) continue;
      if (sla.overdue) breached += 1;
      else warning += 1;
    }
    setSlaWarningCount(warning);
    setSlaBreachedCount(breached);
  };

  const clearSlaCounts = () => {
    setSlaWarningCount(0);
    setSlaBreachedCount(0);
  };

  const normalizeQuery = (params: PageParams & Record<string, unknown>) => {
    const readString = (...values: unknown[]) => {
      const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
      return value === undefined ? undefined : String(value);
    };
    const orderMonthRaw = params.orderMonth;
    const orderMonth = orderMonthRaw && typeof (orderMonthRaw as { format?: unknown }).format === 'function'
      ? (orderMonthRaw as { format: (format: string) => string }).format('YYYY-MM')
      : String(orderMonthRaw || '');
    const toIso = (value: unknown) => {
      if (!value) return undefined;
      if (typeof (value as { toISOString?: unknown }).toISOString === 'function') return (value as { toISOString: () => string }).toISOString();
      return String(value);
    };
    const dispatchedRange = Array.isArray(params.dispatchedRange) ? params.dispatchedRange : [];
    const completedRange = Array.isArray(params.completedRange) ? params.completedRange : [];
    return normalizeDispatchedStatusSearchParams({
      page: Number(params.page ?? (params as { current?: number }).current ?? 1) || 1,
      pageSize: params.pageSize ? Number(params.pageSize) : undefined,
      keyword: readString(params.keyword),
      sort: readString(params.sort),
      status: readString(params.status),
      moduleCode: readString(params.moduleCode, params.module_code),
      orderNo: readString(params.orderNo, params.order_no),
      customerCode: readString(params.customerCode, params.customer_code),
      customerName: readString(params.customerName, params.customer_name),
      employeeName: readString(params.employeeName, params.employee_name),
      idCardNo: readString(params.idCardNo, params.employee_id_card, params.employeeIdCard),
      dispatchedFrom: toIso(dispatchedRange[0]),
      dispatchedTo: toIso(dispatchedRange[1]),
      completedFrom: toIso(completedRange[0]),
      completedTo: toIso(completedRange[1]),
      orderMonth: orderMonth || undefined,
    });
  };

  const requestDispatchedOrders = async (params: PageParams & Record<string, unknown>) => {
    const query = normalizeQuery({
      ...params,
      page: (params as { current?: number }).current || params.page || 1,
    });

    // 已办模式：只显示当前用户已完成的子工单
    if (isDoneMode) {
      const defaultCompletedRange = query.orderMonth || query.completedFrom || query.completedTo
        ? {}
        : currentMonthCompletedRange();
      const result = await getDispatchedOrders({
        ...query,
        ...defaultCompletedRange,
        handlerId: 'current',
        status: 'completed',
      });
      clearSlaCounts();
      return { data: result.list, success: true, total: result.total };
    }

    // 业务发起人待办模式：显示退回的子工单
    if (isBusinessInitiator) {
      const result = await getDispatchedOrders({ ...query, includeReturned: true, status: 'returned' });
      const list = result.list.filter((d) => d.status === 'returned');
      clearSlaCounts();
      return { data: list, success: true, total: result.total };
    }

    // 普通待办模式：显示 pending 和 processing 状态的子工单。
    // 用户选择“待办理/办理中”时同样传 statuses=pending,processing，避免只筛到 pending 或 processing 之一。
    if (query.statuses) {
      const result = await getDispatchedOrders({ ...query, statuses: String(query.statuses) });
      const list = result.list.filter((d) => ACTIVE_DISPATCHED_STATUSES.has(d.status));
      updateSlaCounts(list);
      return { data: list, success: true, total: result.total };
    }

    // 其它单值状态保留单值 status 查询，兼容已办/退回等场景。
    if (query.status) {
      const result = await getDispatchedOrders({ ...query, status: String(query.status) });
      const list = result.list.filter((d) => ACTIVE_DISPATCHED_STATUSES.has(d.status));
      updateSlaCounts(list);
      return { data: list, success: true, total: result.total };
    }

    // 没有指定状态时，在后端用同一个查询完成 pending + processing 的筛选与分页。
    // 不能分别请求两个状态再在前端拼接，否则每个状态都会各自分页，导致总数、页码和当前页数据不一致。
    const result = await getDispatchedOrders({ ...query, statuses: DISPATCHED_PROCESSING_STATUS_FILTER_VALUE });
    const list = result.list.filter((d) => ACTIVE_DISPATCHED_STATUSES.has(d.status));
    updateSlaCounts(list);
    return { data: list, success: true, total: result.total };
  };

  return (
    <PageContainer header={{
      title: headerTitle,
      extra: !isDoneMode && (slaWarningCount > 0 || slaBreachedCount > 0) ? [
        slaWarningCount > 0 ? <Badge key="sla-warning" count={slaWarningCount}><Tag color="orange" icon={<ClockCircleOutlined />}>即将超时</Tag></Badge> : null,
        slaBreachedCount > 0 ? <Badge key="sla-breached" count={slaBreachedCount}><Tag color="red" icon={<ClockCircleOutlined />}>已超时</Tag></Badge> : null,
      ].filter(Boolean) : undefined,
    }}>
      {showReturnedMainOrders && (
        <ProTable<WorkOrderItem>
          columns={returnedWorkOrderColumns}
          rowKey="id"
          request={requestReturnedMainOrders}
          search={{ labelWidth: 'auto' }}
          headerTitle="退回待处理主工单"
          options={false}
          toolBarRender={false}
          pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          dateFormatter="string"
          locale={{ emptyText: '暂无退回待处理主工单' }}
          style={{ marginBottom: 16 }}
        />
      )}
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef} columns={columns} rowKey="id"
        request={requestDispatchedOrders}
        search={{ labelWidth: 'auto', defaultCollapsed: false }} headerTitle={childTableTitle}
        options={false}
        toolBarRender={!isDoneMode && !isBusinessInitiator ? () => [
          <RefButton key="import-status" icon={<UploadOutlined />} onClick={() => setBatchImportMode('status')}>导入办理结果</RefButton>,
          <RefButton key="import-fields" icon={<UploadOutlined />} onClick={() => setBatchImportMode('fields')}>导入银行卡修改</RefButton>,
        ] : false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1500 }}
        dateFormatter="string"
        locale={{ emptyText }}
        rowSelection={{ preserveSelectedRowKeys: true }}
        tableAlertRender={({ selectedRowKeys, selectedRows, onCleanSelected }) => {
          const selected = selectedRows as DispatchedOrderItem[];
          const completable = selected.filter((r) => ACTIVE_DISPATCHED_STATUSES.has(r.status));
          return (
            <Space wrap>
              <span>已选 {selectedRowKeys.length} 项</span>
              <RefButton size="small" onClick={onCleanSelected}>取消</RefButton>
              {!isDoneMode && !isBusinessInitiator && (
                <RefButton
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={completable.length === 0}
                  onClick={() => {
                    setBatchCompleteIds(completable.map((r) => r.id));
                    setBatchCompleteRemark('');
                    setBatchCleanFn(() => onCleanSelected);
                    setBatchCompleteVisible(true);
                  }}
                >批量完成{completable.length > 0 ? `（${completable.length}）` : ''}</RefButton>
              )}
              {!isDoneMode && !isBusinessInitiator && (
                <RefButton
                  size="small"
                  icon={<BellOutlined />}
                  disabled={completable.length === 0}
                  onClick={() => {
                    setBatchUrgeIds(completable.map((r) => r.id));
                    setBatchUrgeReason('');
                    setBatchCleanFn(() => onCleanSelected);
                    setBatchUrgeVisible(true);
                  }}
                >批量催办{completable.length > 0 ? `（${completable.length}）` : ''}</RefButton>
              )}
              {!isDoneMode && !isBusinessInitiator && (
                <RefButton
                  size="small"
                  danger
                  icon={<RollbackOutlined />}
                  disabled={completable.length === 0}
                  onClick={() => {
                    setBatchReturnIds(completable.map((r) => r.id));
                    setBatchReturnReason('');
                    setBatchCleanFn(() => onCleanSelected);
                    setBatchReturnVisible(true);
                  }}
                >批量退回{completable.length > 0 ? `（${completable.length}）` : ''}</RefButton>
              )}
              <RefButton size="small" type="primary" icon={<ExportOutlined />} loading={exporting}
                onClick={() => handleBatchExport((selectedRowKeys as React.Key[]).map(String))}>按固定模板导出</RefButton>
            </Space>
          );
        }}
      />
            <Modal
        title="批量完成子工单"
        open={batchCompleteVisible}
        confirmLoading={batchCompleteLoading}
        onOk={handleBatchComplete}
        onCancel={() => {
          setBatchCompleteVisible(false);
          setBatchCompleteRemark('');
        }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`将批量完成 ${batchCompleteIds.length} 条子工单，仅 pending/processing 子单会被提交。`}
          />
          <span>批量完成备注（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchCompleteRemark}
            onChange={(e) => setBatchCompleteRemark(e.target.value)}
            placeholder="请输入批量完成原因，例如：本批次资料已核验完成"
            maxLength={1024}
            showCount
          />
        </Space>
      </Modal>
      <Modal
        title="批量催办子工单"
        open={batchUrgeVisible}
        confirmLoading={batchUrgeLoading}
        onOk={handleBatchUrge}
        onCancel={() => {
          setBatchUrgeVisible(false);
          setBatchUrgeReason('');
        }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`将批量催办 ${batchUrgeIds.length} 条子工单，仅 pending/processing 子单会被提交。`}
          />
          <span>催办说明：</span>
          <Input.TextArea
            rows={3}
            value={batchUrgeReason}
            onChange={(e) => setBatchUrgeReason(e.target.value)}
            placeholder="例如：客户催促，请尽快处理"
            maxLength={300}
            showCount
          />
        </Space>
      </Modal>
      <Modal
        title="批量退回子工单"
        open={batchReturnVisible}
        confirmLoading={batchReturnLoading}
        onOk={handleBatchReturn}
        onCancel={() => {
          setBatchReturnVisible(false);
          setBatchReturnReason('');
        }}
        width={520}
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={`将批量退回 ${batchReturnIds.length} 条子工单，仅 pending/processing 子单会被提交。`}
          />
          <span>批量退回原因（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchReturnReason}
            onChange={(e) => setBatchReturnReason(e.target.value)}
            placeholder="请输入退回原因，例如：资料不完整，需要业务员补充"
            maxLength={512}
            showCount
          />
        </Space>
      </Modal>
      <Modal title="转交待办" open={reassignOpen} onOk={handleReassign}
        onCancel={() => { setReassignOpen(false); setReassignTarget(null); }}
        confirmLoading={reassignLoading} destroyOnHidden>
        <Form form={reassignForm} layout="vertical">
          <Form.Item label="当前节点">
            <Space wrap>
              <Tag>{reassignTarget?.order_no}</Tag>
              <Tag color="blue">{getModuleLabel(reassignTarget?.module_code)}</Tag>
              <span>{reassignTarget?.handler_name || '待认领'}</span>
            </Space>
          </Form.Item>
          <Form.Item name="handlerId" label="转交给" rules={[{ required: true, message: '请选择同组成员' }]}>
            <Select
              showSearch
              placeholder="请选择同组成员"
              optionFilterProp="label"
              getPopupContainer={getSelectPopupContainer}
              options={teamUsers.map((u) => ({ label: `${u.real_name || u.username}（${u.group_name || u.department_name || '同组'}）`, value: u.id }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="转交原因"
            rules={[
              { required: true, message: '请填写转交原因' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('转交原因不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：办理人请假，转交备用同事代办" />
          </Form.Item>
        </Form>
      </Modal>
      <DispatchedBatchImportModal
        open={batchImportMode !== null}
        mode={batchImportMode || 'status'}
        moduleOptions={WORK_TYPE_OPTIONS}
        defaultModuleCode="onboarding_contact"
        onClose={() => setBatchImportMode(null)}
        onImported={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
};

export default MyDispatched;
