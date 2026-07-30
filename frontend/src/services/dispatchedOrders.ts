import request, { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';
import { addMockNotification } from './notifications';
import { reloadMockWorkOrders } from './workOrders';

export interface DispatchedOrderTimelineChange {
  fieldCode: string;
  fieldLabel: string;
  oldValue: unknown | null;
  newValue: unknown | null;
}

export interface DispatchedOrderTimelineItem {
  id: string;
  createdAt: string;
  operatorId: string | null;
  operatorName: string;
  actionType: string;
  actionLabel: string;
  description: string;
  reason: string | null;
  changes: DispatchedOrderTimelineChange[];
}

export interface DispatchedOrderTimelineResult {
  items: DispatchedOrderTimelineItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DirtyFieldMark {
  field_code: string;
  field_label?: string;
  old_value_text?: string;
  new_value_text?: string;
  changed_by_name?: string;
  changed_at?: string;
  is_active?: boolean;
}

export interface DispatchedOrderItem {
  id: string;
  parent_order_id: string;
  order_no: string;
  module_code: string;
  module_name: string;
  status: string;
  handler_id: string | null;
  handler_name: string | null;
  configured_handler_names?: string[];
  configuredHandlerNames?: string[];
  employee_name: string;
  employee_id_card?: string;
  customer_name: string;
  customer_code?: string;
  created_by?: string;
  created_by_name?: string;
  createdBy?: string;
  createdByName?: string;
  parent_order_status?: string;
  order_type?: string;
  visible_fields: string[];
  return_reason: string | null;
  returned_fields?: string[];
  dispatched_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  void_at?: string | null;
  voidAt?: string | null;
  extra_data?: Record<string, unknown>;
  pending_modify?: {
    fields: Record<string, unknown>;
    reason?: string | null;
    requestedBy?: string | null;
    requestedAt?: string | null;
    previousStatus?: string | null;
  } | null;
  pendingModify?: DispatchedOrderItem['pending_modify'];
  supplementable_fields?: string[];
  dirty_fields?: DirtyFieldMark[];
  dirty_count?: number;
  has_unread_dirty?: boolean;
  action_permissions?: Record<string, boolean>;
  is_module_supervisor?: boolean;
  team_code?: string | null;
  team_name?: string | null;
  node_type?: string | null;
  due_at?: string | null;
  sla_hours?: number | null;
  slaHours?: number | null;
  sla_reminder_before_hours?: number | null;
  slaReminderBeforeHours?: number | null;
  created_at: string;
}

const MODULE_META: Record<string, { name: string; visible_fields: string[]; supplementable_fields: string[] }> = {
  data_entry: {
    name: '增员报岗录入',
    visible_fields: [
      'customer_name', 'customer_code', 'outsource_type', 'position',
      'employee_name', 'id_card_no', 'gender',
      'birth_date', 'age', 'household_type', 'ethnicity',
      'education', 'graduation_school', 'major', 'graduation_date',
      'mobile', 'email', 'current_address', 'household_address', 'postal_code',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'bank_name', 'bank_account', 'remark',
      'business_mode', 'need_company_payroll', 'pay_location',
      'special_remark', 'data_entry_feedback',
    ],
    supplementable_fields: ['bank_name', 'bank_account', 'pay_location'],
  },
  contract: {
    name: '劳动合同新签',
    visible_fields: [
      'customer_name', 'customer_code', 'outsource_type', 'position',
      'employee_name', 'id_card_no', 'gender',
      'mobile', 'email', 'current_address', 'household_address',
      'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
      'probation_start_date', 'probation_months', 'probation_end_date',
      'work_city', 'work_hour_system', 'work_cycle',
      'salary_form', 'base_salary', 'other_salary', 'probation_salary',
      'payroll_cycle', 'payroll_date',
      'business_mode', 'employee_type',
      'need_company_contract', 'contract_subject', 'contract_template',
      'contract_urge', 'contract_feedback',
    ],
    supplementable_fields: ['contract_subject', 'contract_template'],
  },
  onboarding_contact: {
    name: '入职联系',
    visible_fields: [
      'customer_name', 'customer_code',
      'employee_name', 'id_card_no',
      'mobile', 'email',
      'education', 'graduation_school', 'major', 'graduation_date',
      'bank_name', 'bank_account',
      'need_onboarding_contact', 'onboarding_feedback',
      'special_remark',
    ],
    supplementable_fields: ['mobile', 'email', 'education', 'graduation_school', 'major', 'graduation_date', 'bank_name', 'bank_account'],
  },
  social_insurance: {
    name: '社保公积金增员',
    visible_fields: [
      'customer_name', 'customer_code', 'employee_name', 'id_card_no', 'mobile',
      'education', 'graduation_school', 'major', 'graduation_date',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'business_mode', 'employee_type', 'special_remark',
      'social_insurance_result', 'medical_insurance_result', 'housing_fund_result', 'social_insurance_remark',
    ],
    supplementable_fields: ['social_location', 'start_month', 'social_base', 'fund_base'],
  },
  renewal_contract: { name: '劳动合同续签', visible_fields: [], supplementable_fields: [] },
  resignation_contact: { name: '离职材料收集', visible_fields: [], supplementable_fields: [] },
  resignation_cert: { name: '离职材料收集', visible_fields: [], supplementable_fields: [] },
  data_entry_resign: { name: '减员报岗录入', visible_fields: [], supplementable_fields: [] },
  social_insurance_resign: { name: '社保公积金减员', visible_fields: [], supplementable_fields: [] },
  resignation_social_insurance: { name: '社保公积金减员', visible_fields: [], supplementable_fields: [] },
  benefit_apply: { name: '待遇申报', visible_fields: [], supplementable_fields: [] },
};

const MOCK_STORAGE_KEY = 'mock_work_orders_v1';

interface ParentChild {
  id: string;
  module_code: string;
  module_name?: string;
  status: string;
  handler_name: string | null;
  return_reason?: string | null;
  returned_fields?: string[];
  handler_id?: string | null;
  dispatched_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  void_at?: string | null;
  dirty_fields?: DirtyFieldMark[];
  dirty_count?: number;
  has_unread_dirty?: boolean;
  action_permissions?: Record<string, boolean>;
  is_module_supervisor?: boolean;
}

interface ParentOrderShape {
  id: string;
  order_no: string;
  employee_name: string;
  employee_id_card?: string;
  customer_name: string;
  customer_code?: string;
  status?: string;
  extra_data?: Record<string, unknown>;
  dispatched_orders?: ParentChild[];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeDispatchedOrderItem(raw: unknown): DispatchedOrderItem {
  const row = (raw || {}) as Record<string, unknown>;
  const parent = (row.parentOrder || row.parent_order || {}) as Record<string, unknown>;
  const moduleCode = String(row.module_code ?? row.moduleCode ?? '');
  const meta = MODULE_META[moduleCode] || { name: moduleCode, visible_fields: [], supplementable_fields: [] };
  const extraData = (row.extra_data ?? row.extraData ?? row.parent_extra_data ?? row.parentExtraData ?? parent.extra_data ?? parent.extraData) as Record<string, unknown> | undefined;
  const creator = (row.creator ?? row.createdByUser ?? row.created_by_user ?? parent.creator ?? parent.createdByUser ?? parent.created_by_user) as Record<string, unknown> | undefined;
  const createdByRaw = row.created_by ?? row.createdBy ?? parent.created_by ?? parent.createdBy ?? '';
  const createdByNameRaw = row.created_by_name ?? row.createdByName ?? row.creator_name ?? row.creatorName
    ?? parent.created_by_name ?? parent.createdByName ?? parent.creator_name ?? parent.creatorName
    ?? creator?.real_name ?? creator?.realName ?? creator?.username ?? createdByRaw;
  const visibleFields = normalizeStringArray(row.visible_fields ?? row.visibleFields);
  const supplementableFields = normalizeStringArray(row.supplementable_fields ?? row.supplementableFields);
  const mergedVisibleFields = moduleCode === 'onboarding_contact'
    ? Array.from(new Set([...visibleFields, 'bank_name', 'bank_account']))
    : visibleFields;
  const mergedSupplementableFields = moduleCode === 'onboarding_contact'
    ? Array.from(new Set([...supplementableFields, 'bank_name', 'bank_account']))
    : supplementableFields;
  return {
    ...(row as Partial<DispatchedOrderItem>),
    id: String(row.id ?? ''),
    parent_order_id: String(row.parent_order_id ?? row.parentOrderId ?? parent.id ?? ''),
    order_no: String(row.order_no ?? row.orderNo ?? parent.order_no ?? parent.orderNo ?? ''),
    module_code: moduleCode,
    module_name: String(row.module_name ?? row.moduleName ?? meta.name ?? moduleCode),
    status: String(row.status ?? ''),
    handler_id: (row.handler_id ?? row.handlerId ?? null) as string | null,
    handler_name: (row.handler_name ?? row.handlerName ?? (row.handler as Record<string, unknown> | undefined)?.realName ?? null) as string | null,
    configured_handler_names: Array.isArray(row.configured_handler_names) ? row.configured_handler_names as string[] : (Array.isArray(row.configuredHandlerNames) ? row.configuredHandlerNames as string[] : []),
    configuredHandlerNames: Array.isArray(row.configuredHandlerNames) ? row.configuredHandlerNames as string[] : (Array.isArray(row.configured_handler_names) ? row.configured_handler_names as string[] : []),
    employee_name: String(row.employee_name ?? row.employeeName ?? parent.employee_name ?? parent.employeeName ?? extraData?.employee_name ?? ''),
    employee_id_card: String(row.employee_id_card ?? row.employeeIdCard ?? parent.employee_id_card ?? parent.employeeIdCard ?? extraData?.id_card_no ?? extraData?.employee_id_card ?? ''),
    customer_name: String(row.customer_name ?? row.customerName ?? parent.customer_name ?? parent.customerName ?? extraData?.customer_name ?? ''),
    customer_code: String(row.customer_code ?? row.customerCode ?? parent.customer_code ?? parent.customerCode ?? extraData?.customer_code ?? ''),
    created_by: String(createdByRaw || ''),
    created_by_name: String(createdByNameRaw || ''),
    createdBy: String(createdByRaw || ''),
    createdByName: String(createdByNameRaw || ''),
    parent_order_status: String(row.parent_order_status ?? row.parentOrderStatus ?? parent.status ?? ''),
    order_type: String(row.order_type ?? row.orderType ?? parent.order_type ?? parent.orderType ?? ''),
    visible_fields: mergedVisibleFields.length > 0 ? mergedVisibleFields : meta.visible_fields,
    return_reason: (row.return_reason ?? row.returnReason ?? null) as string | null,
    returned_fields: normalizeStringArray(row.returned_fields ?? row.returnedFields),
    dispatched_at: (row.dispatched_at ?? row.dispatchedAt ?? null) as string | null,
    accepted_at: (row.accepted_at ?? row.acceptedAt ?? null) as string | null,
    completed_at: (row.completed_at ?? row.completedAt ?? null) as string | null,
    void_at: (row.void_at ?? row.voidAt ?? null) as string | null,
    voidAt: (row.voidAt ?? row.void_at ?? null) as string | null,
    extra_data: extraData,
    pending_modify: (row.pending_modify ?? row.pendingModify ?? null) as DispatchedOrderItem['pending_modify'],
    pendingModify: (row.pendingModify ?? row.pending_modify ?? null) as DispatchedOrderItem['pending_modify'],
    supplementable_fields: mergedSupplementableFields.length > 0 ? mergedSupplementableFields : meta.supplementable_fields,
    dirty_fields: (row.dirty_fields ?? row.dirtyFields ?? []) as DirtyFieldMark[],
    dirty_count: (row.dirty_count ?? row.dirtyCount) as number | undefined,
    has_unread_dirty: (row.has_unread_dirty ?? row.hasUnreadDirty) as boolean | undefined,
    action_permissions: (row.action_permissions ?? row.actionPermissions) as Record<string, boolean> | undefined,
    is_module_supervisor: (row.is_module_supervisor ?? row.isModuleSupervisor) as boolean | undefined,
    team_code: (row.team_code ?? row.teamCode ?? row.department_code ?? row.departmentCode ?? null) as string | null,
    team_name: (row.team_name ?? row.teamName ?? row.department_name ?? row.departmentName ?? null) as string | null,
    node_type: (row.node_type ?? row.nodeType ?? moduleCode ?? null) as string | null,
    due_at: (row.due_at ?? row.dueAt ?? null) as string | null,
    sla_hours: (row.sla_hours ?? row.slaHours ?? null) as number | null,
    slaHours: (row.slaHours ?? row.sla_hours ?? null) as number | null,
    sla_reminder_before_hours: (row.sla_reminder_before_hours ?? row.slaReminderBeforeHours ?? null) as number | null,
    slaReminderBeforeHours: (row.slaReminderBeforeHours ?? row.sla_reminder_before_hours ?? null) as number | null,
    created_at: String(row.created_at ?? row.createdAt ?? row.dispatched_at ?? row.dispatchedAt ?? new Date().toISOString()),
  } as DispatchedOrderItem;
}

function normalizePageResult(raw: unknown): PageResult<DispatchedOrderItem> {
  const result = (raw || {}) as Record<string, unknown>;
  const rawList = Array.isArray(result.list)
    ? result.list
    : Array.isArray(result.items)
      ? result.items
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(raw)
          ? raw as unknown[]
          : [];
  const list = rawList.map(normalizeDispatchedOrderItem);
  return {
    ...(result as unknown as Partial<PageResult<DispatchedOrderItem>>),
    list,
    page: Number(result.page ?? 1),
    pageSize: Number(result.pageSize ?? list.length),
    total: Number(result.total ?? list.length),
    totalPages: Number(result.totalPages ?? 1),
    success: (result.success as boolean | undefined) ?? true,
  };
}

function readParentOrders(): ParentOrderShape[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeParentOrders(list: ParentOrderShape[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(list)); }
  catch { /* ignore */ }
}

function dayInMonth(value: string | null | undefined, month: string): boolean {
  if (!value || !month) return false;
  return String(value).slice(0, 7) === month;
}

function flattenDispatched(): DispatchedOrderItem[] {
  const parents = readParentOrders();
  const out: DispatchedOrderItem[] = [];
  for (const p of parents) {
    for (const d of p.dispatched_orders || []) {
      const meta = MODULE_META[d.module_code] || { name: d.module_code, visible_fields: [], supplementable_fields: [] };
      out.push({
        id: d.id,
        parent_order_id: p.id,
        order_no: p.order_no,
        module_code: d.module_code,
        module_name: d.module_name || meta.name,
        status: d.status,
        handler_id: d.handler_id ?? null,
        handler_name: d.handler_name ?? null,
        employee_name: String(p.extra_data?.employee_name ?? p.employee_name ?? ''),
        employee_id_card: String(p.extra_data?.id_card_no ?? p.extra_data?.employee_id_card ?? p.employee_id_card ?? ''),
        customer_name: String(p.extra_data?.customer_name ?? p.customer_name ?? ''),
        customer_code: String(p.extra_data?.customer_code ?? p.customer_code ?? ''),
        created_by: String((p as unknown as Record<string, unknown>).created_by ?? (p as unknown as Record<string, unknown>).createdBy ?? ''),
        created_by_name: String((p as unknown as Record<string, unknown>).created_by_name ?? (p as unknown as Record<string, unknown>).createdByName ?? (p as unknown as Record<string, unknown>).created_by ?? (p as unknown as Record<string, unknown>).createdBy ?? ''),
        order_type: String((p as unknown as Record<string, unknown>).order_type ?? (p as unknown as Record<string, unknown>).orderType ?? 'onboarding'),
        visible_fields: meta.visible_fields,
        return_reason: d.return_reason ?? null,
        returned_fields: d.returned_fields,
        dispatched_at: d.dispatched_at,
        accepted_at: d.accepted_at,
        completed_at: d.completed_at,
        void_at: d.void_at ?? null,
        supplementable_fields: meta.supplementable_fields,
        dirty_fields: d.dirty_fields || [],
        dirty_count: d.dirty_count ?? d.dirty_fields?.length ?? 0,
        has_unread_dirty: d.has_unread_dirty ?? Boolean(d.dirty_fields?.length),
        action_permissions: d.action_permissions,
        is_module_supervisor: d.is_module_supervisor,
        created_at: d.dispatched_at || new Date().toISOString(),
      });
    }
  }
  return out;
}

function updateChildInParent(childId: string, patch: (child: ParentChild) => void): DispatchedOrderItem | null {
  const parents = readParentOrders();
  for (const p of parents) {
    const children = p.dispatched_orders || [];
    const idx = children.findIndex((c) => c.id === childId);
    if (idx >= 0) {
      patch(children[idx]);
      writeParentOrders(parents);
      return flattenDispatched().find((d) => d.id === childId) || null;
    }
  }
  return null;
}

function deleteChildInParent(childId: string): boolean {
  const parents = readParentOrders();
  for (const p of parents) {
    const children = p.dispatched_orders || [];
    const idx = children.findIndex((c) => c.id === childId);
    if (idx >= 0) {
      children.splice(idx, 1);
      p.dispatched_orders = children;
      writeParentOrders(parents);
      reloadMockWorkOrders();
      return true;
    }
  }
  return false;
}

const DISPATCHED_ORDER_QUERY_KEYS = new Set([
  'page',
  'pageSize',
  'keyword',
  'module_code',
  'moduleCode',
  'moduleName',
  'nodeType',
  'pool',
  'orderType',
  'order_type',
  'type',
  'departmentId',
  'department_id',
  'department',
  'handlerId',
  'handler_id',
  'handlerName',
  'handler_name',
  'assignee',
  'assigneeId',
  'assignee_id',
  'status',
  'statuses',
  'statusIn',
  'orderNo',
  'order_no',
  'customerCode',
  'customer_code',
  'customerName',
  'customer_name',
  'employeeName',
  'employee_name',
  'idCardNo',
  'employeeIdCard',
  'employee_id_card',
  'orderMonth',
  'order_month',
  'dispatchedFrom',
  'dispatchedTo',
  'completedFrom',
  'completedTo',
  'includeReturned',
  'onlyPool',
  'onlyUnclaimed',
  'onlyDirty',
]);

function normalizePageSize(value: unknown): number {
  const n = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

function cleanDispatchedOrdersQuery(params: DispatchedOrdersListParams): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (!DISPATCHED_ORDER_QUERY_KEYS.has(key)) return;
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    query[key] = value;
  });

  query.page = Number(params.page ?? params.current ?? 1) || 1;
  query.pageSize = normalizePageSize(params.pageSize);
  return query;
}

export type DispatchedOrdersListParams = PageParams & {
  module_code?: string;
  moduleCode?: string;
  orderType?: string;
  order_type?: string;
  handlerId?: string;
  handler_id?: string;
  handlerName?: string;
  handler_name?: string;
  status?: string;
  statuses?: string;
  statusIn?: string;
  orderNo?: string;
  order_no?: string;
  customerCode?: string;
  customer_code?: string;
  customerName?: string;
  customer_name?: string;
  employeeName?: string;
  employee_name?: string;
  idCardNo?: string;
  employeeIdCard?: string;
  orderMonth?: string;
  order_month?: string;
  dispatchedFrom?: string;
  dispatchedTo?: string;
  completedFrom?: string;
  completedTo?: string;
  includeReturned?: boolean;
  silentError?: boolean;
};

export async function getDispatchedOrders(params: DispatchedOrdersListParams): Promise<PageResult<DispatchedOrderItem>> {
  if (isMockMode) {
    let list = flattenDispatched();
    if (params.status) list = list.filter((d) => d.status === params.status);
    else {
      const statuses = String(params.statuses ?? params.statusIn ?? '')
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
      if (statuses.length > 0) list = list.filter((d) => statuses.includes(d.status));
    }
    const moduleCode = String(params.moduleCode ?? params.module_code ?? '');
    if (moduleCode) list = list.filter((d) => d.module_code === moduleCode);
    const orderType = String(params.orderType ?? params.order_type ?? '');
    if (orderType) list = list.filter((d) => d.order_type === orderType || d.module_code === orderType);
    const orderNo = String(params.orderNo ?? params.order_no ?? '').toLowerCase();
    if (orderNo) list = list.filter((d) => String(d.order_no || '').toLowerCase().includes(orderNo));
    const customerCode = String(params.customerCode ?? params.customer_code ?? '').toLowerCase();
    if (customerCode) list = list.filter((d) => String(d.customer_code || '').toLowerCase().includes(customerCode));
    const customerName = String(params.customerName ?? params.customer_name ?? '').toLowerCase();
    if (customerName) list = list.filter((d) => String(d.customer_name || '').toLowerCase().includes(customerName));
    const employeeName = String(params.employeeName ?? params.employee_name ?? '').toLowerCase();
    if (employeeName) list = list.filter((d) => String(d.employee_name || '').toLowerCase().includes(employeeName));
    const idCardNo = String(params.idCardNo ?? params.employeeIdCard ?? '').toLowerCase();
    if (idCardNo) list = list.filter((d) => String(d.employee_id_card || '').toLowerCase().includes(idCardNo));
    const orderMonth = String(params.orderMonth ?? params.order_month ?? '');
    if (orderMonth) list = list.filter((d) => dayInMonth(d.dispatched_at || d.created_at || d.completed_at, orderMonth));
    if (params.dispatchedFrom) list = list.filter((d) => d.dispatched_at && new Date(d.dispatched_at).getTime() >= new Date(String(params.dispatchedFrom)).getTime());
    if (params.dispatchedTo) list = list.filter((d) => d.dispatched_at && new Date(d.dispatched_at).getTime() <= new Date(String(params.dispatchedTo)).getTime());
    if (params.completedFrom) list = list.filter((d) => d.completed_at && new Date(d.completed_at).getTime() >= new Date(String(params.completedFrom)).getTime());
    if (params.completedTo) list = list.filter((d) => d.completed_at && new Date(d.completed_at).getTime() <= new Date(String(params.completedTo)).getTime());
    const handler = String(params.handlerId ?? params.handler_id ?? '');
    if (handler && handler !== 'current') list = list.filter((d) => d.handler_id === handler);
    if (params.keyword) {
      const kw = String(params.keyword).toLowerCase();
      list = list.filter((d) => d.order_no.toLowerCase().includes(kw) || d.employee_name.toLowerCase().includes(kw));
    }
    return mockDelay({ list, page: Number(params.page) || 1, pageSize: Number(params.pageSize) || 20, total: list.length, totalPages: 1, success: true });
  }
  const { silentError } = params;
  const query = cleanDispatchedOrdersQuery(params);
  const raw = await request.get('/dispatched-orders', { params: query, silentError } as any);
  return normalizePageResult(raw);
}

function emptyDispatchedOrdersPage(params: DispatchedOrdersListParams): PageResult<DispatchedOrderItem> {
  const page = Number(params.page ?? params.current ?? 1) || 1;
  const pageSize = Number(params.pageSize ?? 20) || 20;
  return { list: [], page, pageSize, total: 0, totalPages: 0, success: false };
}

function getHttpStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | undefined)?.response?.status;
  const n = Number(status);
  return Number.isFinite(n) ? n : undefined;
}

