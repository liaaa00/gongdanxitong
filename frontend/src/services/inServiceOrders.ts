import request from './request';
import { isMockMode, mockDelay } from './mock';
import type { DispatchedOrderExportResult } from './dispatchedOrders';
import {
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_STATUSES,
  type InServiceBusinessType,
  type InServiceHandleChannel,
  type InServiceOrderKind,
  type InServiceOrderStatus,
  type InServiceProcessType,
  type InServiceProvince,
  type InServiceRequirementType,
} from '@/constants/inService';

export interface InServiceOrderPayload {
  customerId: string;
  departmentId?: string;
  orderKind?: InServiceOrderKind;
  businessScope?: 'beilun' | 'out_of_province';
  employeeName?: string | null;
  idCardNo?: string | null;
  extraData?: Record<string, any>;
  expectedCompletionDate?: string | null;
  businessReason?: string | null;
  businessType?: InServiceBusinessType | null;
  processType?: InServiceProcessType | null;
  requirementType?: InServiceRequirementType | null;
  province?: InServiceProvince | null;
  city?: string | null;
  district?: string | null;
  businessDescription?: string | null;
  serviceFee?: number | null;
  attachments?: string[];
}

export interface InServiceMaterialChangeRequest {
  requestedBy: string;
  requestedAt: string;
  reason: string | null;
  changes: Partial<InServiceOrderPayload>;
}

export interface InServiceTransferRecord {
  fromHandlerId: string | null;
  toHandlerId: string;
  operatorId: string;
  reason: string | null;
  transferredAt: string;
}

export interface InServiceOrderField {
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  value: unknown;
  permission: 'visible' | 'hidden' | 'readonly' | 'masked' | string;
  supplementable?: boolean;
  dropdownOptions?: Array<{ label: string; value: string }>;
  validation?: { required: boolean; regex?: string; regexMsg?: string };
}

export interface InServiceOrder extends InServiceOrderPayload {
  departmentId: string;
  id: string;
  orderNo: string;
  orderType: 'in_service';
  orderKind: InServiceOrderKind;
  businessScope: 'beilun' | 'out_of_province';
  employeeName: string | null;
  idCardNo: string | null;
  extraData: Record<string, any>;
  status: InServiceOrderStatus;
  customerName?: string | null;
  customerCode?: string | null;
  departmentName?: string | null;
  handleChannel: InServiceHandleChannel;
  handlerId: string | null;
  handlerName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  pendingReturnStatus: InServiceOrderStatus | null;
  transferHistory: InServiceTransferRecord[];
  approvedBy: string | null;
  rejectedBy: string | null;
  closedBy: string | null;
  rejectionReason: string | null;
  pendingInfoReason: string | null;
  completionRemark: string | null;
  closeReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  dispatchedAt: string | null;
  acceptedAt: string | null;
  confirmedAt: string | null;
  processingAt: string | null;
  pendingInfoAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  fields?: InServiceOrderField[];
  visibleFields?: string[];
  readonlyFields?: string[];
  _fieldPermissions?: Record<string, string>;
  _detailTemplateFieldCodes?: string[];
}

