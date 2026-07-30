import request from './request';
import { isMockMode, mockDelay } from './mock';
export type DashboardOrderType = 'onboarding' | 'renewal' | 'resignation' | 'benefit' | 'in_service' | 'out_of_province';
export type DashboardMatrixDimension = 'orderType' | 'node';
export type DashboardAudience = 'business' | 'backend';
export type DashboardScopeMode = 'mine' | 'team';

export interface DashboardCards {
  /** Total accessible open child work orders across all history; not limited by selected month. */
  totalPending: number;
  /** Accessible open child work orders dispatched/created in the selected month. */
  monthPending: number;
  /** Accessible child work orders dispatched/created in the selected month. */
  totalThisMonth: number;
  /** @Deprecated use monthPending for selected-month open count. */
  processing: number;
  completed: number;
  voided: number;
  myMessages: number;
  scope?: string;
}

export interface OrderTypeMatrixRow {
  orderType: DashboardOrderType;
  moduleCode?: string;
  dimension?: DashboardMatrixDimension;
  label: string;
  total: number;
  processing: number;
  completed: number;
  voided: number;
  withdrawn: number;
  completionRate: number;
}

export interface OrderTypeMatrixResult {
  rows: OrderTypeMatrixRow[];
  total?: number;
}

export interface LeaderTrendBucket {
  month: string;
  total: number;
  completed: number;
  rate: number;
}

export interface LeaderTrendResult {
  orderType: DashboardOrderType;
  moduleCode?: string;
  buckets: LeaderTrendBucket[];
  fallbackReason?: 'endpoint_error';
}

const LEADER_TREND_TIMEOUT_MS = 8_000;

interface ParentOrderLite {
  id: string;
  order_no: string;
  employee_name?: string;
  customer_name?: string;
  status?: string;
  order_type?: string;
  orderType?: string;
  created_at?: string;
  submitted_at?: string | null;
  dispatched_orders?: Array<{
    module_code: string;
    module_name?: string;
    status?: string;
    handler_id?: string | null;
    handler_name?: string | null;
    completed_at?: string | null;
    dispatched_at?: string | null;
    created_at?: string | null;
  }>;
}

const ORDER_TYPE_LABELS: Record<DashboardOrderType, string> = {
  onboarding: '入职工单',
  renewal: '续签工单',
  resignation: '离职工单',
  benefit: '待遇申报',
  in_service: '在职管理',
  out_of_province: '浙江自签',
};

const PHASE1_ORDER_TYPES: DashboardOrderType[] = ['onboarding', 'resignation'];

const MODULE_LABELS: Record<string, string> = {
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  contract_signing: '劳动合同新签',
  renewal_contract: '劳动合同续签',
  benefit: '待遇申报',
  benefit_apply: '待遇申报',
  resignation_contact: '离职材料收集',
  resignation_cert: '离职证明',
  in_service_certificate: '证明开具',
  in_service_single_business: '单项业务办理',
  out_of_province_dispatch: '省外增减员',
  data_entry_resign: '减员报岗录入',
  social_insurance_resign: '社保公积金减员',
};

function readParents(): ParentOrderLite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mock_work_orders_v1');
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as ParentOrderLite[]) : [];
  } catch {
    return [];
  }
}

function monthLabel(d: Date): string {
  return `${d.getMonth() + 1}月`;
}

function recentMonths(n: number, endMonth?: string): Date[] {
  const out: Date[] = [];
  const end = monthValueToDate(normalizeDashboardMonth(endMonth));
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(new Date(end.getFullYear(), end.getMonth() - i, 1));
  }
  return out;
}

function isSameMonth(iso: string | null | undefined, d: Date): boolean {
  if (!iso) return false;
  const x = new Date(iso);
  if (Number.isNaN(x.getTime())) return false;
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
}