export async function getDispatchedOrdersSafe(params: DispatchedOrdersListParams): Promise<PageResult<DispatchedOrderItem>> {
  try {
    return await getDispatchedOrders({ ...params, silentError: true });
  } catch (error) {
    const status = getHttpStatus(error);
    if (status === 401 || status === 403) {
      console.error('[dispatched-orders] list request failed with auth error; rethrowing to expose permission/session issues', error);
      throw error;
    }
    console.error('[dispatched-orders] list request failed, showing empty table fallback', error);
    return emptyDispatchedOrdersPage(params);
  }
}

export async function getDispatchedOrder(id: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const all = flattenDispatched();
    const found = all.find((d) => d.id === id);
    if (!found) {
      return mockDelay({
        id, parent_order_id: '', order_no: '', module_code: 'data_entry', module_name: '增员报岗录入',
        status: 'pending', handler_id: null, handler_name: null, employee_name: '', customer_name: '',
        visible_fields: [], return_reason: null, dispatched_at: null, accepted_at: null, completed_at: null,
        supplementable_fields: [], dirty_fields: [], dirty_count: 0, has_unread_dirty: false,
        action_permissions: {}, created_at: new Date().toISOString(),
      } as DispatchedOrderItem);
    }
    const parent = readParentOrders().find((p) => p.id === found.parent_order_id);
    return mockDelay({
      ...found,
      extra_data: {
        ...(parent?.extra_data || {}),
        employee_name: found.employee_name,
        customer_name: found.customer_name,
      },
    });
  }
  const raw = await request.get(`/dispatched-orders/${id}`);
  return normalizeDispatchedOrderItem(raw);
}

