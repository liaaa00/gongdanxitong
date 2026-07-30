import { forwardRef, useEffect, useRef, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type Dayjs } from 'dayjs';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Modal, Select, Badge, Form, Input, Tooltip, DatePicker } from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, ExportOutlined, ClockCircleOutlined,
  WarningOutlined, RollbackOutlined, UploadOutlined, BellOutlined,
} from '@ant-design/icons';
import {
  getDispatchedOrdersSafe,
  acceptDispatchedOrder,
  batchAcceptDispatchedOrders,
  batchApproveModifyDispatchedOrders,
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
// 我的工单列表统一按子工单维度展示，不再混入主工单表。
import { useAuth } from '@/hooks/useAuth';
import { getModuleLabel, getPhaseOneModuleOptions, isPhaseOneVisibleModule } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { ROLE } from '@/constants/roles';
import { isPhase1VisibleOrderType } from '@/utils/moduleAccess';
import { mergeProTableFiltersIntoParams, selectHeaderFilter, textHeaderFilter } from '@/utils/proTableFilters';
import {
  KEEP_ALIVE_ROUTE_ACTIVATED_EVENT,
  applyCachedColumnFilters,
  getCachedListPageState,
  getCachedMonthOrNull,
  normalizeCachedFilters,
  toMonthKey,
  updateCachedListPageState,
  type KeepAliveRouteActivatedDetail,
} from '@/utils/listPageState';
import {
  DISPATCHED_NINE_STATUS_OPTIONS,
  normalizeDispatchedStatusSearchParams,
} from '@/utils/dispatchedStatusFilter';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const getSelectPopupContainer = (triggerNode: HTMLElement) => triggerNode.parentElement || document.body;

type MyDispatchedMode = 'pending' | 'done' | 'initiated' | 'returned';

interface MyDispatchedProps {
  mode?: MyDispatchedMode;
}

const ACTIVE_DISPATCHED_STATUSES = new Set(['pending', 'processing']);
const TODO_DISPATCHED_STATUS_FILTER_VALUE = ['pending', 'processing', 'modify_pending', 'withdraw_pending', 'void_pending'].join(',');
const TODO_VISIBLE_STATUSES = new Set(TODO_DISPATCHED_STATUS_FILTER_VALUE.split(','));
const OPEN_DISPATCHED_STATUS_VALUES = new Set<string>(DISPATCHED_NINE_STATUS_OPTIONS.map((option) => option.value));

const WORK_TYPE_OPTIONS = getPhaseOneModuleOptions().map((option) => ({
  label: `${option.label}子工单`,
  value: option.value,
}));

const DISPATCHED_STATUS_OPTIONS = DISPATCHED_NINE_STATUS_OPTIONS;


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
  const configured = record.configured_handler_names || record.configuredHandlerNames || [];
  if (record.handler_name) return record.handler_name;
  if (configured.length > 0) return configured.join('、');
  return '负责人未配置';
}