function currentMonthValue(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeDashboardMonth(month?: string): string {
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentMonthValue();
}

function monthValueToDate(month: string): Date {
  return new Date(`${month}-01T00:00:00`);
}

function isCurrentMonthValue(iso: string | null | undefined, month = currentMonthValue()): boolean {
  if (!iso) return false;
  return String(iso).slice(0, 7) === month || isSameMonth(iso, new Date(`${month}-01T00:00:00`));
}

function normalizeStatus(status: string | undefined): string {
  return String(status || '').toLowerCase();
}

function isWithdrawStatus(status: string | undefined): boolean {
  return ['withdraw_pending', 'withdrawn'].includes(normalizeStatus(status));
}

function isVoidStatus(status: string | undefined): boolean {
  return ['void', 'voided', 'cancelled', 'canceled'].includes(normalizeStatus(status));
}

function isOpenStatus(status: string | undefined): boolean {
  return ['pending', 'processing', 'accepted', 'in_progress', 'returned', 'modify_pending', 'withdraw_pending', 'withdrawn', 'void_pending'].includes(normalizeStatus(status));
}

// Dashboard production fallback must not call /dispatched-orders during app initialization.

const unwrapPayload = (raw: any): any => raw?.data?.data ?? raw?.data ?? raw?.result ?? raw ?? {};

const num = (value: unknown, fallback = 0): number => {
  if (typeof value === 'string') {
    const n = Number(value.replace('%', ''));
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function normalizePercent(value: unknown, fallback = 0): number {
  const n = num(value, fallback);
  const percent = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10;
}

function calculateCompletionRate(completed: unknown, total: unknown, voided: unknown = 0): number {
  const denominator = Math.max(0, num(total) - Math.max(0, num(voided)));
  return denominator === 0 ? 0 : normalizePercent((Math.max(0, num(completed)) / denominator) * 100);
}

function normalizeOrderType(value: unknown): DashboardOrderType {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('out_of_province')) return 'out_of_province';
  if (raw === 'in_service' || raw.includes('in_service_')) return 'in_service';
  if (raw.includes('renewal')) return 'renewal';
  if (raw.includes('resignation') || raw.includes('resign')) return 'resignation';
  if (raw.includes('benefit')) return 'benefit';
  return 'onboarding';
}

function getParentOrderType(order: ParentOrderLite): DashboardOrderType {
  return normalizeOrderType(order.order_type ?? order.orderType);
}

function isProcessingStatus(status: string | undefined): boolean {
  return ['processing', 'accepted', 'in_progress'].includes(String(status || '').toLowerCase());
}

function isCompletedStatus(status: string | undefined): boolean {
  return String(status || '').toLowerCase() === 'completed';
}

function buildMatrixRows(parents: ParentOrderLite[], dimension: DashboardMatrixDimension): OrderTypeMatrixRow[] {
  if (dimension === 'node') {
    const map = new Map<string, { total: number; processing: number; completed: number; voided: number; withdrawn: number }>();
    parents.forEach((parent) => {
      (parent.dispatched_orders || []).forEach((child) => {
        const code = child.module_code || 'unknown';
        const current = map.get(code) || { total: 0, processing: 0, completed: 0, voided: 0, withdrawn: 0 };
        current.total += 1;
        if (isWithdrawStatus(child.status)) current.withdrawn += 1;
        if (isVoidStatus(child.status)) current.voided += 1;
        else if (isCompletedStatus(child.status)) current.completed += 1;
        else if (isOpenStatus(child.status)) current.processing += 1;
        map.set(code, current);
      });
    });
    return Array.from(map.entries()).map(([moduleCode, item]) => ({
      orderType: 'onboarding',
      moduleCode,
      dimension,
      label: moduleName(moduleCode),
      total: item.total,
      processing: item.processing,
      completed: item.completed,
      voided: item.voided,
      withdrawn: item.withdrawn,
      completionRate: calculateCompletionRate(item.completed, item.total, item.voided),
    }));
  }

  return PHASE1_ORDER_TYPES.map((orderType) => buildOrderTypeRow(
    orderType,
    parents
      .filter((p) => getParentOrderType(p) === orderType)
      .flatMap((item) => item.dispatched_orders?.length ? item.dispatched_orders.map((child) => child.status) : [item.status]),
    dimension,
  ));
}

function buildOrderTypeRow(orderType: DashboardOrderType, statuses: Array<string | undefined>, dimension: DashboardMatrixDimension): OrderTypeMatrixRow {
  const total = statuses.length;
  const completed = statuses.filter(isCompletedStatus).length;
  const voided = statuses.filter(isVoidStatus).length;
  const withdrawn = statuses.filter(isWithdrawStatus).length;
  const processing = statuses.filter(isOpenStatus).length;
  return {
    orderType,
    dimension,
    label: ORDER_TYPE_LABELS[orderType],
    total,
    processing,
    completed,
    voided,
    withdrawn,
    completionRate: calculateCompletionRate(completed, total, voided),
  };
}

function emptyMatrixResult(): OrderTypeMatrixResult {
  return { rows: [], total: 0 };
}

function normalizeDashboardCards(raw: unknown): DashboardCards {
  const data = unwrapPayload(raw);
  const source = data.cards || data;
  const monthPending = num(source.monthPending ?? source.month_pending ?? source.processing ?? source.processing_orders ?? source.processingOrders);
  const totalPending = num(source.totalPending ?? source.total_pending ?? source.allPending ?? source.all_pending ?? monthPending);
  return {
    totalPending,
    monthPending,
    totalThisMonth: num(source.totalThisMonth ?? source.total_this_month ?? source.monthTotal ?? source.month_total ?? source.total),
    processing: monthPending,
    completed: num(source.completed ?? source.completed_orders ?? source.completedOrders),
    voided: num(source.voided ?? source.void_orders ?? source.voidOrders ?? source.cancelled ?? source.canceled),
    myMessages: num(source.myMessages ?? source.my_messages ?? source.unreadMessages ?? source.unread_messages ?? source.unread ?? source.notificationCount),
    scope: typeof source.scope === 'string' ? source.scope : undefined,
  };
}

function normalizeOrderTypeMatrix(raw: unknown, fallbackDimension: DashboardMatrixDimension): OrderTypeMatrixResult {
  const data = unwrapPayload(raw);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.list)
        ? data.list
        : [];

  const rows = list.map((item: any) => {
    const orderType = normalizeOrderType(item.orderType ?? item.order_type ?? item.type ?? item.biz_type);
    const moduleCode = item.moduleCode ?? item.module_code ?? item.nodeCode ?? item.node_code;
    const dimension = (item.dimension ?? fallbackDimension) as DashboardMatrixDimension;
    const total = num(item.total ?? item.total_count ?? item.count);
    const completed = num(item.completed ?? item.completed_count);
    const processing = num(item.processing ?? item.processing_count);
    const voided = num(item.voided ?? item.void_count ?? item.voidCount ?? item.cancelled ?? item.canceled);
    const withdrawn = num(item.withdrawn ?? item.withdrawn_count ?? item.withdrawCount ?? item.withdraw_count);
    const rateValue = item.completionRate ?? item.completion_rate ?? item.rate;
    return {
      orderType,
      moduleCode: moduleCode ? String(moduleCode) : undefined,
      dimension,
      label: String(item.label ?? item.moduleName ?? item.module_name ?? item.nodeName ?? item.node_name ?? (moduleCode ? moduleName(String(moduleCode)) : ORDER_TYPE_LABELS[orderType])),
      total,
      processing,
      completed,
      voided,
      withdrawn,
      completionRate: rateValue === undefined || rateValue === null
        ? calculateCompletionRate(completed, total, voided)
        : normalizePercent(rateValue),
    };
  });

  return { rows, total: num(data.total, rows.length) };
}

function normalizeLeaderTrend(raw: unknown, fallbackOrderType: DashboardOrderType, fallbackModuleCode?: string): LeaderTrendResult {
  const data = unwrapPayload(raw);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.buckets)
      ? data.buckets
      : Array.isArray(data.trend)
        ? data.trend
        : [];

  return {
    orderType: normalizeOrderType(data.orderType ?? data.order_type ?? fallbackOrderType),
    moduleCode: String(data.moduleCode ?? data.module_code ?? fallbackModuleCode ?? '') || undefined,
    buckets: list.map((item: any) => {
      const total = num(item.total ?? item.total_count ?? item.submitted ?? item.created);
      const completed = num(item.completed ?? item.completed_count);
      const voided = num(item.voided ?? item.void_count ?? item.voidCount ?? item.cancelled ?? item.canceled);
      const rateValue = item.rate ?? item.completionRate ?? item.completion_rate;
      return {
        month: String(item.month ?? item.bucket ?? item.label ?? ''),
        total,
        completed,
        rate: rateValue === undefined || rateValue === null
          ? calculateCompletionRate(completed, total, voided)
          : normalizePercent(rateValue),
      };
    }),
  };
}