export async function acceptDispatchedOrder(id: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'processing';
      c.accepted_at = new Date().toISOString();
      c.handler_name = '当前用户';
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  return request.post(`/dispatched-orders/${id}/accept`) as Promise<DispatchedOrderItem>;
}

export interface BatchAcceptResult {
  success: boolean;
  accepted: number;
  skipped: Array<{ id: string; reason: string }>;
}

export async function batchAcceptDispatchedOrders(ids: string[]): Promise<BatchAcceptResult> {
  if (isMockMode) {
    let accepted = 0;
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (c) => {
        if (c.status !== 'pending') return;
        c.status = 'processing';
        c.accepted_at = new Date().toISOString();
        c.handler_name = '当前用户';
      });
      if (updated?.status === 'processing') accepted += 1;
    });
    return mockDelay({ success: true, accepted, skipped: [] });
  }
  return request.post('/dispatched-orders/batch-accept', { ids }) as Promise<BatchAcceptResult>;
}

export interface BatchApproveModifyResult {
  success: boolean;
  processed: number;
  skipped: Array<{ id: string; reason: string }>;
}

export async function batchApproveModifyDispatchedOrders(
  ids: string[],
  approved = true,
  comment?: string,
): Promise<BatchApproveModifyResult> {
  if (isMockMode) {
    let processed = 0;
    const skipped: Array<{ id: string; reason: string }> = [];
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (child) => {
        if (child.status !== 'modify_pending') return;
        child.status = approved ? 'pending' : 'returned';
        child.accepted_at = approved ? null : child.accepted_at;
        child.return_reason = approved ? null : (comment || '修改审批已拒绝');
      });
      if (updated && updated.status === (approved ? 'pending' : 'returned')) processed += 1;
      else skipped.push({ id, reason: '子工单未处于修改审批中' });
    });
    return mockDelay({ success: true, processed, skipped });
  }
  return request.post('/dispatched-orders/batch-approve-modify', { ids, approved, comment }) as Promise<BatchApproveModifyResult>;
}

