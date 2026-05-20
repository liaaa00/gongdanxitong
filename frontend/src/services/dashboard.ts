import request from './request';
import { isMockMode, mockDelay } from './mock';

interface ParentOrderLite {
  id: string;
  order_no: string;
  employee_name?: string;
  customer_name?: string;
  status?: string;
  created_at?: string;
  dispatched_orders?: Array<{
    module_code: string; module_name?: string; status?: string;
    handler_id?: string | null; handler_name?: string | null;
    completed_at?: string | null; dispatched_at?: string | null;
  }>;
}

function readParents(): ParentOrderLite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mock_work_orders_v1');
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as ParentOrderLite[]) : [];
  } catch { return []; }
}

function monthLabel(d: Date): string { return `${d.getMonth() + 1}月`; }

function recentMonths(n: number): Date[] {
  const out: Date[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  return out;
}

function isSameMonth(iso: string | undefined, d: Date): boolean {
  if (!iso) return false;
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
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

const unwrapPayload = (raw: any): any => raw?.data?.data ?? raw?.data ?? raw?.result ?? raw ?? {};
const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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
  const labels: Record<string, string> = {
    data_entry: '数据录入',
    social_insurance: '社保公积金办理',
    onboarding_contact: '入职联系',
    contract: '劳动合同签订',
    renewal_contract: '续签合同',
    benefit: '待遇申报',
    resignation_contact: '离职联系',
    resignation_cert: '离职证明',
    data_entry_resign: '社保停保',
  };
  return labels[moduleCode] || moduleCode || '未命名模块';
}

function normalizeManagerDashboard(raw: any): DashboardManager {
  const data = unwrapPayload(raw);
  if ('total_onboarding' in data || 'by_module' in data) return data as DashboardManager;

  const modules = Array.isArray(data.modules) ? data.modules : [];
  const ratios = data.ratios || {};
  const total = num(ratios.total_submitted ?? ratios.totalSubmitted ?? modules.reduce((sum: number, item: any) => sum + num(item.total), 0));
  const completed = modules.reduce((sum: number, item: any) => sum + num(item.completed), 0);

  return {
    total_onboarding: total,
    completed_onboarding: completed,
    total_this_month: total,
    completed_this_month: completed,
    completion_rate: total === 0 ? 0 : Math.round((completed / total) * 1000) / 10,
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
      if (p.status === 'pending') counters.pending++;
      else if (p.status === 'completed') counters.completed++;
      else if (p.status === 'returned') counters.returned++;
      else counters.processing++;
    }
    const months = recentMonths(5);
    const monthly_trend = months.map((m) => ({
      month: monthLabel(m),
      total: parents.filter((p) => isSameMonth(p.created_at, m)).length,
      completed: parents.filter((p) => isSameMonth(p.created_at, m) && p.status === 'completed').length,
    }));
    const lastMonth = months[months.length - 2];
    const last_month_total = lastMonth ? monthly_trend[monthly_trend.length - 2].total : 0;
    const last_month_completed = lastMonth ? monthly_trend[monthly_trend.length - 2].completed : 0;
    const recent_orders = parents.slice(0, 5).map((p) => ({
      id: p.id, order_no: p.order_no, employee_name: p.employee_name || '',
      status: p.status || '', created_at: p.created_at || new Date().toISOString(),
    }));
    const custMap = new Map<string, number>();
    for (const p of parents) if (p.customer_name) custMap.set(p.customer_name, (custMap.get(p.customer_name) || 0) + 1);
    const top_customers = Array.from(custMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customer_name, count]) => ({ customer_name, count }));
    return mockDelay({
      total_orders: parents.length, pending_orders: counters.pending, processing_orders: counters.processing,
      completed_orders: counters.completed, returned_orders: counters.returned,
      last_month_total, last_month_completed,
      monthly_trend, recent_orders, top_customers,
    });
  }
  const result = await request.get('/dashboard/salesperson', { params }) as any;
  return normalizeSalespersonDashboard(result);
}

export async function getTeamDashboard(moduleCode: string): Promise<DashboardTeam> {
  if (isMockMode) {
    const parents = readParents();
    const subs = parents.flatMap((p) => (p.dispatched_orders || []).filter((d) => d.module_code === moduleCode).map((d) => ({ parent: p, d })));
    const total_pending = subs.filter((x) => x.d.status === 'pending' || !x.d.status).length;
    const total_processing = subs.filter((x) => x.d.status === 'processing' || x.d.status === 'accepted').length;
    const today = new Date().toDateString();
    const thisMonth = new Date();
    const completed_today = subs.filter((x) => x.d.completed_at && new Date(x.d.completed_at).toDateString() === today).length;
    const completed_this_month = subs.filter((x) => x.d.completed_at && isSameMonth(x.d.completed_at, thisMonth)).length;
    const trend: { date: string; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      trend.push({ date: label, completed: subs.filter((x) => x.d.completed_at && new Date(x.d.completed_at).toDateString() === d.toDateString()).length });
    }
    const memberMap = new Map<string, { user_id: string; user_name: string; pending_count: number; processing_count: number; completed_today: number }>();
    for (const x of subs) {
      const uid = x.d.handler_id || 'unassigned';
      const uname = x.d.handler_name || '未分配';
      const cur = memberMap.get(uid) || { user_id: uid, user_name: uname, pending_count: 0, processing_count: 0, completed_today: 0 };
      if (x.d.status === 'pending' || !x.d.status) cur.pending_count++;
      else if (x.d.status === 'processing' || x.d.status === 'accepted') cur.processing_count++;
      if (x.d.completed_at && new Date(x.d.completed_at).toDateString() === today) cur.completed_today++;
      memberMap.set(uid, cur);
    }
    const sample = subs[0]?.d.module_name;
    return mockDelay({
      module_code: moduleCode, module_name: sample || moduleCode,
      total_pending, total_processing, completed_today, completed_this_month,
      avg_processing_hours: 0,
      trend, members: Array.from(memberMap.values()),
    });
  }
  const result = await request.get('/dashboard/team/' + moduleCode) as any;
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
    const completion_rate = total_onboarding === 0 ? 0 : Math.round((completed_onboarding / total_onboarding) * 1000) / 10;
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
        if (d.status === 'completed') cur.completed++;
        else if (d.status === 'processing' || d.status === 'accepted') cur.processing++;
        else cur.pending++;
        modMap.set(d.module_code, cur);
      }
    }
    return mockDelay({
      total_onboarding, completed_onboarding, total_this_month, completed_this_month, completion_rate,
      monthly_trend, by_module: Array.from(modMap.values()), by_salesperson: [], sla_breach_count: 0,
    });
  }
  const result = await request.get('/dashboard/manager') as any;
  return normalizeManagerDashboard(result);
}