export async function getDashboardCards(audience: DashboardAudience = 'business', scope?: DashboardScopeMode, month?: string): Promise<DashboardCards> {
  const selectedMonth = normalizeDashboardMonth(month);
  if (isMockMode) {
    const parents = readParents();
    const allChildren = parents.flatMap((p) => p.dispatched_orders || []);
    const allSource = allChildren.length > 0 ? allChildren : parents;
    const monthChildren = allChildren.filter((item) => isCurrentMonthValue(item.dispatched_at ?? item.created_at, selectedMonth));
    const monthOrders = parents.filter((p) => isCurrentMonthValue(p.submitted_at ?? p.created_at, selectedMonth));
    const source = allChildren.length > 0 ? monthChildren : monthOrders;
    const monthPending = source.filter((item) => isOpenStatus(item.status)).length;
    const totalPending = allSource.filter((item) => isOpenStatus(item.status)).length;
    return mockDelay({
      totalPending,
      monthPending,
      totalThisMonth: source.length,
      processing: monthPending,
      completed: source.filter((item) => isCompletedStatus(item.status)).length,
      voided: source.filter((item) => isVoidStatus(item.status)).length,
      myMessages: 0,
      scope: audience === 'backend' ? '本月办理子工单' : '本月子工单数据',
    });
  }

  const modernParams = { audience, month: selectedMonth, ...(scope ? { scope } : {}) };
  try {
    const result = await request.get('/dashboard/cards', {
      params: modernParams,
      silentError: true,
    } as any);
    return normalizeDashboardCards(result);
  } catch (error) {
    // 兼容仍在运行的旧后端：旧 DTO 不认识 audience/month 时会被白名单校验拦截。
    // 不能静默返回空卡片，否则业务员/管理员会误以为没有数据。
    console.warn('[dashboard] cards endpoint failed, retrying legacy params', error);
    const legacyResult = await request.get('/dashboard/cards', {
      params: scope ? { scope } : {},
      silentError: true,
    } as any);
    return normalizeDashboardCards(legacyResult);
  }
}