export async function completeDispatchedOrder(id: string, data?: Record<string, unknown>): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'completed';
      c.completed_at = new Date().toISOString();
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const body: Record<string, unknown> = {};
  if (data && Object.keys(data).length > 0) {
    const { extraData, extra_data, remark, ...rest } = data as Record<string, unknown>;
    const trimmedRemark = typeof remark === 'string' ? remark.trim() : remark;
    if (trimmedRemark !== undefined && trimmedRemark !== null && String(trimmedRemark).length > 0) {
      body.remark = trimmedRemark;
    }
    body.extraData = {
      ...((extraData as Record<string, unknown>) || (extra_data as Record<string, unknown>) || {}),
      ...rest,
      ...(body.remark ? { remark: body.remark } : {}),
    };
  }
  return request.post(`/dispatched-orders/${id}/complete`, body) as Promise<DispatchedOrderItem>;
}

export function isDispatchedAcceptedByBackend(order?: Pick<DispatchedOrderItem, 'status' | 'accepted_at'> | null): boolean {
  return Boolean(order?.accepted_at) || order?.status === 'processing' || order?.status === 'accepted';
}

export async function returnDispatchedOrder(id: string, reason: string, fields?: string[]): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'returned';
      c.return_reason = reason;
      c.returned_fields = fields;
    });
    if (updated) {
      const parents = readParentOrders();
      const parent = parents.find((p) => p.id === updated.parent_order_id);
      if (parent) {
        const children = parent.dispatched_orders || [];
        const hasOpen = children.some((c) => c.status === 'pending' || c.status === 'processing');
        if (!hasOpen) {
          const pIdx = parents.findIndex((po) => po.id === parent.id);
          if (pIdx >= 0) {
            (parents[pIdx] as unknown as Record<string, unknown>)['status'] = 'returned';
            writeParentOrders(parents);
            reloadMockWorkOrders();
          }
        }
        addMockNotification({
          id: 'n-' + Date.now(),
          type: '退回',
          biz_type: 'task',
          priority: 'urgent',
          title: '子工单被退回',
          content: `工单 ${updated.order_no} 的 ${updated.module_name} 已被退回，原因：${reason}`,
          entity_type: 'dispatched_order',
          entity_id: id,
          link: `/dispatched/${id}`,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    }
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  // 后端 ReturnDispatchedOrderDto 要求 returnReason + returnedFields[]
  return request.post(`/dispatched-orders/${id}/return`, {
    returnReason: reason,
    returnedFields: fields,
  }) as Promise<DispatchedOrderItem>;
}

export async function supplementField(id: string, fields: Record<string, string>): Promise<void> {
  if (isMockMode) return mockDelay(undefined);
  return request.post(`/dispatched-orders/${id}/supplement`, { fields }) as Promise<void>;
}

export async function creatorUpdateDispatchedOrderFields(id: string, fields: Record<string, unknown>, reason?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const parents = readParentOrders();
    let updated: DispatchedOrderItem | null = null;
    for (const parent of parents) {
      const child = (parent.dispatched_orders || []).find((item) => item.id === id);
      if (!child) continue;
      const accepted = child.status === 'processing' || Boolean(child.accepted_at);
      if (accepted) {
        child.status = 'modify_pending';
        child.return_reason = reason ? `业务员修改申请：${reason}` : '业务员修改申请';
      } else {
        parent.extra_data = { ...(parent.extra_data || {}), ...fields };
        if (fields.customer_name !== undefined) parent.customer_name = String(fields.customer_name || '');
        if (fields.customer_code !== undefined) parent.customer_code = String(fields.customer_code || '');
        if (fields.employee_name !== undefined) parent.employee_name = String(fields.employee_name || '');
        if (fields.id_card_no !== undefined || fields.employee_id_card !== undefined) {
          parent.employee_id_card = String(fields.id_card_no ?? fields.employee_id_card ?? '');
        }
      }
      break;
    }
    writeParentOrders(parents);
    updated = flattenDispatched().find((item) => item.id === id) || null;
    reloadMockWorkOrders();
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/creator-update`, { fields, reason });
  return normalizeDispatchedOrderItem(raw);
}

// 子工单重新提交以文件后方的 payload 版本为准，避免“修改字段”自动改变状态。

export async function urgeDispatchedOrder(id: string, reason?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = flattenDispatched().find((item) => item.id === id) || null;
    if (updated) {
      addMockNotification({
        id: 'n-urge-' + Date.now(),
        type: '催办',
        biz_type: 'creator_urge',
        priority: 'normal',
        title: '业务员催办子工单',
        content: reason || `请尽快处理工单 ${updated.order_no}`,
        entity_type: 'dispatched_order',
        entity_id: id,
        link: `/my-dispatched/${id}`,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/urge`, { reason });
  return normalizeDispatchedOrderItem(raw);
}

export async function approveModifyDispatchedOrder(id: string, approved: boolean, comment?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'processing';
      c.return_reason = approved ? null : (comment ? `修改审批已拒绝：${comment}` : null);
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/modify/approve`, { approved, comment });
  return normalizeDispatchedOrderItem(raw);
}

export async function withdrawDispatchedOrder(id: string, reason: string, moduleCode?: string | null): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      const isUnaccepted = c.status === 'pending' && !c.accepted_at;
      c.status = isUnaccepted ? 'withdrawn' : 'withdraw_pending';
      c.return_reason = isUnaccepted ? `业务员未接单前直接撤回：${reason}` : `业务员撤回申请：${reason}`;
      c.completed_at = isUnaccepted ? new Date().toISOString() : null;
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/withdraw`, { reason, moduleCode, module_code: moduleCode });
  return normalizeDispatchedOrderItem(raw);
}

