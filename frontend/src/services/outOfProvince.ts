import request from './request';
import { uploadExcel } from './upload';
import type { PageParams, PageResult } from './mock';
import type { ImportJob, ImportNewFieldPayload, ImportPreviewResult } from './workOrders';
import { BUSINESS_SCOPE } from '@/utils/businessScope';

export const OUT_OF_PROVINCE_API_ROOT = '/out-of-province-orders';
const WORK_ORDER_IMPORT_API_ROOT = '/work-orders/import';
export const OUT_OF_PROVINCE_SCOPE = BUSINESS_SCOPE.OUT_OF_PROVINCE;

export const OUT_OF_PROVINCE_ORDER_TYPE = {
  INCREASE: 'out_of_province_increase',
  DECREASE: 'out_of_province_decrease',
} as const;

export type OutOfProvinceOrderType = (typeof OUT_OF_PROVINCE_ORDER_TYPE)[keyof typeof OUT_OF_PROVINCE_ORDER_TYPE];

export interface OutOfProvinceOrderItem {
  id: string;
  order_no: string;
  order_type: OutOfProvinceOrderType;
  businessScope: typeof OUT_OF_PROVINCE_SCOPE;
  status: string;
  province?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  employee_name?: string | null;
  employee_id_card?: string | null;
  created_by_name?: string | null;
  created_at: string;
  [key: string]: unknown;
}

type RawListResponse = Partial<PageResult<Record<string, unknown>>> & {
  items?: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
  page?: number;
  pageSize?: number;
};

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrder(row: Record<string, unknown>): OutOfProvinceOrderItem | null {
  const scope = row.businessScope ?? row.business_scope;
  if (scope !== OUT_OF_PROVINCE_SCOPE) return null;
  const extraData = row.extra_data && typeof row.extra_data === 'object'
    ? row.extra_data as Record<string, unknown>
    : {};
  return {
    ...row,
    id: String(row.id || ''),
    order_no: String(row.order_no ?? row.orderNo ?? ''),
    order_type: String(row.order_type ?? row.orderType ?? '') as OutOfProvinceOrderType,
    businessScope: OUT_OF_PROVINCE_SCOPE,
    status: String(row.status || ''),
    province: String(row.province ?? extraData.province ?? '') || null,
    customer_code: String(row.customer_code ?? row.customerCode ?? '') || null,
    customer_name: String(row.customer_name ?? row.customerName ?? '') || null,
    employee_name: String(row.employee_name ?? row.employeeName ?? '') || null,
    employee_id_card: String(row.employee_id_card ?? row.employeeIdCard ?? '') || null,
    created_by_name: String(row.created_by_name ?? row.createdByName ?? '') || null,
    created_at: String(row.created_at ?? row.createdAt ?? ''),
  };
}

export async function getOutOfProvinceOrders(params: PageParams): Promise<PageResult<OutOfProvinceOrderItem>> {
  const { current, ...query } = params;
  const raw = await request.get(OUT_OF_PROVINCE_API_ROOT, {
    params: { ...query, page: params.page ?? current ?? 1 },
  }) as RawListResponse;
  const source = raw.list || raw.items || raw.rows || [];
  if (source.some((row) => (row.businessScope ?? row.business_scope) === undefined)) {
    throw new Error('省外列表响应缺少 businessScope，已阻止展示以避免与北仑数据混用');
  }
  const list = source.map(normalizeOrder).filter((item): item is OutOfProvinceOrderItem => Boolean(item));
  const total = list.length === source.length ? toNumber(raw.total, list.length) : list.length;
  const pageSize = toNumber(raw.pageSize, toNumber(params.pageSize, 20));
  return {
    list,
    total,
    page: toNumber(raw.page, toNumber(params.page ?? params.current, 1)),
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    success: true,
  };
}

