import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Dayjs } from 'dayjs';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Alert, Badge, Button, Checkbox, DatePicker, Form, Input, Modal, Select, Space, Tag, Tooltip } from 'antd';
import { BellOutlined, CheckCircleOutlined, ExportOutlined, EyeOutlined, RollbackOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import {
  batchAcceptDispatchedOrders,
  batchCompleteDispatchedOrders,
  batchCompleteSocialInsurance,
  batchExportDispatchedOrders,
  batchReturnDispatchedOrders,
  batchUrgeDispatchedOrders,
  downloadDispatchedExport,
  getDispatchedOrders,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem, DispatchedOrdersListParams } from '@/services/dispatchedOrders';
import DispatchedBatchImportModal from '@/components/DispatchedBatchImportModal';
import type { DispatchedBatchImportMode } from '@/components/DispatchedBatchImportModal';
import type { PageParams } from '@/services/mock';
import { getModuleLabel, getModuleTitle } from '@/constants/modules';
import { ROLE } from '@/constants/roles';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { BUSINESS_SCOPE, readBusinessScope } from '@/utils/businessScope';
import { useAuth } from '@/hooks/useAuth';
import { useColumnConfig } from '@/components/MultiViewTable/useColumnConfig';
import { normalizePayrollSlipDisplay } from '@/utils/payrollBankCard';
import { DISPATCHED_NINE_STATUS_OPTIONS } from '@/utils/dispatchedStatusFilter';
import {
  getCachedListPageState,
  getCachedStatusFilter,
  getCachedMonthOrNull,
  KEEP_ALIVE_ROUTE_ACTIVATED_EVENT,
  toMonthKey,
  updateCachedListPageState,
  updateCachedStatusFilter,
} from '@/utils/listPageState';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const SOCIAL_REMARK_PLACEHOLDER = '请输入办理备注';
const HANDLING_FEEDBACK_FIELDS = [
  { result: 'social_insurance_result', label: '社保' },
  { result: 'medical_insurance_result', label: '医保' },
  { result: 'housing_fund_result', label: '公积金' },
];
const HANDLING_SHARED_REMARK = 'social_insurance_remark';
const HANDLING_RESULT_OPTIONS = [
  { label: '是', value: '是' },
  { label: '否', value: '否' },
];
const ACTIVE_DISPATCHED_STATUSES = new Set(['pending', 'processing']);
const DEFAULT_STATUS_FILTER_VALUES = ['pending', 'processing', 'modify_pending', 'withdraw_pending', 'void_pending'] as const;
const SELECT_ALL_PAGE_SIZE = 200;
const BATCH_ACCEPT_SIZE = 50;
const BATCH_COMPLETE_SIZE = 50;
const BATCH_RETURN_SIZE = 100;
const BATCH_EXPORT_SIZE = 1000;

export function chunkValues<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error('Chunk size must be greater than zero');
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function mergeSelectedDispatchedRows(
  previousRows: DispatchedOrderItem[],
  selectedRowKeys: React.Key[],
  currentRows: DispatchedOrderItem[],
): DispatchedOrderItem[] {
  const rowsById = new Map<string, DispatchedOrderItem>();
  previousRows.forEach((row) => rowsById.set(row.id, row));
  currentRows.forEach((row) => rowsById.set(row.id, row));
  return selectedRowKeys
    .map((key) => rowsById.get(String(key)))
    .filter((row): row is DispatchedOrderItem => Boolean(row));
}

export async function fetchAllFilteredDispatchedOrders(
  params: DispatchedOrdersListParams,
  fetchPage: typeof getDispatchedOrders = getDispatchedOrders,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ rows: DispatchedOrderItem[]; total: number }> {
  const rowsById = new Map<string, DispatchedOrderItem>();
  let page = 1;
  let total = 0;
  do {
    const result = await fetchPage({ ...params, current: page, pageSize: SELECT_ALL_PAGE_SIZE });
    total = Math.max(0, Number(result.total) || 0);
    result.list.forEach((row) => rowsById.set(row.id, row));
    onProgress?.(rowsById.size, total);
    if (result.list.length === 0 || page >= Math.ceil(total / SELECT_ALL_PAGE_SIZE)) break;
    page += 1;
  } while (true);
  return { rows: Array.from(rowsById.values()), total };
}

export async function runChunkedRequests<T, R>(
  items: T[],
  size: number,
  requestChunk: (chunk: T[]) => Promise<R>,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ results: R[]; failedItems: T[] }> {
  const results: R[] = [];
  const failedItems: T[] = [];
  let processed = 0;
  for (const chunk of chunkValues(items, size)) {
    try {
      results.push(await requestChunk(chunk));
    } catch {
      failedItems.push(...chunk);
    }
    processed += chunk.length;
    onProgress?.(processed, items.length);
  }
  return { results, failedItems };
}

export function buildOnboardingModulePageStateKey(
  moduleCode: string,
  userId: string,
  businessScope: string,
): string {
  return [userId || 'anonymous', businessScope || 'default', moduleCode || 'unknown']
    .map((part) => encodeURIComponent(part))
    .join(':');
}

const DISPATCHED_PROCESSING_FILTER_STATUSES = ['pending', 'processing'] as const;
const PAYROLL_BANK_CARD_FIELDS = ['bank_name', 'bank_account', 'bank_location', 'payroll_location'] as const;

function getMissingPayrollBankCardFields(record: DispatchedOrderItem): string[] {
  return PAYROLL_BANK_CARD_FIELDS.filter((fieldCode) => String(record.extra_data?.[fieldCode] ?? '').trim() === '');
}



export interface OnboardingModulePermissionState {
  isSocialModule: boolean;
  hasBackendActionPermissions: boolean;
  canOperateCurrentModule: boolean;
  canBatchImport: boolean;
  canBatchImportFields: boolean;
  canBatchExport: boolean;
  canBatchAccept: boolean;
  canBatchComplete: boolean;
  canBatchReturn: boolean;
  canBatchUrge: boolean;
  canSelectRows: boolean;
}

export function getOnboardingModuleManageAction(currentModule: string): string {
  if (['contract', 'renewal_contract', 'resignation_cert'].includes(currentModule)) return 'module.contract.manage';
  if (currentModule === 'onboarding_contact') return 'module.onboarding_contact.manage';
  if (currentModule === 'payroll_bank_card') return 'module.payroll_bank_card.manage';
  if (currentModule === 'resignation_contact') return 'module.resignation_contact.manage';
  if (currentModule === 'data_entry') return 'module.data_entry.manage';
  if (currentModule === 'data_entry_resign') return 'module.data_entry_resign.manage';
  if (currentModule === 'social_insurance') return 'module.social_insurance.manage';
  if (['social_insurance_resign', 'resignation_social_insurance'].includes(currentModule)) return 'module.social_insurance_resign.manage';
  return '';
}

export function getOnboardingModulePermissionState({
  currentModule,
  userPermissions = [],
  hasRole,
}: {
  currentModule: string;
  userPermissions?: string[];
  hasRole: (roleCode: string) => boolean;
}): OnboardingModulePermissionState {
  const isSocialModule = ['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(currentModule);
  const isResignationCertificateModule = currentModule === 'resignation_cert';
  const isPayrollBankCardExport = currentModule === 'payroll_bank_card';
  const supportsBatchStatusImport = !isResignationCertificateModule;
  const hasActionPermission = (action: string) => (
    userPermissions.includes('*') || userPermissions.includes('all') || userPermissions.includes(action)
  );
  const hasBackendActionPermissions = userPermissions.some((permission) => (
    permission.startsWith('module.') || permission.startsWith('dispatched_order.') || permission.startsWith('route.')
  ));
  const moduleManageAction = getOnboardingModuleManageAction(currentModule);
  if (isPayrollBankCardExport) {
    const isBusinessRole = hasRole(ROLE.BUSINESS_OWNER)
      || hasRole(ROLE.BUSINESS_GROUP_LEADER)
      || hasRole(ROLE.BUSINESS_GROUP_MEMBER);
    const canOperateCurrentModule = isBusinessRole || (!hasBackendActionPermissions || hasActionPermission(moduleManageAction));
    const canBatchExport = canOperateCurrentModule;
    return {
      isSocialModule: false,
      hasBackendActionPermissions,
      canOperateCurrentModule,
      canBatchImport: false,
      canBatchImportFields: false,
      canBatchExport,
      canBatchAccept: false,
      canBatchComplete: false,
      canBatchReturn: false,
      canBatchUrge: false,
      canSelectRows: canBatchExport,
    };
  }

  const legacyCanOperateCurrentModule = hasRole('admin')
    || (['contract', 'renewal_contract', 'resignation_cert'].includes(currentModule) && (hasRole('labor_contract_member') || hasRole('shared_team_owner')))
    || (['onboarding_contact', 'resignation_contact'].includes(currentModule) && (hasRole('onboarding_resignation_member') || hasRole('shared_team_owner')))
    || (['data_entry', 'data_entry_resign'].includes(currentModule) && hasRole('data_entry_leader'))
    || (['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(currentModule) && hasRole('social_insurance_specialist'));
  const canOperateCurrentModule = hasBackendActionPermissions && moduleManageAction
    ? hasActionPermission(moduleManageAction)
    : legacyCanOperateCurrentModule;
  const canBackendOperate = canOperateCurrentModule;
  const canBatchImport = supportsBatchStatusImport && canBackendOperate && (!hasBackendActionPermissions || hasActionPermission('dispatched_order.batch_import'));
  const canBatchImportFields = canBackendOperate && (!hasBackendActionPermissions || hasActionPermission('dispatched_order.batch_import_fields'));
  const canBatchExport = canBackendOperate && (!hasBackendActionPermissions || hasActionPermission('dispatched_order.batch_export'));
  const canBatchAccept = !isResignationCertificateModule
    && canBackendOperate
    && (!hasBackendActionPermissions || hasActionPermission('dispatched_order.batch_accept'));
  const canBatchComplete = !isResignationCertificateModule && canBackendOperate && (!hasBackendActionPermissions || hasActionPermission(isSocialModule ? 'dispatched_order.batch_feedback' : 'dispatched_order.batch_complete'));
  const canBatchReturn = !isResignationCertificateModule && canBackendOperate;
  const canBatchUrge = hasBackendActionPermissions
    ? hasActionPermission('dispatched_order.batch_urge')
    : hasRole('admin') || hasRole('business_group_member') || hasRole('business_group_leader') || hasRole('business_owner');
  const canSelectRows = canBatchImport || canBatchExport || canBatchAccept || canBatchComplete || canBatchReturn || canBatchUrge;

  return {
    isSocialModule,
    hasBackendActionPermissions,
    canOperateCurrentModule,
    canBatchImport,
    canBatchImportFields,
    canBatchExport,
    canBatchAccept,
    canBatchComplete,
    canBatchReturn,
    canBatchUrge,
    canSelectRows,
  };
}

export const DISPATCHED_STATUS_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  ...DISPATCHED_NINE_STATUS_OPTIONS,
];

type TableFilterValue = Array<string | number | bigint | boolean> | null | undefined;
type TableFilters = Record<string, TableFilterValue>;
type ControlledFilters = Record<string, React.Key[] | null>;

export const getFilterValues = (filters: TableFilters, key: string): string[] => {
  const value = filters[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

export const getFirstFilterValue = (filters: TableFilters, key: string) => getFilterValues(filters, key)[0];

export const serializeFilterValues = (filters: TableFilters, key: string): string | undefined => {
  const values = getFilterValues(filters, key);
  return values.length > 0 ? values.join(',') : undefined;
};

export const normalizeTableFilters = (filters: TableFilters): ControlledFilters => {
  return Object.entries(filters).reduce<ControlledFilters>((acc, [key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      const normalized = value.map((item) => String(item ?? '').trim()).filter(Boolean);
      if (normalized.length > 0) acc[key] = normalized;
    }
    return acc;
  }, {});
};

export const areControlledFiltersEqual = (left: ControlledFilters, right: ControlledFilters): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftValues = left[key] || [];
    const rightValues = right[key] || [];
    if (leftValues.length !== rightValues.length) return false;
    return leftValues.every((value, index) => String(value) === String(rightValues[index]));
  });
};

export const hasTableFilterPayload = (filters: TableFilters): boolean => Object.keys(filters).length > 0;

export const getEffectiveHeaderFilters = (
  filters: TableFilters = {},
  controlledFilters: ControlledFilters = {},
): TableFilters => (hasTableFilterPayload(filters) ? filters : controlledFilters as TableFilters);

export const buildEffectiveHeaderFilterParams = (
  filters: TableFilters = {},
  controlledFilters: ControlledFilters = {},
) => buildHeaderFilterParams(getEffectiveHeaderFilters(filters, controlledFilters));

export const buildHeaderFilterParams = (filters: TableFilters) => {
  const params: Record<string, string | undefined> = {
    orderNo: getFirstFilterValue(filters, 'order_no'),
    customerCode: getFirstFilterValue(filters, 'customer_code'),
    customerName: getFirstFilterValue(filters, 'customer_name'),
    employeeName: getFirstFilterValue(filters, 'employee_name'),
    idCardNo: getFirstFilterValue(filters, 'employee_id_card'),
    createdByName: getFirstFilterValue(filters, 'created_by_name'),
  };
  const statuses = serializeFilterValues(filters, 'status');
  if (statuses) params.statuses = statuses;
  const dataEntryStatuses = serializeFilterValues(filters, 'data_entry_status');
  if (dataEntryStatuses) params.dataEntryStatuses = dataEntryStatuses;
  return params;
};

const textHeaderFilter = (placeholder: string): Pick<ProColumns<DispatchedOrderItem>, 'filterDropdown' | 'filterIcon'> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div role="presentation" style={{ padding: 8, width: 260 }} onKeyDown={(event) => event.stopPropagation()}>
      <Input
        allowClear
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
): Pick<ProColumns<DispatchedOrderItem>, 'filterDropdown' | 'filterIcon' | 'filterMultiple'> => ({
  filterMultiple: true,
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div role="presentation" style={{ padding: 8, width: 220 }} onKeyDown={(event) => event.stopPropagation()}>
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
        <Checkbox.Group
          value={selectedKeys as string[]}
          onChange={(values) => setSelectedKeys(values as React.Key[])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {options.map((item) => (
              <Checkbox key={item.value} value={item.value}>{item.label}</Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </div>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
});

const SOCIAL_FUND_VALUE_ALIASES: Record<string, string[]> = {
  insured_unit: ['contract_subject', 'contractSubject', 'insured_unit', 'insuredUnit', '参保单位'],
  social_pay_region: ['social_location', 'socialLocation', 'social_pay_region', 'socialPayRegion'],
  start_month: ['start_month', 'startMonth', 'social_start_month', 'socialStartMonth'],
  fund_start_month: ['fund_start_month', 'fundStartMonth', 'start_month', 'startMonth'],
  social_stop_month: ['social_stop_month', 'socialStopMonth', 'stop_month', 'stopMonth'],
  fund_stop_month: ['fund_stop_month', 'fundStopMonth', 'social_stop_month', 'socialStopMonth'],
  social_insurance_result: ['social_insurance_result', 'socialInsuranceResult', 'social_security_result'],
  medical_insurance_result: ['medical_insurance_result', 'medicalInsuranceResult'],
  housing_fund_result: ['housing_fund_result', 'housingFundResult'],
  social_insurance_remark: ['social_insurance_remark', 'socialInsuranceRemark', 'social_security_remark'],
};

export const displaySocialFundValue = (record: DispatchedOrderItem, fieldCode: string): string => {
  const extraData = record.extra_data ?? {};
  for (const alias of SOCIAL_FUND_VALUE_ALIASES[fieldCode] ?? [fieldCode]) {
    const value = extraData[alias];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '-';
};

function displayDateOnly(value: unknown): string {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 10) : '-';
}

const OnboardingModule: React.FC = () => {
  const { moduleCode } = useParams<{ moduleCode: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole, user } = useAuth();
  const actionRef = useRef<ActionType>();
  const currentListQueryRef = useRef<DispatchedOrdersListParams>({});
  const didMountFilterReloadRef = useRef(false);
  const skipNextFilterReloadRef = useRef(false);
  const [selectedRows, setSelectedRows] = useState<DispatchedOrderItem[]>([]);
  const [tableFilters, setTableFilters] = useState<ControlledFilters>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchReturnOpen, setBatchReturnOpen] = useState(false);
  const [batchReturnIds, setBatchReturnIds] = useState<string[]>([]);
  const [batchReturnReason, setBatchReturnReason] = useState('');
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);
  const [batchForm] = Form.useForm();
  const [batchImportMode, setBatchImportMode] = useState<DispatchedBatchImportMode | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [batchProgress, setBatchProgress] = useState<{
    action: 'select' | 'accept' | 'complete' | 'return' | 'export';
    label: string;
    processed: number;
    total: number;
  } | null>(null);

  const currentModule = moduleCode || '';
  const accountBusinessScope = user?.business_scope ?? user?.businessScope ?? BUSINESS_SCOPE.BEILUN;
  const canSwitchBusinessScope = hasRole(ROLE.ADMIN)
    || (user?.permissions || []).some((permission) => permission === 'business_scope.switch' || permission === '*' || permission === 'all');
  const activeBusinessScope = canSwitchBusinessScope ? readBusinessScope() : accountBusinessScope;
  const pageStateKey = `onboarding-module:${buildOnboardingModulePageStateKey(currentModule, user?.id || user?.username || 'anonymous', activeBusinessScope)}`;
  const [month, setMonth] = useState<Dayjs | null>(() => getCachedMonthOrNull(pageStateKey));
  const backendModuleCode = currentModule === 'social_insurance_resign' ? 'resignation_social_insurance' : currentModule;
  const moduleLabel = getModuleLabel(currentModule);
  const isResignationCertificateModule = currentModule === 'resignation_cert';
  const isPayrollBankCardExport = currentModule === 'payroll_bank_card';
  const batchExportLabel = isResignationCertificateModule ? '批量导出离职证明' : '按固定模板导出';
  const exportFileBaseName = isPayrollBankCardExport ? '薪酬银行卡导出' : `${moduleLabel}子工单`;


  useEffect(() => {
    setMonth(getCachedMonthOrNull(pageStateKey));
    const cachedStatus = getCachedStatusFilter(pageStateKey);
    const status = isPayrollBankCardExport
      ? undefined
      : cachedStatus === undefined
        ? [...DEFAULT_STATUS_FILTER_VALUES]
        : cachedStatus;
    const restoredFilters: ControlledFilters = status && status.length > 0 ? { status: [...status] } : {};
    if (!areControlledFiltersEqual(tableFilters, restoredFilters)) {
      skipNextFilterReloadRef.current = true;
    }
    setTableFilters((previousFilters) => (
      areControlledFiltersEqual(previousFilters, restoredFilters) ? previousFilters : restoredFilters
    ));
    setSelectedRows((previousRows) => (previousRows.length === 0 ? previousRows : []));
  }, [currentModule, pageStateKey, isPayrollBankCardExport]);

  useEffect(() => {
    const handleKeepAliveRouteActivated = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string; refreshAll?: boolean }>).detail;
      if (!detail?.refreshAll && detail?.pathname !== `/onboarding/${currentModule}`) return;
      actionRef.current?.reload();
    };
    window.addEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, handleKeepAliveRouteActivated);
    return () => window.removeEventListener(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, handleKeepAliveRouteActivated);
  }, [currentModule]);

  useEffect(() => {
    if (!didMountFilterReloadRef.current) {
      didMountFilterReloadRef.current = true;
      return;
    }
    if (skipNextFilterReloadRef.current) {
      skipNextFilterReloadRef.current = false;
      return;
    }
    actionRef.current?.reload();
  }, [tableFilters]);

  const handleTableChange = useCallback((_: unknown, filters: TableFilters) => {
    skipNextFilterReloadRef.current = false;
    const nextFilters = normalizeTableFilters(filters);
    const hasStatusPayload = Object.prototype.hasOwnProperty.call(filters, 'status');
    const nextStatus = hasStatusPayload ? (nextFilters.status ?? null) : tableFilters.status;
    const mergedFilters = hasStatusPayload || tableFilters.status === undefined
      ? nextFilters
      : { ...nextFilters, status: tableFilters.status };
    if (!areControlledFiltersEqual(tableFilters, mergedFilters)) setSelectedRows([]);
    setTableFilters((previousFilters) => (
      areControlledFiltersEqual(previousFilters, mergedFilters) ? previousFilters : mergedFilters
    ));
    if (nextStatus !== undefined) {
      updateCachedStatusFilter(pageStateKey, nextStatus);
    }
  }, [pageStateKey, tableFilters]);

  const {
    isSocialModule,
    canBatchImport,
    canBatchImportFields,
    canBatchExport,
    canBatchAccept,
    canBatchComplete,
    canBatchReturn,
    canBatchUrge,
    canSelectRows,
  } = getOnboardingModulePermissionState({
    currentModule,
    userPermissions: user?.permissions || [],
    hasRole,
  });

  const isRowSelectable = useCallback((record: DispatchedOrderItem) => (
    (canBatchExport && (!isPayrollBankCardExport || getMissingPayrollBankCardFields(record).length === 0))
    || canBatchAccept
    || canBatchComplete
    || (canBatchReturn && ACTIVE_DISPATCHED_STATUSES.has(record.status))
    || (canBatchUrge && ACTIVE_DISPATCHED_STATUSES.has(record.status))
  ), [canBatchAccept, canBatchComplete, canBatchExport, canBatchReturn, canBatchUrge, isPayrollBankCardExport]);

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => {
    const actionColumn: ProColumns<DispatchedOrderItem> = {
      title: '查看',
      key: 'actions',
      width: 88,
      fixed: 'left',
      hideInSearch: true,
      render: (_, record) => (
        <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/my-dispatched/${record.id}`)}>
          查看
        </RefButton>
      ),
    };
    const statusColumn: ProColumns<DispatchedOrderItem> = {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      valueType: 'select',
      filteredValue: tableFilters.status || null,
      fieldProps: { options: DISPATCHED_STATUS_FILTER_OPTIONS },
      ...selectHeaderFilter('选择状态', DISPATCHED_STATUS_FILTER_OPTIONS),
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    };
    const dateRangeColumns: ProColumns<DispatchedOrderItem>[] = [
      {
        title: '派发时间',
        dataIndex: 'dispatchedRange',
        key: 'dispatchedRange',
        valueType: 'dateTimeRange',
        hideInTable: true,
        search: { transform: (value) => ({ dispatchedFrom: value?.[0], dispatchedTo: value?.[1] }) },
      },
      {
        title: '完成时间',
        dataIndex: 'completedRange',
        key: 'completedRange',
        valueType: 'dateTimeRange',
        hideInTable: true,
        search: { transform: (value) => ({ completedFrom: value?.[0], completedTo: value?.[1] }) },
      },
    ];

    if (currentModule === 'payroll_bank_card') {
      const value = (record: DispatchedOrderItem, fieldCode: string) => record.extra_data?.[fieldCode] ?? '-';
      const missingLabels: Record<string, string> = {
        bank_name: '开户银行',
        bank_account: '银行卡号',
        bank_location: '开户地',
        payroll_location: '发薪地',
      };
      return [
        { title: '姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, filteredValue: tableFilters.employee_name || null, ...textHeaderFilter('输入员工姓名') },
        { title: '证件号码', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 190, filteredValue: tableFilters.employee_id_card || null, ...textHeaderFilter('输入证件号码') },
        { title: '是否需要工资单', key: 'need_payroll_slip', width: 130, renderText: (_: unknown, record) => normalizePayrollSlipDisplay(record.extra_data?.need_payroll_slip) },
        { title: '资料状态', key: 'payroll_bank_card_status', width: 180, renderText: (_: unknown, record) => {
          const missing = getMissingPayrollBankCardFields(record);
          return missing.length === 0 ? '完整' : `缺少：${missing.map((field) => missingLabels[field]).join('、')}`;
        } },
        { title: '开户行', key: 'bank_name', width: 180, renderText: (_: unknown, record) => value(record, 'bank_name') },
        { title: '银行账号', key: 'bank_account', width: 210, renderText: (_: unknown, record) => value(record, 'bank_account') },
        { title: '开户地', key: 'bank_location', width: 130, renderText: (_: unknown, record) => value(record, 'bank_location') },
        { title: '商社代码', key: 'branch_code', width: 130, renderText: (_: unknown, record) => value(record, 'branch_code') },
        { title: '发薪地', key: 'payroll_location', width: 160, renderText: (_: unknown, record) => value(record, 'payroll_location') },
      ];
    }

    if (isSocialModule) {
      const increase = currentModule === 'social_insurance';
      const socialMonthCode = increase ? 'start_month' : 'social_stop_month';
      const fundMonthCode = increase ? 'fund_start_month' : 'fund_stop_month';
      return [
        actionColumn,
        statusColumn,
        { title: '参保单位', key: 'insured_unit', width: 220, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'insured_unit') },
        { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, search: { transform: (value) => ({ employeeName: value }) }, filteredValue: tableFilters.employee_name || null, ...textHeaderFilter('输入员工姓名') },
        { title: '证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 190, search: { transform: (value) => ({ idCardNo: value }) }, filteredValue: tableFilters.employee_id_card || null, ...textHeaderFilter('输入证件号') },
        { title: '缴纳地', key: 'social_pay_region', width: 140, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'social_pay_region') },
        { title: increase ? '社保起缴月' : '社保停缴月', key: socialMonthCode, width: 120, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, socialMonthCode) },
        { title: increase ? '公积金起缴月' : '公积金停缴月', key: fundMonthCode, width: 130, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, fundMonthCode) },
        { title: '社保是否办结', key: 'social_insurance_result', width: 120, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'social_insurance_result') },
        { title: '医保是否办结', key: 'medical_insurance_result', width: 120, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'medical_insurance_result') },
        { title: '公积金是否办结', key: 'housing_fund_result', width: 130, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'housing_fund_result') },
        { title: '社保公积金办理备注', key: 'social_insurance_remark', width: 220, hideInSearch: true, renderText: (_: unknown, record: DispatchedOrderItem) => displaySocialFundValue(record, 'social_insurance_remark') },
        { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 160, valueType: 'dateTime', sorter: true, hideInSearch: true },
        { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 160, valueType: 'dateTime', hideInSearch: true },
        ...dateRangeColumns,
      ];
    }

    return [
      actionColumn,
      ...(currentModule === 'contract'
        ? [{
            title: '增员报岗状态',
            dataIndex: 'data_entry_status',
            key: 'data_entry_status',
            width: 130,
            valueType: 'select' as const,
            filteredValue: tableFilters.data_entry_status || null,
            fieldProps: { options: DISPATCHED_STATUS_FILTER_OPTIONS },
            ...selectHeaderFilter('选择增员报岗状态', DISPATCHED_STATUS_FILTER_OPTIONS),
            render: (_: unknown, record: DispatchedOrderItem) => record.data_entry_status
              ? <Tag color={getStatusColor(record.data_entry_status)}>{getStatusText(record.data_entry_status)}</Tag>
              : '-',
          }]
        : []),
      ...(currentModule === 'contract'
        ? [{
            title: '是否电子签',
            key: 'need_esign',
            width: 110,
            hideInSearch: true,
            renderText: (_: unknown, record: DispatchedOrderItem) => record.extra_data?.need_esign ?? '-',
          }, {
            title: '电子签平台',
            key: 'esign_platform',
            width: 110,
            hideInSearch: true,
            renderText: (_: unknown, record: DispatchedOrderItem) => {
              const value = record.extra_data?.esign_platform ?? record.extra_data?.esignPlatform;
              return value !== undefined && value !== null && value !== '' ? String(value) : '-';
            },
          }, {
            title: '缴纳地',
            key: 'social_location',
            width: 130,
            hideInSearch: true,
            renderText: (_: unknown, record: DispatchedOrderItem) => {
              const value = record.extra_data?.social_location ?? record.extra_data?.socialLocation;
              return value !== undefined && value !== null && value !== '' ? String(value) : '未填写';
            },
          }, {
            title: '特殊合同模板名称',
            key: 'special_contract_template_name',
            width: 200,
            hideInSearch: true,
            renderText: (_: unknown, record: DispatchedOrderItem) => record.extra_data?.special_contract_template_name ?? '-',
          }]
        : []),
      {
        title: '子工单号',
        dataIndex: 'order_no',
        key: 'order_no',
        width: 160,
        copyable: true,
        search: { transform: (value) => ({ orderNo: value }) },
        filteredValue: tableFilters.order_no || null,
        ...textHeaderFilter('输入子工单号'),
        render: (_: unknown, record: DispatchedOrderItem) => (
          <Space size={4}>
            {record.has_unread_dirty && (
              <Tooltip title="业务员更新了字段，请打开详情核对">
                <Badge color="red" />
              </Tooltip>
            )}
            <span>{record.order_no}</span>
            {record.has_unread_dirty && <Tag color="red">有字段变更</Tag>}
          </Space>
        ),
      },
      { title: '客户代码', dataIndex: 'customer_code', key: 'customer_code', width: 130, search: { transform: (value) => ({ customerCode: value }) }, filteredValue: tableFilters.customer_code || null, ...textHeaderFilter('输入客户代码') },
      { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 190, search: { transform: (value) => ({ customerName: value }) }, filteredValue: tableFilters.customer_name || null, ...textHeaderFilter('输入客户名称') },
      { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, search: { transform: (value) => ({ employeeName: value }) }, filteredValue: tableFilters.employee_name || null, ...textHeaderFilter('输入员工姓名') },
      { title: '证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 190, search: { transform: (value) => ({ idCardNo: value }) }, filteredValue: tableFilters.employee_id_card || null, ...textHeaderFilter('输入证件号') },
      ...(currentModule === 'resignation_cert'
        ? [{
            title: '最后工作日',
            key: 'last_work_date',
            width: 130,
            hideInSearch: true,
            renderText: (_: unknown, record: DispatchedOrderItem) => displayDateOnly(
              record.extra_data?.last_work_date
                ?? record.extra_data?.lastWorkDate
                ?? record.extra_data?.resignation_date,
            ),
          }]
        : []),
      { title: '发起人', dataIndex: 'created_by_name', key: 'created_by_name', width: 120, hideInSearch: true, filteredValue: tableFilters.created_by_name || null, ...textHeaderFilter('输入发起人'), renderText: (value: string | undefined, record: DispatchedOrderItem) => value || record.created_by || '-' },
      statusColumn,
      { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 160, valueType: 'dateTime', sorter: true, hideInSearch: true },
      { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 160, valueType: 'dateTime', hideInSearch: true },
      ...dateRangeColumns,
    ];
  }, [currentModule, isSocialModule, navigate, tableFilters]);
  const columnConfig = useColumnConfig(`onboarding-module:${currentModule || 'unknown'}`, columns);
  const resolvedColumns = useMemo(() => {
    if (!isSocialModule) return columnConfig.columns;
    const actionColumns = columnConfig.columns.filter((column) => String(column.key ?? column.dataIndex) === 'actions');
    const dataColumns = columnConfig.columns.filter((column) => String(column.key ?? column.dataIndex) !== 'actions');
    return [...actionColumns, ...dataColumns];
  }, [columnConfig.columns, isSocialModule]);

  const requestFn = useCallback(async (params: PageParams, _sort: Record<string, unknown>, filters: TableFilters = {}) => {
    const headerFilters = buildEffectiveHeaderFilterParams(filters, tableFilters);
    const queryParams: DispatchedOrdersListParams = {
      ...params,
      ...headerFilters,
      module_code: backendModuleCode,
      orderMonth: month ? month.format('YYYY-MM') : undefined,
      keyword: appliedSearchKeyword || undefined,
    };
    currentListQueryRef.current = queryParams;
    const result = await getDispatchedOrders(queryParams);
    setFilteredTotal(result.total);
    return { data: result.list, success: true, total: result.total };
  }, [appliedSearchKeyword, backendModuleCode, month, tableFilters]);

  const handleSelectAllFiltered = async () => {
    setBatchProgress({ action: 'select', label: '正在选择', processed: 0, total: filteredTotal });
    try {
      const result = await fetchAllFilteredDispatchedOrders(
        currentListQueryRef.current,
        getDispatchedOrders,
        (processed, total) => setBatchProgress({ action: 'select', label: '正在选择', processed, total }),
      );
      const selectableRows = result.rows.filter(isRowSelectable);
      setSelectedRows((previousRows) => mergeSelectedDispatchedRows(
        previousRows,
        Array.from(new Set([...previousRows.map((row) => row.id), ...selectableRows.map((row) => row.id)])),
        selectableRows,
      ));
      const unavailable = result.total - selectableRows.length;
      if (unavailable > 0) message.warning(`已选择 ${selectableRows.length} 条，${unavailable} 条不符合当前操作条件`);
      else message.success(`已选择当前筛选结果全部 ${selectableRows.length} 条`);
    } catch {
      message.error('选择全部筛选结果失败');
    } finally {
      setBatchProgress(null);
    }
  };

  const handleBatchAccept = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const ids = rows
      .filter((row) => row.module_code === backendModuleCode)
      .map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块子工单');
      return;
    }
    setBatchProgress({ action: 'accept', label: '正在批量接单', processed: 0, total: ids.length });
    try {
      const summary = await runChunkedRequests(
        ids,
        BATCH_ACCEPT_SIZE,
        batchAcceptDispatchedOrders,
        (processed, total) => setBatchProgress({ action: 'accept', label: '正在批量接单', processed, total }),
      );
      const accepted = summary.results.reduce((total, result) => total + result.accepted, 0);
      const skippedIds = summary.results.flatMap((result) => result.skipped ?? []).map((item) => item.id);
      const failedIds = new Set([...summary.failedItems, ...skippedIds]);
      const failed = failedIds.size;
      if (accepted === 0 && failed > 0) message.error(`批量接单未成功，${failed} 条失败或跳过`);
      else if (failed > 0) message.warning(`已接单 ${accepted} 条，${failed} 条失败或跳过`);
      else message.success(`已接单 ${accepted} 条子工单`);
      setSelectedRows(rows.filter((row) => failedIds.has(row.id)));
      actionRef.current?.reload();
    } finally {
      setBatchProgress(null);
    }
  };

  const handleBatchUrge = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const ids = rows
      .filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status))
      .map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块处理中子工单');
      return;
    }
    try {
      const result = await batchUrgeDispatchedOrders(ids, '业务员批量催办：请尽快处理');
      const skipped = result.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`已催办 ${result.urged} 条，${skipped} 条跳过`);
      else message.success(`已催办 ${result.urged} 条子工单`);
      setSelectedRows([]);
      actionRef.current?.reload();
    } catch {
      message.error('批量催办失败');
    }
  };

  const handleBatchReturn = async () => {
    const reason = batchReturnReason.trim();
    if (reason.length < 2) {
      message.warning('批量退回原因至少填写 2 个字符');
      return;
    }
    if (batchReturnIds.length === 0) {
      message.warning('请选择当前模块可退回的子工单');
      return;
    }
    setBatchReturnLoading(true);
    setBatchProgress({ action: 'return', label: '正在批量退回', processed: 0, total: batchReturnIds.length });
    try {
      const summary = await runChunkedRequests(
        batchReturnIds,
        BATCH_RETURN_SIZE,
        (ids) => batchReturnDispatchedOrders(ids, reason),
        (processed, total) => setBatchProgress({ action: 'return', label: '正在批量退回', processed, total }),
      );
      const returned = summary.results.reduce((total, result) => total + result.returned, 0);
      const skippedIds = summary.results.flatMap((result) => result.skipped ?? []).map((item) => item.id);
      const failedIds = new Set([...summary.failedItems, ...skippedIds]);
      const failed = failedIds.size;
      if (returned === 0 && failed > 0) message.error(`批量退回未成功，${failed} 条失败或跳过`);
      else if (failed > 0) message.warning(`已退回 ${returned} 条，${failed} 条失败或跳过`);
      else message.success(`已批量退回 ${returned} 条子工单`);
      setBatchReturnOpen(false);
      setBatchReturnReason('');
      setBatchReturnIds([]);
      setSelectedRows((previousRows) => previousRows.filter((row) => failedIds.has(row.id)));
      actionRef.current?.reload();
    } finally {
      setBatchReturnLoading(false);
      setBatchProgress(null);
    }
  };

  const handleBatchExport = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const exportRows = rows.filter((row) => (
      row.module_code === backendModuleCode
      && (!isPayrollBankCardExport || getMissingPayrollBankCardFields(row).length === 0)
    ));
    if (exportRows.length === 0) {
      if (isPayrollBankCardExport && rows.some((row) => row.module_code === backendModuleCode)) {
        message.warning('银行卡资料不完整，补齐后才能导出');
      } else {
        message.warning('请先选择当前子工单页面中要导出的数据');
      }
      return;
    }
    const ids = exportRows.map((row) => row.id);
    setExporting(true);
    setBatchProgress({ action: 'export', label: '正在生成导出文件', processed: 0, total: ids.length });
    try {
      const summary = await runChunkedRequests(
        ids,
        BATCH_EXPORT_SIZE,
        batchExportDispatchedOrders,
        (processed, total) => setBatchProgress({ action: 'export', label: '正在生成导出文件', processed, total }),
      );
      let downloaded = 0;
      let downloadFailed = 0;
      let skippedPaperContracts = 0;
      for (const result of summary.results) {
        skippedPaperContracts += result.skippedPaperContracts ?? 0;
        const files = result.files && result.files.length > 0 ? result.files : [result];
        for (const file of files) {
          const signPlatform = 'signPlatform' in file ? file.signPlatform : null;
          const fileType = 'fileType' in file ? file.fileType : undefined;
          const platform = signPlatform ? `-${signPlatform}` : '';
          const extension = fileType === 'attachments_zip' || fileType === 'word_zip'
            ? '.zip'
            : fileType === 'word'
              ? '.docx'
              : '.xlsx';
          const fallbackName = isResignationCertificateModule
            ? `离职证明批量导出${extension}`
            : `${exportFileBaseName}${platform}${extension}`;
          try {
            await downloadDispatchedExport(file, fallbackName);
            downloaded += 1;
          } catch {
            downloadFailed += 1;
          }
        }
      }
      const failedRecords = summary.failedItems.length;
      if (downloaded === 0 && (failedRecords > 0 || downloadFailed > 0)) {
        message.error(`导出失败，共 ${failedRecords || ids.length} 条记录未成功生成`);
      } else if (failedRecords > 0 || downloadFailed > 0 || skippedPaperContracts > 0) {
        message.warning(`已下载 ${downloaded} 个文件，${failedRecords} 条记录生成失败，${downloadFailed} 个文件下载失败，跳过 ${skippedPaperContracts} 条纸质合同`);
      } else {
        message.success(downloaded > 1 ? `导出成功，共 ${downloaded} 个文件` : '导出成功');
      }
      const failedIds = new Set(summary.failedItems);
      setSelectedRows(rows.filter((row) => failedIds.has(row.id)));
    } finally {
      setExporting(false);
      setBatchProgress(null);
    }
  };

  const handleBatchOk = async () => {
    const values = await batchForm.validateFields();
    const ids = selectedRows.filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status)).map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块未完成的子工单');
      return;
    }
    setBatchLoading(true);
    setBatchProgress({ action: 'complete', label: isSocialModule ? '正在批量反馈' : '正在批量完成', processed: 0, total: ids.length });
    try {
      let failedIds = new Set<string>();
      if (isSocialModule) {
        const extraData = HANDLING_FEEDBACK_FIELDS.reduce<Record<string, unknown>>((acc, item) => {
          acc[item.result] = values[item.result];
          return acc;
        }, {} as Record<string, unknown>);
        const remark = String(values[HANDLING_SHARED_REMARK] || '').trim();
        if (remark) extraData[HANDLING_SHARED_REMARK] = remark;
        const summary = await runChunkedRequests(
          ids,
          BATCH_COMPLETE_SIZE,
          (chunk) => batchCompleteSocialInsurance(chunk, '', extraData),
          (processed, total) => setBatchProgress({ action: 'complete', label: '正在批量反馈', processed, total }),
        );
        const processed = summary.results.reduce((total, result) => total + (result.processed ?? result.completed), 0);
        const completed = summary.results.reduce((total, result) => total + result.completed, 0);
        const skippedIds = summary.results.flatMap((result) => [...(result.skipped ?? []), ...(result.failed ?? [])]).map((item) => item.id);
        failedIds = new Set([...summary.failedItems, ...skippedIds]);
        if (processed === 0 && failedIds.size > 0) message.error(`批量反馈未成功，${failedIds.size} 条失败或跳过`);
        else if (failedIds.size > 0) message.warning(`已反馈 ${processed} 条，自动完成 ${completed} 条，${failedIds.size} 条失败或跳过`);
        else message.success(`已反馈 ${processed} 条，自动完成 ${completed} 条`);
      } else {
        const remark = String(values.remark || '').trim();
        const summary = await runChunkedRequests(
          ids,
          BATCH_COMPLETE_SIZE,
          (chunk) => batchCompleteDispatchedOrders(chunk, remark),
          (processed, total) => setBatchProgress({ action: 'complete', label: '正在批量完成', processed, total }),
        );
        const completed = summary.results.reduce((total, result) => total + result.completed, 0);
        const skippedIds = summary.results.flatMap((result) => result.skipped ?? []).map((item) => item.id);
        failedIds = new Set([...summary.failedItems, ...skippedIds]);
        if (completed === 0 && failedIds.size > 0) message.error(`批量完成未成功，${failedIds.size} 条失败或跳过`);
        else if (failedIds.size > 0) message.warning(`已完成 ${completed} 条，${failedIds.size} 条失败或跳过，请检查状态和权限`);
        else message.success(`已完成 ${completed} 条子工单`);
      }
      setBatchOpen(false);
      batchForm.resetFields();
      setSelectedRows((previousRows) => previousRows.filter((row) => failedIds.has(row.id)));
      actionRef.current?.reload();
    } finally {
      setBatchLoading(false);
      setBatchProgress(null);
    }
  };

  return (
    <PageContainer header={{
      title: getModuleTitle(currentModule),
      extra: [
        <Space key="month">
          <span>{isPayrollBankCardExport ? '进入清单月份：' : '工单月份：'}</span>
          <DatePicker
            picker="month"
            allowClear
            placeholder="全部月份"
            value={month}
            onChange={(value) => {
              setMonth(value);
              setSelectedRows([]);
              updateCachedListPageState(pageStateKey, { month: value ? toMonthKey(value) : '', current: 1 });
              actionRef.current?.reload();
            }}
          />
        </Space>,
      ],
    }}>
      <ProTable<DispatchedOrderItem>
        key={`${currentModule}-${searchVersion}`}
        getPopupContainer={() => document.body}
        actionRef={actionRef}
        columns={resolvedColumns}
        request={requestFn}
        onChange={handleTableChange}
        rowKey="id"
        search={false}
        headerTitle={isPayrollBankCardExport
          ? '薪酬银行卡记录'
          : currentModule === 'resignation_cert'
            ? '离职证明子工单列表'
            : `${moduleLabel}列表`}
        options={false}
        toolBarRender={() => [
          <Input.Search
            key="keyword"
            allowClear
            value={searchKeyword}
            enterButton={<SearchOutlined />}
            placeholder="搜索工单号、客户、员工或证件号"
            onChange={(event) => setSearchKeyword(event.target.value)}
            onSearch={(value) => {
              setAppliedSearchKeyword(value.trim());
              setSelectedRows([]);
              setSearchVersion((current) => current + 1);
            }}
            style={{ width: 280 }}
          />,
          <span key="columns">{columnConfig.button}</span>,
          canBatchImport && <Button key="import-status" icon={<UploadOutlined />} onClick={() => setBatchImportMode('status')}>
            导入办理结果
          </Button>,
          ...(canBatchImportFields && currentModule === 'onboarding_contact' ? [
            <Button key="import-fields" icon={<UploadOutlined />} onClick={() => setBatchImportMode('fields')}>
              导入银行卡修改
            </Button>,
          ] : []),
          canBatchExport && <Button key="export" icon={<ExportOutlined />} loading={exporting} disabled={selectedRows.length === 0} onClick={() => handleBatchExport()}>
            {batchExportLabel}
          </Button>,
          canBatchAccept && <Button
            key="batch-accept"
            icon={<CheckCircleOutlined />}
            loading={batchProgress?.action === 'accept'}
            disabled={selectedRows.filter((row) => row.module_code === backendModuleCode).length === 0}
            onClick={() => handleBatchAccept()}
          >
            批量接单
          </Button>,
          canBatchReturn && <Button
            key="batch-return"
            danger
            icon={<RollbackOutlined />}
            disabled={selectedRows.filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status)).length === 0}
            onClick={() => {
              setBatchReturnIds(selectedRows
                .filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status))
                .map((row) => row.id));
              setBatchReturnReason('');
              setBatchReturnOpen(true);
            }}
          >
            批量退回
          </Button>,
          canBatchComplete && <Button
            key="batch"
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedRows.filter((row) => ACTIVE_DISPATCHED_STATUSES.has(row.status)).length === 0}
            onClick={() => { batchForm.resetFields(); setBatchOpen(true); }}
          >
            {isSocialModule ? '批量反馈办理结果' : '批量完成'}
          </Button>,
        ].filter(Boolean) as React.ReactNode[]}
        rowSelection={canSelectRows ? {
          selectedRowKeys: selectedRows.map((row) => row.id),
          onChange: (keys, rows) => setSelectedRows((previousRows) => mergeSelectedDispatchedRows(previousRows, keys, rows)),
          preserveSelectedRowKeys: true,
          getCheckboxProps: (record) => ({ disabled: !isRowSelectable(record) }),
        } : undefined}
        tableAlertRender={canSelectRows ? ({ selectedRows: alertSelectedRows, onCleanSelected }) => {
          const selected = selectedRows.length > 0 ? selectedRows : alertSelectedRows as DispatchedOrderItem[];
          const activeRows = selected.filter((row) => ACTIVE_DISPATCHED_STATUSES.has(row.status));
          const acceptable = canBatchAccept ? selected.filter((row) => row.module_code === backendModuleCode) : [];
          const completable = canBatchComplete ? activeRows : [];
          const returnable = canBatchReturn ? activeRows.filter((row) => row.module_code === backendModuleCode) : [];
          const urgeable = canBatchUrge ? activeRows : [];
          return (
            <Space wrap>
              <span>已选 {selected.length} 项</span>
              {filteredTotal > selected.length && (
                <Button
                  size="small"
                  loading={batchProgress?.action === 'select'}
                  disabled={Boolean(batchProgress && batchProgress.action !== 'select')}
                  onClick={handleSelectAllFiltered}
                >
                  选择当前筛选结果全部 {filteredTotal} 条
                </Button>
              )}
              {batchProgress && <span>{batchProgress.label} {batchProgress.processed}/{batchProgress.total}</span>}
              <Button size="small" onClick={() => { onCleanSelected(); setSelectedRows([]); }}>取消</Button>
              {canBatchExport && (
                <Button size="small" icon={<ExportOutlined />} loading={exporting} disabled={selected.length === 0} onClick={() => handleBatchExport(selected)}>
                  {batchExportLabel}{selected.length > 0 ? `（${selected.length}）` : ''}
                </Button>
              )}
              {canBatchAccept && (
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  loading={batchProgress?.action === 'accept'}
                  disabled={acceptable.length === 0}
                  onClick={() => {
                    setSelectedRows(acceptable);
                    handleBatchAccept(acceptable);
                  }}
                >
                  批量接单{acceptable.length > 0 ? `（${acceptable.length}）` : ''}
                </Button>
              )}
              {canBatchReturn && (
                <Button
                  size="small"
                  danger
                  icon={<RollbackOutlined />}
                  disabled={returnable.length === 0}
                  onClick={() => {
                    setBatchReturnIds(returnable.map((row) => row.id));
                    setBatchReturnReason('');
                    setBatchReturnOpen(true);
                  }}
                >
                  批量退回{returnable.length > 0 ? `（${returnable.length}）` : ''}
                </Button>
              )}
              {canBatchComplete && (
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={completable.length === 0}
                  onClick={() => {
                    setSelectedRows(completable);
                    batchForm.resetFields();
                    setBatchOpen(true);
                  }}
                >
                  {isSocialModule ? '批量反馈办理结果' : '批量完成'}{completable.length > 0 ? `（${completable.length}）` : ''}
                </Button>
              )}
              {canBatchUrge && (
                <Button
                  size="small"
                  icon={<BellOutlined />}
                  disabled={urgeable.length === 0}
                  onClick={() => {
                    setSelectedRows(urgeable);
                    handleBatchUrge(urgeable);
                  }}
                >
                  批量催办{urgeable.length > 0 ? `（${urgeable.length}）` : ''}
                </Button>
              )}
            </Space>
          );
        } : false}
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['20', '50', '100', '200'], showSizeChanger: true }}
        scroll={{ x: 1280 }}
        dateFormatter="string"
      />
      {columnConfig.drawer}

      <Modal
        title={`批量退回${moduleLabel}子工单`}
        open={batchReturnOpen}
        confirmLoading={batchReturnLoading}
        onOk={handleBatchReturn}
        onCancel={() => {
          setBatchReturnOpen(false);
          setBatchReturnReason('');
          setBatchReturnIds([]);
        }}
        okButtonProps={{ danger: true }}
        okText="确认退回"
        width={520}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>批量退回原因（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchReturnReason}
            onChange={(event) => setBatchReturnReason(event.target.value)}
            placeholder="请输入退回原因"
            minLength={2}
            maxLength={512}
            showCount
          />
        </Space>
      </Modal>

      <Modal
        title={isSocialModule ? `批量反馈${moduleLabel}办理结果` : `批量完成${moduleLabel}子工单`}
        open={batchOpen}
        onOk={handleBatchOk}
        onCancel={() => setBatchOpen(false)}
        confirmLoading={batchLoading}
        okText={isSocialModule ? '确认反馈' : '确认完成'}
        destroyOnHidden
      >

        <Form form={batchForm} layout="vertical">
          {isSocialModule ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="请选择本次批量反馈的三项办理结果"
                description="三项均为&quot;是&quot;时子工单自动完成；任一项为&quot;否&quot;时保持处理中，备注可不填。"
              />
              {HANDLING_FEEDBACK_FIELDS.map((item) => (
                <Form.Item
                  key={item.result}
                  name={item.result}
                  label={`${item.label}是否办结`}
                  rules={[{ required: true, message: `请选择${item.label}是否办结` }]}
                  style={{ marginBottom: 8 }}
                >
                  <Select options={HANDLING_RESULT_OPTIONS} />
                </Form.Item>
              ))}
              <Form.Item name={HANDLING_SHARED_REMARK} label="社保公积金办理备注（选填）" style={{ marginTop: 8 }}>
                <Input.TextArea rows={2} maxLength={500} showCount placeholder="可填写未完成原因或补充说明" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="remark"
              label="办理备注"
              rules={[
                { required: true, message: '请填写办理备注' },
                { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('办理备注不能只填空格')) },
              ]}
            >
              <Input.TextArea rows={4} maxLength={500} showCount placeholder={SOCIAL_REMARK_PLACEHOLDER} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <DispatchedBatchImportModal
        open={batchImportMode !== null}
        mode={batchImportMode || 'status'}
        moduleOptions={[{ label: moduleLabel, value: currentModule }]}
        defaultModuleCode={currentModule}
        hideModuleSelect
        onClose={() => setBatchImportMode(null)}
        onImported={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
};

export default OnboardingModule;