export async function approveWithdrawDispatchedOrder(id: string, approved: boolean, comment?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = approved ? 'withdrawn' : 'processing';
      c.return_reason = approved ? c.return_reason : (comment ? `撤回已拒绝：${comment}` : null);
      c.completed_at = approved ? new Date().toISOString() : null;
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/withdraw/approve`, { approved, comment });
  return normalizeDispatchedOrderItem(raw);
}

export async function voidDispatchedOrder(id: string, reason: string, moduleCode?: string | null): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const now = new Date().toISOString();
    const updated = updateChildInParent(id, (c) => {
      const isUnaccepted = c.status === 'pending' && !c.accepted_at;
      c.status = isUnaccepted ? 'void' : 'void_pending';
      c.void_at = isUnaccepted ? now : null;
      c.return_reason = isUnaccepted ? `业务员未接单前直接作废：${reason}` : `业务员作废申请：${reason}`;
      c.completed_at = isUnaccepted ? now : null;
    });
    return mockDelay(updated ? { ...updated, void_at: updated.void_at || null, voidAt: updated.void_at || null } : ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/void`, { reason, moduleCode, module_code: moduleCode });
  return normalizeDispatchedOrderItem(raw);
}

export async function approveVoidDispatchedOrder(id: string, approved: boolean, comment?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const now = new Date().toISOString();
    const updated = updateChildInParent(id, (c) => {
      c.status = approved ? 'void' : 'processing';
      c.void_at = approved ? now : null;
      c.return_reason = approved ? c.return_reason : (comment ? `作废已拒绝：${comment}` : null);
      c.completed_at = approved ? now : null;
    });
    return mockDelay(updated ? { ...updated, void_at: approved ? now : null, voidAt: approved ? now : null } : ({} as DispatchedOrderItem));
  }
  const raw = await request.post(`/dispatched-orders/${id}/void/approve`, { approved, comment });
  return normalizeDispatchedOrderItem(raw);
}