export async function getOrderTypeMatrix(params: { dimension?: DashboardMatrixDimension; audience?: DashboardAudience; scope?: DashboardScopeMode; month?: string } = {}): Promise<OrderTypeMatrixResult> {
  const dimension = params.dimension || 'node';
  const selectedMonth = normalizeDashboardMonth(params.month);
  if (isMockMode) {
    const rows = buildMatrixRows(readParents().filter((p) => isCurrentMonthValue(p.created_at, selectedMonth)), dimension);
    return mockDelay({ rows, total: rows.length });
  }

  const modernParams = { dimension, ...(params.audience ? { audience: params.audience } : {}), month: selectedMonth, ...(params.scope ? { scope: params.scope } : {}) };
  try {
    const result = await request.get('/dashboard/order-type-matrix', { params: modernParams, silentError: true } as any);
    return normalizeOrderTypeMatrix(result, dimension);
  } catch (error) {
    console.warn('[dashboard] matrix endpoint failed, retrying legacy params', error);
    try {
      const legacyResult = await request.get('/dashboard/order-type-matrix', { params: { dimension, ...(params.scope ? { scope: params.scope } : {}) }, silentError: true } as any);
      return normalizeOrderTypeMatrix(legacyResult, dimension);
    } catch {
      return emptyMatrixResult();
    }
  }
}