export interface InServiceOrderListQuery {
  page?: number;
  pageSize?: number;
  customerId?: string;
  departmentId?: string;
  handlerId?: string;
  onlyUnassigned?: boolean;
  orderKind?: InServiceOrderKind;
  businessScope?: 'beilun' | 'out_of_province';
  businessType?: InServiceBusinessType;
  processType?: InServiceProcessType;
  requirementType?: InServiceRequirementType;
  status?: InServiceOrderStatus;
  province?: InServiceProvince;
  keyword?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface InServiceOrderListResult {
  items: InServiceOrder[];
  total: number;
  page: number;
  pageSize: number;
}

type RawRecord = Record<string, any>;

const IN_SERVICE_UPDATE_FIELDS = [
  'customerId',
  'departmentId',
  'employeeName',
  'idCardNo',
  'extraData',
  'expectedCompletionDate',
  'businessReason',
  'businessType',
  'processType',
  'requirementType',
  'province',
  'city',
  'district',
  'businessDescription',
  'serviceFee',
  'attachments',
] as const;

export function sanitizeInServiceUpdatePayload(
  payload: Partial<InServiceOrderPayload>,
): Partial<InServiceOrderPayload> {
  return Object.fromEntries(
    IN_SERVICE_UPDATE_FIELDS
      .filter((field) => payload[field] !== undefined)
      .map((field) => [field, payload[field]]),
  ) as Partial<InServiceOrderPayload>;
}

const MOCK_KEY = 'mock_in_service_orders_v2';

const MOCK_SEED: InServiceOrder[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    orderNo: 'IS-20260729-DEMO001',
    orderType: 'in_service',
    orderKind: 'single_business',
    businessScope: 'beilun',
    employeeName: null,
    idCardNo: null,
    extraData: {},
    customerId: 'CUST_NB001',
    customerCode: 'CUST_NB001',
    customerName: '宁波某制造集团',
    departmentId: '4',
    departmentName: '业务1组',
    expectedCompletionDate: '2026-08-05',
    businessReason: '员工异地社保补缴',
    businessType: 'registration',
    processType: 'supplementary_payment',
    requirementType: 'unpaid_supplement',
    province: '江苏',
    city: '南京市',
    district: '建邺区',
    businessDescription: '补缴 2026 年 6 月社会保险，请按附件工资基数办理。',
    serviceFee: 280,
    handleChannel: 'online',
    attachments: [],
    status: 'dispatched',
    handlerId: 'handler-jiangsu',
    handlerName: '江苏福保专员',
    createdBy: 'mock-business-member',
    createdByName: '业务员',
    pendingReturnStatus: null,
    transferHistory: [],
    approvedBy: null,
    rejectedBy: null,
    closedBy: null,
    rejectionReason: null,
    pendingInfoReason: null,
    completionRemark: null,
    closeReason: null,
    approvedAt: null,
    rejectedAt: null,
    dispatchedAt: '2026-07-29T09:00:00.000Z',
    acceptedAt: null,
    confirmedAt: null,
    processingAt: null,
    pendingInfoAt: null,
    completedAt: null,
    closedAt: null,
    createdAt: '2026-07-29T09:00:00.000Z',
    updatedAt: '2026-07-29T09:00:00.000Z',
    version: 1,
  },
];

function readMockOrders(): InServiceOrder[] {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (!raw) {
      localStorage.setItem(MOCK_KEY, JSON.stringify(MOCK_SEED));
      return MOCK_SEED.map((item) => ({ ...item }));
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeInServiceOrder) : [];
  } catch {
    return MOCK_SEED.map((item) => ({ ...item }));
  }
}

function writeMockOrders(orders: InServiceOrder[]): void {
  localStorage.setItem(MOCK_KEY, JSON.stringify(orders));
}

function readMockActor(): { id: string; name: string } {
  try {
    const user = JSON.parse(localStorage.getItem('mock_session_user_v1') || '{}') as RawRecord;
    return {
      id: String(user.id || 'mock-user'),
      name: String(user.real_name || user.realName || user.username || '当前用户'),
    };
  } catch {
    return { id: 'mock-user', name: '当前用户' };
  }
}

function asIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeInServiceOrder(raw: RawRecord): InServiceOrder {
  const status = IN_SERVICE_STATUSES.includes(raw.status) ? raw.status : 'dispatched';
  return {
    id: String(raw.id || ''),
    orderNo: String(raw.orderNo ?? raw.order_no ?? ''),
    orderType: 'in_service',
    orderKind: raw.orderKind ?? raw.order_kind ?? 'single_business',
    businessScope: raw.businessScope ?? raw.business_scope ?? 'beilun',
    employeeName: raw.employeeName ?? raw.employee_name ?? null,
    idCardNo: raw.idCardNo ?? raw.id_card_no ?? null,
    extraData: raw.extraData ?? raw.extra_data ?? {},
    customerId: String(raw.customerId ?? raw.customer_id ?? ''),
    customerName: raw.customerName ?? raw.customer_name ?? raw.customer?.customerName ?? raw.customer?.customer_name ?? null,
    customerCode: raw.customerCode ?? raw.customer_code ?? raw.customer?.customerCode ?? raw.customer?.customer_code ?? null,
    departmentId: String(raw.departmentId ?? raw.department_id ?? ''),
    departmentName: raw.departmentName ?? raw.department_name ?? raw.department?.name ?? null,
    expectedCompletionDate: raw.expectedCompletionDate ?? raw.expected_completion_date ?? null,
    businessReason: raw.businessReason ?? raw.business_reason ?? null,
    businessType: raw.businessType ?? raw.business_type,
    processType: raw.processType ?? raw.process_type,
    requirementType: raw.requirementType ?? raw.requirement_type ?? null,
    province: raw.province ?? null,
    city: raw.city ?? null,
    district: raw.district ?? null,
    businessDescription: raw.businessDescription ?? raw.business_description ?? null,
    serviceFee: raw.serviceFee === null || raw.service_fee === null
      ? null
      : Number(raw.serviceFee ?? raw.service_fee ?? 0),
    handleChannel: raw.handleChannel ?? raw.handle_channel ?? 'online',
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(String) : [],
    status,
    handlerId: raw.handlerId ?? raw.handler_id ?? null,
    handlerName: raw.handlerName ?? raw.handler_name ?? raw.handler?.realName ?? raw.handler?.real_name ?? null,
    createdBy: String(raw.createdBy ?? raw.created_by ?? ''),
    createdByName: raw.createdByName ?? raw.created_by_name ?? raw.creator?.realName ?? raw.creator?.real_name ?? null,
    pendingReturnStatus: raw.pendingReturnStatus ?? raw.pending_return_status ?? null,
    transferHistory: Array.isArray(raw.transferHistory ?? raw.transfer_history)
      ? (raw.transferHistory ?? raw.transfer_history)
      : [],
    approvedBy: raw.approvedBy ?? raw.approved_by ?? null,
    rejectedBy: raw.rejectedBy ?? raw.rejected_by ?? null,
    closedBy: raw.closedBy ?? raw.closed_by ?? null,
    rejectionReason: raw.rejectionReason ?? raw.rejection_reason ?? null,
    pendingInfoReason: raw.pendingInfoReason ?? raw.pending_info_reason ?? null,
    completionRemark: raw.completionRemark ?? raw.completion_remark ?? null,
    closeReason: raw.closeReason ?? raw.close_reason ?? null,
    approvedAt: asIso(raw.approvedAt ?? raw.approved_at),
    rejectedAt: asIso(raw.rejectedAt ?? raw.rejected_at),
    dispatchedAt: asIso(raw.dispatchedAt ?? raw.dispatched_at),
    acceptedAt: asIso(raw.acceptedAt ?? raw.accepted_at),
    confirmedAt: asIso(raw.confirmedAt ?? raw.confirmed_at),
    processingAt: asIso(raw.processingAt ?? raw.processing_at),
    pendingInfoAt: asIso(raw.pendingInfoAt ?? raw.pending_info_at),
    completedAt: asIso(raw.completedAt ?? raw.completed_at),
    closedAt: asIso(raw.closedAt ?? raw.closed_at),
    createdAt: asIso(raw.createdAt ?? raw.created_at) || new Date().toISOString(),
    updatedAt: asIso(raw.updatedAt ?? raw.updated_at) || new Date().toISOString(),
    version: Number(raw.version ?? 1),
    fields: Array.isArray(raw.fields)
      ? raw.fields.map((field: RawRecord) => ({
          fieldCode: String(field.fieldCode ?? field.field_code ?? ''),
          fieldName: String(field.fieldName ?? field.field_name ?? field.fieldCode ?? field.field_code ?? ''),
          fieldType: String(field.fieldType ?? field.field_type ?? 'text'),
          value: field.value ?? null,
          permission: String(field.permission ?? 'visible'),
          supplementable: Boolean(field.supplementable),
          dropdownOptions: Array.isArray(field.dropdownOptions ?? field.dropdown_options)
            ? (field.dropdownOptions ?? field.dropdown_options)
            : undefined,
          validation: field.validation,
        }))
      : undefined,
    visibleFields: Array.isArray(raw.visibleFields ?? raw.visible_fields)
      ? (raw.visibleFields ?? raw.visible_fields).map(String)
      : undefined,
    readonlyFields: Array.isArray(raw.readonlyFields ?? raw.readonly_fields)
      ? (raw.readonlyFields ?? raw.readonly_fields).map(String)
      : undefined,
    _fieldPermissions: (raw._fieldPermissions ?? raw._field_permissions ?? {}) as Record<string, string>,
    _detailTemplateFieldCodes: Array.isArray(raw._detailTemplateFieldCodes ?? raw._detail_template_field_codes)
      ? (raw._detailTemplateFieldCodes ?? raw._detail_template_field_codes).map(String)
      : undefined,
  };
}