function normalizeTimelineItem(raw: unknown): DispatchedOrderTimelineItem {
  const row = (raw || {}) as Record<string, unknown>;
  const changes = Array.isArray(row.changes) ? row.changes : [];
  return {
    id: String(row.id ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    operatorId: (row.operatorId ?? row.operator_id ?? null) as string | null,
    operatorName: String(row.operatorName ?? row.operator_name ?? '系统'),
    actionType: String(row.actionType ?? row.action_type ?? ''),
    actionLabel: String(row.actionLabel ?? row.action_label ?? row.actionType ?? row.action_type ?? ''),
    description: String(row.description ?? ''),
    reason: typeof row.reason === 'string' ? row.reason : null,
    changes: changes.map((change) => {
      const item = (change || {}) as Record<string, unknown>;
      const fieldCode = String(item.fieldCode ?? item.field_code ?? '');
      return {
        fieldCode,
        fieldLabel: String(item.fieldLabel ?? item.field_label ?? fieldCode),
        oldValue: (item.oldValue ?? item.old_value ?? null) as unknown,
        newValue: (item.newValue ?? item.new_value ?? null) as unknown,
      };
    }).filter((change) => change.fieldCode),
  };
}

export async function getDispatchedOrderTimeline(
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<DispatchedOrderTimelineResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  if (isMockMode) {
    return mockDelay({ items: [], total: 0, page, pageSize });
  }
  const raw = await request.get(`/dispatched-orders/${id}/timeline`, { params: { page, pageSize } }) as unknown;
  const result = (raw || {}) as Record<string, unknown>;
  const rows = Array.isArray(result.items)
    ? result.items
    : Array.isArray(result.list)
      ? result.list
      : Array.isArray(result.data)
        ? result.data
        : [];
  return {
    items: rows.map(normalizeTimelineItem),
    total: Number(result.total ?? rows.length),
    page: Number(result.page ?? page),
    pageSize: Number(result.pageSize ?? pageSize),
  };
}

export async function resubmitDispatchedOrder(id: string, payload?: { fields?: Record<string, unknown>; reason?: string; moduleCode?: string | null }): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'pending';
      c.return_reason = null;
      c.returned_fields = [];
      c.completed_at = null;
      c.void_at = null;
    });
    reloadMockWorkOrders();
    return mockDelay(updated ? { ...updated, void_at: null, voidAt: null } : ({} as DispatchedOrderItem));
  }
  const body = {
    fields: payload?.fields,
    extraData: payload?.fields,
    reason: payload?.reason,
    moduleCode: payload?.moduleCode,
    module_code: payload?.moduleCode,
  };
  try {
    const raw = await request.post(`/dispatched-orders/${id}/resubmit`, body);
    return normalizeDispatchedOrderItem(raw);
  } catch {
    if (payload?.moduleCode) {
      const raw = await request.post(`/dispatched-orders/${id}/void/restore`, { moduleCode: payload.moduleCode, module_code: payload.moduleCode });
      return normalizeDispatchedOrderItem(raw);
    }
    throw new Error('resubmit failed');
  }
}

