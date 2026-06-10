import request from './request';
import axios from 'axios';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';
import * as XLSX from 'xlsx';
import { addMockNotification } from './notifications';
import { getFields } from './fields';
import { uploadExcel } from './upload';

export interface WorkOrderItem {
  id: string;
  order_no: string;
  order_type: string;
  status: string;
  customer_name: string;
  employee_name: string;
  employee_id_card: string;
  created_by: string;
  department_id: string;
  extra_data: Record<string, unknown>;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  dispatched_orders?: DispatchedOrderSummary[];
  readonly_fields?: string[];
  [key: string]: unknown;
}

export interface DispatchedOrderSummary {
  id: string;
  module_code: string;
  module_name: string;
  status: string;
  handler_id?: string | null;
  handler_name: string | null;
  return_reason?: string | null;
  dispatched_at?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  void_at?: string | null;
  voidAt?: string | null;
  created_at?: string | null;
  due_at?: string | null;
  node_type?: string | null;
  is_overdue?: boolean;
}

export interface WorkOrderTimelineItem {
  id: string;
  createdAt: string;
  created_at?: string;
  operatorId: string | null;
  operator_id?: string | null;
  operatorName: string | null;
  operator_name?: string | null;
  userId: string | null;
  user_id?: string | null;
  userName: string | null;
  user_name?: string | null;
  entityType: string;
  entity_type?: string;
  entityId: string;
  entity_id?: string;
  entityLabel: string;
  entity_label?: string;
  actionCode: string;
  action_code?: string;
  actionType: string;
  action_type?: string;
  actionLabel: string;
  action_label?: string;
  title: string;
  description: string;
  contextFields: Record<string, unknown>;
  context_fields?: Record<string, unknown>;
  beforeData: Record<string, unknown> | null;
  before_data?: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}

export interface ImportPreviewResult {
  fileId?: string;
  orderType?: string;
  headers?: string[];
  rowCount?: number;
  preview?: Record<string, unknown>[];
  suggestion?: Record<string, string>;
  confidence?: Record<string, number>;
  unmatched?: string[];
  unmatchedHeaders?: string[];
  mapping: {
    excelColumn: string;
    systemFieldCode: string;
    systemFieldName: string;
    confidence?: number;
  }[];
  availableFields: { field_code: string; field_name: string; is_required?: boolean }[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  previewRows: Record<string, unknown>[];
  missingRequired?: string[];
  modelUsed?: string;
  fallbackReason?: string | null;
}

interface RawImportPreviewResult {
  fileId?: string;
  orderType?: string;
  headers?: string[];
  rowCount?: number;
  preview?: Record<string, unknown>[];
  suggestion?: Record<string, string>;
  confidence?: Record<string, number>;
  unmatched?: string[];
  unmatchedHeaders?: string[];
  mapping?: ImportPreviewResult['mapping'];
  suggestedMapping?: Record<string, string>;
  totalRows?: number;
  previewRows?: Record<string, unknown>[];
  missingRequired?: string[];
  modelUsed?: string;
  fallbackReason?: string | null;
  availableFields?: Array<{
    field_code?: string;
    fieldCode?: string;
    field_name?: string;
    fieldName?: string;
    is_required?: boolean;
    required?: boolean;
  }>;
}

export interface ImportJob {
  id: string;
  total_rows: number;
  success_rows: number;
  fail_rows: number;
  warning_rows?: number;
  status: 'processing' | 'completed' | 'failed' | 'partially_failed';
  error_report_url: string | null;
  processed_rows?: number;
  validation_errors?: Array<{ row: number; field?: string; message: string; code?: string; existedOrderNo?: string; originalValue?: unknown; suggestion?: string; autoFixed?: boolean; autoFixedValue?: unknown; normalizedValue?: unknown; level?: 'error' | 'warning' }>;
  top_errors?: Array<{ row: number; field?: string; message: string; code?: string; existedOrderNo?: string; originalValue?: unknown; suggestion?: string; autoFixed?: boolean; autoFixedValue?: unknown; normalizedValue?: unknown; level?: 'error' | 'warning' }>;
  warning_details?: Array<{ row?: number; field?: string; message: string; code?: string; originalValue?: unknown; normalizedValue?: unknown }>;
  warnings?: string[];
  error_message?: string | null;
  detail_messages?: string[];
  partial?: boolean;
}

interface RawImportJob {
  id?: string | number;
  jobId?: string | number;
  taskId?: string | number;
  total_rows?: number | string | null;
  totalRows?: number | string | null;
  rowCount?: number | string | null;
  success_rows?: number | string | null;
  successRows?: number | string | null;
  successfulRows?: number | string | null;
  fail_rows?: number | string | null;
  failRows?: number | string | null;
  failedRows?: number | string | null;
  warning_rows?: number | string | null;
  warningRows?: number | string | null;
  processed_rows?: number | string | null;
  processedRows?: number | string | null;
  handledRows?: number | string | null;
  status?: ImportJob['status'] | string | null;
  error_report_url?: string | null;
  errorReportUrl?: string | null;
  validation_errors?: Array<Record<string, unknown>> | null;
  validationErrors?: Array<Record<string, unknown>> | null;
  top_errors?: Array<Record<string, unknown>> | null;
  topErrors?: Array<Record<string, unknown>> | null;
  warning_details?: Array<Record<string, unknown>> | null;
  warningDetails?: Array<Record<string, unknown>> | null;
  warnings?: string | string[] | Array<string | Record<string, unknown>> | null;
  warning_messages?: string[] | null;
  warningMessages?: string[] | null;
  error_message?: string | null;
  errorMessage?: string | null;
  message?: string | null;
  detail?: string | string[] | null;
  details?: string | string[] | null;
  detail_messages?: string[] | null;
  detailMessages?: string[] | null;
  partial?: boolean | null;
}

function toImportJobNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function toImportJobString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function normalizeImportValidationErrors(errors: unknown): NonNullable<ImportJob['validation_errors']> {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((item, index) => {
      const row = isPlainRecord(item) ? item : {};
      const normalizedValue = row.normalizedValue ?? row.normalized_value ?? row.defaultValue ?? row.default_value ?? row.safeValue ?? row.safe_value;
      const warningCode = toImportJobString(row.code ?? row.error_code ?? row.errorCode ?? row.type ?? row.warningCode ?? row.warning_code);
      return {
        row: toImportJobNumber(row.row ?? row.row_no ?? row.rowNo ?? row.rowNum ?? row.line ?? row.line_no ?? row.lineNo) ?? index + 1,
        field: toImportJobString(row.field ?? row.field_name ?? row.fieldName ?? row.column ?? row.column_name ?? row.columnName ?? row.header ?? row.excelColumn),
        message: toImportJobString(row.message ?? row.error_message ?? row.errorMessage ?? row.reason ?? row.detail ?? row.details ?? row.description) || '导入失败',
        code: warningCode,
        existedOrderNo: toImportJobString(row.existedOrderNo ?? row.existed_order_no ?? row.orderNo ?? row.order_no ?? row.conflictOrderNo ?? row.conflict_order_no),
        originalValue: row.originalValue ?? row.original_value ?? row.rawValue ?? row.raw_value ?? row.value ?? row.cellValue ?? row.cell_value,
        suggestion: toImportJobString(row.suggestion ?? row.suggest ?? row.fixSuggestion ?? row.fix_suggestion ?? row.advice ?? row.recommendation),
        autoFixed: Boolean(row.autoFixed ?? row.auto_fixed ?? row.autoCompatible ?? row.auto_compatible ?? row.safeDefault ?? row.safe_default),
        autoFixedValue: row.autoFixedValue ?? row.auto_fixed_value ?? row.compatibleValue ?? row.compatible_value ?? row.defaultValue ?? row.default_value,
        normalizedValue,
        level: (toImportJobString(row.level ?? row.severity ?? row.errorLevel ?? row.error_level ?? (row.isWarning ? 'warning' : undefined)) === 'warning' ? 'warning' : 'error') as 'error' | 'warning',
      };
    })
    .filter((item) => Boolean(item.message || item.field || item.row));
}

function normalizeImportWarningDetails(errors: unknown): NonNullable<ImportJob['warning_details']> {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((item, index) => {
      const row = isPlainRecord(item) ? item : {};
      const message = toImportJobString(row.message ?? row.error_message ?? row.errorMessage ?? row.reason ?? row.detail ?? row.description) || '系统警告';
      return {
        row: toImportJobNumber(row.row ?? row.row_no ?? row.rowNo ?? row.rowNum ?? row.line ?? row.line_no ?? row.lineNo) ?? index + 1,
        field: toImportJobString(row.field ?? row.field_name ?? row.fieldName ?? row.column ?? row.column_name ?? row.columnName ?? row.header ?? row.excelColumn),
        message,
        code: toImportJobString(row.code ?? row.warning_code ?? row.warningCode ?? row.type),
        originalValue: row.originalValue ?? row.original_value ?? row.rawValue ?? row.raw_value ?? row.value ?? row.cellValue ?? row.cell_value,
        normalizedValue: row.normalizedValue ?? row.normalized_value ?? row.defaultValue ?? row.default_value ?? row.safeValue ?? row.safe_value,
      };
    })
    .filter((item) => Boolean(item.message || item.field || item.row));
}

function normalizeImportJobStatus(status: unknown, partial = false): ImportJob['status'] {
  const raw = String(status ?? '').trim().toLowerCase();
  if (raw === 'partially_failed' || raw === 'partial_failed' || raw === 'partialfailed') return 'partially_failed';
  if (raw === 'completed' || raw === 'success' || raw === 'succeeded') return partial ? 'partially_failed' : 'completed';
  if (raw === 'failed' || raw === 'error' || raw === 'aborted') return 'failed';
  if (raw === 'processing' || raw === 'pending' || raw === 'running') return 'processing';
  return partial ? 'partially_failed' : 'processing';
}

function uniqueImportMessages(rawMessages: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawMessages) {
    const text = toImportJobString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function collectImportDetailMessages(source: RawImportJob): string[] {
  return uniqueImportMessages([
    source.error_message,
    source.errorMessage,
    source.message,
    ...(Array.isArray(source.detail) ? source.detail : [source.detail]),
    ...(Array.isArray(source.details) ? source.details : [source.details]),
    ...(Array.isArray(source.detail_messages) ? source.detail_messages : []),
    ...(Array.isArray(source.detailMessages) ? source.detailMessages : []),
  ]);
}

function collectImportWarnings(source: RawImportJob): string[] {
  const raw = Array.isArray(source.warnings) ? source.warnings : [];
  const messages = raw.map((item: unknown) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'message' in item) {
      const msg = (item as Record<string, unknown>).message;
      const row = (item as Record<string, unknown>).row;
      const prefix = row ? `第${row}行 ` : '';
      return prefix + (typeof msg === 'string' ? msg : String(msg));
    }
    return typeof item === 'string' ? item : '';
  }).filter(Boolean);
  return uniqueImportMessages([
    ...messages,
    ...(Array.isArray(source.warning_messages) ? source.warning_messages : []),
    ...(Array.isArray(source.warningMessages) ? source.warningMessages : []),
  ]);
}