function updateMock(id: string, updater: (order: InServiceOrder) => InServiceOrder): InServiceOrder {
  const orders = readMockOrders();
  const index = orders.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('单项业务工单不存在');
  const next = updater({ ...orders[index] });
  orders[index] = { ...next, updatedAt: new Date().toISOString(), version: next.version + 1 };
  writeMockOrders(orders);
  return orders[index];
}

export async function getInServiceOrders(query: InServiceOrderListQuery = {}): Promise<InServiceOrderListResult> {
  if (isMockMode) {
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const createdFrom = query.createdFrom ? new Date(query.createdFrom).getTime() : null;
    const createdTo = query.createdTo ? new Date(query.createdTo).getTime() : null;
    const filtered = readMockOrders().filter((item) => {
      if (query.customerId && item.customerId !== query.customerId) return false;
      if (query.departmentId && item.departmentId !== query.departmentId) return false;
      if (query.handlerId && item.handlerId !== query.handlerId) return false;
      if (query.onlyUnassigned && item.handlerId) return false;
      if (query.orderKind && item.orderKind !== query.orderKind) return false;
      if (query.businessScope && item.businessScope !== query.businessScope) return false;
      if (query.businessType && item.businessType !== query.businessType) return false;
      if (query.processType && item.processType !== query.processType) return false;
      if (query.requirementType && item.requirementType !== query.requirementType) return false;
      if (query.status && item.status !== query.status) return false;
      if (query.province && item.province !== query.province) return false;
      const createdAt = new Date(item.createdAt).getTime();
      if (createdFrom !== null && createdAt < createdFrom) return false;
      if (createdTo !== null && createdAt > createdTo) return false;
      if (keyword) {
        const haystack = [
          item.orderNo, item.employeeName, item.idCardNo, item.customerName,
          item.customerCode, item.businessReason, item.businessDescription,
          item.handlerName, item.createdByName,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
    const start = (page - 1) * pageSize;
    return mockDelay({ items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize }, 120);
  }

  const result = await request.get('/in-service-orders', { params: query }) as RawRecord;
  const items = result?.items ?? result?.list ?? result?.data ?? [];
  return {
    items: Array.isArray(items) ? items.map(normalizeInServiceOrder) : [],
    total: Number(result?.total ?? items.length ?? 0),
    page: Number(result?.page ?? query.page ?? 1),
    pageSize: Number(result?.pageSize ?? query.pageSize ?? 20),
  };
}

export async function getInServiceOrder(id: string): Promise<InServiceOrder> {
  if (isMockMode) {
    const item = readMockOrders().find((order) => order.id === id);
    if (!item) throw new Error('单项业务工单不存在');
    return mockDelay({ ...item }, 100);
  }
  return normalizeInServiceOrder(await request.get('/in-service-orders/' + id) as RawRecord);
}

export interface RenewalHistoryResult {
  found: boolean;
  source: 'onboarding' | 'renewal' | null;
  orderId: string | null;
  orderNo: string | null;
  employeeName: string | null;
  idCardNo: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  extraData: Record<string, unknown>;
  fixedTermCount: number;
  fixedTermRisk: boolean;
  warning: string | null;
}

export async function getRenewalHistory(customerId: string, idCardNo: string): Promise<RenewalHistoryResult> {
  if (isMockMode) {
    return mockDelay({
      found: false,
      source: null,
      orderId: null,
      orderNo: null,
      employeeName: null,
      idCardNo,
      departmentId: null,
      extraData: {},
      fixedTermCount: 0,
      fixedTermRisk: false,
      warning: null,
    });
  }
  return request.get('/in-service-orders/renewal/history', {
    params: { customerId, idCardNo },
  }) as Promise<RenewalHistoryResult>;
}

export async function createInServiceOrder(payload: InServiceOrderPayload): Promise<InServiceOrder> {
  if (isMockMode) {
    const orders = readMockOrders();
    const actor = readMockActor();
    const now = new Date().toISOString();
    const id = `is-${Date.now()}`;
    const item = normalizeInServiceOrder({
      ...payload,
      id,
      orderNo: 'IS-' + now.slice(0, 10).replace(/-/g, '') + '-' + id.slice(0, 8).toUpperCase(),
      status: 'dispatched',
      handleChannel: 'online',
      handlerId: 'mock-province-handler',
      handlerName: payload.province + '福保专员',
      createdBy: actor.id,
      createdByName: actor.name,
      pendingReturnStatus: null,
      transferHistory: [],
      dispatchedAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    writeMockOrders([item, ...orders]);
    return mockDelay(item, 160);
  }
  return normalizeInServiceOrder(await request.post('/in-service-orders', payload) as RawRecord);
}

export async function createBatchRenewalOrders(
  payloads: InServiceOrderPayload[],
): Promise<{ items: InServiceOrder[]; total: number }> {
  if (isMockMode) {
    const items = await Promise.all(payloads.map((payload) => createInServiceOrder({
      ...payload,
      orderKind: 'contract_renewal',
    })));
    return { items, total: items.length };
  }
  const result = await request.post('/in-service-orders/renewal/batch', { items: payloads.map((payload) => ({
    ...payload,
    orderKind: 'contract_renewal',
  })) }) as RawRecord;
  const items = Array.isArray(result?.items)
    ? result.items.map(normalizeInServiceOrder)
    : [];
  return { items, total: Number(result?.total ?? items.length) };
}

export async function exportInServiceRenewalTemplate(
  id: string,
): Promise<DispatchedOrderExportResult> {
  if (isMockMode) {
    return mockDelay({
      templateId: null,
      templateName: '劳动合同续签模板',
      moduleCode: 'contract',
      rowCount: 1,
    }, 120);
  }
  return request.post(
    '/in-service-orders/' + encodeURIComponent(id) + '/renewal-template',
  ) as Promise<DispatchedOrderExportResult>;
}

export async function downloadOutOfProvinceOrderExport(
  id: string,
  orderNo: string,
  typeLabel: '菜鸟增员' | '菜鸟减员',
): Promise<void> {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  const response = await fetch(base + '/api/in-service-orders/' + encodeURIComponent(id) + '/out-of-province-export', {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  });
  if (!response.ok) throw new Error(typeLabel + '导出失败');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = typeLabel + '-' + orderNo + '.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadInServiceCertificate(
  id: string,
  orderNo: string,
  filePrefix = '证明',
): Promise<void> {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  const response = await fetch(base + '/api/in-service-orders/' + encodeURIComponent(id) + '/certificate-template', {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
  });
  if (!response.ok) throw new Error('证明模板导出失败');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filePrefix + '-' + orderNo + '.docx';
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function updateInServiceOrder(id: string, payload: Partial<InServiceOrderPayload>): Promise<InServiceOrder> {
  const changes = sanitizeInServiceUpdatePayload(payload);
  if (isMockMode) return mockDelay(updateMock(id, (order) => ({ ...order, ...changes })), 120);
  return normalizeInServiceOrder(await request.patch('/in-service-orders/' + id, changes) as RawRecord);
}

async function postAction(id: string, action: string, payload: RawRecord = {}): Promise<InServiceOrder> {
  if (!isMockMode) {
    return normalizeInServiceOrder(await request.post('/in-service-orders/' + id + '/' + action, payload) as RawRecord);
  }

  const actor = readMockActor();
  const now = new Date().toISOString();
  const next = updateMock(id, (order) => {
    const usesSingleBusinessFlow = order.orderKind === IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS
      || order.orderKind === IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE;
    if (action === 'accept') {
      return order.orderKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE
        ? { ...order, status: 'processing', acceptedAt: now, processingAt: now }
        : { ...order, status: 'accepted', acceptedAt: now };
    }
    if (action === 'confirm') {
      if (!usesSingleBusinessFlow) throw new Error('当前流程没有材料确认节点');
      return { ...order, status: 'ready', confirmedAt: now };
    }
    if (action === 'transfer') return {
      ...order,
      status: 'dispatched',
      handlerId: String(payload.handlerId),
      handlerName: '转派办理人',
      acceptedAt: null,
      transferHistory: [...order.transferHistory, {
        fromHandlerId: order.handlerId,
        toHandlerId: String(payload.handlerId),
        operatorId: actor.id,
        reason: payload.reason ? String(payload.reason) : null,
        transferredAt: now,
      }],
    };
    if (action === 'start-processing') {
      if (!usesSingleBusinessFlow) throw new Error('当前流程没有办理渠道选择节点');
      return {
        ...order,
        status: 'processing',
        handleChannel: payload.handleChannel,
        processingAt: now,
      };
    }
    if (action === 'material-change-request') return {
      ...order,
      extraData: {
        ...order.extraData,
        __materialChangeRequest: {
          requestedBy: actor.id,
          requestedAt: now,
          reason: payload.reason ? String(payload.reason) : null,
          changes: payload.changes || {},
        },
      },
    };
    if (action === 'material-change-review') {
      const request = order.extraData.__materialChangeRequest as InServiceMaterialChangeRequest | undefined;
      if (!request) return order;
      const { __materialChangeRequest: _request, __materialChangeHistory: oldHistory, ...currentExtra } = order.extraData;
      const history = Array.isArray(oldHistory) ? oldHistory : [];
      const reviewedExtra = {
        ...(payload.approved ? { ...currentExtra, ...(request.changes.extraData || {}) } : currentExtra),
        __materialChangeHistory: [...history, {
          ...request,
          approved: Boolean(payload.approved),
          reviewedBy: actor.id,
          reviewedAt: now,
          reviewReason: payload.reason ? String(payload.reason) : null,
        }].slice(-20),
      };
      return payload.approved
        ? { ...order, ...request.changes, extraData: reviewedExtra }
        : { ...order, extraData: reviewedExtra };
    }
    if (action === 'request-info') return {
      ...order,
      status: 'pending_info',
      pendingReturnStatus: order.status,
      pendingInfoReason: String(payload.reason || ''),
      pendingInfoAt: now,
    };
    if (action === 'resubmit') return {
      ...order,
      ...payload,
      attachments: Array.from(new Set([...(order.attachments || []), ...(payload.attachments || [])])).slice(0, 5),
      status: order.pendingReturnStatus || 'dispatched',
      pendingReturnStatus: null,
      pendingInfoReason: null,
    };
    if (action === 'complete' || action === 'fail') {
      if (action === 'fail' && !usesSingleBusinessFlow) throw new Error('当前流程没有办理失败动作');
      return {
        ...order,
        status: action === 'complete' ? 'completed' : 'failed',
        completionRemark: payload.remark ? String(payload.remark) : null,
        completedAt: now,
      };
    }
    if (action === 'cancel') return {
      ...order,
      status: 'cancelled',
      closeReason: String(payload.reason || ''),
      closedBy: actor.id,
      closedAt: now,
      extraData: {
        ...order.extraData,
        __closureAction: payload.action === 'withdraw' ? 'withdraw' : 'void',
        __closureAt: now,
      },
    };
    return order;
  });
  return mockDelay(next, 120);
}

export const acceptInServiceOrder = (id: string) => postAction(id, 'accept');
export const confirmInServiceOrder = (id: string) => postAction(id, 'confirm');
export const transferInServiceOrder = (id: string, handlerId: string, reason?: string) =>
  postAction(id, 'transfer', { handlerId, reason });
export const startInServiceProcessing = (id: string, handleChannel: InServiceHandleChannel) =>
  postAction(id, 'start-processing', { handleChannel });
export const requestInServiceOrderInfo = (id: string, reason: string) =>
  postAction(id, 'request-info', { reason });
export const requestInServiceMaterialChange = (
  id: string,
  changes: Partial<InServiceOrderPayload>,
  reason?: string,
) => postAction(id, 'material-change-request', {
  changes: sanitizeInServiceUpdatePayload(changes),
  reason,
});
export const reviewInServiceMaterialChange = (id: string, approved: boolean, reason?: string) =>
  postAction(id, 'material-change-review', { approved, reason });
export const resubmitInServiceOrder = (
  id: string,
  payload: Partial<InServiceOrderPayload>,
  resubmitReason: string,
) => postAction(id, 'resubmit', {
  ...sanitizeInServiceUpdatePayload(payload),
  resubmitReason,
});
export const completeInServiceOrder = (
  id: string,
  remark?: string,
  attachments?: string[],
  extraData?: Record<string, unknown>,
) => postAction(id, 'complete', { remark, attachments, extraData });
export const failInServiceOrder = (id: string, remark?: string, attachments?: string[]) =>
  postAction(id, 'fail', { remark, attachments });
export const cancelInServiceOrder = (
  id: string,
  reason: string,
  action: 'withdraw' | 'void' = 'void',
) => postAction(id, 'cancel', { reason, action });