function normalizePreview(raw: Record<string, unknown>, fileId: string): ImportPreviewResult {
  const mapping = Array.isArray(raw.mapping) ? raw.mapping as ImportPreviewResult['mapping'] : [];
  const previewRows = (raw.previewRows ?? raw.preview ?? []) as Record<string, unknown>[];
  const availableFields = (raw.availableFields ?? raw.available_fields ?? []) as ImportPreviewResult['availableFields'];
  return {
    ...raw,
    fileId: String(raw.fileId ?? raw.file_id ?? fileId),
    mapping,
    availableFields,
    suggestedMapping: (raw.suggestedMapping ?? raw.suggested_mapping ?? {}) as Record<string, string>,
    totalRows: toNumber(raw.totalRows ?? raw.total_rows ?? raw.rowCount, previewRows.length),
    previewRows,
    missingRequired: (raw.missingRequired ?? raw.missing_required ?? []) as string[],
  };
}

function normalizeJob(raw: Record<string, unknown>): ImportJob {
  const totalRows = toNumber(raw.total_rows ?? raw.totalRows, 0);
  const successRows = toNumber(raw.success_rows ?? raw.successRows, 0);
  const failRows = toNumber(raw.fail_rows ?? raw.failRows, 0);
  return {
    id: String(raw.id ?? raw.jobId ?? raw.job_id ?? ''),
    total_rows: totalRows,
    success_rows: successRows,
    fail_rows: failRows,
    warning_rows: toNumber(raw.warning_rows ?? raw.warningRows, 0),
    processed_rows: toNumber(raw.processed_rows ?? raw.processedRows, successRows + failRows),
    status: String(raw.status || 'processing') as ImportJob['status'],
    error_report_url: String(raw.error_report_url ?? raw.errorReportUrl ?? '') || null,
    validation_errors: (raw.validation_errors ?? raw.validationErrors ?? []) as ImportJob['validation_errors'],
    top_errors: (raw.top_errors ?? raw.topErrors ?? []) as ImportJob['top_errors'],
    warning_details: (raw.warning_details ?? raw.warningDetails ?? []) as ImportJob['warning_details'],
    warnings: (raw.warnings ?? []) as string[],
    error_message: String(raw.error_message ?? raw.errorMessage ?? '') || null,
    detail_messages: (raw.detail_messages ?? raw.detailMessages ?? []) as string[],
    partial: Boolean(raw.partial),
  };
}

export async function previewOutOfProvinceImport(
  file: File,
  orderType: OutOfProvinceOrderType,
): Promise<ImportPreviewResult> {
  const uploaded = await uploadExcel(file);
  const fileId = uploaded.fileId || uploaded.id;
  if (!fileId) throw new Error('Excel 上传成功但未返回 fileId，请重新上传后再试');
  const raw = await request.post(WORK_ORDER_IMPORT_API_ROOT + '/preview', {
    fileId,
    orderType,
    sampleRows: 10,
  }) as Record<string, unknown>;
  return normalizePreview(raw, fileId);
}

export async function confirmOutOfProvinceImport(
  mapping: Record<string, string>,
  fileId: string | undefined,
  orderType: OutOfProvinceOrderType,
  newFields?: ImportNewFieldPayload[],
): Promise<ImportJob> {
  if (!fileId) throw new Error('缺少 Excel fileId，请重新上传后再确认导入');
  const sanitizedMapping = Object.fromEntries(
    Object.entries(mapping).filter(([, fieldCode]) => fieldCode && fieldCode !== '__NEW_FIELD__'),
  );
  const raw = await request.post(WORK_ORDER_IMPORT_API_ROOT + '/confirm', {
    fileId,
    orderType,
    mapping: sanitizedMapping,
    autoSubmit: true,
    ...(newFields?.length ? { newFields } : {}),
  }) as Record<string, unknown>;
  return normalizeJob(raw);
}

export async function getOutOfProvinceImportJob(jobId: string): Promise<ImportJob> {
  const raw = await request.get(
    WORK_ORDER_IMPORT_API_ROOT + '/' + encodeURIComponent(jobId),
  ) as Record<string, unknown>;
  return normalizeJob(raw);
}

export async function downloadOutOfProvinceImportErrorReport(jobId: string): Promise<void> {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  const url = base + '/api' + WORK_ORDER_IMPORT_API_ROOT + '/jobs/'
    + encodeURIComponent(jobId) + '/error-report';
  const response = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : undefined });
  if (!response.ok) throw new Error('下载错误报告失败');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '省外增减员导入错误-' + jobId + '.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