function collectImportWarningDetails(source: RawImportJob): NonNullable<ImportJob['warning_details']> {
  const warningsFromWarnings = normalizeImportWarningDetails(
    Array.isArray(source.warnings)
      ? source.warnings.map((item) => {
          if (typeof item === 'string') return { message: item };
          return item;
        })
      : [],
  );
  const warnings = normalizeImportWarningDetails(source.warning_details ?? source.warningDetails);
  const validationWarnings = normalizeImportValidationErrors(source.validation_errors ?? source.validationErrors)
    .filter((item) => item.level === 'warning')
    .map((item) => ({
      row: item.row,
      field: item.field,
      message: item.message,
      code: item.code,
      originalValue: item.originalValue,
      normalizedValue: item.normalizedValue ?? item.autoFixedValue,
    }));
  return [...warnings, ...warningsFromWarnings, ...validationWarnings];
}

function normalizeImportJobResponse(raw: unknown): ImportJob {
  const wrapper = isPlainRecord(raw) ? raw : {};
  const nested = [wrapper.importJob, wrapper.job, wrapper.task, wrapper.result, wrapper.data].find((candidate) => isPlainRecord(candidate));
  const source = ((nested as Record<string, unknown> | undefined) || wrapper) as RawImportJob;

  const partial = Boolean(source.partial);
  const status = normalizeImportJobStatus(source.status, partial);
  const detailMessages = collectImportDetailMessages(source);
  const validationErrors = normalizeImportValidationErrors(source.validation_errors ?? source.validationErrors);
  const topErrors = normalizeImportValidationErrors(source.top_errors ?? source.topErrors);
  const warningDetails = collectImportWarningDetails(source);

  return {
    id: toImportJobString(source.id ?? source.jobId ?? source.taskId) || '',
    total_rows: toImportJobNumber(source.total_rows ?? source.totalRows ?? source.rowCount) ?? 0,
    success_rows: toImportJobNumber(source.success_rows ?? source.successRows ?? source.successfulRows) ?? 0,
    fail_rows: toImportJobNumber(source.fail_rows ?? source.failRows ?? source.failedRows) ?? 0,
    warning_rows: toImportJobNumber(source.warning_rows ?? source.warningRows),
    processed_rows: toImportJobNumber(source.processed_rows ?? source.processedRows ?? source.handledRows),
    status,
    error_report_url: toImportJobString(source.error_report_url ?? source.errorReportUrl) ?? null,
    validation_errors: validationErrors.length > 0 ? validationErrors : topErrors,
    top_errors: topErrors,
    warning_details: warningDetails,
    warnings: collectImportWarnings(source),
    error_message: detailMessages[0] ?? null,
    detail_messages: detailMessages,
    partial: partial || status === 'partially_failed',
  };
}

const mockExtraData: Record<string, unknown> = {
  customer_name: '浙江企服',
  customer_code: 'ZJQF001',
  outsource_type: '全风险',
  position: '软件工程师',
  employee_name: '张三',
  id_card_no: '330106199001011234',
  gender: '男',
  birth_date: '1990-01-01',
  age: 36,
  household_type: '非农业',
  ethnicity: '汉族',
  mobile: '13800138000',
  email: 'zhangsan@example.com',
  current_address: '浙江省杭州市西湖区文三路138号1201室',
  household_address: '浙江省杭州市西湖区',
  postal_code: '310000',
  contract_term_type: '固定期限',
  contract_term: '3年',
  contract_start_date: '2026-06-01',
  contract_end_date: '2029-05-31',
  probation_start_date: '2026-06-01',
  probation_months: '3',
  probation_end_date: '2026-08-31',
  work_city: '杭州',
  work_hour_system: '标准',
  work_cycle: '',
  salary_form: '',
  base_salary: 15000,
  other_salary: 0,
  probation_salary: 12000,
  payroll_cycle: '次月',
  payroll_date: '15',
  social_location: '杭州',
  start_month: '2026-06',
  social_base: 15000,
  fund_base: 15000,
  fund_ratio: '单位12%+个人12%',
  bank_name: '',
  bank_account: '',
  remark: '',
  business_mode: '北仑自营',
  employee_type: '全日制',
  need_company_contract: '是',
  contract_subject: '浙江企服服务外包有限公司',
  contract_template: '标准',
  need_contract_urge: '否',
  contract_feedback: '',
  need_onboarding_contact: '是',
  onboarding_feedback: '',
  need_company_payroll: '是',
  payroll_location: '杭州',
  special_remark: '',
  data_entry_feedback: '',
};

const MOCK_STORAGE_KEY = 'mock_work_orders_v1';

const mockInitialWorkOrders: WorkOrderItem[] = [
  {
    id: '1', order_no: 'ON20260508001', order_type: 'onboarding', status: 'processing',
    customer_name: '浙江企服', employee_name: '张三', employee_id_card: '330106199001011234',
    created_by: '业务员A', department_id: '1', extra_data: { ...mockExtraData },
    submitted_at: '2026-05-08T10:00:00Z', completed_at: null,
    created_at: '2026-05-08T09:30:00Z', updated_at: '2026-05-08T10:00:00Z',
    dispatched_orders: [
      { id: 'd1', module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_name: null, dispatched_at: '2026-05-08T10:00:01Z', accepted_at: null, completed_at: null },
      { id: 'd2', module_code: 'social_insurance', module_name: '社保公积金增员', status: 'pending', handler_name: '傅倩雯', dispatched_at: '2026-05-08T10:00:01Z', accepted_at: null, completed_at: null },
      { id: 'd3', module_code: 'contract', module_name: '劳动合同新签', status: 'processing', handler_name: '合同专员A', dispatched_at: '2026-05-08T10:00:01Z', accepted_at: '2026-05-08T11:00:00Z', completed_at: null },
      { id: 'd4', module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending', handler_name: null, dispatched_at: '2026-05-08T10:00:01Z', accepted_at: null, completed_at: null },
    ],
  },
  {
    id: '2', order_no: 'ON20260508002', order_type: 'onboarding', status: 'draft',
    customer_name: '浙江企服', employee_name: '李四', employee_id_card: '330106199102020022',
    created_by: '业务员A', department_id: '1',
    extra_data: { ...mockExtraData, employee_name: '李四', id_card_no: '330106199102020022', need_company_contract: '否', need_onboarding_contact: '否' },
    submitted_at: null, completed_at: null, created_at: '2026-05-08T14:00:00Z', updated_at: '2026-05-08T14:00:00Z',
    dispatched_orders: [],
  },
  {
    id: '4', order_no: 'ON20260507002', order_type: 'onboarding', status: 'returned',
    customer_name: '浙江企服', employee_name: '赵六', employee_id_card: '330106199404040044',
    created_by: '业务员A', department_id: '1',
    extra_data: { ...mockExtraData, employee_name: '赵六', id_card_no: '330106199404040044' },
    submitted_at: '2026-05-07T11:00:00Z', completed_at: null,
    created_at: '2026-05-07T10:00:00Z', updated_at: '2026-05-08T09:00:00Z',
    dispatched_orders: [
      { id: 'd7', module_code: 'data_entry', module_name: '增员报岗录入', status: 'processing', handler_name: '录入员B', dispatched_at: '2026-05-07T11:00:01Z', accepted_at: '2026-05-07T12:00:00Z', completed_at: null },
      { id: 'd8', module_code: 'social_insurance', module_name: '社保公积金增员', status: 'pending', handler_name: '傅倩雯', dispatched_at: '2026-05-07T11:00:01Z', accepted_at: null, completed_at: null },
      { id: 'd9', module_code: 'contract', module_name: '劳动合同新签', status: 'returned', handler_name: '合同专员B', return_reason: '合同开始日期与入职日期不符，请核实', dispatched_at: '2026-05-07T11:00:01Z', accepted_at: '2026-05-07T12:00:00Z', completed_at: null },
    ],
  },
];

function loadMockWorkOrders(): WorkOrderItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [...mockInitialWorkOrders];
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw === null) return [...mockInitialWorkOrders];
    const parsed = JSON.parse(raw) as WorkOrderItem[];
    if (!Array.isArray(parsed)) return [...mockInitialWorkOrders];
    return parsed;
  } catch {
    return [...mockInitialWorkOrders];
  }
}