export async function getLeaderTrend(orderType: DashboardOrderType, moduleCode?: string, scope?: DashboardScopeMode, signal?: AbortSignal, month?: string): Promise<LeaderTrendResult> {
  const selectedMonth = normalizeDashboardMonth(month);
  if (isMockMode) {
    const parents = readParents().filter((p) => getParentOrderType(p) === orderType);
    const buckets = recentMonths(12, selectedMonth).map((m) => {
      const list = parents.filter((p) => isSameMonth(p.created_at, m));
      const children = list.flatMap((p) => p.dispatched_orders || []).filter((d) => !moduleCode || d.module_code === moduleCode);
      const fallback = moduleCode ? [] : list;
      const source = children.length > 0 ? children : fallback;
      const total = source.length;
      const completed = source.filter((item) => isCompletedStatus(item.status)).length;
      const voided = source.filter((item) => isVoidStatus(item.status)).length;
      return {
        month: monthLabel(m),
        total,
        completed,
        rate: calculateCompletionRate(completed, total, voided),
      };
    });
    return mockDelay({ orderType, moduleCode, buckets });
  }

  try {
    const result = await request.get('/dashboard/leader-trend', {
      params: { orderType, month: selectedMonth, ...(moduleCode ? { moduleCode } : {}), ...(scope ? { scope } : {}) },
      silentError: true,
      timeout: LEADER_TREND_TIMEOUT_MS,
      signal,
    } as any);
    return normalizeLeaderTrend(result, orderType, moduleCode);
  } catch (err) {
    if ((err as { code?: string })?.code !== 'ERR_CANCELED') {
      console.debug('[dashboard] leader-trend unavailable, render zero buckets');
    }
    return {
      orderType,
      moduleCode,
      fallbackReason: 'endpoint_error',
      buckets: recentMonths(12, selectedMonth).map((m) => ({
        month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
        total: 0,
        completed: 0,
        rate: 0,
      })),
    };
  }
}

export interface DashboardSalesperson {
  total_orders: number;
  pending_orders: number;
  processing_orders: number;
  completed_orders: number;
  returned_orders: number;
  last_month_total: number;
  last_month_completed: number;
  monthly_trend: { month: string; total: number; completed: number }[];
  recent_orders: { id: string; order_no: string; employee_name: string; status: string; created_at: string }[];
  top_customers: { customer_name: string; count: number }[];
}

export interface DashboardTeam {
  module_code: string;
  module_name: string;
  total_pending: number;
  total_processing: number;
  completed_today: number;
  completed_this_month: number;
  avg_processing_hours: number;
  trend: { date: string; completed: number }[];
  members: { user_id: string; user_name: string; pending_count: number; processing_count: number; completed_today: number }[];
}

export interface DashboardManager {
  total_onboarding: number;
  completed_onboarding: number;
  total_this_month: number;
  completed_this_month: number;
  completion_rate: number;
  monthly_trend: { month: string; total: number; completed: number }[];
  by_module: { module_code: string; module_name: string; pending: number; processing: number; completed: number }[];
  by_salesperson: { user_id: string; user_name: string; total: number; completed: number; processing: number }[];
  sla_breach_count: number;
}

function normalizeSalespersonDashboard(raw: any): DashboardSalesperson {
  const data = unwrapPayload(raw);
  if ('total_orders' in data || 'monthly_trend' in data) return data as DashboardSalesperson;

  const current = data.current || {};
  const previous = data.previous || {};
  const submitted = num(current.submitted ?? current.created);
  const completed = num(current.completed);
  const returned = num(current.returned);
  const withdrawn = num(current.withdrawn);
  const processing = Math.max(submitted - completed - returned - withdrawn, 0);
  const trend = Array.isArray(data.trend) ? data.trend : [];

  return {
    total_orders: submitted,
    pending_orders: num(current.pending),
    processing_orders: processing,
    completed_orders: completed,
    returned_orders: returned,
    last_month_total: num(previous.submitted ?? previous.created),
    last_month_completed: num(previous.completed),
    monthly_trend: trend.map((item: any) => ({
      month: String(item.month ?? item.bucket ?? ''),
      total: num(item.total ?? item.submitted ?? item.created),
      completed: num(item.completed),
    })),
    recent_orders: Array.isArray(data.recent_orders) ? data.recent_orders : [],
    top_customers: Array.isArray(data.top_customers) ? data.top_customers : [],
  };
}

function normalizeTeamDashboard(raw: any, moduleCode: string): DashboardTeam {
  const data = unwrapPayload(raw);
  if ('total_pending' in data || 'module_code' in data) return data as DashboardTeam;

  const counts = data.counts || {};
  const members = Array.isArray(data.members) ? data.members : [];
  const trend = Array.isArray(data.trend) ? data.trend : [];

  return {
    module_code: data.module_code ?? data.moduleCode ?? moduleCode,
    module_name: data.module_name ?? data.moduleName ?? data.moduleCode ?? moduleCode,
    total_pending: num(counts.pending),
    total_processing: num(counts.processing),
    completed_today: num(data.completed_today ?? data.completedToday),
    completed_this_month: num(counts.completed ?? data.completed_this_month ?? data.completedThisMonth),
    avg_processing_hours: num(data.avg_processing_hours ?? data.avgProcessingHours),
    trend: trend.map((item: any) => ({
      date: String(item.date ?? item.bucket ?? ''),
      completed: num(item.completed),
    })),
    members: members.map((item: any) => ({
      user_id: String(item.user_id ?? item.userId ?? ''),
      user_name: String(item.user_name ?? item.userName ?? item.real_name ?? item.realName ?? '未命名'),
      pending_count: num(item.pending_count ?? item.pendingCount ?? item.in_flight ?? item.inFlight),
      processing_count: num(item.processing_count ?? item.processingCount),
      completed_today: num(item.completed_today ?? item.completedToday),
    })),
  };
}