function moduleAllowedByCurrentBackendRole(moduleCode: string | undefined | null, hasAnyRole: (roles: string[]) => boolean): boolean {
  const code = String(moduleCode || '');
  if (!code) return false;
  if (!isPhaseOneVisibleModule(code)) return false;
  if (hasAnyRole([ROLE.ADMIN])) return true;
  if (hasAnyRole([ROLE.LABOR_CONTRACT_MEMBER])) return ['contract', 'contract_signing'].includes(code);
  if (hasAnyRole([ROLE.ONBOARDING_RESIGNATION_MEMBER])) return ['onboarding_contact', 'resignation_contact'].includes(code);
  if (hasAnyRole([ROLE.DATA_ENTRY_LEADER])) return ['data_entry', 'data_entry_resign'].includes(code);
  if (hasAnyRole([ROLE.SOCIAL_INSURANCE_SPECIALIST])) return ['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(code);
  if (hasAnyRole([ROLE.SHARED_TEAM_OWNER])) return ['contract', 'contract_signing', 'onboarding_contact', 'resignation_contact'].includes(code);
  return true;
}

const MyDispatched: React.FC<MyDispatchedProps> = ({ mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { hasAnyRole } = useAuth();
  const actionRef = useRef<ActionType>();

  useEffect(() => {
    const handleRouteActivated = (event: Event) => {
      const detail = (event as CustomEvent<KeepAliveRouteActivatedDetail>).detail;
      if (detail?.pathname === location.pathname) void actionRef.current?.reload();
    };
    window.addEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, handleRouteActivated);
    return () => window.removeEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, handleRouteActivated);
  }, [location.pathname]);

  const routeMode: MyDispatchedMode = location.pathname.includes('/my-work/done')
    ? 'done'
    : location.pathname.includes('/my-work/initiated')
      ? 'initiated'
      : location.pathname.includes('/my-work/returned')
        ? 'returned'
        : 'pending';
  const currentMode = mode || routeMode;
  const pageStateKey = `my-work:${currentMode}`;
  const cachedPageState = getCachedListPageState(pageStateKey);
  const isDoneMode = currentMode === 'done';
  const isInitiatedMode = currentMode === 'initiated';
  const isReturnedMode = currentMode === 'returned';
  const isBusinessSideUser = hasAnyRole([ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER]);

  // 发起人视图由路由 mode 控制，数据范围由后端 scope 兜底。
  const headerTitle = isDoneMode ? '我的已办' : isInitiatedMode ? '我发起的' : isReturnedMode ? '我的退回' : '我的待办';
  const childTableTitle = isDoneMode ? '当月已办子工单' : isInitiatedMode ? '我发起的子工单' : isReturnedMode ? '退回待处理子工单' : '待办子工单';
  const emptyText = isDoneMode ? '本月暂无已办子工单' : isInitiatedMode ? '暂无我发起的子工单' : isReturnedMode ? '暂无退回待处理子工单' : '暂无待办子工单';
  const [exporting, setExporting] = useState(false);
  const [month, setMonth] = useState<Dayjs | null>(() => getCachedMonthOrNull(pageStateKey));
  const [batchImportMode, setBatchImportMode] = useState<DispatchedBatchImportMode | null>(null);
  const [slaWarningCount, setSlaWarningCount] = useState(0);
  const [slaBreachedCount, setSlaBreachedCount] = useState(0);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<DispatchedOrderItem | null>(null);
  const [teamUsers, setTeamUsers] = useState<UserItem[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [batchAcceptLoading, setBatchAcceptLoading] = useState(false);
  const [batchApproveModifyLoading, setBatchApproveModifyLoading] = useState(false);
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
  const [selectedRows, setSelectedRows] = useState<DispatchedOrderItem[]>([]);
  const selectedIds = selectedRows.map((row) => row.id);
  const selectedPendingIds = selectedRows.filter((row) => row.status === 'pending').map((row) => row.id);
  const selectedModifyPendingIds = selectedRows.filter((row) => row.status === 'modify_pending').map((row) => row.id);
  const selectedActiveIds = selectedRows.filter((row) => ACTIVE_DISPATCHED_STATUSES.has(row.status)).map((row) => row.id);
  const canBatchOperate = !isDoneMode && !isInitiatedMode && !isReturnedMode;
  const [visibleImportModuleCodes, setVisibleImportModuleCodes] = useState<string[]>([]);
  const [reassignForm] = Form.useForm<{ handlerId: string; reason: string }>();

  const handleAccept = async (id: string) => {
    try {
      await acceptDispatchedOrder(id);
      message.success('已接单');
      await actionRef.current?.reload();
    } catch { message.error('接单失败'); }
  };

  const handleBatchAccept = async (ids: string[], clear?: () => void) => {
    if (ids.length === 0) {
      message.warning('请先选择未接单的子工单');
      return;
    }
    setBatchAcceptLoading(true);
    try {
      const res = await batchAcceptDispatchedOrders(ids);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`已批量接单 ${res.accepted} 条，${skipped} 条跳过`);
      else message.success(`已批量接单 ${res.accepted} 条子工单`);
      setSelectedRows([]);
      clear?.();
      await actionRef.current?.reload();
    } catch {
      message.error('批量接单失败');
    } finally {
      setBatchAcceptLoading(false);
    }
  };

  const handleBatchApproveModify = async (ids: string[], clear?: () => void) => {
    if (ids.length === 0) {
      message.warning('请先选择修改审批中的子工单');
      return;
    }
    setBatchApproveModifyLoading(true);
    try {
      const res = await batchApproveModifyDispatchedOrders(ids);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`已通过 ${res.processed} 条修改，${skipped} 条跳过`);
      else message.success(`已通过 ${res.processed} 条修改申请`);
      setSelectedRows([]);
      clear?.();
      await actionRef.current?.reload();
    } catch {
      message.error('批量通过修改失败');
    } finally {
      setBatchApproveModifyLoading(false);
    }
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
      setSelectedRows([]);
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
      setSelectedRows([]);
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
      setSelectedRows([]);
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

  const batchImportModuleOptions = useMemo(() => {
    const visibleSet = new Set(visibleImportModuleCodes);
    const roleFallback = WORK_TYPE_OPTIONS.filter((option) => {
      if (visibleSet.size > 0) return visibleSet.has(option.value);
      if (hasAnyRole([ROLE.LABOR_CONTRACT_MEMBER])) return ['contract'].includes(option.value);
      if (hasAnyRole([ROLE.ONBOARDING_RESIGNATION_MEMBER])) return ['onboarding_contact', 'resignation_contact'].includes(option.value);
      if (hasAnyRole([ROLE.DATA_ENTRY_LEADER])) return ['data_entry', 'data_entry_resign'].includes(option.value);
      if (hasAnyRole([ROLE.SOCIAL_INSURANCE_SPECIALIST])) return ['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(option.value);
      if (hasAnyRole([ROLE.SHARED_TEAM_OWNER])) return ['contract', 'onboarding_contact', 'resignation_contact'].includes(option.value);
      if (hasAnyRole([ROLE.ADMIN])) return true;
      return false;
    });
    return roleFallback;
  }, [hasAnyRole, visibleImportModuleCodes]);

  const defaultBatchImportModule = batchImportModuleOptions[0]?.value;

  const handleBatchExport = async (ids: string[]) => {
    if (ids.length === 0) {
      message.warning('请先选择要导出的子工单');
      return;
    }
    setExporting(true);
    try {
      const result = await batchExportDispatchedOrders(ids);
      await downloadDispatchedExport(result, '批量导出子工单.xlsx');
      message.success('导出成功');
    } catch { message.error('导出失败'); }
    finally { setExporting(false); }
  };

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => applyCachedColumnFilters<DispatchedOrderItem>([
    {
      title: '操作', key: 'actions', width: 130, fixed: 'left', hideInSearch: true,
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          <RefButton
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/my-dispatched/${record.id}`)}
          >详情</RefButton>
        </Space>
      ),
    },
    { title: '编号', dataIndex: 'order_no', key: 'order_no', width: 150, copyable: true, ...textHeaderFilter('输入编号') },
    {
      title: '工单类型',
      dataIndex: 'moduleCode',
      key: 'moduleCode',
      width: 160,
      valueType: 'select',
      fieldProps: { options: WORK_TYPE_OPTIONS, placeholder: '下拉选择' },
      ...selectHeaderFilter('选择工单类型', WORK_TYPE_OPTIONS),
      render: (_, r) => (
        <Space size={4} wrap>
          {r.has_unread_dirty && <Badge color="red" />}
          <Tag color="blue">{getModuleLabel(r.module_code, r.order_type)}</Tag>
          {r.has_unread_dirty && <Tag color="red">字段变更</Tag>}
        </Space>
      ),
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customerCode', width: 110, ...textHeaderFilter('输入客户代码') },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customerName', width: 150, ellipsis: true, ...textHeaderFilter('输入客户名称') },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employeeName', width: 100, ...textHeaderFilter('输入员工姓名') },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'idCardNo', width: 170, ellipsis: true, ...textHeaderFilter('输入证件号') },
    {
      title: '手机号',
      key: 'mobile',
      width: 125,
      hideInSearch: true,
      render: (_, record) => String(record.extra_data?.mobile || '-'),
    },
    {
      title: '邮箱',
      key: 'email',
      width: 190,
      ellipsis: true,
      hideInSearch: true,
      render: (_, record) => String(record.extra_data?.email || '-'),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100, valueType: 'select',
      fieldProps: {
        options: isDoneMode
          ? [{ label: '已完成', value: 'completed' }]
          : isReturnedMode
            ? [{ label: '已退回', value: 'returned' }]
            : DISPATCHED_STATUS_OPTIONS,
        placeholder: isDoneMode ? '已完成' : isReturnedMode ? '已退回' : '请选择状态',
      },
      ...selectHeaderFilter('选择状态', isDoneMode
        ? [{ label: '已完成', value: 'completed' }]
        : isReturnedMode
          ? [{ label: '已退回', value: 'returned' }]
          : DISPATCHED_STATUS_OPTIONS),
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    { title: '工单所属月份', dataIndex: 'orderMonth', key: 'orderMonth', valueType: 'dateMonth', hideInTable: true, hideInSearch: true },
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
    { title: '实际操作人/配置负责人', dataIndex: 'handler_name', key: 'handlerName', width: 190, hideInSearch: true, ...textHeaderFilter('输入负责人'),
      render: (_, r) => {
        const text = getOperatorDisplay(r);
        return r.status === 'completed' ? text : <Tag color={text === '负责人未配置' ? 'orange' : 'blue'}>{text}</Tag>;
      },
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '派发时间', dataIndex: 'dispatchedRange', key: 'dispatchedRange', valueType: 'dateTimeRange', hideInTable: true },
    { title: '完成时间', dataIndex: 'completedRange', key: 'completedRange', valueType: 'dateTimeRange', hideInTable: true },

  ], cachedPageState.filters || {}), [navigate, isDoneMode, isInitiatedMode, isReturnedMode, cachedPageState.filters]);

  // 我的退回仅展示退回子工单，避免主工单表 + 子工单表重复筛选/重复数据。
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
      handlerName: readString(params.handlerName, params.handler_name),
      dispatchedFrom: toIso(dispatchedRange[0]),
      dispatchedTo: toIso(dispatchedRange[1]),
      completedFrom: toIso(completedRange[0]),
      completedTo: toIso(completedRange[1]),
      orderMonth: orderMonth || (month ? month.format('YYYY-MM') : undefined),
    });
  };

  const requestDispatchedOrders = async (params: PageParams & Record<string, unknown>, _sort?: Record<string, unknown>, filters?: Record<string, unknown[] | null>) => {
    updateCachedListPageState(pageStateKey, {
      current: Number((params as { current?: number }).current || params.page || cachedPageState.current || 1),
      pageSize: Number(params.pageSize || cachedPageState.pageSize || 20),
      filters: normalizeCachedFilters(filters),
    });
    const mergedParams = mergeProTableFiltersIntoParams(params, filters);
    const query = normalizeQuery({
      ...mergedParams,
      page: (params as { current?: number }).current || params.page || 1,
    });

    const filterVisibleList = (rows: DispatchedOrderItem[]) => rows.filter((row) => {
      if (row.order_type && !isPhase1VisibleOrderType(row.order_type)) return false;
      const phaseVisible = isPhaseOneVisibleModule(row.module_code);
      if (!phaseVisible) return false;
      return true;
    });

    // 已办模式：按工单流转月份（派发/创建月份）统计，不再按完成时间归属月份。
    if (isDoneMode) {
      const doneQuery: Record<string, unknown> = { ...query };
      const result = await getDispatchedOrdersSafe({
        ...doneQuery,
        ...(isBusinessSideUser ? {} : { handlerId: 'current' }),
        status: 'completed',
      });
      const list = filterVisibleList(result.list);
      setVisibleImportModuleCodes([]);
      clearSlaCounts();
      return { data: list, success: true, total: result.total };
    }

    // 我发起的：后端按当前用户创建人 scope 兜底；前端保持逐子工单一行并允许状态筛选。
    if (isInitiatedMode) {
      const result = await getDispatchedOrdersSafe({ ...query, includeReturned: true });
      const list = filterVisibleList(result.list);
      setVisibleImportModuleCodes([]);
      clearSlaCounts();
      return { data: list, success: true, total: result.total };
    }

    // 我的退回：仅展示退回子工单，避免主工单表和子工单表重复展示。
    if (isReturnedMode) {
      const result = await getDispatchedOrdersSafe({ ...query, includeReturned: true, status: 'returned' });
      const list = filterVisibleList(result.list.filter((d) => d.status === 'returned'));
      setVisibleImportModuleCodes([]);
      clearSlaCounts();
      return { data: list, success: true, total: result.total };
    }

    // 普通待办模式：默认显示未接单、已接单和审批中状态；用户选择具体九状态时按单状态筛选。
    if (query.statuses) {
      const selectedStatuses = new Set(String(query.statuses).split(',').map((status) => status.trim()).filter(Boolean));
      const visibleStatuses = selectedStatuses.size > 0 ? selectedStatuses : TODO_VISIBLE_STATUSES;
      const result = await getDispatchedOrdersSafe({ ...query, statuses: String(query.statuses) });
      const list = filterVisibleList(result.list.filter((d) => visibleStatuses.has(d.status)));
      setVisibleImportModuleCodes(Array.from(new Set(list.map((item) => item.module_code).filter(Boolean))));
      updateSlaCounts(list);
      return { data: list, success: true, total: result.total };
    }

    // 其它单值状态保留单值 status 查询，兼容已办/退回等场景。
    if (query.status) {
      const selectedStatus = String(query.status);
      const result = await getDispatchedOrdersSafe({ ...query, status: selectedStatus });
      const list = filterVisibleList(result.list.filter((d) => d.status === selectedStatus || !OPEN_DISPATCHED_STATUS_VALUES.has(selectedStatus)));
      setVisibleImportModuleCodes(Array.from(new Set(list.map((item) => item.module_code).filter(Boolean))));
      updateSlaCounts(list);
      return { data: list, success: true, total: result.total };
    }

    // 没有指定状态时，在后端用同一个查询完成待办状态集合的筛选与分页。
    // 不能分别请求多个状态再在前端拼接，否则每个状态都会各自分页，导致总数、页码和当前页数据不一致。
    const result = await getDispatchedOrdersSafe({ ...query, statuses: TODO_DISPATCHED_STATUS_FILTER_VALUE });
    const list = filterVisibleList(result.list.filter((d) => TODO_VISIBLE_STATUSES.has(d.status)));
    setVisibleImportModuleCodes(Array.from(new Set(list.map((item) => item.module_code).filter(Boolean))));
    updateSlaCounts(list);
    return { data: list, success: true, total: result.total };
  };

  return (
    <PageContainer header={{
      title: headerTitle,
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
              updateCachedListPageState(pageStateKey, { month: value ? toMonthKey(value) : '', current: 1 });
              actionRef.current?.reload();
            }}
          />
        </Space>,
        ...(!isDoneMode && slaWarningCount > 0 ? [<Badge key="sla-warning" count={slaWarningCount}><Tag color="orange" icon={<ClockCircleOutlined />}>即将超时</Tag></Badge>] : []),
        ...(!isDoneMode && slaBreachedCount > 0 ? [<Badge key="sla-breached" count={slaBreachedCount}><Tag color="red" icon={<ClockCircleOutlined />}>已超时</Tag></Badge>] : []),
      ],
    }}>
      <ProTable<DispatchedOrderItem>
        getPopupContainer={() => document.body}
        actionRef={actionRef} columns={columns} rowKey="id"
        request={requestDispatchedOrders}
        search={false} headerTitle={childTableTitle}
        options={false}
        toolBarRender={false}
        pagination={{ defaultCurrent: cachedPageState.current || 1, defaultPageSize: cachedPageState.pageSize || 20, showSizeChanger: true }}
        scroll={{ x: 1500 }}
        dateFormatter="string"
        locale={{ emptyText }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (_keys, rows) => setSelectedRows(rows as DispatchedOrderItem[]),
          preserveSelectedRowKeys: true,
        }}
        tableAlertRender={({ selectedRowKeys }) => <span>已选 {selectedRowKeys.length} 项</span>}
        tableAlertOptionRender={({ onCleanSelected }) => {
          const cleanSelection = () => {
            onCleanSelected?.();
            setSelectedRows([]);
          };
          return (
            <Space wrap>
              <RefButton size="small" onClick={cleanSelection}>取消</RefButton>
              {canBatchOperate && (
                <RefButton size="small" type="primary" loading={batchAcceptLoading} disabled={selectedPendingIds.length === 0}
                  onClick={() => handleBatchAccept(selectedPendingIds, cleanSelection)}>批量接单{selectedPendingIds.length > 0 ? `（${selectedPendingIds.length}）` : ''}</RefButton>
              )}
              {canBatchOperate && (
                <RefButton size="small" icon={<CheckCircleOutlined />} loading={batchApproveModifyLoading}
                  disabled={selectedModifyPendingIds.length === 0}
                  onClick={() => handleBatchApproveModify(selectedModifyPendingIds, cleanSelection)}>
                  批量通过修改{selectedModifyPendingIds.length > 0 ? `（${selectedModifyPendingIds.length}）` : ''}
                </RefButton>
              )}
              {canBatchOperate && (
                <RefButton size="small" icon={<CheckCircleOutlined />} disabled={selectedActiveIds.length === 0}
                  onClick={() => { setBatchCompleteIds(selectedActiveIds); setBatchCleanFn(() => cleanSelection); setBatchCompleteVisible(true); }}>批量完成</RefButton>
              )}
              {canBatchOperate && (
                <RefButton size="small" danger icon={<RollbackOutlined />} disabled={selectedActiveIds.length === 0}
                  onClick={() => { setBatchReturnIds(selectedActiveIds); setBatchCleanFn(() => cleanSelection); setBatchReturnVisible(true); }}>批量退回</RefButton>
              )}
              {canBatchOperate && (
                <RefButton size="small" icon={<BellOutlined />} disabled={selectedActiveIds.length === 0}
                  onClick={() => { setBatchUrgeIds(selectedActiveIds); setBatchCleanFn(() => cleanSelection); setBatchUrgeVisible(true); }}>批量催办</RefButton>
              )}
              <RefButton size="small" icon={<ExportOutlined />} loading={exporting}
                onClick={() => handleBatchExport(selectedIds)}>按固定模板导出</RefButton>
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
          <span>批量完成备注（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchCompleteRemark}
            onChange={(e) => setBatchCompleteRemark(e.target.value)}
            placeholder="请输入批量完成备注"
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
          <span>催办备注：</span>
          <Input.TextArea
            rows={3}
            value={batchUrgeReason}
            onChange={(e) => setBatchUrgeReason(e.target.value)}
            placeholder="请输入催办备注"
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
          <span>批量退回原因（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchReturnReason}
            onChange={(e) => setBatchReturnReason(e.target.value)}
            placeholder="请输入退回原因"
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
              <Tag color="blue">{getModuleLabel(reassignTarget?.module_code, reassignTarget?.order_type)}</Tag>
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
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入转交备注" />
          </Form.Item>
        </Form>
      </Modal>
      <DispatchedBatchImportModal
        open={batchImportMode !== null}
        mode={batchImportMode || 'status'}
        moduleOptions={batchImportModuleOptions}
        defaultModuleCode={defaultBatchImportModule}
        onClose={() => setBatchImportMode(null)}
        onImported={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
};

export default MyDispatched;