function saveMockWorkOrders() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(mockWorkOrders)); }
  catch { /* quota or serialization failure — non-fatal */ }
}

export function reloadMockWorkOrders(): void {
  const fresh = loadMockWorkOrders();
  mockWorkOrders.length = 0;
  mockWorkOrders.push(...fresh);
}

const mockWorkOrders: WorkOrderItem[] = loadMockWorkOrders();

const ONBOARDING_IMPORT_TEMPLATE_EXCLUDED_FIELD_CODES = new Set([
  'contract_feedback',
  'onboarding_feedback',
  'data_entry_feedback',
  'contract_template',
]);

const AVAILABLE_FIELDS_MOCK = [
  { field_code: 'customer_name', field_name: '客户名称', is_required: true },
  { field_code: 'customer_code', field_name: '客户代码', is_required: true },
  { field_code: 'outsource_type', field_name: '外包类型', is_required: true },
  { field_code: 'position', field_name: '岗位', is_required: true },
  { field_code: 'employee_name', field_name: '姓名', is_required: true },
  { field_code: 'id_card_no', field_name: '身份证号码（护照）', is_required: true },
  { field_code: 'gender', field_name: '性别', is_required: true },
  { field_code: 'birth_date', field_name: '出生日期' },
  { field_code: 'age', field_name: '年龄' },
  { field_code: 'household_type', field_name: '户籍性质' },
  { field_code: 'ethnicity', field_name: '民族' },
  { field_code: 'mobile', field_name: '移动电话', is_required: true },
  { field_code: 'email', field_name: '电子邮件', is_required: true },
  { field_code: 'current_address', field_name: '现住地址', is_required: true },
  { field_code: 'household_address', field_name: '户籍地址', is_required: true },
  { field_code: 'postal_code', field_name: '邮编' },
  { field_code: 'contract_term_type', field_name: '合同期限形式', is_required: true },
  { field_code: 'contract_term', field_name: '合同期限', is_required: true },
  { field_code: 'contract_start_date', field_name: '合同开始日期', is_required: true },
  { field_code: 'contract_end_date', field_name: '合同终止日期', is_required: true },
  { field_code: 'probation_start_date', field_name: '试用期开始日期', is_required: true },
  { field_code: 'probation_months', field_name: '试用期(月)', is_required: true },
  { field_code: 'probation_end_date', field_name: '试用期结束日期', is_required: true },
  { field_code: 'work_city', field_name: '工作城市', is_required: true },
  { field_code: 'work_hour_system', field_name: '工时制', is_required: true },
  { field_code: 'work_cycle', field_name: '工作制周期', is_required: true },
  { field_code: 'salary_form', field_name: '工资形式', is_required: true },
  { field_code: 'base_salary', field_name: '基本工资', is_required: true },
  { field_code: 'other_salary', field_name: '其他工资', is_required: true },
  { field_code: 'probation_salary', field_name: '试用期工资' },
  { field_code: 'payroll_cycle', field_name: '发薪周期', is_required: true },
  { field_code: 'payroll_date', field_name: '发薪日期', is_required: true },
  { field_code: 'social_location', field_name: '参保地', is_required: true },
  { field_code: 'start_month', field_name: '起始月', is_required: true },
  { field_code: 'social_base', field_name: '社保基数', is_required: true },
  { field_code: 'fund_base', field_name: '公积金基数', is_required: true },
  { field_code: 'fund_ratio', field_name: '公积金比例', is_required: true },
  { field_code: 'bank_name', field_name: '开户银行信息', is_required: true },
  { field_code: 'bank_account', field_name: '银行借记卡帐号', is_required: true },
  { field_code: 'remark', field_name: '备注' },
  { field_code: 'business_mode', field_name: '业务模式' },
  { field_code: 'employee_type', field_name: '人员类型' },
  { field_code: 'need_company_contract', field_name: '是否企服发起劳动合同', is_required: true },
  { field_code: 'contract_subject', field_name: '劳动合同主体' },
  { field_code: 'contract_template', field_name: '劳动合同模板' },
  { field_code: 'contract_urge', field_name: '劳动合同签署是否需要催办员工' },
  { field_code: 'contract_feedback', field_name: '劳动合同新签反馈' },
  { field_code: 'need_onboarding_contact', field_name: '入职材料是否需要集约收集', is_required: true },
  { field_code: 'onboarding_feedback', field_name: '入职联系反馈' },
  { field_code: 'need_company_payroll', field_name: '是否企服发薪', is_required: true },
  { field_code: 'pay_location', field_name: '发薪地' },
  { field_code: 'special_remark', field_name: '特殊备注' },
  { field_code: 'data_entry_feedback', field_name: '增员报岗录入反馈' },
];

const AVAILABLE_IMPORT_FIELDS_MOCK = AVAILABLE_FIELDS_MOCK.filter(
  (field) => !ONBOARDING_IMPORT_TEMPLATE_EXCLUDED_FIELD_CODES.has(field.field_code),
);

let importJobCounter = 1;
const mockImportJobs = new Map<string, ImportJob>();
const mockImportRows = new Map<string, Record<string, unknown>[]>();

function simulateImportProgress(jobId: string, totalRows: number): ImportJob {
  const job: ImportJob = {
    id: jobId,
    total_rows: Math.max(1, totalRows),
    success_rows: 0,
    fail_rows: 0,
    warning_rows: 0,
    processed_rows: 0,
    status: 'processing',
    error_report_url: null,
    validation_errors: [],
    warning_details: [],
  };
  mockImportJobs.set(jobId, job);
  return job;
}

function normalizePageResult<T>(raw: unknown, normalizeItem?: (item: unknown) => T): PageResult<T> {
  const result = (raw || {}) as Record<string, unknown>;
  const rawList = Array.isArray(result.items)
    ? result.items
    : Array.isArray(result.list)
      ? result.list
      : Array.isArray(result.timeline)
        ? result.timeline
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(raw)
            ? raw as unknown[]
            : [];
  const list = normalizeItem ? rawList.map(normalizeItem) : rawList as T[];
  const total = Number(result.total ?? result.totalCount ?? list.length);
  const page = Number(result.page ?? result.current ?? 1);
  const pageSize = Number(result.pageSize ?? result.size ?? (list.length || 10));

  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Number(result.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize)))),
    success: (result.success as boolean | undefined) ?? true,
  };
}

export async function getWorkOrders(params: PageParams): Promise<PageResult<WorkOrderItem>> {
  if (isMockMode) {
    let list = mockWorkOrders.map((item) => normalizeWorkOrderResponse(item));
    const query = params as PageParams & Record<string, unknown>;
    if (query.status) list = list.filter((w) => w.status === query.status);
    const orderNo = String(query.orderNo ?? query.order_no ?? '').toLowerCase();
    if (orderNo) list = list.filter((w) => String(w.order_no || '').toLowerCase().includes(orderNo));
    const orderType = String(query.orderType ?? query.order_type ?? '');
    if (orderType) list = list.filter((w) => w.order_type === orderType);
    const customerCode = String(query.customerCode ?? query.customer_code ?? '').toLowerCase();
    if (customerCode) list = list.filter((w) => String(w.customer_code || '').toLowerCase().includes(customerCode));
    const customerName = String(query.customerName ?? query.customer_name ?? '').toLowerCase();
    if (customerName) list = list.filter((w) => String(w.customer_name || '').toLowerCase().includes(customerName));
    const employeeName = String(query.employeeName ?? query.employee_name ?? '').toLowerCase();
    if (employeeName) list = list.filter((w) => String(w.employee_name || '').toLowerCase().includes(employeeName));
    const idCardNo = String(query.idCardNo ?? query.id_card_no ?? query.employeeIdCard ?? '').toLowerCase();
    if (idCardNo) list = list.filter((w) => String(w.employee_id_card || '').toLowerCase().includes(idCardNo));
    if (query.keyword) {
      const kw = String(query.keyword).toLowerCase();
      list = list.filter((w) => w.order_no.toLowerCase().includes(kw) || w.employee_name.toLowerCase().includes(kw) || (w.employee_id_card && w.employee_id_card.includes(kw)));
    }
    return mockDelay({ list, page: Number(query.page) || 1, pageSize: Number(query.pageSize) || 20, total: list.length, totalPages: 1, success: true });
  }
  const { order_type, ...restParams } = params as PageParams & Record<string, unknown>;
  const requestParams = {
    ...restParams,
    orderType: (restParams.orderType ?? order_type) as unknown,
  };
  if (!requestParams.orderType) delete requestParams.orderType;
  const raw = await request.get('/work-orders', { params: requestParams });
  return normalizePageResult<WorkOrderItem>(raw, normalizeWorkOrderResponse);
}