function moduleName(moduleCode: string): string {
  return MODULE_LABELS[moduleCode] || moduleCode || '未命名模块';
}

function normalizeManagerDashboard(raw: any): DashboardManager {
  const data = unwrapPayload(raw);
  if ('total_onboarding' in data || 'by_module' in data) return data as DashboardManager;

  const modules = Array.isArray(data.modules) ? data.modules : [];
  const ratios = data.ratios || {};
  const total = num(ratios.total_submitted ?? ratios.totalSubmitted ?? modules.reduce((sum: number, item: any) => sum + num(item.total), 0));
  const completed = modules.reduce((sum: number, item: any) => sum + num(item.completed), 0);
  const voided = num(ratios.voided ?? ratios.voidedOrders ?? ratios.void_count ?? modules.reduce((sum: number, item: any) => sum + num(item.voided ?? item.void_count), 0));

  return {
    total_onboarding: total,
    completed_onboarding: completed,
    total_this_month: total,
    completed_this_month: completed,
    completion_rate: calculateCompletionRate(completed, total, voided),
    monthly_trend: (Array.isArray(data.trend) ? data.trend : []).map((item: any) => ({
      month: String(item.month ?? item.bucket ?? ''),
      total: num(item.total ?? item.submitted),
      completed: num(item.completed),
    })),
    by_module: modules.map((item: any) => {
      const code = String(item.module_code ?? item.moduleCode ?? '');
      return {
        module_code: code,
        module_name: String(item.module_name ?? item.moduleName ?? moduleName(code)),
        pending: num(item.pending),
        processing: num(item.processing),
        completed: num(item.completed),
      };
    }),
    by_salesperson: Array.isArray(data.by_salesperson) ? data.by_salesperson : [],
    sla_breach_count: num(data.sla_breach_count ?? data.slaBreachCount),
  };
}

export async function getSalespersonDashboard(params?: { period?: string }): Promise<DashboardSalesperson> {
  if (isMockMode) {
    const parents = readParents();
    const counters = { pending: 0, processing: 0, completed: 0, returned: 0 };
    for (const p of parents) {
      if (p.status === 'pending') counters.pending += 1;
      else if (p.status === 'completed') counters.completed += 1;
      else if (p.status === 'returned') counters.returned += 1;
      else counters.processing += 1;
    }
    const months = recentMonths(5);
    const monthly_trend = months.map((m) => ({
      month: monthLabel(m),
      total: parents.filter((p) => isSameMonth(p.created_at, m)).length,
      completed: parents.filter((p) => isSameMonth(p.created_at, m) && p.status === 'completed').length,
    }));
    const last_month_total = monthly_trend[monthly_trend.length - 2]?.total || 0;
    const last_month_completed = monthly_trend[monthly_trend.length - 2]?.completed || 0;
    const recent_orders = parents.slice(0, 5).map((p) => ({
      id: p.id,
      order_no: p.order_no,
      employee_name: p.employee_name || '',
      status: p.status || '',
      created_at: p.created_at || new Date().toISOString(),
    }));
    const custMap = new Map<string, number>();
    for (const p of parents) {
      if (p.customer_name) custMap.set(p.customer_name, (custMap.get(p.customer_name) || 0) + 1);
    }
    const top_customers = Array.from(custMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([customer_name, count]) => ({ customer_name, count }));
    return mockDelay({
      total_orders: parents.length,
      pending_orders: counters.pending,
      processing_orders: counters.processing,
      completed_orders: counters.completed,
      returned_orders: counters.returned,
      last_month_total,
      last_month_completed,
      monthly_trend,
      recent_orders,
      top_customers,
    });
  }
  const result = await request.get('/dashboard/salesperson', { params });
  return normalizeSalespersonDashboard(result);
}

