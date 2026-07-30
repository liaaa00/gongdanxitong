import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Descriptions, Tag, Button, Space, App, Modal, Input, Select,
  Empty, Alert, Form, Checkbox, Timeline, Badge, Tooltip, Collapse,
} from 'antd';
import {
  CheckCircleOutlined, RollbackOutlined, PlusCircleOutlined,
  HistoryOutlined,
  WarningOutlined, EyeOutlined, EditOutlined, BellOutlined, StopOutlined,
} from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import MaterialsUpload from '@/components/MaterialsUpload';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { useDispatchedActions } from '@/hooks/useDispatchedActions';
import {
  getDispatchedOrder,
  getDispatchedOrderTimeline,
  confirmDispatchedDirtyRead,
  returnCompletedDispatchedOrder,
} from '@/services/dispatchedOrders';
import type { DirtyFieldMark, DispatchedOrderItem, DispatchedOrderTimelineItem } from '@/services/dispatchedOrders';
import { getFallbackFields, getFields } from '@/services/fields';
import { getSupplementLogs } from '@/services/supplementLogs';
import type { SupplementLogItem } from '@/services/supplementLogs';
import { getActiveDetailViewTemplate } from '@/services/detailViewTemplates';
import { getExportTemplates } from '@/services/exportTemplates';
import { getModuleColor, getModuleLabel, isSocialInsuranceModule } from '@/constants/modules';
import { canAccessPath } from '@/config/routeVisibility';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useAuth } from '@/hooks/useAuth';
import { getUsersByTeam } from '@/services/users';
import type { UserItem } from '@/services/users';

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

const FIELD_GROUPS: Array<{ title: string; codes: string[] }> = [
  {
    title: '基础信息',
    codes: ['customer_name', 'customer_code', 'outsource_type', 'position', 'employee_name', 'id_card_no', 'gender', 'birth_date', 'age', 'household_type', 'ethnicity', 'mobile', 'email', 'current_address', 'household_address', 'postal_code', 'business_mode', 'employee_type'],
  },
  {
    title: '合同信息',
    codes: ['contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date', 'probation_start_date', 'probation_months', 'probation_end_date', 'work_city', 'work_hour_system', 'work_cycle', 'need_company_contract', 'contract_subject', 'contract_template', 'need_contract_urge', 'contract_feedback'],
  },
  {
    title: '薪资与发薪',
    codes: ['salary_form', 'base_salary', 'other_salary', 'probation_salary', 'payroll_cycle', 'payroll_date', 'need_company_payroll', 'payroll_location', 'pay_location'],
  },
  {
    title: '社保公积金',
    codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_insurance_feedback', ...HANDLING_FEEDBACK_FIELDS.map((item) => item.result), HANDLING_SHARED_REMARK],
  },
  {
    title: '银行与备注',
    codes: ['bank_name', 'bank_account', 'remark', 'special_remark'],
  },
  {
    title: '离职信息',
    codes: ['resignation_type', 'resignation_reason', 'last_work_date', 'contract_terminate_date', 'handover_person', 'need_resignation_cert', 'cert_delivery_address'],
  },
  {
    title: '后道反馈',
    codes: ['need_onboarding_contact', 'onboarding_feedback', 'data_entry_feedback', 'resignation_contact_feedback', 'resignation_cert_status', 'social_handover_done', 'final_salary_settled', 'resignation_remark'],
  },
];

const FEEDBACK_FIELD_MAP: Record<string, string> = {
  contract: 'contract_feedback', onboarding_contact: 'onboarding_feedback',
  data_entry: 'data_entry_feedback', social_insurance: 'social_insurance_feedback',
  renewal_contract: 'renewal_feedback', resignation_contact: 'resignation_contact_feedback',
  resignation_cert: 'resignation_cert_status', benefit_apply: 'benefit_result',
};

const SUPPLEMENT_ALLOWED_MODULE_CODE = 'onboarding_contact';
const SUPPLEMENT_ALLOWED_USERNAMES = new Set(['maoyani', 'jianglu']);
const SUPPLEMENT_ALLOWED_REAL_NAMES = new Set(['毛雅妮', '江璐']);

const normalizeUsername = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeRealName = (value: unknown) => String(value || '').trim();
const isAllowedSupplementOperator = (currentUser?: { username?: string; real_name?: string; realName?: string } | null) => {
  const username = normalizeUsername(currentUser?.username);
  const realName = normalizeRealName(currentUser?.real_name ?? currentUser?.realName);
  return SUPPLEMENT_ALLOWED_USERNAMES.has(username) || SUPPLEMENT_ALLOWED_REAL_NAMES.has(realName);
};

const hasText = (value: unknown) => String(value || '').trim().length > 0;

const getTeamCode = (order?: DispatchedOrderItem | null) => order?.team_code || order?.module_code || 'shared_team';

// 部分子工单 module_code 存在别名（如 resignation_social_insurance 与 social_insurance_resign
// 同义），但 routeVisibility 只为其中一个登记了合法列表路由。返回列表前必须把别名归一到有
// 权限条目的规范 code，并校验当前角色确实可访问，否则回退安全列表，避免落到无权限页(403)。
const DISPATCHED_MODULE_ROUTE_ALIASES: Record<string, string> = {
  resignation_social_insurance: 'social_insurance_resign',
};

function getDispatchedListPath(
  order: DispatchedOrderItem | null | undefined,
  userRoles?: { code?: string }[],
  permissions?: string[],
) {
  const rawCode = String(order?.module_code || '');
  const canonicalCode = DISPATCHED_MODULE_ROUTE_ALIASES[rawCode] || rawCode;
  const candidate = canonicalCode ? `/onboarding/${canonicalCode}` : '';
  if (candidate && canAccessPath(candidate, userRoles, permissions)) return candidate;
  if (canAccessPath('/my-dispatched', userRoles, permissions)) return '/my-dispatched';
  return '/dashboard';
}

function getOperatorDisplay(order: DispatchedOrderItem) {
  const configured = order.configured_handler_names || order.configuredHandlerNames || [];
  if (order.handler_name) return order.handler_name;
  if (configured.length > 0) return configured.join('、');
  return '负责人未配置';
}

const withRequiredLabel = (field: FieldConfig): FieldConfig => field;
const GROUPED_FIELD_CODES = new Set(FIELD_GROUPS.flatMap((group) => group.codes));