export async function getWorkOrder(id: string): Promise<WorkOrderItem> {
  if (isMockMode) {
    const found = mockWorkOrders.find((w) => w.id === id) || mockWorkOrders[0];
    return mockDelay(normalizeWorkOrderResponse(found));
  }
  return request.get(`/work-orders/${id}`) as Promise<WorkOrderItem>;
}

function buildMockTimeline(order: WorkOrderItem): WorkOrderTimelineItem[] {
  const createdAt = order.created_at || new Date().toISOString();
  const submittedAt = order.submitted_at || order.updated_at || createdAt;
  const items: WorkOrderTimelineItem[] = [
    normalizeWorkOrderTimelineItem({
      id: `mock-${order.id}-create`,
      createdAt,
      operatorId: null,
      operatorName: order.created_by || '当前用户',
      userId: null,
      userName: order.created_by || '当前用户',
      entityType: 'work_order',
      entityId: order.id,
      entityLabel: '主工单',
      actionCode: 'work_order.create_draft',
      actionType: 'create_draft',
      actionLabel: '创建工单',
      title: '创建工单',
      description: '创建主工单草稿',
      contextFields: { newStatus: 'draft', createdBy: order.created_by },
      beforeData: null,
      afterData: { status: 'draft' },
    }),
  ];

  if (order.submitted_at) {
    items.unshift(normalizeWorkOrderTimelineItem({
      id: `mock-${order.id}-submit`,
      createdAt: submittedAt,
      operatorId: null,
      operatorName: order.created_by || '当前用户',
      userId: null,
      userName: order.created_by || '当前用户',
      entityType: 'work_order',
      entityId: order.id,
      entityLabel: '主工单',
      actionCode: 'work_order.submit',
      actionType: 'submit',
      actionLabel: '提交工单',
      title: '提交工单',
      description: '提交主工单并触发派发',
      contextFields: { oldStatus: 'draft', newStatus: order.status },
      beforeData: { status: 'draft' },
      afterData: { status: order.status },
    }));
  }

  for (const child of order.dispatched_orders || []) {
    items.unshift(normalizeWorkOrderTimelineItem({
      id: `mock-${order.id}-${child.id}-dispatch`,
      createdAt: child.dispatched_at || submittedAt,
      operatorId: null,
      operatorName: '系统',
      userId: null,
      userName: '系统',
      entityType: 'dispatched_order',
      entityId: child.id,
      entityLabel: '子工单',
      actionCode: 'dispatched_order.dispatched',
      actionType: 'dispatched',
      actionLabel: '子工单派发',
      title: '子工单派发',
      description: '主工单派发生成子工单',
      contextFields: { parentOrderId: order.id, dispatchedOrderId: child.id, moduleCode: child.module_code, toUserId: child.handler_name, handlerId: child.handler_name },
      beforeData: null,
      afterData: { parentOrderId: order.id, moduleCode: child.module_code, handlerId: child.handler_name },
    }));
    if (child.status === 'returned') {
      items.unshift(normalizeWorkOrderTimelineItem({
        id: `mock-${order.id}-${child.id}-return`,
        createdAt: child.completed_at || order.updated_at || submittedAt,
        operatorId: null,
        operatorName: child.handler_name || '处理人',
        userId: null,
        userName: child.handler_name || '处理人',
        entityType: 'dispatched_order',
        entityId: child.id,
        entityLabel: '子工单',
        actionCode: 'dispatched_order.return',
        actionType: 'return',
        actionLabel: '退回子工单',
        title: '退回子工单',
        description: '退回未办结子工单',
        contextFields: { oldStatus: 'processing', newStatus: 'returned', returnReason: child.return_reason, moduleCode: child.module_code },
        beforeData: { status: 'processing' },
        afterData: { status: 'returned', returnReason: child.return_reason },
      }));
    }
  }

  return items.sort((a, b) => new Date(b.createdAt || b.created_at || '').getTime() - new Date(a.createdAt || a.created_at || '').getTime());
}

export async function getWorkOrderTimeline(id: string): Promise<PageResult<WorkOrderTimelineItem>> {
  if (isMockMode) {
    const found = mockWorkOrders.find((w) => w.id === id) || mockWorkOrders[0];
    const list = buildMockTimeline(found);
    return mockDelay({ list, total: list.length, page: 1, pageSize: list.length || 20, totalPages: 1, success: true });
  }
  const raw = await request.get(`/work-orders/${id}/timeline`);
  return normalizePageResult<WorkOrderTimelineItem>(raw, normalizeWorkOrderTimelineItem);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeExtraValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value && typeof value === 'object' && 'format' in (value as Record<string, unknown>)) {
    const formatter = (value as { format?: (fmt: string) => string }).format;
    if (typeof formatter === 'function') return formatter.call(value, 'YYYY-MM-DD');
  }
  return value;
}

function normalizeCreateExtraData(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const v = normalizeExtraValue(value);
    if (v !== undefined) normalized[key] = v;
  }

  // 兼容旧表单或历史代码可能传出的 camelCase 字段，避免 employeeName/idCardNo 顶层直送后端。
  const aliasMap: Record<string, string> = {
    employeeName: 'employee_name',
    idCardNo: 'id_card_no',
    customerName: 'customer_name',
    customerCode: 'customer_code',
    branchCode: 'branch_code',
  };
  for (const [camel, snake] of Object.entries(aliasMap)) {
    if (normalized[camel] !== undefined && normalized[snake] === undefined) {
      normalized[snake] = normalized[camel];
    }
    delete normalized[camel];
  }

  return normalized;
}

function normalizeDispatchedOrders(list: unknown): DispatchedOrderSummary[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      module_code: String(row.module_code ?? row.moduleCode ?? ''),
      module_name: String(row.module_name ?? row.moduleName ?? row.module_code ?? row.moduleCode ?? ''),
      status: String(row.status ?? ''),
      handler_id: (row.handler_id ?? row.handlerId ?? null) as string | null,
      handler_name: (row.handler_name ?? row.handlerName ?? null) as string | null,
      return_reason: (row.return_reason ?? row.returnReason ?? null) as string | null,
      dispatched_at: (row.dispatched_at ?? row.dispatchedAt ?? null) as string | null,
      accepted_at: (row.accepted_at ?? row.acceptedAt ?? null) as string | null,
      completed_at: (row.completed_at ?? row.completedAt ?? null) as string | null,
      void_at: (row.void_at ?? row.voidAt ?? null) as string | null,
      voidAt: (row.voidAt ?? row.void_at ?? null) as string | null,
      created_at: (row.created_at ?? row.createdAt ?? null) as string | null,
      due_at: (row.due_at ?? row.dueAt ?? null) as string | null,
      node_type: (row.node_type ?? row.nodeType ?? null) as string | null,
      is_overdue: (row.is_overdue ?? row.isOverdue ?? false) as boolean,
    };
  });
}

function normalizeWorkOrderResponse(raw: unknown): WorkOrderItem {
  const wrapper = (raw || {}) as Record<string, unknown>;
  const source = ((wrapper.workOrder as Record<string, unknown> | undefined) || wrapper) as Record<string, unknown>;
  const extra = (source.extra_data || source.extraData || {}) as Record<string, unknown>;
  const dispatched = wrapper.dispatchedOrders || source.dispatched_orders || source.dispatchedOrders || [];
  return {
    ...(source as WorkOrderItem),
    id: String(source.id ?? ''),
    order_no: String(source.order_no ?? source.orderNo ?? ''),
    order_type: String(source.order_type ?? source.orderType ?? ''),
    status: String(source.status ?? ''),
    customer_name: String(extra.customer_name ?? source.customer_name ?? source.customerName ?? (source.customer as any)?.customerName ?? ''),
    employee_name: String(extra.employee_name ?? source.employee_name ?? source.employeeName ?? ''),
    employee_id_card: String(extra.id_card_no ?? extra.employee_id_card ?? source.employee_id_card ?? source.employeeIdCard ?? ''),
    created_by: String(source.created_by ?? (source.createdBy as any)?.realName ?? source.createdBy ?? ''),
    department_id: String(source.department_id ?? source.departmentId ?? (source.department as any)?.id ?? ''),
    extra_data: extra,
    submitted_at: (source.submitted_at ?? source.submittedAt ?? null) as string | null,
    completed_at: (source.completed_at ?? source.completedAt ?? null) as string | null,
    created_at: String(source.created_at ?? source.createdAt ?? ''),
    updated_at: String(source.updated_at ?? source.updatedAt ?? ''),
    dispatched_orders: normalizeDispatchedOrders(dispatched),
  };
}