export async function getTeamDashboard(moduleCode: string): Promise<DashboardTeam> {
  if (isMockMode) {
    const parents = readParents();
    const subs = parents.flatMap((p) => (p.dispatched_orders || [])
      .filter((d) => d.module_code === moduleCode)
      .map((d) => ({ parent: p, d })));
    const total_pending = subs.filter((x) => x.d.status === 'pending' || !x.d.status).length;
    const total_processing = subs.filter((x) => isProcessingStatus(x.d.status)).length;
    const today = new Date().toDateString();
    const thisMonth = new Date();
    const completed_today = subs.filter((x) => x.d.completed_at && new Date(x.d.completed_at).toDateString() === today).length;
    const completed_this_month = subs.filter((x) => x.d.completed_at && isSameMonth(x.d.completed_at, thisMonth)).length;
    const trend: { date: string; completed: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      trend.push({
        date: label,
        completed: subs.filter((x) => x.d.completed_at && new Date(x.d.completed_at).toDateString() === d.toDateString()).length,
      });
    }
    const memberMap = new Map<string, { user_id: string; user_name: string; pending_count: number; processing_count: number; completed_today: number }>();
    for (const x of subs) {
      const uid = x.d.handler_id || 'unassigned';
      const uname = x.d.handler_name || '未分配';
      const cur = memberMap.get(uid) || { user_id: uid, user_name: uname, pending_count: 0, processing_count: 0, completed_today: 0 };
      if (x.d.status === 'pending' || !x.d.status) cur.pending_count += 1;
      else if (isProcessingStatus(x.d.status)) cur.processing_count += 1;
      if (x.d.completed_at && new Date(x.d.completed_at).toDateString() === today) cur.completed_today += 1;
      memberMap.set(uid, cur);
    }
    const sample = subs[0]?.d.module_name;
    return mockDelay({
      module_code: moduleCode,
      module_name: sample || moduleCode,
      total_pending,
      total_processing,
      completed_today,
      completed_this_month,
      avg_processing_hours: 0,
      trend,
      members: Array.from(memberMap.values()),
    });
  }
  const result = await request.get('/dashboard/team/' + moduleCode);
  return normalizeTeamDashboard(result, moduleCode);
}

export async function getManagerDashboard(): Promise<DashboardManager> {
  if (isMockMode) {
    const parents = readParents();
    const total_onboarding = parents.length;
    const completed_onboarding = parents.filter((p) => p.status === 'completed').length;
    const thisMonth = new Date();
    const total_this_month = parents.filter((p) => isSameMonth(p.created_at, thisMonth)).length;
    const completed_this_month = parents.filter((p) => isSameMonth(p.created_at, thisMonth) && p.status === 'completed').length;
    const voided_onboarding = parents.filter((p) => isVoidStatus(p.status)).length;
    const completion_rate = calculateCompletionRate(completed_onboarding, total_onboarding, voided_onboarding);
    const months = recentMonths(5);
    const monthly_trend = months.map((m) => ({
      month: monthLabel(m),
      total: parents.filter((p) => isSameMonth(p.created_at, m)).length,
      completed: parents.filter((p) => isSameMonth(p.created_at, m) && p.status === 'completed').length,
    }));
    const modMap = new Map<string, { module_code: string; module_name: string; pending: number; processing: number; completed: number }>();
    for (const p of parents) {
      for (const d of p.dispatched_orders || []) {
        const cur = modMap.get(d.module_code) || { module_code: d.module_code, module_name: d.module_name || d.module_code, pending: 0, processing: 0, completed: 0 };
        if (d.status === 'completed') cur.completed += 1;
        else if (isProcessingStatus(d.status)) cur.processing += 1;
        else cur.pending += 1;
        modMap.set(d.module_code, cur);
      }
    }
    return mockDelay({
      total_onboarding,
      completed_onboarding,
      total_this_month,
      completed_this_month,
      completion_rate,
      monthly_trend,
      by_module: Array.from(modMap.values()),
      by_salesperson: [],
      sla_breach_count: 0,
    });
  }
  const result = await request.get('/dashboard/manager');
  return normalizeManagerDashboard(result);
}