export type BatchReassignStrategy = 'single' | 'round_robin' | 'load_balance';

export interface BatchReassignResult {
  success: boolean;
  reassigned: number;
  assignments: Array<{ id: string; previousHandlerId: string | null; newHandlerId: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export async function batchReassignDispatchedOrders(
  ids: string[],
  handlerIds: string[],
  strategy: BatchReassignStrategy,
  reason: string,
): Promise<BatchReassignResult> {
  if (isMockMode) {
    const assignments: BatchReassignResult['assignments'] = [];
    ids.forEach((id, index) => {
      const handlerId = strategy === 'single' ? handlerIds[0] : handlerIds[index % handlerIds.length];
      const updated = updateChildInParent(id, (child) => {
        const previousHandlerId = child.handler_id || null;
        child.handler_id = handlerId;
        child.handler_name = handlerId ? '新处理人' : null;
        child.status = 'pending';
        assignments.push({ id, previousHandlerId, newHandlerId: handlerId });
      });
      void updated;
    });
    return mockDelay({ success: true, reassigned: assignments.length, assignments, skipped: [] });
  }
  return request.post('/dispatched-orders/batch-reassign', {
    ids,
    handlerIds,
    strategy,
    reason,
  }) as Promise<BatchReassignResult>;
}

export async function reassignDispatchedOrder(id: string, handlerId: string, reason?: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.handler_name = handlerId ? '新处理人' : null;
      c.handler_id = handlerId || null;
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  const payload = { handlerId, reason };
  try {
    const raw = await request.post(`/work-orders/sub/${id}/reassign`, payload);
    return normalizeDispatchedOrderItem(raw);
  } catch {
    const raw = await request.post(`/dispatched-orders/${id}/reassign`, payload);
    return normalizeDispatchedOrderItem(raw);
  }
}

export interface DispatchedOrderExportFile {
  fileId: string;
  fileName: string;
  downloadUrl: string;
  moduleCode?: string;
  signPlatform?: string | null;
  count?: number;
}

export interface DispatchedOrderExportResult {
  templateId?: string | null;
  templateName?: string;
  moduleCode?: string;
  rowCount?: number;
  fileId?: string;
  fileName?: string;
  downloadUrl?: string;
  files?: DispatchedOrderExportFile[];
}

export function resolveExportDownloadUrl(result: DispatchedOrderExportResult): string {
  const url = result.downloadUrl || (result.fileId ? `/api/files/${result.fileId}` : '');
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  return `${base}${url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`}`;
}

async function downloadBinaryFile(url: string, fileName: string): Promise<void> {
  const token = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('token') : null;
  const response = await fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `导出文件下载失败 (${response.status})`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.click();
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
}

export async function downloadDispatchedExport(result: DispatchedOrderExportResult, fallbackName: string): Promise<void> {
  const url = resolveExportDownloadUrl(result);
  if (!url) {
    const blobUrl = window.URL.createObjectURL(new Blob(['mock export data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fallbackName;
      a.click();
    } finally {
      window.URL.revokeObjectURL(blobUrl);
    }
    return;
  }
  await downloadBinaryFile(url, result.fileName || fallbackName);
}

export async function exportDispatchedOrder(id: string, templateId?: string): Promise<DispatchedOrderExportResult> {
  if (isMockMode) return mockDelay({ templateId: templateId || null, templateName: 'mock', moduleCode: 'mock', rowCount: 1, fileName: 'mock.xlsx' });
  const body: Record<string, unknown> = {};
  if (templateId) body.templateId = templateId;
  return request.post(`/dispatched-orders/${id}/export`, body) as Promise<DispatchedOrderExportResult>;
}

export async function batchExportDispatchedOrders(ids: string[], templateId?: string): Promise<DispatchedOrderExportResult> {
  if (isMockMode) return mockDelay({ templateId: templateId || null, templateName: 'mock batch', moduleCode: 'mixed', rowCount: ids.length, fileName: 'mock-batch.xlsx' });
  return request.post('/dispatched-orders/batch-export', { ids, templateId }) as Promise<DispatchedOrderExportResult>;
}

export async function deleteDispatchedOrder(id: string): Promise<void> {
  if (isMockMode) {
    deleteChildInParent(id);
    return mockDelay(undefined);
  }
  return request.delete(`/dispatched-orders/${id}`) as Promise<void>;
}

export async function batchDeleteDispatchedOrders(ids: string[]): Promise<{ success: number; failed: number }> {
  if (isMockMode) {
    const success = ids.filter((id) => deleteChildInParent(id)).length;
    return mockDelay({ success, failed: ids.length - success });
  }
  try {
    return await request.post('/dispatched-orders/batch-delete', { ids }) as { success: number; failed: number };
  } catch {
    const results = await Promise.allSettled(ids.map((id) => deleteDispatchedOrder(id)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: ids.length - success };
  }
}

/**
 * 清除子单未读 dirty 标记。
 * 后端最终接口建议：POST /dispatched-orders/:id/dirty/confirm-read { reason }。
 * 当前做兼容空实现：接口未就绪时不阻断详情页，只在前端本地清空提示。
 */
export async function confirmDispatchedDirtyRead(id: string, reason: 'owner_open_detail' | 'confirm_read' = 'confirm_read'): Promise<{ success: boolean }> {
  if (isMockMode) {
    updateChildInParent(id, (c) => {
      c.dirty_fields = [];
      c.dirty_count = 0;
      c.has_unread_dirty = false;
    });
    return mockDelay({ success: true });
  }
  try {
    await request.post(`/dispatched-orders/${id}/dirty/confirm-read`, { reason });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * 主管/admin 退回已完成子单。后端未提供专用接口时回退到通用 return 接口。
 */
export async function returnCompletedDispatchedOrder(id: string, reason: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const updated = updateChildInParent(id, (c) => {
      c.status = 'returned';
      c.return_reason = reason;
      c.returned_fields = [];
      c.completed_at = null;
    });
    return mockDelay(updated || ({} as DispatchedOrderItem));
  }
  try {
    return await request.post(`/dispatched-orders/${id}/return-completed`, { returnReason: reason }) as DispatchedOrderItem;
  } catch {
    return returnDispatchedOrder(id, reason, []);
  }
}

export interface SocialBatchCompleteResult {
  success: boolean;
  processed?: number;
  completed: number;
  skipped?: Array<{ id: string; reason: string }>;
  failed?: Array<{ id: string; reason: string }>;
}

export interface BatchCompleteResult {
  success: boolean;
  completed: number;
  skipped?: Array<{ id: string; reason: string }>;
}

export interface BatchReturnResult {
  success: boolean;
  returned: number;
  skipped?: Array<{ id: string; reason: string }>;
}

export interface DispatchedBatchImportRow {
  orderNo?: string;
  employeeIdCard?: string;
  idCardNo?: string;
  result?: string;
  status?: string;
  returnReason?: string;
  remark?: string;
  fields?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface DispatchedBatchImportResult {
  success: boolean;
  totalRows: number;
  successRows: number;
  failRows: number;
  rows: Array<{ rowNumber: number; success: boolean; id?: string; orderNo?: string; employeeIdCard?: string; action?: string; message: string }>;
}

export async function batchImportDispatchedOrders(payload: {
  moduleCode: string;
  mode: 'status' | 'fields';
  rows: DispatchedBatchImportRow[];
  defaultRemark?: string;
  defaultReturnReason?: string;
  forceAction?: 'complete' | 'return' | 'processing';
}): Promise<DispatchedBatchImportResult> {
  if (isMockMode) {
    return mockDelay({
      success: true,
      totalRows: payload.rows.length,
      successRows: payload.rows.length,
      failRows: 0,
      rows: payload.rows.map((row, index) => ({ rowNumber: index + 2, success: true, orderNo: row.orderNo, employeeIdCard: row.employeeIdCard || row.idCardNo, action: payload.mode, message: 'mock success' })),
    });
  }
  return request.post('/dispatched-orders/batch-import', payload) as Promise<DispatchedBatchImportResult>;
}

export interface BatchUrgeResult {
  success: boolean;
  urged: number;
  skipped: Array<{ id: string; reason: string }>;
}

export async function batchUrgeDispatchedOrders(ids: string[], reason?: string): Promise<BatchUrgeResult> {
  if (isMockMode) {
    return mockDelay({ success: true, urged: ids.length, skipped: [] });
  }
  return request.post('/dispatched-orders/batch-urge', { ids, reason }) as Promise<BatchUrgeResult>;
}

export async function batchReturnDispatchedOrders(ids: string[], returnReason: string, returnedFields?: string[]): Promise<BatchReturnResult> {
  if (isMockMode) {
    let returned = 0;
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (c) => {
        c.status = 'returned';
        c.return_reason = returnReason;
        c.returned_fields = returnedFields || [];
        c.completed_at = null;
      });
      if (updated) returned += 1;
    });
    return mockDelay({ success: true, returned, skipped: [] });
  }
  return request.post('/dispatched-orders/batch-return', {
    ids,
    returnReason,
    returnedFields: returnedFields || [],
  }) as Promise<BatchReturnResult>;
}

export async function batchCompleteDispatchedOrders(
  ids: string[],
  remark?: string,
  extraData?: Record<string, unknown>,
): Promise<BatchCompleteResult> {
  if (isMockMode) {
    let completed = 0;
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (c) => {
        c.status = 'completed';
        c.completed_at = new Date().toISOString();
      });
      if (updated) completed += 1;
    });
    return mockDelay({ success: true, completed, skipped: [] });
  }
  return request.post('/dispatched-orders/batch-complete', {
    ids,
    remark,
    ...(extraData ? { extraData } : {}),
  }) as Promise<BatchCompleteResult>;
}

export async function batchCompleteSocialInsurance(
  ids: string[],
  remark?: string,
  extraData?: Record<string, unknown>,
): Promise<SocialBatchCompleteResult> {
  if (isMockMode) {
    let completed = 0;
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (c) => {
        if (!['social_insurance', 'resignation_social_insurance'].includes(c.module_code)) return;
        c.status = 'completed';
        c.completed_at = new Date().toISOString();
      });
      if (updated && ['social_insurance', 'resignation_social_insurance'].includes(updated.module_code)) completed += 1;
    });
    return mockDelay({ success: true, processed: completed, completed, skipped: [] });
  }
  return request.post('/dispatched-orders/social-insurance/batch-complete', {
    ids,
    remark: remark || '',
    ...(extraData ? { extraData } : {}),
  }) as Promise<SocialBatchCompleteResult>;
}