function normalizeWorkOrderTimelineItem(raw: unknown): WorkOrderTimelineItem {
  const row = (raw || {}) as Record<string, unknown>;
  const contextFields = (row.contextFields ?? row.context_fields ?? {}) as Record<string, unknown>;
  return {
    ...(row as unknown as Partial<WorkOrderTimelineItem>),
    id: String(row.id ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    created_at: String(row.created_at ?? row.createdAt ?? ''),
    operatorId: (row.operatorId ?? row.operator_id ?? null) as string | null,
    operator_id: (row.operator_id ?? row.operatorId ?? null) as string | null,
    operatorName: (row.operatorName ?? row.operator_name ?? row.userName ?? row.user_name ?? null) as string | null,
    operator_name: (row.operator_name ?? row.operatorName ?? row.userName ?? row.user_name ?? null) as string | null,
    userId: (row.userId ?? row.user_id ?? null) as string | null,
    user_id: (row.user_id ?? row.userId ?? null) as string | null,
    userName: (row.userName ?? row.user_name ?? row.operatorName ?? row.operator_name ?? null) as string | null,
    user_name: (row.user_name ?? row.userName ?? row.operatorName ?? row.operator_name ?? null) as string | null,
    entityType: String(row.entityType ?? row.entity_type ?? ''),
    entity_type: String(row.entity_type ?? row.entityType ?? ''),
    entityId: String(row.entityId ?? row.entity_id ?? ''),
    entity_id: String(row.entity_id ?? row.entityId ?? ''),
    entityLabel: String(row.entityLabel ?? row.entity_label ?? ''),
    entity_label: String(row.entity_label ?? row.entityLabel ?? ''),
    actionCode: String(row.actionCode ?? row.action_code ?? ''),
    action_code: String(row.action_code ?? row.actionCode ?? ''),
    actionType: String(row.actionType ?? row.action_type ?? ''),
    action_type: String(row.action_type ?? row.actionType ?? ''),
    actionLabel: String(row.actionLabel ?? row.action_label ?? row.title ?? ''),
    action_label: String(row.action_label ?? row.actionLabel ?? row.title ?? ''),
    title: String(row.title ?? row.actionLabel ?? row.action_label ?? ''),
    description: String(row.description ?? ''),
    contextFields,
    context_fields: contextFields,
    beforeData: (row.beforeData ?? row.before_data ?? null) as Record<string, unknown> | null,
    before_data: (row.before_data ?? row.beforeData ?? null) as Record<string, unknown> | null,
    afterData: (row.afterData ?? row.after_data ?? null) as Record<string, unknown> | null,
    after_data: (row.after_data ?? row.afterData ?? null) as Record<string, unknown> | null,
  };
}


export async function createWorkOrder(data: Record<string, unknown>): Promise<WorkOrderItem> {
  // ====== 统一载荷打包 ======
  // 后端 CreateWorkOrderDto 仅接受: orderType / customerId / departmentId / extraData。
  // 所有业务动态字段（含 employeeName/idCardNo 等历史别名）只能进入 extraData，严禁平铺到顶层。
  const {
    orderType,
    order_type,
    customerId,
    customer_id,
    departmentId,
    department_id,
    extraData,
    extra_data,
    _action,
    ...rest
  } = data as Record<string, unknown>;
  const resolvedOrderType = (orderType as string) || (order_type as string) || 'onboarding';
  const action = (_action as string) || 'submit';
  const mergedExtra = normalizeCreateExtraData({
    ...(isPlainRecord(extra_data) ? extra_data : {}),
    ...(isPlainRecord(extraData) ? extraData : {}),
    ...rest,
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const payload: Record<string, unknown> = {
    orderType: resolvedOrderType,
    extraData: mergedExtra,
  };
  const cid = (customerId as string) || (customer_id as string) || '';
  const did = (departmentId as string) || (department_id as string) || '';
  if (cid && UUID_RE.test(cid)) payload.customerId = cid;
  if (did && UUID_RE.test(did)) payload.departmentId = did;

  if (isMockMode) {
    // mock 路径同样使用统一载荷，确保真实接口和 mock 行为一致。
    const orderTypeValue = resolvedOrderType;
    const newOrder: WorkOrderItem = {
      id: `${Date.now()}`,
      order_no: `ON${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      order_type: orderTypeValue,
      status: action === 'submit' ? 'processing' : 'draft',
      customer_name: (mergedExtra.customer_name as string) || '',
      employee_name: (mergedExtra.employee_name as string) || '',
      employee_id_card: (mergedExtra.id_card_no as string) || '',
      created_by: '当前用户', department_id: '1',
      extra_data: { ...mergedExtra },
      submitted_at: action === 'submit' ? new Date().toISOString() : null,
      completed_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      dispatched_orders: action === 'submit' ? (orderTypeValue === 'renewal' ? [
        { id: `d-n1`, module_code: 'renewal_contract', module_name: '劳动合同续签', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
      ] : orderTypeValue === 'resignation' ? [
        { id: `d-n1`, module_code: 'resignation_contact', module_name: '离职材料收集', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
        { id: `d-n2`, module_code: 'data_entry_resign', module_name: '减员报岗录入', status: 'pending', handler_name: '安娜祎', dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
        { id: `d-n3`, module_code: 'resignation_social_insurance', module_name: '社保公积金减员', status: 'pending', handler_name: '傅倩雯', dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
      ] : orderTypeValue === 'benefit' ? [
        { id: `d-n1`, module_code: 'benefit_apply', module_name: '待遇申报', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
      ] : [
        // onboarding 默认：增员报岗录入、社保公积金增员固定生成；合同/入职联系按原条件生成
        { id: `d-n1`, module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
        { id: `d-n2`, module_code: 'social_insurance', module_name: '社保公积金增员', status: 'pending', handler_name: '傅倩雯', dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null },
        ...(mergedExtra.need_company_contract === '是' ? [{ id: `d-n3`, module_code: 'contract', module_name: '劳动合同新签', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null }] : []),
        ...(mergedExtra.need_onboarding_contact === '是' ? [{ id: `d-n4`, module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending', handler_name: null, dispatched_at: new Date().toISOString(), accepted_at: null, completed_at: null }] : []),
      ]) : [],
    };
    mockWorkOrders.unshift(newOrder);
    saveMockWorkOrders();
    return mockDelay(newOrder, 600);
  }

  const draft = normalizeWorkOrderResponse(await request.post('/work-orders', payload));
  if (action === 'submit' && draft?.id) {
    return normalizeWorkOrderResponse(await request.post(`/work-orders/${draft.id}/submit`, {}));
  }
  return draft;
}

export async function updateWorkOrder(id: string, data: Record<string, unknown>): Promise<WorkOrderItem> {
  if (isMockMode) {
    const idx = mockWorkOrders.findIndex((w) => w.id === id);
    if (idx >= 0) {
      const prev = mockWorkOrders[idx];
      const incomingExtra = (data.extra_data as Record<string, unknown>) || undefined;
      const merged: WorkOrderItem = {
        ...prev,
        extra_data: { ...prev.extra_data, ...(incomingExtra || {}) },
        updated_at: new Date().toISOString(),
      };
      mockWorkOrders[idx] = merged;
      saveMockWorkOrders();
      return mockDelay(merged);
    }
    return mockDelay(mockWorkOrders[0]);
  }
  // 真实后端：UpdateWorkOrderDto 仅接受 customerId / departmentId / extraData
  const {
    customerId,
    customer_id,
    departmentId,
    department_id,
    extra_data,
    extraData,
    orderType: _ot,
    order_type: _ots,
    _action: _a,
    ...rest
  } = data as Record<string, unknown>;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const mergedExtra: Record<string, unknown> = {
    ...((extraData as Record<string, unknown>) || (extra_data as Record<string, unknown>) || {}),
    ...rest,
  };
  const payload: Record<string, unknown> = { extraData: mergedExtra };
  const cid = (customerId as string) || (customer_id as string) || '';
  const did = (departmentId as string) || (department_id as string) || '';
  if (cid && UUID_RE.test(cid)) payload.customerId = cid;
  if (did && UUID_RE.test(did)) payload.departmentId = did;
  return request.put(`/work-orders/${id}`, payload) as Promise<WorkOrderItem>;
}

export async function submitWorkOrder(id: string): Promise<WorkOrderItem> {
  if (isMockMode) {
    const idx = mockWorkOrders.findIndex((w) => w.id === id);
    if (idx < 0) return mockDelay(mockWorkOrders[0]);
    const found = mockWorkOrders[idx];
    const needContract = found.extra_data.need_company_contract === '是';
    const needContact = found.extra_data.need_onboarding_contact === '是';
    const now = new Date().toISOString();
    const updated: WorkOrderItem = {
      ...found, status: 'processing', submitted_at: now, updated_at: now,
      dispatched_orders: [
        { id: `d-s1-${id}`, module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null },
        { id: `d-s2-${id}`, module_code: 'social_insurance', module_name: '社保公积金增员', status: 'pending', handler_name: '傅倩雯', dispatched_at: now, accepted_at: null, completed_at: null },
        ...(needContract ? [{ id: `d-s3-${id}`, module_code: 'contract', module_name: '劳动合同新签', status: 'pending' as const, handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null }] : []),
        ...(needContact ? [{ id: `d-s4-${id}`, module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending' as const, handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null }] : []),
      ],
    };
    mockWorkOrders[idx] = updated;
    saveMockWorkOrders();

    addMockNotification({
      id: 'n-submit-' + id + '-' + Date.now(),
      type: '工单提交',
      biz_type: 'task',
      priority: 'normal',
      title: '工单已提交',
      content: `工单 ${found.order_no}（${found.employee_name} / ${found.customer_name}）已提交并进入派发流程`,
      entity_type: 'work_order',
      entity_id: id,
      link: `/work-orders/${id}`,
      is_read: false,
      created_at: now,
    });

    return mockDelay(updated, 800);
  }
  return request.post(`/work-orders/${id}/submit`) as Promise<WorkOrderItem>;
}

export async function resubmitWorkOrder(id: string, data?: Record<string, unknown>): Promise<WorkOrderItem> {
  if (isMockMode) {
    const idx = mockWorkOrders.findIndex((w) => w.id === id);
    if (idx < 0) return mockDelay(mockWorkOrders[0]);
    const found = mockWorkOrders[idx];
    const updatedDispatched = (found.dispatched_orders || []).map((d) =>
      d.status === 'returned' ? { ...d, status: 'pending' as const, return_reason: undefined } : d
    );
    const updated: WorkOrderItem = {
      ...found, status: 'processing', extra_data: { ...found.extra_data, ...data },
      dispatched_orders: updatedDispatched, updated_at: new Date().toISOString(),
    };
    mockWorkOrders[idx] = updated;
    saveMockWorkOrders();

    addMockNotification({
      id: 'n-resubmit-' + id + '-' + Date.now(),
      type: '工单重提',
      biz_type: 'task',
      priority: 'normal',
      title: '工单已重新提交',
      content: `工单 ${found.order_no}（${found.employee_name} / ${found.customer_name}）已重新提交`,
      entity_type: 'work_order',
      entity_id: id,
      link: `/work-orders/${id}`,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return mockDelay(updated, 800);
  }
  // 真实后端：resubmit 仅接受 SubmitWorkOrderDto { extraData? }
  const body: Record<string, unknown> = {};
  if (data && Object.keys(data).length > 0) {
    const {
      orderType: _ot,
      order_type: _ots,
      customerId: _cid,
      customer_id: _cids,
      departmentId: _did,
      department_id: _dids,
      _action: _a,
      extraData,
      extra_data,
      ...rest
    } = data as Record<string, unknown>;
    body.extraData = {
      ...((extraData as Record<string, unknown>) || (extra_data as Record<string, unknown>) || {}),
      ...rest,
    };
  }
  return request.post(`/work-orders/${id}/resubmit`, body) as Promise<WorkOrderItem>;
}

export async function withdrawWorkOrder(id: string, reason?: string): Promise<WorkOrderItem> {
  const body = reason?.trim() ? { reason: reason.trim() } : {};
  return request.post(`/work-orders/${id}/withdraw`, body) as Promise<WorkOrderItem>;
}

export async function voidWorkOrder(id: string, reason: string): Promise<WorkOrderItem> {
  return request.post(`/work-orders/${id}/void`, { reason: reason.trim() }) as Promise<WorkOrderItem>;
}

export async function approveWithdrawWorkOrder(id: string, approved: boolean, comment?: string): Promise<WorkOrderItem> {
  const body: Record<string, unknown> = { approved };
  if (comment?.trim()) body.comment = comment.trim();
  return request.post(`/work-orders/${id}/withdraw/approve`, body) as Promise<WorkOrderItem>;
}

export async function approveVoidWorkOrder(id: string, approved: boolean, comment?: string): Promise<WorkOrderItem> {
  const body: Record<string, unknown> = { approved };
  if (comment?.trim()) body.comment = comment.trim();
  return request.post(`/work-orders/${id}/void/approve`, body) as Promise<WorkOrderItem>;
}

export async function deleteWorkOrder(id: string): Promise<void> {
  if (isMockMode) {
    const idx = mockWorkOrders.findIndex((w) => w.id === id);
    if (idx >= 0) {
      mockWorkOrders.splice(idx, 1);
      saveMockWorkOrders();
    }
    return mockDelay(undefined);
  }
  return request.delete(`/work-orders/${id}`) as Promise<void>;
}

export async function batchDeleteWorkOrders(ids: string[]): Promise<{ deleted: number }> {
  if (isMockMode) {
    const set = new Set(ids);
    const before = mockWorkOrders.length;
    for (let i = mockWorkOrders.length - 1; i >= 0; i--) {
      if (set.has(mockWorkOrders[i].id)) mockWorkOrders.splice(i, 1);
    }
    saveMockWorkOrders();
    return mockDelay({ deleted: before - mockWorkOrders.length }, 300);
  }
  return request.post('/work-orders/batch-delete', { ids }) as Promise<{ deleted: number }>;
}

const HEADER_SUGGESTIONS: Record<string, { code: string; name: string; confidence: number }> = {
  '客户名称': { code: 'customer_name', name: '客户名称', confidence: 0.98 },
  '客户': { code: 'customer_name', name: '客户名称', confidence: 0.9 },
  '客户代码': { code: 'customer_code', name: '客户代码', confidence: 0.98 },
  '外包类型': { code: 'outsource_type', name: '外包类型', confidence: 0.97 },
  '岗位': { code: 'position', name: '岗位', confidence: 0.95 },
  '职位': { code: 'position', name: '岗位', confidence: 0.88 },
  '姓名': { code: 'employee_name', name: '姓名', confidence: 0.98 },
  '员工姓名': { code: 'employee_name', name: '姓名', confidence: 0.96 },
  '身份证号码（护照）': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.98 },
  '身份证号码(护照)': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.98 },
  '身份证号（护照）': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.97 },
  '身份证号(护照)': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.97 },
  '身份证（护照）': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.96 },
  '身份证(护照)': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.96 },
  '身份证号码': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.96 },
  '身份证号': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.95 },
  '身份证': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.9 },
  '护照': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.85 },
  '护照号': { code: 'id_card_no', name: '身份证号码（护照）', confidence: 0.85 },
  '性别': { code: 'gender', name: '性别', confidence: 0.98 },
  '出生日期': { code: 'birth_date', name: '出生日期', confidence: 0.95 },
  '年龄': { code: 'age', name: '年龄', confidence: 0.95 },
  '户籍性质': { code: 'household_type', name: '户籍性质', confidence: 0.95 },
  '民族': { code: 'ethnicity', name: '民族', confidence: 0.95 },
  '移动电话': { code: 'mobile', name: '移动电话', confidence: 0.97 },
  '手机号': { code: 'mobile', name: '移动电话', confidence: 0.9 },
  '手机': { code: 'mobile', name: '移动电话', confidence: 0.85 },
  '电话': { code: 'mobile', name: '移动电话', confidence: 0.8 },
  '电子邮件': { code: 'email', name: '电子邮件', confidence: 0.98 },
  '邮箱': { code: 'email', name: '电子邮件', confidence: 0.9 },
  '现住地址': { code: 'current_address', name: '现住地址', confidence: 0.97 },
  '户籍地址': { code: 'household_address', name: '户籍地址', confidence: 0.97 },
  '邮编': { code: 'postal_code', name: '邮编', confidence: 0.95 },
  '合同期限形式': { code: 'contract_term_type', name: '合同期限形式', confidence: 0.95 },
  '合同期限': { code: 'contract_term', name: '合同期限', confidence: 0.93 },
  '合同开始日期': { code: 'contract_start_date', name: '合同开始日期', confidence: 0.95 },
  '合同终止日期': { code: 'contract_end_date', name: '合同终止日期', confidence: 0.95 },
  '试用期开始日期': { code: 'probation_start_date', name: '试用期开始日期', confidence: 0.95 },
  '试用期（月）': { code: 'probation_months', name: '试用期(月)', confidence: 0.95 },
  '试用期(月)': { code: 'probation_months', name: '试用期(月)', confidence: 0.94 },
  '试用期月数': { code: 'probation_months', name: '试用期(月)', confidence: 0.88 },
  '试用期结束日期': { code: 'probation_end_date', name: '试用期结束日期', confidence: 0.95 },
  '工作城市': { code: 'work_city', name: '工作城市', confidence: 0.95 },
  '工时制': { code: 'work_hour_system', name: '工时制', confidence: 0.95 },
  '工作制周期': { code: 'work_cycle', name: '工作制周期', confidence: 0.95 },
  '工资形式': { code: 'salary_form', name: '工资形式', confidence: 0.92 },
  '基本工资': { code: 'base_salary', name: '基本工资', confidence: 0.95 },
  '其他工资': { code: 'other_salary', name: '其他工资', confidence: 0.93 },
  '试用期工资': { code: 'probation_salary', name: '试用期工资', confidence: 0.92 },
  '发薪周期': { code: 'payroll_cycle', name: '发薪周期', confidence: 0.95 },
  '发薪日期': { code: 'payroll_date', name: '发薪日期', confidence: 0.95 },
  '发薪地': { code: 'pay_location', name: '发薪地', confidence: 0.92 },
  '参保地': { code: 'social_location', name: '参保地', confidence: 0.95 },
  '起始月': { code: 'start_month', name: '起始月', confidence: 0.93 },
  '社保基数': { code: 'social_base', name: '社保基数', confidence: 0.97 },
  '公积金基数': { code: 'fund_base', name: '公积金基数', confidence: 0.97 },
  '公积金比例': { code: 'fund_ratio', name: '公积金比例', confidence: 0.95 },
  '开户银行信息': { code: 'bank_name', name: '开户银行信息', confidence: 0.95 },
  '开户银行': { code: 'bank_name', name: '开户银行信息', confidence: 0.9 },
  '银行借记卡帐号': { code: 'bank_account', name: '银行借记卡帐号', confidence: 0.95 },
  '银行账号': { code: 'bank_account', name: '银行借记卡帐号', confidence: 0.9 },
  '银行卡号': { code: 'bank_account', name: '银行借记卡帐号', confidence: 0.9 },
  '备注': { code: 'remark', name: '备注', confidence: 0.85 },
  '业务模式': { code: 'business_mode', name: '业务模式', confidence: 0.94 },
  '人员类型': { code: 'employee_type', name: '人员类型', confidence: 0.94 },
  '是否企服发起劳动合同': { code: 'need_company_contract', name: '是否企服发起劳动合同', confidence: 0.95 },
  '是否签订劳动合同': { code: 'need_company_contract', name: '是否企服发起劳动合同', confidence: 0.88 },
  '劳动合同主体': { code: 'contract_subject', name: '劳动合同主体', confidence: 0.95 },
  '劳动合同模板': { code: 'contract_template', name: '劳动合同模板', confidence: 0.95 },
  '劳动合同签署是否需要催办员工': { code: 'contract_urge', name: '劳动合同签署是否需要催办员工', confidence: 0.95 },
  '劳动合同新签反馈': { code: 'contract_feedback', name: '劳动合同新签反馈', confidence: 0.95 },
  '劳动合同签订反馈': { code: 'contract_feedback', name: '劳动合同新签反馈', confidence: 0.9 },
  '入职材料是否需要集约收集': { code: 'need_onboarding_contact', name: '入职材料是否需要集约收集', confidence: 0.95 },
  '是否需要入职联系': { code: 'need_onboarding_contact', name: '入职材料是否需要集约收集', confidence: 0.85 },
  '入职联系反馈': { code: 'onboarding_feedback', name: '入职联系反馈', confidence: 0.95 },
  '是否企服发薪': { code: 'need_company_payroll', name: '是否企服发薪', confidence: 0.95 },
  '特殊备注': { code: 'special_remark', name: '特殊备注', confidence: 0.9 },
  '增员报岗录入反馈': { code: 'data_entry_feedback', name: '增员报岗录入反馈', confidence: 0.95 },
  '数据录入反馈': { code: 'data_entry_feedback', name: '增员报岗录入反馈', confidence: 0.9 },
  '岗位类型': { code: 'position_type', name: '岗位类型', confidence: 0.95 },
  '证件类型': { code: 'id_card_type', name: '证件类型', confidence: 0.95 },
  '学历': { code: 'education', name: '学历', confidence: 0.95 },
  '婚姻状况': { code: 'marital_status', name: '婚姻状况', confidence: 0.95 },
  '试用期其他工资': { code: 'probation_other_salary', name: '试用期其他工资', confidence: 0.93 },
  '是否电子签': { code: 'need_esign', name: '是否电子签', confidence: 0.95 },
  '电子签平台': { code: 'esign_platform', name: '电子签平台', confidence: 0.95 },
  '甲方住所': { code: 'company_address', name: '甲方住所', confidence: 0.95 },
  '项目名称': { code: 'project_name', name: '项目名称', confidence: 0.95 },
  '安排或调整工作的情况': { code: 'work_arrangement', name: '安排或调整工作的情况', confidence: 0.95 },
  '反馈截止日期': { code: 'feedback_deadline', name: '反馈截止日期', confidence: 0.93 },
  '需要反馈截止日期': { code: 'feedback_deadline', name: '反馈截止日期', confidence: 0.9 },
  '是否为通用模板': { code: 'is_common_template', name: '是否为通用模板', confidence: 0.95 },
  '模板名称': { code: 'template_name', name: '模板名称', confidence: 0.93 },
  '缴纳地区': { code: 'social_pay_region', name: '缴纳地区', confidence: 0.94 },
  '社保公积金停保月': { code: 'social_stop_month', name: '社保公积金停保月', confidence: 0.94 },
  '停保月': { code: 'social_stop_month', name: '社保公积金停保月', confidence: 0.85 },
  '离职原因': { code: 'resignation_reason', name: '离职原因', confidence: 0.93 },
  '离职日期': { code: 'resignation_date', name: '离职日期', confidence: 0.93 },
  '离职材料是否需要共享收集': { code: 'need_resignation_share', name: '离职材料是否需要共享收集', confidence: 0.93 },
};

async function readExcelFile(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

function normalizeHeader(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[\s ​‌‍　\r\n\t]+/g, '')
    .replace(/[*＊'"：:]/g, '')
    .toLowerCase();
}

const NORMALIZED_SUGGESTIONS: Record<string, { code: string; name: string; confidence: number }> = (() => {
  const out: Record<string, { code: string; name: string; confidence: number }> = {};
  for (const [k, v] of Object.entries(HEADER_SUGGESTIONS)) out[normalizeHeader(k)] = v;
  for (const f of AVAILABLE_IMPORT_FIELDS_MOCK) {
    const key = normalizeHeader(f.field_name);
    if (!out[key]) out[key] = { code: f.field_code, name: f.field_name, confidence: 0.9 };
  }
  return out;
})();

function resolveHeader(header: string): { code: string; name: string; confidence: number } | undefined {
  const norm = normalizeHeader(header);
  const exact = NORMALIZED_SUGGESTIONS[norm];
  if (exact) return exact;

  const stripped = stripParens(norm);
  if (stripped && stripped !== norm) {
    const byStripped = NORMALIZED_SUGGESTIONS[stripped];
    if (byStripped) return { ...byStripped, confidence: Math.min(byStripped.confidence, 0.82) };
  }

  let best: { code: string; name: string; confidence: number } | undefined;
  let bestScore = 0;
  const a = stripped || norm;
  for (const [key, v] of Object.entries(NORMALIZED_SUGGESTIONS)) {
    const b = stripParens(key) || key;
    if (a.length < 2 || b.length < 2) continue;
    if (a === b) { best = v; bestScore = 1; break; }
    if (a.includes(b) || b.includes(a)) {
      const score = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      if (score > bestScore) { bestScore = score; best = v; }
    }
  }
  if (best && bestScore >= 0.5) {
    return { ...best, confidence: Math.min(0.75, bestScore * 0.85) };
  }
  return undefined;
}

function stripParens(s: string): string {
  return s.replace(/\([^)]*\)/g, '');
}

function normalizeImportPreviewResult(raw: RawImportPreviewResult, fallbackFileId: string): ImportPreviewResult {
  const availableFields = (raw.availableFields || []).map((field) => ({
    field_code: field.field_code || field.fieldCode || '',
    field_name: field.field_name || field.fieldName || field.field_code || field.fieldCode || '',
    is_required: field.is_required ?? field.required ?? false,
  })).filter((field) => field.field_code);

  const suggestedMapping = raw.suggestedMapping || raw.suggestion || {};
  const confidence = raw.confidence || {};
  const mapping = raw.mapping || (raw.headers || Object.keys(suggestedMapping)).map((header) => {
    const fieldCode = suggestedMapping[header] || '';
    const matchedField = availableFields.find((field) => field.field_code === fieldCode);
    return {
      excelColumn: header,
      systemFieldCode: fieldCode,
      systemFieldName: matchedField?.field_name || fieldCode,
      confidence: confidence[header],
    };
  });

  return {
    ...raw,
    fileId: raw.fileId || fallbackFileId,
    mapping,
    availableFields,
    suggestedMapping,
    totalRows: raw.totalRows ?? raw.rowCount ?? 0,
    previewRows: raw.previewRows || raw.preview || [],
    missingRequired: raw.missingRequired || [],
    unmatched: raw.unmatched || raw.unmatchedHeaders || [],
    unmatchedHeaders: raw.unmatchedHeaders || raw.unmatched || [],
    modelUsed: raw.modelUsed,
    fallbackReason: raw.fallbackReason ?? null,
  };
}

export async function previewImport(file: File, orderType = 'onboarding'): Promise<ImportPreviewResult> {
  if (isMockMode) {
    const { headers, rows } = await readExcelFile(file);
    if (headers.length === 0) {
      return mockDelay({
        mapping: [], availableFields: AVAILABLE_IMPORT_FIELDS_MOCK, suggestedMapping: {},
        totalRows: 0, previewRows: [], missingRequired: [],
      }, 300);
    }
    const mapping = headers.map((h) => {
      const s = resolveHeader(h);
      return {
        excelColumn: h,
        systemFieldCode: s?.code || '',
        systemFieldName: s?.name || '',
        confidence: s?.confidence,
      };
    });

    const suggestedMapping: Record<string, string> = {};
    for (const m of mapping) if (m.systemFieldCode) suggestedMapping[m.excelColumn] = m.systemFieldCode;
    return mockDelay({
      mapping,
      availableFields: AVAILABLE_IMPORT_FIELDS_MOCK,
      suggestedMapping,
      totalRows: rows.length,
      previewRows: rows.slice(0, 10),
      missingRequired: [],
      _rows: rows,
    } as ImportPreviewResult & { _rows: Record<string, unknown>[] }, 800);
  }
  const uploaded = await uploadExcel(file);
  const fileId = uploaded.fileId || uploaded.id;
  if (!fileId) {
    throw new Error('Excel 上传成功但未返回 fileId，请重新上传文件后再试');
  }
  const result = await request.post('/work-orders/import/preview', {
    fileId,
    orderType,
    sampleRows: 10,
  }) as RawImportPreviewResult;
  return normalizeImportPreviewResult(result, fileId);
}

export interface ImportNewFieldPayload {
  header: string;
  fieldName: string;
  fieldType: string;
  required?: boolean;
}

export async function confirmImport(
  mapping: Record<string, string>,
  rows?: Record<string, unknown>[],
  fileId?: string,
  newFields?: ImportNewFieldPayload[],
  orderType = 'onboarding',
): Promise<ImportJob> {
  if (isMockMode) {
    const jobId = `job-${importJobCounter++}-${Date.now()}`;
    const dataRows = rows || [];
    const mapped: Record<string, unknown>[] = dataRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [excelCol, fieldCode] of Object.entries(mapping)) {
        if (!fieldCode) continue;
        out[fieldCode] = row[excelCol];
      }
      return out;
    });
    mockImportRows.set(jobId, mapped);
    const job = simulateImportProgress(jobId, mapped.length);
    return mockDelay(job, 500);
  }
  if (!fileId || fileId.trim().length === 0) {
    throw new Error('缺少 Excel fileId，请重新上传文件后再确认导入');
  }
  const sanitizedMapping: Record<string, string> = {};
  for (const [header, code] of Object.entries(mapping)) {
    if (code === '__NEW_FIELD__') continue;
    sanitizedMapping[header] = code;
  }
  const result = await request.post('/work-orders/import/confirm', {
    fileId: fileId.trim(),
    orderType,
    mapping: sanitizedMapping,
    autoSubmit: true,
    ...(newFields && newFields.length > 0 ? { newFields } : {}),
  }) as RawImportJob;
  return normalizeImportJobResponse(result);
}

function getImportTemplateFileName(orderType: string): string {
  const label = orderType === 'resignation' ? '离职' : '入职';
  return `工单管理系统-${label}导入模板.xlsx`;
}

function parseContentDispositionFileName(disposition: string | undefined): string | null {
  if (!disposition) return null;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return null;
    }
  }
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch ? asciiMatch[1] : null;
}

export async function downloadCurrentImportTemplate(orderType = 'onboarding'): Promise<{ fieldCount: number; fileName: string }> {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  // 直接用 axios（绕过 request 的响应拦截器，拦截器会把 blob 当 ApiResponse 处理而报错）
  let response;
  try {
    response = await axios.get<Blob>(`${base}/api/work-orders/import/template`, {
      params: { orderType },
      responseType: 'blob',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (err) {
    // 后端业务异常（如 NO_FIELDS）以非 2xx + JSON blob 返回，需解出 message
    const respData = (err as { response?: { data?: unknown } }).response?.data;
    if (respData instanceof Blob) {
      const message = await extractBlobErrorMessage(respData);
      throw new Error(message);
    }
    throw err instanceof Error ? err : new Error('下载模板失败');
  }

  const blob = response.data;
  if (blob.type && blob.type.includes('application/json')) {
    throw new Error(await extractBlobErrorMessage(blob));
  }

  const fileName =
    parseContentDispositionFileName(response.headers['content-disposition']) ||
    getImportTemplateFileName(orderType);
  const fieldCount = Number(response.headers['x-field-count'] ?? 0);

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);

  return { fieldCount, fileName };
}

async function extractBlobErrorMessage(blob: Blob): Promise<string> {
  try {
    const parsed = JSON.parse(await blob.text()) as { message?: string };
    if (parsed.message === 'NO_FIELDS') return 'NO_FIELDS';
    return parsed.message || '下载模板失败';
  } catch {
    return '下载模板失败';
  }
}

export function downloadImportErrorReport(jobId: string) {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
  const url = `${base}/api/work-orders/import/jobs/${jobId}/error-report${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  window.open(url, '_blank');
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  if (isMockMode) {
    const job = mockImportJobs.get(jobId);
    if (!job) {
      return mockDelay({
        id: jobId, total_rows: 0, success_rows: 0, fail_rows: 0, warning_rows: 0, processed_rows: 0,
        status: 'completed', error_report_url: null, validation_errors: [], warning_details: [],
      }, 200);
    }
    if (job.status === 'processing' && job.processed_rows !== undefined) {
      const step = Math.max(1, Math.ceil(job.total_rows / 5));
      job.processed_rows = Math.min(job.total_rows, job.processed_rows + step);
      const rows = mockImportRows.get(jobId) || [];
      const validationErrors: Array<{ row: number; field: string; message: string }> = [];
      let failCount = 0;
      for (let i = 0; i < job.processed_rows; i++) {
        const r = rows[i] || {};
        if (!r.employee_name) { validationErrors.push({ row: i + 1, field: 'employee_name', message: '姓名不能为空' }); failCount++; continue; }
        if (!r.id_card_no) { validationErrors.push({ row: i + 1, field: 'id_card_no', message: '身份证号不能为空' }); failCount++; continue; }
      }
      job.fail_rows = failCount;
      job.warning_rows = 0;
      job.success_rows = job.processed_rows - failCount;
      if (job.processed_rows >= job.total_rows) {
        job.status = 'completed';
        job.error_report_url = failCount > 0 ? '/api/files/error-report.xlsx' : null;
        job.validation_errors = validationErrors;

        const now = new Date().toISOString();
        const datePart = now.slice(0, 10).replace(/-/g, '');
        let seq = 900;
        rows.forEach((r, i) => {
          if (!r.employee_name || !r.id_card_no) return;
          const id = `${Date.now()}-imp${i}`;
          const needContract = String(r.need_company_contract ?? '是') === '是';
          const needContact = String(r.need_onboarding_contact ?? '是') === '是';
          const dispatched = [
            { id: `${id}-d1`, module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending' as const, handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null },
            { id: `${id}-d2`, module_code: 'social_insurance', module_name: '社保公积金增员', status: 'pending' as const, handler_name: '傅倩雯', dispatched_at: now, accepted_at: null, completed_at: null },
            ...(needContract ? [{ id: `${id}-d3`, module_code: 'contract', module_name: '劳动合同新签', status: 'pending' as const, handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null }] : []),
            ...(needContact ? [{ id: `${id}-d4`, module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending' as const, handler_name: null, dispatched_at: now, accepted_at: null, completed_at: null }] : []),
          ];
          mockWorkOrders.unshift({
            id,
            order_no: `ON${datePart}${String(seq++).padStart(3, '0')}`,
            order_type: 'onboarding',
            status: 'processing',
            customer_name: String(r.customer_name ?? '浙江企服'),
            employee_name: String(r.employee_name),
            employee_id_card: String(r.id_card_no),
            created_by: '批量导入', department_id: '1',
            extra_data: { ...r, _source: 'import', _job: jobId },
            submitted_at: now, completed_at: null,
            created_at: now, updated_at: now,
            dispatched_orders: dispatched,
          });
        });
        saveMockWorkOrders();
        mockImportRows.delete(jobId);
      }
    }
    return mockDelay({ ...job }, 200);
  }
  const result = await request.get(`/work-orders/import/${jobId}`) as RawImportJob;
  return normalizeImportJobResponse(result);
}
