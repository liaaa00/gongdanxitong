import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';
import { addMockNotification } from './notifications';
import { reloadMockWorkOrders } from './workOrders';

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
  employee_name: string;
  customer_name: string;
  visible_fields: string[];
  return_reason: string | null;
  returned_fields?: string[];
  dispatched_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  extra_data?: Record<string, unknown>;
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
  created_at: string;
}

const MODULE_META: Record<string, { name: string; visible_fields: string[]; supplementable_fields: string[] }> = {
  data_entry: {
    name: '数据录入',
    visible_fields: [
      'customer_name', 'customer_code', 'outsource_type', 'position',
      'employee_name', 'id_card_no', 'gender',
      'birth_date', 'age', 'household_type', 'ethnicity',
      'mobile', 'email', 'current_address', 'household_address', 'postal_code',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'bank_name', 'bank_account', 'remark',
      'business_mode', 'need_company_payroll', 'pay_location',
      'social_urge', 'special_remark', 'data_entry_feedback',
    ],
    supplementable_fields: ['bank_name', 'bank_account', 'pay_location'],
  },
  contract: {
    name: '劳动合同签订',
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
      'need_onboarding_contact', 'onboarding_feedback',
      'social_urge', 'special_remark',
    ],
    supplementable_fields: ['mobile', 'email'],
  },
  social_insurance: {
    name: '社保公积金办理',
    visible_fields: [
      'customer_name', 'customer_code', 'employee_name', 'id_card_no', 'mobile',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'business_mode', 'employee_type', 'social_urge', 'special_remark', 'social_insurance_feedback',
    ],
    supplementable_fields: ['social_location', 'start_month', 'social_base', 'fund_base'],
  },
  renewal_contract: { name: '续签合同', visible_fields: [], supplementable_fields: [] },
  resignation_contact: { name: '离职联系', visible_fields: [], supplementable_fields: [] },
  resignation_cert: { name: '离职证明', visible_fields: [], supplementable_fields: [] },
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
  customer_name: string;
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
  const visibleFields = normalizeStringArray(row.visible_fields ?? row.visibleFields);
  const supplementableFields = normalizeStringArray(row.supplementable_fields ?? row.supplementableFields);
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
    employee_name: String(row.employee_name ?? row.employeeName ?? parent.employee_name ?? parent.employeeName ?? extraData?.employee_name ?? ''),
    customer_name: String(row.customer_name ?? row.customerName ?? parent.customer_name ?? parent.customerName ?? extraData?.customer_name ?? ''),
    visible_fields: visibleFields.length > 0 ? visibleFields : meta.visible_fields,
    return_reason: (row.return_reason ?? row.returnReason ?? null) as string | null,
    returned_fields: normalizeStringArray(row.returned_fields ?? row.returnedFields),
    dispatched_at: (row.dispatched_at ?? row.dispatchedAt ?? null) as string | null,
    accepted_at: (row.accepted_at ?? row.acceptedAt ?? null) as string | null,
    completed_at: (row.completed_at ?? row.completedAt ?? null) as string | null,
    extra_data: extraData,
    supplementable_fields: supplementableFields.length > 0 ? supplementableFields : meta.supplementable_fields,
    dirty_fields: (row.dirty_fields ?? row.dirtyFields ?? []) as DirtyFieldMark[],
    dirty_count: (row.dirty_count ?? row.dirtyCount) as number | undefined,
    has_unread_dirty: (row.has_unread_dirty ?? row.hasUnreadDirty) as boolean | undefined,
    action_permissions: (row.action_permissions ?? row.actionPermissions) as Record<string, boolean> | undefined,
    is_module_supervisor: (row.is_module_supervisor ?? row.isModuleSupervisor) as boolean | undefined,
    team_code: (row.team_code ?? row.teamCode ?? row.department_code ?? row.departmentCode ?? null) as string | null,
    team_name: (row.team_name ?? row.teamName ?? row.department_name ?? row.departmentName ?? null) as string | null,
    node_type: (row.node_type ?? row.nodeType ?? moduleCode ?? null) as string | null,
    due_at: (row.due_at ?? row.dueAt ?? null) as string | null,
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
        employee_name: p.employee_name,
        customer_name: p.customer_name,
        visible_fields: meta.visible_fields,
        return_reason: d.return_reason ?? null,
        returned_fields: d.returned_fields,
        dispatched_at: d.dispatched_at,
        accepted_at: d.accepted_at,
        completed_at: d.completed_at,
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

export async function getDispatchedOrders(params: PageParams & { module_code?: string; moduleCode?: string; handlerId?: string; handler_id?: string; onlyPool?: boolean; onlyUnclaimed?: boolean }): Promise<PageResult<DispatchedOrderItem>> {
  if (isMockMode) {
    let list = flattenDispatched();
    if (params.status) list = list.filter((d) => d.status === params.status);
    if (params.module_code) list = list.filter((d) => d.module_code === params.module_code);
    const handler = String(params.handlerId ?? params.handler_id ?? '');
    if (handler && handler !== 'current') list = list.filter((d) => d.handler_id === handler);
    if (params.keyword) {
      const kw = String(params.keyword).toLowerCase();
      list = list.filter((d) => d.order_no.toLowerCase().includes(kw) || d.employee_name.toLowerCase().includes(kw));
    }
    return mockDelay({ list, page: Number(params.page) || 1, pageSize: Number(params.pageSize) || 20, total: list.length, totalPages: 1, success: true });
  }
  const raw = await request.get('/dispatched-orders', { params });
  return normalizePageResult(raw);
}

export async function getDispatchedOrder(id: string): Promise<DispatchedOrderItem> {
  if (isMockMode) {
    const all = flattenDispatched();
    const found = all.find((d) => d.id === id);
    if (!found) {
      return mockDelay({
        id, parent_order_id: '', order_no: '', module_code: 'data_entry', module_name: '数据录入',
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

export async function exportDispatchedOrder(id: string, templateId?: string): Promise<Blob> {
  if (isMockMode) return mockDelay(new Blob(['mock export data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  // 后端 ExportDispatchedOrderDto 要求 templateId (camelCase, UUID)
  const body: Record<string, unknown> = {};
  if (templateId) body.templateId = templateId;
  return request.post(`/dispatched-orders/${id}/export`, body, { responseType: 'blob' }) as Promise<Blob>;
}

export async function batchExportDispatchedOrders(ids: string[], templateId?: string): Promise<Blob> {
  if (isMockMode) return mockDelay(new Blob(['mock batch export'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return request.post('/dispatched-orders/batch-export', { ids, template_id: templateId }, { responseType: 'blob' }) as Promise<Blob>;
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
  completed: number;
  failed?: Array<{ id: string; reason: string }>;
}

export interface BatchCompleteResult {
  success: boolean;
  completed: number;
  skipped?: Array<{ id: string; reason: string }>;
}

export async function batchCompleteDispatchedOrders(
  ids: string[],
  remark: string,
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

export async function batchCompleteSocialInsurance(ids: string[], remark: string): Promise<SocialBatchCompleteResult> {
  if (isMockMode) {
    let completed = 0;
    ids.forEach((id) => {
      const updated = updateChildInParent(id, (c) => {
        if (c.module_code !== 'social_insurance') return;
        c.status = 'completed';
        c.completed_at = new Date().toISOString();
      });
      if (updated?.module_code === 'social_insurance') completed += 1;
    });
    return mockDelay({ success: true, completed, failed: [] });
  }
  return request.post('/dispatched-orders/social-insurance/batch-complete', {
    ids,
    remark,
  }) as Promise<SocialBatchCompleteResult>;
}