const CONTRACT_EXPORT_TEMPLATE_PLATFORMS = new Set(['速创', 'E签宝']);
const CONTRACT_DETAIL_REQUIRED_FIELD_CODES = ['gender', 'birth_date', 'age', 'probation_end_date', 'contract_template', 'contract_subject'];

const mergeFieldCodes = (...groups: Array<string[] | undefined>) => Array.from(new Set(groups.flatMap((group) => group || []).filter(Boolean)));

type ContractTemplateDetailField = FieldConfig & { template_const_value?: unknown };

const readTemplateText = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).find(Boolean);
  const text = String(value ?? '').trim();
  return text || undefined;
};

const getTemplateFieldCode = (field: any): string | undefined => readTemplateText(field?.fieldCode ?? field?.field_code ?? field?.code ?? field?.sameAs);

const getTemplateFieldTitle = (field: any, code: string, index: number): string => (
  readTemplateText(field?.alias)
  ?? readTemplateText(field?.title)
  ?? readTemplateText(field?.header)
  ?? code
  ?? `模板字段${index + 1}`
);

const buildContractTemplateFields = (templates: Array<{ field_list?: unknown; fieldList?: unknown }>, systemFields: FieldConfig[]): ContractTemplateDetailField[] => {
  const systemFieldMap = new Map(systemFields.map((field) => [field.field_code, field]));
  const usedKeys = new Set<string>();
  const result: ContractTemplateDetailField[] = [];

  templates.forEach((template) => {
    const list = (template as any)?.fieldList ?? (template as any)?.field_list ?? [];
    if (!Array.isArray(list)) return;
    list.forEach((rawField: any, index: number) => {
      const code = getTemplateFieldCode(rawField) || `__contract_template_column_${result.length + 1}`;
      const title = getTemplateFieldTitle(rawField, code, index);
      const key = getTemplateFieldCode(rawField) ? code : `${code}:${title}`;
      if (usedKeys.has(key)) return;
      usedKeys.add(key);

      const systemField = systemFieldMap.get(code);
      result.push({
        ...(systemField || {
          field_code: code,
          field_name: title,
          field_type: 'text',
          is_required: false,
          default_required: false,
          display_order: result.length + 1,
          is_active: true,
          collection_group: '导出模板字段',
        }),
        field_name: systemField?.field_name || title,
        display_order: result.length + 1,
        template_const_value: Object.prototype.hasOwnProperty.call(rawField || {}, 'const') ? rawField.const : undefined,
      });
    });
  });

  CONTRACT_DETAIL_REQUIRED_FIELD_CODES.forEach((code) => {
    if (usedKeys.has(code)) return;
    const systemField = systemFieldMap.get(code);
    if (!systemField) return;
    usedKeys.add(code);
    result.push({
      ...systemField,
      display_order: result.length + 1,
    });
  });

  return result;
};

const filterByVisibleFields = (allFields: FieldConfig[], visibleFields?: string[]) => {
  const visibleSet = new Set((visibleFields || []).filter(Boolean));
  if (visibleSet.size === 0) return allFields;
  return allFields.filter((field) => visibleSet.has(field.field_code));
};

const MyDispatchedDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const autoActionHandledRef = useRef<string>('');
  const { message, modal } = App.useApp();
  const { hasRole, user } = useAuth();
  const scenario = 'dispatched:' + (id || '');
  const { permissions } = useFieldPermissions(scenario);

  const [order, setOrder] = useState<DispatchedOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [detailTemplateApplied, setDetailTemplateApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supplementLogs, setSupplementLogs] = useState<SupplementLogItem[]>([]);
  const [dirtyCleared, setDirtyCleared] = useState(false);
  const [confirmReadLoading, setConfirmReadLoading] = useState(false);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnForm] = Form.useForm();

  const [returnCompletedOpen, setReturnCompletedOpen] = useState(false);
  const [returnCompletedForm] = Form.useForm();
  const [returnCompletedLoading, setReturnCompletedLoading] = useState(false);

  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeForm] = Form.useForm();

  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [supplementForm] = Form.useForm();


  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignForm] = Form.useForm<{ handlerId: string; reason: string }>();
  const [teamUsers, setTeamUsers] = useState<UserItem[]>([]);
  const [teamUsersLoading, setTeamUsersLoading] = useState(false);

  const [creatorEditOpen, setCreatorEditOpen] = useState(false);
  const [creatorEditForm] = Form.useForm<Record<string, unknown>>();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm] = Form.useForm<{ reason: string }>();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidForm] = Form.useForm<{ reason: string }>();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalType, setApprovalType] = useState<'modify' | 'withdraw' | 'void'>('withdraw');
  const [approvalApproved, setApprovalApproved] = useState(true);
  const [approvalForm] = Form.useForm<{ comment: string }>();
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitForm] = Form.useForm<{ reason?: string }>();
  const [timelineItems, setTimelineItems] = useState<DispatchedOrderTimelineItem[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [timelineError, setTimelineError] = useState(false);

  const effectiveOrderId = order?.id || id || '';

  const { actionLoading, handleAccept, handleComplete, handleReturn,
    handleSupplement, handleReassign,
    handleCreatorUpdate, handleUrge, handleResubmit, handleWithdraw, handleVoid,
    handleApproveModify, handleApproveWithdraw, handleApproveVoid }
    = useDispatchedActions({ orderId: effectiveOrderId, order, onOrderUpdated: setOrder });

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [orderData, logs] = await Promise.all([getDispatchedOrder(id), getSupplementLogs(id)]);
      const orderType = orderData.order_type || 'onboarding';
      const moduleCode = orderData.module_code;

      // 加载字段配置
      const fallbackFields = getFallbackFields(orderType);
      let backendFields: FieldConfig[] = [];
      try {
        backendFields = await getFields(orderType);
      } catch {
        backendFields = [];
      }
      const fieldList = backendFields.length > 0 ? backendFields : fallbackFields;

      // 加载详情页模板（普通子工单有配置则用配置的字段列表）。劳动合同新签特殊：动态读取速创/E签宝两套导出模板字段合集。
      let visibleFieldCodes: string[] | undefined;
      let contractTemplateFields: ContractTemplateDetailField[] | undefined;
      if (moduleCode === 'contract') {
        const templates = await getExportTemplates('contract');
        const contractTemplates = templates.filter((template) => CONTRACT_EXPORT_TEMPLATE_PLATFORMS.has(String(template.sign_platform || '').trim()));
        const fieldsFromTemplates = buildContractTemplateFields(contractTemplates, fieldList as FieldConfig[]);
        contractTemplateFields = fieldsFromTemplates.length > 0 ? fieldsFromTemplates : undefined;
      } else if (moduleCode) {
        try {
          const template = await getActiveDetailViewTemplate(moduleCode);
          // template 已经是解包后的数据（通过 request 拦截器处理）
          if (template && typeof template === 'object') {
            const list = (template as any).fieldList ?? (template as any).field_list ?? [];
            visibleFieldCodes = list
              .map((f: any) => f.fieldCode ?? f.field_code)
              .filter(Boolean) as string[];
          }
        } catch {
          // 无配置或加载失败，回退到默认字段范围。
        }
      }

      setOrder(orderData);
      setSupplementLogs(logs);
      setDirtyCleared(false);

      // 如果有模板配置，按模板字段顺序过滤；劳动合同新签严格按速创/E签宝导出模板字段显示（含自定义列）。
      if (contractTemplateFields && contractTemplateFields.length > 0) {
        setFields(contractTemplateFields);
        setDetailTemplateApplied(true);
      } else if (visibleFieldCodes && visibleFieldCodes.length > 0) {
        const fieldMap = new Map(fieldList.map(f => [f.field_code, f]));
        const orderedFields: FieldConfig[] = [];
        visibleFieldCodes.forEach(code => {
          const field = fieldMap.get(code);
          if (field) orderedFields.push(field);
        });
        setFields(orderedFields);
        setDetailTemplateApplied(orderedFields.length > 0);
      } else {
        setFields(fieldList);
        setDetailTemplateApplied(false);
      }
    } catch {
      message.error('加载子工单详情失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const dirtyFields = useMemo(() => order?.dirty_fields?.filter((mark) => mark.is_active !== false) || [], [order?.dirty_fields]);
  const dirtyFieldCodes = useMemo(() => new Set(dirtyFields.map((mark) => mark.field_code)), [dirtyFields]);
  const dirtyCount = order?.dirty_count ?? dirtyFields.length;
  const hasUnreadDirty = Boolean(order?.has_unread_dirty || dirtyFields.length > 0) && !dirtyCleared;

  const markDirtyRead = useCallback(async (reason: 'owner_open_detail' | 'confirm_read') => {
    if (!id || (!order?.has_unread_dirty && !dirtyFields.length)) return;
    setConfirmReadLoading(true);
    try {
      const result = await confirmDispatchedDirtyRead(id, reason);
      setDirtyCleared(true);
      setOrder((prev) => prev ? { ...prev, has_unread_dirty: false, dirty_count: 0, dirty_fields: [] } : prev);
      if (result.success) message.success('已标记为已阅');
      else message.info('已在当前页面标记为已阅，后端清除接口待联调');
    } catch {
      message.warning('确认已阅失败，请稍后重试');
    } finally {
      setConfirmReadLoading(false);
    }
  }, [dirtyFields.length, id, message, order?.has_unread_dirty]);

  // 保留字段变更高亮，避免打开详情后自动清除；由用户点击“确认已阅”后再清理。

  const visibleFields = useMemo(
    () => detailTemplateApplied ? [] : (order?.visible_fields || []),
    [detailTemplateApplied, order?.visible_fields],
  );
  const visibleDetailFields = useMemo(() => filterByVisibleFields(fields, visibleFields), [fields, visibleFields]);
  const ungroupedVisibleDetailFields = useMemo(
    () => visibleDetailFields.filter((field) => !GROUPED_FIELD_CODES.has(field.field_code)),
    [visibleDetailFields],
  );
  const dynamicVisibleFields = useMemo(() => visibleDetailFields.map(withRequiredLabel), [visibleDetailFields]);
  const visibleFieldPermissions = useMemo(() => {
    if (!visibleFields.length) return permissions;
    const allowed = new Set(visibleFields);
    return Object.fromEntries(fields.map((field) => [
      field.field_code,
      allowed.has(field.field_code) ? (permissions[field.field_code] || 'visible') : 'hidden',
    ])) as Record<string, 'visible' | 'hidden' | 'readonly' | 'masked'>;
  }, [fields, permissions, visibleFields]);

  const supplementableFields = useMemo(() => {
    if (!order?.supplementable_fields || !fields) return [];
    const visibleSet = new Set(visibleFields);
    return fields.filter((f) => order.supplementable_fields?.includes(f.field_code) && (visibleSet.size === 0 || visibleSet.has(f.field_code)));
  }, [order, fields, visibleFields]);

  const emptySupplementFields = useMemo(() =>
    supplementableFields.filter((f) =>
      !order?.extra_data?.[f.field_code] || order.extra_data[f.field_code] === ''
    ),
    [supplementableFields, order],
  );

  const orderWithParent = (order || {}) as unknown as { parentOrder?: { createdBy?: string; created_by?: string }; parent_order?: { created_by?: string; createdBy?: string } };
  const parentCreatedBy = String(
    orderWithParent.parentOrder?.createdBy
    ?? orderWithParent.parentOrder?.created_by
    ?? orderWithParent.parent_order?.created_by
    ?? orderWithParent.parent_order?.createdBy
    ?? order?.created_by
    ?? order?.createdBy
    ?? '',
  );
  const searchParams = new URLSearchParams(location.search);
  const readonlyFrom = searchParams.get('from');
  // 我的待办/我的已办/我的退回/我发起的/历史工单/团队工单入口都允许直接操作。
  // 仅保留显式 readonly=1 的兼容只读模式，避免旧链接或特殊审计入口误开放。
  const isReadOnlyView = searchParams.get('readonly') === '1';
  const isTeamReadOnlyView = isReadOnlyView && readonlyFrom === 'team';
  const isMyWorkReadOnlyView = isReadOnlyView && readonlyFrom === 'my-work';
  const isAdminUser = hasRole('admin');
  const canBackendOperateByRole = isAdminUser || hasRole('data_entry_leader') || hasRole('shared_team_owner')
    || hasRole('labor_contract_member') || hasRole('onboarding_resignation_member') || hasRole('social_insurance_specialist');
  const canBackendOperate = canBackendOperateByRole && !isReadOnlyView;
  const isOrderCreator = Boolean(user?.id && parentCreatedBy === user.id);
  const isCreator = isAdminUser || isOrderCreator;
  const isVoided = Boolean(order?.void_at || order?.voidAt || order?.status === 'void');
  const isResubmittableStatus = Boolean(order && (['returned', 'withdrawn', 'void'].includes(order.status) || isVoided));
  const isSocialInsuranceOrder = isSocialInsuranceModule(order?.module_code);
  const isAcceptedByBackend = Boolean(order?.accepted_at) || order?.status === 'accepted' || order?.status === 'processing';
  const canAccept = canBackendOperate && !isVoided && order?.status === 'pending';
  const canComplete = canBackendOperate && !isVoided && order?.status === 'processing';
  const canReturn = canBackendOperate && !isVoided && (order?.status === 'processing' || order?.status === 'pending');
  const canSupplementOperator = isAllowedSupplementOperator(user);
  const canSupplementModule = order?.module_code === SUPPLEMENT_ALLOWED_MODULE_CODE;
  const canSupplement = canBackendOperate && canSupplementOperator && canSupplementModule && !isVoided && order?.status === 'processing' && supplementableFields.length > 0;
  const isRepairableStatus = isResubmittableStatus;
  const isApprovalStatus = Boolean(order && ['modify_pending', 'withdraw_pending', 'void_pending'].includes(order.status));
  const isTerminalStatus = Boolean(order && ['completed', 'modify_pending', 'withdraw_pending', 'void_pending', 'void'].includes(order.status));
  const isTerminal = isVoided || (isTerminalStatus && !isRepairableStatus);
  const canCreatorOperate = Boolean(order && isCreator && !isReadOnlyView && (!isTerminalStatus || isRepairableStatus));
  const canCreatorUpdate = canCreatorOperate && !isApprovalStatus && !isVoided && order?.status !== 'completed';
  const canCreatorResubmit = canCreatorOperate && isResubmittableStatus;
  const canCreatorUrge = canCreatorOperate && !isResubmittableStatus && !isApprovalStatus;
  const canShowCreatorWithdraw = canCreatorOperate && !isApprovalStatus && !isResubmittableStatus && !isVoided && order?.status !== 'completed';
  const canShowCreatorVoid = canCreatorOperate && !isApprovalStatus && !isVoided && order?.status !== 'completed';
  const canCreatorWithdraw = canShowCreatorWithdraw;
  const canCreatorVoid = canShowCreatorVoid;
  const canApproveModify = canBackendOperate && order?.status === 'modify_pending' && (isAdminUser || !isOrderCreator);
  const canApproveWithdraw = canBackendOperate && order?.status === 'withdraw_pending' && (isAdminUser || !isOrderCreator);
  const canApproveVoid = canBackendOperate && order?.status === 'void_pending' && (isAdminUser || !isOrderCreator);
  const canReturnCompleted = canBackendOperate && !isVoided && order?.status === 'completed' && (
    order?.action_permissions?.return_completed === true ||
    order?.is_module_supervisor === true ||
    hasRole('admin')
  );
  const readOnlyBackPath = isTeamReadOnlyView ? '/my-work/team' : order?.status === 'completed' ? '/my-work/done' : '/my-work/pending';

  const fillCreatorEditForm = () => {
    if (!order) return;
    creatorEditForm.setFieldsValue(Object.fromEntries(visibleDetailFields.map((field) => [
      field.field_code,
      String((order.extra_data as Record<string, unknown> | undefined)?.[field.field_code] ?? ''),
    ])));
  };

  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    const actionKey = `${order?.id || ''}:${location.search}`;
    if (action !== 'edit' || !order || loading || autoActionHandledRef.current === actionKey) return;
    if (!canCreatorUpdate || visibleDetailFields.length === 0) return;
    autoActionHandledRef.current = actionKey;
    fillCreatorEditForm();
    setCreatorEditOpen(true);
  }, [canCreatorUpdate, location.search, order, loading, visibleDetailFields]);

  const refreshLogs = () => {
    if (id) getSupplementLogs(id).then(setSupplementLogs);
  };

  const loadTimeline = useCallback(async (page = 1, append = false) => {
    if (!id || timelineLoading) return;
    setTimelineLoading(true);
    setTimelineError(false);
    try {
      const result = await getDispatchedOrderTimeline(id, { page, pageSize: 50 });
      setTimelineItems((previous) => append ? [...previous, ...result.items] : result.items);
      setTimelineTotal(result.total);
      setTimelineLoaded(true);
    } catch {
      setTimelineError(true);
    } finally {
      setTimelineLoading(false);
    }
  }, [id, timelineLoading]);

  const handleTimelineChange = (keys: string[]) => {
    const open = keys.includes('processing-log');
    if (open && !timelineLoaded) void loadTimeline();
  };

  const formatTimelineValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '子工单详情' }}><Empty description="子工单不存在" /></PageContainer>;

  const openCreatorEdit = () => {
    fillCreatorEditForm();
    setCreatorEditOpen(true);
  };

  const handleCreatorEditOk = async () => {
    const values = await creatorEditForm.validateFields();
    const original = (order.extra_data || {}) as Record<string, unknown>;
    const changed = Object.fromEntries(
      visibleDetailFields
        .map((field) => [field.field_code, values[field.field_code]] as const)
        .filter(([fieldCode, value]) => String(original[fieldCode] ?? '') !== String(value ?? '')),
    );
    if (Object.keys(changed).length === 0) {
      message.info('没有检测到字段变化');
      setCreatorEditOpen(false);
      return;
    }
    const updated = await handleCreatorUpdate(changed, '业务员在子工单详情修改字段');
    if (updated) setCreatorEditOpen(false);
  };

  const handleCreatorUrgeClick = () => {
    modal.confirm({
      title: '确认催办该子工单？',
      content: '系统会向当前办理人或该模块负责人发送催办通知。',
      okText: '确认催办',
      cancelText: '取消',
      onOk: () => handleUrge('业务员催办：请尽快处理该子工单'),
    });
  };

  const handleCreatorWithdrawOk = async () => {
    const values = await withdrawForm.validateFields();
    const reason = String(values.reason || '').trim();
    const updated = await handleWithdraw(reason);
    if (updated) {
      setWithdrawOpen(false);
      withdrawForm.resetFields();
    }
  };

  const handleCreatorVoidOk = async () => {
    const values = await voidForm.validateFields();
    const reason = String(values.reason || '').trim();
    const updated = await handleVoid(reason);
    if (updated) {
      setVoidOpen(false);
      voidForm.resetFields();
    }
  };

  const handleCreatorResubmitClick = () => {
    resubmitForm.resetFields();
    setResubmitOpen(true);
  };

  const handleCreatorResubmitOk = async () => {
    const values = await resubmitForm.validateFields();
    const reason = String(values.reason || '').trim() || undefined;
    const updated = await handleResubmit(reason);
    if (updated) {
      setResubmitOpen(false);
      resubmitForm.resetFields();
      if (timelineLoaded) void loadTimeline(1);
    }
  };

  const openApproval = (type: 'modify' | 'withdraw' | 'void', approved: boolean) => {
    setApprovalType(type);
    setApprovalApproved(approved);
    approvalForm.resetFields();
    setApprovalOpen(true);
  };

  const handleApprovalOk = async () => {
    const values = await approvalForm.validateFields();
    const comment = String(values.comment || '').trim();
    const updated = approvalType === 'modify'
      ? await handleApproveModify(approvalApproved, comment)
      : approvalType === 'withdraw'
        ? await handleApproveWithdraw(approvalApproved, comment)
        : await handleApproveVoid(approvalApproved, comment);
    if (updated) setApprovalOpen(false);
  };

  const handleReturnOk = async () => {
    const values = await returnForm.validateFields();
    await handleReturn(values.reason, values.fields);
    setReturnModalOpen(false);
  };

  const handleReturnCompletedOk = async () => {
    const values = await returnCompletedForm.validateFields();
    const reason = String(values.reason || '').trim();
    if (!hasText(reason)) {
      message.warning('请填写退回原因');
      return;
    }
    setReturnCompletedLoading(true);
    try {
      const updated = await returnCompletedDispatchedOrder(order.id, reason);
      setOrder({ ...order, ...updated, status: updated.status || 'returned', return_reason: reason });
      message.success('已退回该已完成节点');
      setReturnCompletedOpen(false);
      returnCompletedForm.resetFields();
    } catch {
      message.error('退回已完成节点失败');
    } finally {
      setReturnCompletedLoading(false);
    }
  };

  const handleCompleteOk = async () => {
    const values = await completeForm.validateFields();
    const payload: Record<string, unknown> = { ...values };
    if (isSocialInsuranceOrder) {
      if (payload[HANDLING_SHARED_REMARK] !== undefined && payload[HANDLING_SHARED_REMARK] !== null) {
        payload[HANDLING_SHARED_REMARK] = String(payload[HANDLING_SHARED_REMARK]).trim();
      }
      const remarkSummary = HANDLING_FEEDBACK_FIELDS
        .map((item) => `${item.label}:${String(payload[item.result] || '').trim() || '未填'}`)
        .join('；');
      payload.remark = remarkSummary;
    }
    await handleComplete(payload);
    setCompleteModalOpen(false);
  };

  const handleSupplementOk = async () => {
    if (!canSupplement) {
      message.error('当前用户或子工单无权补充暂存字段');
      setSupplementModalOpen(false);
      return;
    }
    const values = supplementForm.getFieldsValue();
    await handleSupplement(values);
    setSupplementModalOpen(false);
    refreshLogs();
  };


  const openReassignModal = async () => {
    if (!order) return;
    setReassignModalOpen(true);
    reassignForm.resetFields();
    setTeamUsersLoading(true);
    try {
      const users = await getUsersByTeam(getTeamCode(order));
      setTeamUsers(users.filter((u) => u.id !== order.handler_id));
    } catch {
      setTeamUsers([]);
      message.warning('同组成员加载失败，请稍后重试');
    } finally {
      setTeamUsersLoading(false);
    }
  };

  const handleReassignOk = async () => {
    const values = await reassignForm.validateFields();
    const updated = await handleReassign(values.handlerId, values.reason.trim());
    if (updated) {
      setReassignModalOpen(false);
      reassignForm.resetFields();
    }
  };

  const dirtySummary = dirtyFields.length > 0 ? dirtyFields : [];

  return (
    <PageContainer header={{
      title: '子工单详情',
      extra: [<Button key="back" onClick={() => navigate(isReadOnlyView ? readOnlyBackPath : getDispatchedListPath(order, user?.roles, user?.permissions))}>返回列表</Button>],
      ghost: false,
    }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {hasUnreadDirty && (
          <Alert
            type="warning"
            showIcon
            message={`业务员更新了 ${dirtyCount || dirtyFields.length || 1} 个字段，请优先核对红色标记内容。`}
            description={
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {dirtySummary.length > 0 && (
                  <Space wrap>
                    {dirtySummary.map((mark) => <Tag color="red" key={mark.field_code}>{mark.field_label || fields.find((f) => f.field_code === mark.field_code)?.field_name || '已变更字段'}</Tag>)}
                  </Space>
                )}
                <Button size="small" icon={<EyeOutlined />} loading={confirmReadLoading} onClick={() => markDirtyRead('confirm_read')}>确认已阅</Button>
              </Space>
            }
          />
        )}
        {!hasUnreadDirty && dirtyCleared && <Alert type="success" showIcon message="已标记为已阅，字段变更提示已清除。" />}

        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="子工单号">{order.id}</Descriptions.Item>
            <Descriptions.Item label="所属工单">{order.order_no}</Descriptions.Item>
            <Descriptions.Item label="模块">
              <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code, order.order_type)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(isVoided ? 'void' : order.status)}>{getStatusText(isVoided ? 'void' : order.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="工单发起人">{order.created_by_name || order.createdByName || order.created_by || order.createdBy || '-'}</Descriptions.Item>
            <Descriptions.Item label="实际操作人/配置负责人">
              {order.status === 'completed'
                ? getOperatorDisplay(order)
                : <Tag color={getOperatorDisplay(order) === '负责人未配置' ? 'orange' : 'blue'}>{getOperatorDisplay(order)}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="派发时间">{order.dispatched_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="接单时间">{order.accepted_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{order.completed_at || '-'}</Descriptions.Item>
            {order.return_reason && (
              <Descriptions.Item label="退回原因" span={3}>
                <Space direction="vertical" size={2}>
                  <span style={{ color: '#faad14' }}>{order.return_reason}</span>
                  {order.returned_fields && order.returned_fields.length > 0 && (
                    <span style={{ fontSize: 12, color: '#999' }}>
                      需补充字段：{order.returned_fields
                        .map((f) => fields.find((ff) => ff.field_code === f)?.field_name || '未知字段')
                        .join('、')}
                    </span>
                  )}
                </Space>
              </Descriptions.Item>
            )}
            {(order.pending_modify || order.pendingModify) && (
              <Descriptions.Item label="待审批修改" span={3}>
                <Space wrap>
                  {Object.keys((order.pending_modify || order.pendingModify)?.fields || {}).map((fieldCode) => (
                    <Tag color="gold" key={fieldCode}>{fields.find((ff) => ff.field_code === fieldCode)?.field_name || fieldCode}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Space style={{ marginTop: 16 }} wrap>
            {canCreatorUpdate && (
              <Button icon={<EditOutlined />} onClick={openCreatorEdit}>修改</Button>
            )}
            {canCreatorResubmit && (
              <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading} onClick={handleCreatorResubmitClick}>重新提交</Button>
            )}
            {canCreatorWithdraw && (
              <Button icon={<RollbackOutlined />} onClick={() => { withdrawForm.resetFields(); setWithdrawOpen(true); }}>撤回</Button>
            )}
            {canCreatorVoid && (
              <Button danger icon={<StopOutlined />} onClick={() => { voidForm.resetFields(); setVoidOpen(true); }}>作废</Button>
            )}
            {canCreatorUrge && (
              <Button icon={<BellOutlined />} onClick={handleCreatorUrgeClick}>催办</Button>
            )}
            {canApproveModify && (
              <>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openApproval('modify', true)}>同意修改</Button>
                <Button danger icon={<RollbackOutlined />} onClick={() => openApproval('modify', false)}>拒绝修改</Button>
              </>
            )}
            {canApproveWithdraw && (
              <>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openApproval('withdraw', true)}>同意撤回</Button>
                <Button danger icon={<RollbackOutlined />} onClick={() => openApproval('withdraw', false)}>拒绝撤回</Button>
              </>
            )}
            {canApproveVoid && (
              <>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openApproval('void', true)}>同意作废</Button>
                <Button danger icon={<RollbackOutlined />} onClick={() => openApproval('void', false)}>拒绝作废</Button>
              </>
            )}
            {!isTerminal && canAccept && (
              <Button type="primary" icon={<CheckCircleOutlined />}
                loading={actionLoading} onClick={handleAccept}>接单</Button>
            )}
            {!isTerminal && canComplete && (
              <Button type="primary" icon={<CheckCircleOutlined />}
                onClick={() => { completeForm.resetFields(); setCompleteModalOpen(true); }}>完成</Button>
            )}
            {!isTerminal && canReturn && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { returnForm.resetFields(); setReturnModalOpen(true); }}>退回</Button>
            )}
            {canReturnCompleted && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { returnCompletedForm.resetFields(); setReturnCompletedOpen(true); }}>退回已完成节点</Button>
            )}
            {!isTerminal && canSupplement && (
              <Button icon={<PlusCircleOutlined />}
                onClick={() => {
                  supplementForm.setFieldsValue(order.extra_data || {});
                  setSupplementModalOpen(true);
                }}>补充/修改暂存字段</Button>
            )}
             {/* 转交功能按 P2 要求暂时隐藏，相关代码保留以便后续恢复。 */}
          </Space>
        </Card>

        <Collapse
          defaultActiveKey={[]}
          onChange={handleTimelineChange}
          items={[{
            key: 'processing-log',
            label: <Space><HistoryOutlined />工单处理日志{timelineTotal > 0 ? `（${timelineTotal}）` : ''}</Space>,
            children: timelineError ? (
              <Alert
                type="error"
                showIcon
                message="处理日志加载失败"
                action={<Button size="small" onClick={() => void loadTimeline(1)}>重试</Button>}
              />
            ) : timelineLoading && timelineItems.length === 0 ? (
              <div style={{ color: '#999' }}>正在加载处理日志...</div>
            ) : timelineItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无处理日志" />
            ) : (
              <>
                <Timeline
                  items={timelineItems.map((item) => ({
                    color: item.actionType.includes('return') ? 'orange' : item.actionType.includes('resubmit') ? 'green' : 'blue',
                    children: (
                      <div>
                        <div>
                          <strong>{item.actionLabel}</strong>
                          <span style={{ marginLeft: 8, color: '#666' }}>{item.operatorName}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{new Date(item.createdAt).toLocaleString('zh-CN')}</div>
                        {item.reason && <div style={{ marginTop: 4, color: '#595959' }}>说明：{item.reason}</div>}
                        {item.changes.length > 0 && (
                          <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
                            {item.changes.map((change) => (
                              <div key={change.fieldCode} style={{ fontSize: 12, color: '#595959' }}>
                                {change.fieldLabel || fields.find((field) => field.field_code === change.fieldCode)?.field_name || change.fieldCode}：
                                {formatTimelineValue(change.oldValue)} → {formatTimelineValue(change.newValue)}
                              </div>
                            ))}
                          </Space>
                        )}
                      </div>
                    ),
                  }))}
                />
                {timelineItems.length < timelineTotal && (
                  <Button size="small" loading={timelineLoading} onClick={() => void loadTimeline(Math.floor(timelineItems.length / 50) + 1, true)}>
                    加载更多
                  </Button>
                )}
              </>
            ),
          }]}
        />

        {canSupplement && emptySupplementFields.length > 0 && (
          <Alert
            message="待补充字段（紫色标记项为空，请尽快补充）"
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            description={
              <Space wrap>
                {emptySupplementFields.map((f) => (
                  <Badge key={f.field_code} color="purple" text={f.field_name} />
                ))}
              </Space>
            }
          />
        )}

        <Card title="工单信息">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {[...FIELD_GROUPS, { title: '其他字段', codes: ungroupedVisibleDetailFields.map((field) => field.field_code) }].map((group) => {
              const groupFields = visibleDetailFields.filter((f) => group.codes.includes(f.field_code));
              if (groupFields.length === 0) return null;
              return (
                <Card key={group.title} title={group.title} size="small" type="inner">
                  <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
                    {groupFields.map((f) => {
                      const templateConstValue = (f as ContractTemplateDetailField).template_const_value;
                      const raw = templateConstValue !== undefined ? templateConstValue : (order.extra_data as Record<string, unknown> | undefined)?.[f.field_code];
                      const value = raw === null || raw === undefined || raw === '' ? '-' : String(raw);
                      const dirty = hasUnreadDirty && dirtyFieldCodes.has(f.field_code);
                      const dirtyInfo = dirtyFields.find((mark) => mark.field_code === f.field_code);
                      return (
                        <Descriptions.Item
                          key={f.field_code}
                          label={
                            <Space size={4}>
                              <span>{f.field_name}</span>
                              {f.is_required && <span style={{ color: '#ff4d4f', fontWeight: 600 }}>*</span>}
                              {dirty && <Tag color="red">已变更</Tag>}
                            </Space>
                          }
                          contentStyle={dirty ? { borderLeft: '3px solid #ff4d4f', background: '#fff1f0' } : undefined}
                        >
                          <Space direction="vertical" size={2}>
                            <span>{value}</span>
                            {dirty && dirtyInfo && (
                              <Tooltip title={`修改人：${dirtyInfo.changed_by_name || '业务员'}；修改时间：${dirtyInfo.changed_at || '未知'}`}>
                                <span style={{ color: '#cf1322', fontSize: 12 }}>
                                  原值：{dirtyInfo.old_value_text || '-'} → 新值：{dirtyInfo.new_value_text || value}
                                </span>
                              </Tooltip>
                            )}
                          </Space>
                        </Descriptions.Item>
                      );
                    })}
                  </Descriptions>
                </Card>
              );
            })}
            {canSupplement && (
              <Card title="补充字段（可编辑）" size="small" type="inner">
                <DynamicForm
                  fields={dynamicVisibleFields}
                  fieldPermissions={visibleFieldPermissions}
                  orderType={order.order_type || 'onboarding'}
                  initialValues={order.extra_data || {}}
                  readOnly={false}
                />
              </Card>
            )}
          </Space>
        </Card>

        {/* 离职材料附件：三个离职子工单共享挂在主工单(parent_order_id)上的附件，bizPurpose=resignation_material */}
        {['resignation_contact', 'resignation_cert'].includes(String(order.module_code || '')) && order.parent_order_id && (
          <MaterialsUpload workOrderId={order.parent_order_id} bizPurpose="resignation_material" />
        )}

        {supplementLogs.length > 0 && (
          <Card title={<><HistoryOutlined /> 补充历史</>}>
            <Timeline
              items={supplementLogs.map((log) => ({
                color: 'blue' as const,
                children: (
                  <div>
                    <div>
                      <Tag color="purple">{log.field_name}</Tag>
                      由 <strong>{log.supplemented_by}</strong> 补充
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {log.old_value ? log.old_value + ' → ' : '空 → '}
                      <span style={{ color: '#1677ff' }}>{log.new_value}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>{log.supplemented_at}</div>
                  </div>
                ),
              }))}
            />
          </Card>
        )}

        <Modal title="重新提交子工单" open={resubmitOpen} onOk={handleCreatorResubmitOk}
          onCancel={() => setResubmitOpen(false)} okText="重新提交" cancelText="取消"
          confirmLoading={actionLoading} destroyOnHidden>
          <Form form={resubmitForm} layout="vertical">
            <Form.Item name="reason" label="重新提交原因">
              <Input.TextArea
                rows={4}
                maxLength={500}
                showCount
                placeholder="可说明本次修改或重新提交原因，例如：以员工辞职报告真实日期为准"
              />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="修改子工单字段" open={creatorEditOpen} onOk={handleCreatorEditOk}
          onCancel={() => setCreatorEditOpen(false)} confirmLoading={actionLoading}
          width={760} destroyOnHidden>
          <Form form={creatorEditForm} layout="vertical">
            {visibleDetailFields.map((field) => (
              <Form.Item
                key={field.field_code}
                name={field.field_code}
                label={field.field_name}
                rules={field.is_required ? [{ required: true, message: `请填写${field.field_name}` }] : undefined}
              >
                <Input placeholder={`请输入${field.field_name}`} />
              </Form.Item>
            ))}
          </Form>
        </Modal>

        <Modal title="撤回子工单" open={withdrawOpen} onOk={handleCreatorWithdrawOk}
          onCancel={() => setWithdrawOpen(false)} confirmLoading={actionLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Alert style={{ marginBottom: 12 }} type="warning" showIcon
            message="撤回只影响当前子工单，不会影响同一人员的其他子工单。" />
          <Form form={withdrawForm} layout="vertical">
            <Form.Item name="reason" label="撤回原因"
              rules={[
                { required: true, message: '请填写撤回原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('撤回原因不能只填空格')) },
              ]}>
              <Input.TextArea rows={3} maxLength={500} showCount placeholder="请说明为什么撤回该子工单" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="作废子工单" open={voidOpen} onOk={handleCreatorVoidOk}
          onCancel={() => setVoidOpen(false)} confirmLoading={actionLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Alert style={{ marginBottom: 12 }} type="error" showIcon
            message="作废只影响当前子工单，作废后该子工单不可继续办理。" />
          <Form form={voidForm} layout="vertical">
            <Form.Item name="reason" label="作废原因"
              rules={[
                { required: true, message: '请填写作废原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('作废原因不能只填空格')) },
              ]}>
              <Input.TextArea rows={3} maxLength={500} showCount placeholder="请说明为什么作废该子工单" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title={`${approvalApproved ? '同意' : '拒绝'}${approvalType === 'modify' ? '修改' : approvalType === 'withdraw' ? '撤回' : '作废'}申请`} open={approvalOpen} onOk={handleApprovalOk}
          onCancel={() => setApprovalOpen(false)} confirmLoading={actionLoading}
          okButtonProps={{ danger: !approvalApproved }} destroyOnHidden>
          <Alert
            type={approvalApproved ? 'info' : 'warning'}
            showIcon
            style={{ marginBottom: 12 }}
            message={approvalType === 'modify'
              ? (approvalApproved ? '确认后会应用业务员提交的字段修改。' : '拒绝后该子工单会恢复到申请前状态，字段不变。')
              : (approvalApproved ? '确认后该子工单会进入终态。' : '拒绝后该子工单会恢复到申请前状态。')}
          />
          <Form form={approvalForm} layout="vertical">
            <Form.Item name="comment" label="审批意见"
              rules={!approvalApproved ? [
                { required: true, message: '拒绝时请填写审批意见' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('审批意见不能只填空格')) },
              ] : undefined}>
              <Input.TextArea rows={3} maxLength={300} showCount placeholder="可填写审批意见" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="退回工单" open={returnModalOpen} onOk={handleReturnOk}
          onCancel={() => setReturnModalOpen(false)} confirmLoading={actionLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Form form={returnForm} layout="vertical">
            <Form.Item name="reason" label="退回原因"
              rules={[
                { required: true, message: '请填写退回原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('退回原因不能只填空格')) },
                { min: 5, message: '退回原因至少5个字符' },
                { max: 500, message: '不超过500字符' },
              ]}>
              <Input.TextArea rows={3} placeholder="请详细说明退回原因（至少5字）"
                maxLength={500} showCount />
            </Form.Item>
            {supplementableFields.length > 0 && (
              <Form.Item name="fields" label="需补充字段">
                <Checkbox.Group>
                  <Space direction="vertical">
                    {supplementableFields.map((f) => (
                      <Checkbox key={f.field_code} value={f.field_code}>
                        {f.field_name}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </Form.Item>
            )}
          </Form>
        </Modal>

        <Modal title="退回已完成节点" open={returnCompletedOpen} onOk={handleReturnCompletedOk}
          onCancel={() => setReturnCompletedOpen(false)} confirmLoading={returnCompletedLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Alert style={{ marginBottom: 12 }} type="warning" showIcon
            message="退回后该节点需要重新办理"
            description="仅模块主管或系统管理员可退回已完成节点。业务员需要等待相关已完成节点被退回后才能修改并重新提交。" />
          <Form form={returnCompletedForm} layout="vertical">
            <Form.Item label="子单名称">
              <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code, order.order_type)}</Tag>
            </Form.Item>
            <Form.Item label="当前状态"><Tag color="success">已完成</Tag></Form.Item>
            <Form.Item name="reason" label="退回原因"
              rules={[
                { required: true, message: '请填写退回原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('退回原因不能只填空格')) },
                { min: 5, message: '退回原因至少5个字符' },
              ]}>
              <Input.TextArea rows={4} maxLength={500} showCount placeholder="请说明为什么需要退回该已完成节点" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="完成工单" open={completeModalOpen} onOk={handleCompleteOk}
          onCancel={() => setCompleteModalOpen(false)} confirmLoading={actionLoading} destroyOnHidden>
          <Form form={completeForm} layout="vertical">
            {isSocialInsuranceOrder ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="请反馈社保、医保、公积金三项办理结果"
                  description="三项均为“是”时子工单自动完成；任一项为“否”时保持处理中，备注可不填。"
                />
                {HANDLING_FEEDBACK_FIELDS.map((item) => (
                  <Form.Item
                    key={item.result}
                    name={item.result}
                    label={`${item.label}是否办结`}
                    rules={[{ required: true, message: `请选择${item.label}是否办结` }]}
                    style={{ marginBottom: 8 }}
                  >
                    <Select getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body} options={HANDLING_RESULT_OPTIONS} />
                  </Form.Item>
                ))}
                <Form.Item name={HANDLING_SHARED_REMARK} label="社保公积金办理备注（选填）" style={{ marginTop: 8 }}>
                  <Input.TextArea rows={2} maxLength={500} showCount placeholder="可填写未完成原因或补充说明" />
                </Form.Item>
              </>
            ) : (
              <Form.Item name={FEEDBACK_FIELD_MAP[order.module_code] || 'feedback'}
                label="反馈状态"
                rules={[{ required: true, message: '请选择反馈状态' }]}>
                <Select getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body} options={[
                  { label: '已办结', value: '已办结' },
                  { label: '办理中', value: '办理中' },
                  { label: '未办', value: '未办' },
                ]} />
              </Form.Item>
            )}
          </Form>
        </Modal>

        <Modal title="补充/修改暂存字段" open={supplementModalOpen} onOk={handleSupplementOk}
          onCancel={() => setSupplementModalOpen(false)} confirmLoading={actionLoading} destroyOnHidden>
          <Form form={supplementForm} layout="vertical">
            {supplementableFields.map((field) => {
              const isEmpty = !order?.extra_data?.[field.field_code] ||
                order.extra_data[field.field_code] === '';
              return (
                <Form.Item key={field.field_code} name={field.field_code}
                  label={<Space>{field.field_name}
                    {isEmpty && <Badge color="purple" text="待补充" />}
                  </Space>}>
                  <Input placeholder={'请输入' + field.field_name}
                    status={isEmpty ? 'warning' : undefined} />
                </Form.Item>
              );
            })}
          </Form>
        </Modal>


        <Modal title="转交待办" open={reassignModalOpen} onOk={handleReassignOk}
          onCancel={() => { setReassignModalOpen(false); reassignForm.resetFields(); }}
          confirmLoading={actionLoading} destroyOnHidden>
          <Form form={reassignForm} layout="vertical">
            <Form.Item label="当前节点">
              <Space wrap>
                <Tag>{order.order_no}</Tag>
                <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code, order.order_type)}</Tag>
                <span>{order.handler_name || '待认领'}</span>
              </Space>
            </Form.Item>
            <Form.Item name="handlerId" label="转交给" rules={[{ required: true, message: '请选择同组成员' }]}>
              <Select
                showSearch
                loading={teamUsersLoading}
                optionFilterProp="label"
                placeholder="请选择同组成员"
                getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                options={teamUsers.map((u) => ({
                  label: `${u.real_name || u.username}（${u.group_name || u.department_name || '同组'}）`,
                  value: u.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="reason"
              label="转交原因"
              rules={[
                { required: true, message: '请填写转交原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('转交原因不能只填空格')) },
              ]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入转交备注" />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </PageContainer>
  );
};

export default MyDispatchedDetail;
