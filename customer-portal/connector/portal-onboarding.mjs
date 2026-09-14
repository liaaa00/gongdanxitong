import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^(?:[1-9]|1[0-2])月$/;
const MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const BANK_TEXT_PATTERN = /^[^\s()[\]{}<>（）【】]+$/;
const BANK_ACCOUNT_PATTERN = /^\d{8,30}$/;
const CONTRACT_TERM_TYPES = new Set(['固定期限', '无固定期限', '任务期限']);
const WORK_HOUR_SYSTEMS = new Set(['标准工时制', '综合工时制', '不定时工时制']);
const SALARY_FORMS = new Set(['按月']);
const TOKEN_VERSION = 1;
const TOKEN_AUDIENCE = 'customer-portal';
// Keep the public portal attachment limit below the 50 MB reverse-proxy body limit
// after base64 encoding, while allowing the larger files agreed in the review.
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.zip']);

// Only fields rendered in the phase-one onboarding form may cross the public portal boundary.
// Customer-specific defaults (contract subject, e-sign route, fund ratio, etc.) remain internal.
const CUSTOMER_ONBOARDING_FIELDS = new Set([
  'employee_name', 'id_card_type', 'id_card_no', 'mobile', 'email',
  'household_type', 'ethnicity', 'education', 'marital_status', 'household_address', 'current_address',
  'position', 'position_type', 'work_city', 'contract_term_type',
  'contract_start_date', 'contract_end_date', 'probation_start_date', 'probation_end_date',
  'work_hour_system', 'salary_form', 'base_salary', 'other_salary', 'probation_salary',
  'social_location', 'start_month', 'social_base', 'fund_base',
  'bank_location', 'bank_name', 'bank_account',
]);

const INTERNAL_ONBOARDING_DEFAULT_FIELDS = new Set([
  'fund_ratio', 'outsource_type', 'business_mode', 'employee_type', 'need_company_contract',
  'need_esign', 'esign_platform', 'contract_subject', 'company_address', 'project_name',
  'work_arrangement', 'contract_template', 'need_contract_urge', 'need_onboarding_contact',
  'feedback_deadline', 'is_common_template', 'supplementary_materials', 'need_company_payroll',
  'payroll_location', 'social_urge', 'special_remark',
]);

const INTERNAL_RESIGNATION_DEFAULT_FIELDS = new Set([
  'need_resignation_cert', 'cert_delivery_address', 'cert_delivery_method', 'certificate_template',
]);
const SALARY_REMINDER_OFFSETS = [3, 2, 1];
const REQUIRED_CUSTOMER_ONBOARDING_FIELDS = [
  'employee_name', 'id_card_type', 'id_card_no', 'mobile',
  'position', 'position_type', 'work_city', 'contract_term_type', 'contract_start_date',
  'work_hour_system', 'salary_form', 'base_salary',
  'social_location', 'start_month', 'social_base', 'fund_base',
];

export class PortalRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function extensionOf(name) {
  const match = /\.[^.]+$/.exec(String(name || '').toLowerCase());
  return match ? match[0] : '';
}

function decodeBase64(value, fieldName) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/=_-]+$/.test(value)) {
    throw new PortalRequestError('INVALID_ATTACHMENT', fieldName + ' must be base64 data');
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length) throw new PortalRequestError('INVALID_ATTACHMENT', fieldName + ' is empty');
  return buffer;
}

export function normalizePortalAttachments(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) {
    throw new PortalRequestError('INVALID_ATTACHMENT', 'files must contain 1-5 items');
  }
  return files.map((file) => {
    if (!isPlainObject(file)) throw new PortalRequestError('INVALID_ATTACHMENT', 'attachment must be an object');
    const name = requiredText(file.name, 'attachment name');
    const extension = extensionOf(name);
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
      throw new PortalRequestError('INVALID_ATTACHMENT', 'unsupported attachment type: ' + extension);
    }
    const buffer = decodeBase64(file.contentBase64, 'attachment content');
    if (buffer.length > MAX_ATTACHMENT_BYTES) throw new PortalRequestError('INVALID_ATTACHMENT', 'attachment exceeds the allowed size limit');
    return {
      name,
      contentBase64: buffer.toString('base64'),
      size: buffer.length,
      mimeType: typeof file.mimeType === 'string' ? file.mimeType.slice(0, 120) : 'application/octet-stream',
      bizPurpose: requiredText(file.bizPurpose, 'attachment business purpose'),
    };
  });
}

export function normalizeImportMapping(mapping) {
  if (!isPlainObject(mapping) || Object.keys(mapping).length < 1 || Object.keys(mapping).length > 200) {
    throw new PortalRequestError('INVALID_IMPORT', 'mapping must contain 1-200 columns');
  }
  const normalized = {};
  for (const [header, fieldCode] of Object.entries(mapping)) {
    const cleanHeader = String(header).trim();
    const cleanFieldCode = String(fieldCode).trim();
    if (!cleanHeader || cleanHeader.length > 100 || !/^[A-Za-z0-9_:-]{1,100}$/.test(cleanFieldCode)) {
      throw new PortalRequestError('INVALID_IMPORT', 'Excel column mapping is invalid');
    }
    if (!CUSTOMER_ONBOARDING_FIELDS.has(cleanFieldCode)) {
      throw new PortalRequestError('INVALID_IMPORT', 'Excel mapping may only target customer-editable onboarding fields: ' + cleanFieldCode);
    }
    normalized[cleanHeader] = cleanFieldCode;
  }
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PortalRequestError('INVALID_PORTAL_LINK', fieldName + ' is required');
  }
  return value.trim();
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signPayload(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePayload(encodedPayload) {
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'portal link is invalid');
  }
}

export function createPortalLinkToken(context, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new PortalRequestError('PORTAL_CONFIGURATION_ERROR', 'PORTAL_LINK_SECRET must contain at least 32 characters');
  }
  if (!isPlainObject(context) || !UUID_PATTERN.test(String(context.customerId || ''))) {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'customerId must be a UUID');
  }

  const payload = {
    v: TOKEN_VERSION,
    aud: TOKEN_AUDIENCE,
    customerId: String(context.customerId),
    customerName: requiredText(context.customerName, 'customerName'),
    exp: Number(context.exp),
  };
  if (!Number.isInteger(payload.exp) || payload.exp <= 0) {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'exp must be a Unix timestamp');
  }
  if (typeof context.customerCode === 'string' && context.customerCode.trim()) {
    payload.customerCode = context.customerCode.trim();
  }

  const encodedPayload = encodePayload(payload);
  return encodedPayload + '.' + signPayload(encodedPayload, secret);
}

export function verifyPortalLinkToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new PortalRequestError('PORTAL_CONFIGURATION_ERROR', 'PORTAL_LINK_SECRET must contain at least 32 characters');
  }
  if (typeof token !== 'string') {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'portal link is required');
  }

  const [encodedPayload, signature, ...extraParts] = token.split('.');
  if (!encodedPayload || !signature || extraParts.length > 0 || !constantTimeEquals(signature, signPayload(encodedPayload, secret))) {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'portal link is invalid');
  }

  const payload = parsePayload(encodedPayload);
  if (
    !isPlainObject(payload)
    || payload.v !== TOKEN_VERSION
    || payload.aud !== TOKEN_AUDIENCE
    || !UUID_PATTERN.test(String(payload.customerId || ''))
    || typeof payload.customerName !== 'string'
    || !payload.customerName.trim()
    || !Number.isInteger(payload.exp)
    || payload.exp <= nowSeconds
  ) {
    throw new PortalRequestError('INVALID_PORTAL_LINK', 'portal link is invalid or expired');
  }

  return {
    customerId: payload.customerId,
    customerName: payload.customerName.trim(),
    customerCode: typeof payload.customerCode === 'string' && payload.customerCode.trim()
      ? payload.customerCode.trim()
      : undefined,
    expiresAt: payload.exp,
  };
}

function assertDate(value, fieldCode) {
  if (value && !DATE_PATTERN.test(value)) {
    throw new PortalRequestError('INVALID_FIELDS', fieldCode + ' must use YYYY-MM-DD');
  }
}

export function normalizeOnboardingFields(fields) {
  if (!isPlainObject(fields)) {
    throw new PortalRequestError('INVALID_FIELDS', 'fields must be an object');
  }

  const entries = Object.entries(fields);
  if (entries.length > CUSTOMER_ONBOARDING_FIELDS.size) {
    throw new PortalRequestError('INVALID_FIELDS', 'too many fields');
  }

  const normalized = {};
  for (const [fieldCode, rawValue] of entries) {
    if (!CUSTOMER_ONBOARDING_FIELDS.has(fieldCode)) {
      throw new PortalRequestError('INVALID_FIELDS', 'field is not available to the customer: ' + fieldCode);
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') {
      throw new PortalRequestError('INVALID_FIELDS', 'field value must be text: ' + fieldCode);
    }

    const value = String(rawValue).trim();
    if (!value || value.length > 500) {
      throw new PortalRequestError('INVALID_FIELDS', 'field value is invalid: ' + fieldCode);
    }
    normalized[fieldCode] = value;
  }

  const missing = REQUIRED_CUSTOMER_ONBOARDING_FIELDS.filter((fieldCode) => !normalized[fieldCode]);
  if (missing.length > 0) {
    throw new PortalRequestError('INVALID_FIELDS', 'missing required fields: ' + missing.join(', '));
  }
  for (const fieldCode of ['contract_start_date', 'contract_end_date', 'probation_start_date', 'probation_end_date']) {
    assertDate(normalized[fieldCode], fieldCode);
  }
  if (!CONTRACT_TERM_TYPES.has(normalized.contract_term_type)) {
    throw new PortalRequestError('INVALID_FIELDS', 'contract_term_type must be 固定期限、无固定期限或任务期限');
  }
  if (!WORK_HOUR_SYSTEMS.has(normalized.work_hour_system)) {
    throw new PortalRequestError('INVALID_FIELDS', 'work_hour_system is invalid');
  }
  if (!SALARY_FORMS.has(normalized.salary_form)) {
    throw new PortalRequestError('INVALID_FIELDS', 'salary_form must be 按月');
  }
  if (normalized.start_month && !MONTH_PATTERN.test(normalized.start_month)) {
    throw new PortalRequestError('INVALID_FIELDS', 'start_month must use 1月-12月');
  }
  if (!MOBILE_PATTERN.test(normalized.mobile)) {
    throw new PortalRequestError('INVALID_FIELDS', 'mobile must be an 11-digit mainland China mobile number');
  }
  if (normalized.bank_location && !BANK_TEXT_PATTERN.test(normalized.bank_location)) {
    throw new PortalRequestError('INVALID_FIELDS', 'bank_location cannot contain spaces or brackets');
  }
  if (normalized.bank_account && !BANK_ACCOUNT_PATTERN.test(normalized.bank_account)) {
    throw new PortalRequestError('INVALID_FIELDS', 'bank_account must contain 8-30 digits without spaces or brackets');
  }

  return normalized;
}

const CUSTOMER_RESIGNATION_FIELDS = new Set([
  'employee_name', 'id_card_no', 'mobile', 'email',
  'resignation_date', 'social_location', 'social_stop_month', 'stop_month', 'resignation_reason',
]);

const REQUIRED_CUSTOMER_RESIGNATION_FIELDS = [
  'employee_name', 'id_card_no', 'mobile', 'resignation_date', 'social_stop_month', 'resignation_reason',
];

export function normalizeResignationFields(fields) {
  if (!isPlainObject(fields)) {
    throw new PortalRequestError('INVALID_FIELDS', 'fields must be an object');
  }
  const normalized = {};
  for (const [fieldCode, rawValue] of Object.entries(fields)) {
    if (!CUSTOMER_RESIGNATION_FIELDS.has(fieldCode)) {
      throw new PortalRequestError('INVALID_FIELDS', 'field is not available to the customer: ' + fieldCode);
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') {
      throw new PortalRequestError('INVALID_FIELDS', 'field value must be text: ' + fieldCode);
    }
    const value = String(rawValue).trim();
    if (!value || value.length > 500) {
      throw new PortalRequestError('INVALID_FIELDS', 'field value is invalid: ' + fieldCode);
    }
    if (fieldCode === 'stop_month') {
      if (normalized.social_stop_month !== undefined) {
        throw new PortalRequestError('INVALID_FIELDS', 'social_stop_month and stop_month cannot both be provided');
      }
      normalized.social_stop_month = value;
    } else {
      normalized[fieldCode] = value;
    }
  }
  const missing = REQUIRED_CUSTOMER_RESIGNATION_FIELDS.filter((fieldCode) => !normalized[fieldCode]);
  if (missing.length > 0) {
    throw new PortalRequestError('INVALID_FIELDS', 'missing required fields: ' + missing.join(', '));
  }
  if (!DATE_PATTERN.test(normalized.resignation_date)) {
    throw new PortalRequestError('INVALID_FIELDS', 'resignation_date must use YYYY-MM-DD');
  }
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(normalized.social_stop_month)) {
    normalized.social_stop_month = Number(normalized.social_stop_month.slice(5)) + '月';
  }
  if (!MONTH_PATTERN.test(normalized.social_stop_month)) {
    throw new PortalRequestError('INVALID_FIELDS', 'social_stop_month must use 1月-12月');
  }
  if (!MOBILE_PATTERN.test(normalized.mobile)) {
    throw new PortalRequestError('INVALID_FIELDS', 'mobile must be an 11-digit mainland China mobile number');
  }
  return normalized;
}

export function normalizeSalaryFields(fields) {
  if (!isPlainObject(fields)) {
    throw new PortalRequestError('INVALID_FIELDS', 'fields must be an object');
  }
  const mode = fields.mode;
  if (mode !== 'changed' && mode !== 'same') {
    throw new PortalRequestError('INVALID_FIELDS', 'salary mode must be changed or same');
  }
  const note = fields.note === undefined || fields.note === null ? '' : String(fields.note).trim();
  if (note.length > 2000) {
    throw new PortalRequestError('INVALID_FIELDS', 'salary note is too long');
  }
  const channel = fields.channel === undefined || fields.channel === null || fields.channel === '' ? null : String(fields.channel).trim();
  if (mode === 'changed' && channel !== null && !['text', 'attachment'].includes(channel)) {
    throw new PortalRequestError('INVALID_FIELDS', 'salary channel must be text or attachment');
  }
  const result = { mode, note, channel };
  if (fields.month !== undefined && fields.month !== null && fields.month !== '') {
    const month = String(fields.month).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new PortalRequestError('INVALID_FIELDS', 'salary month must use YYYY-MM');
    }
    result.month = month;
  }
  return result;
}

function normalizeStandardTemplateResult(preview, businessType) {
  if (!isPlainObject(preview)) {
    throw new PortalRequestError('INVALID_IMPORT', 'standard template preview is invalid');
  }
  if (preview.templateValid === false || preview.standardTemplate === false) {
    throw new PortalRequestError('INVALID_IMPORT', '请使用系统提供的标准 Excel 模板');
  }
  const expected = businessType === 'resignation'
    ? ['employee_name', 'id_card_no', 'mobile', 'email', 'resignation_date', 'social_stop_month', 'resignation_reason']
    : ['employee_name', 'id_card_type', 'id_card_no', 'mobile', 'email', 'position', 'position_type', 'contract_term_type', 'contract_start_date', 'contract_end_date', 'probation_end_date', 'work_city', 'work_hour_system', 'salary_form', 'base_salary', 'social_location', 'start_month', 'social_base', 'fund_base', 'bank_account'];
  const mapping = preview.suggestedMapping || preview.mapping;
  if (isPlainObject(mapping)) {
    const mapped = [...new Set(Object.values(mapping).map((value) => String(value || '').trim()).filter(Boolean))];
    if (mapped.length !== expected.length || expected.some((field) => !mapped.includes(field))) {
      throw new PortalRequestError('INVALID_IMPORT', 'Excel 字段与标准模板不一致，请下载并使用系统模板');
    }
  }
  return { ...preview, templateValid: true, templateBusinessType: businessType };
}

function unwrapResponse(body) {
  if (isPlainObject(body) && isPlainObject(body.data)) return body.data;
  return body;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function backendError(response, body) {
  const source = unwrapResponse(body);
  const message = isPlainObject(source) && typeof source.message === 'string'
    ? source.message
    : 'local backend rejected the onboarding draft';
  return new PortalRequestError(response.status === 401 ? 'PORTAL_UNAUTHORIZED' : response.status === 403 ? 'PORTAL_FORBIDDEN' : 'BACKEND_REJECTED', message + ' (HTTP ' + response.status + ')');
}

async function requestBackend(path, init, options = {}) {
  const backendUrl = (options.backendUrl || process.env.LOCAL_BACKEND_URL || '').replace(/\/$/, '');
  const backendToken = options.backendToken || process.env.PORTAL_BACKEND_TOKEN || '';
  const fetchImpl = options.fetchImpl || fetch;
  const publicPortalEndpoint = /^\/api\/(?:portal-auth\/(?:login|session|change-password)|customer-portal\/(?:schema|template|submit|resubmit|import\/preview|import\/confirm|progress|attachments))$/.test(path);
  if (!backendUrl || (!publicPortalEndpoint && !backendToken)) {
    throw new PortalRequestError('PORTAL_CONFIGURATION_ERROR', 'LOCAL_BACKEND_URL is required; internal employee endpoints also require PORTAL_BACKEND_TOKEN');
  }
  const response = await fetchImpl(backendUrl + path, {
    ...init,
    headers: {
      ...(backendToken ? { Authorization: 'Bearer ' + backendToken } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw backendError(response, body);
  return unwrapResponse(body);
}

export async function loginPortalAccount(payload, options = {}) {
  const loginEmail = typeof payload?.loginEmail === 'string' ? payload.loginEmail.trim().toLowerCase() : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!loginEmail || loginEmail.length > 320 || !loginEmail.includes('@')) {
    throw new PortalRequestError('INVALID_LOGIN', '请输入有效的登录邮箱');
  }
  if (!password || password.length > 200) {
    throw new PortalRequestError('INVALID_LOGIN', '请输入登录密码');
  }
  const result = await requestBackend('/api/portal-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginEmail, password }),
  }, options);
  return { ...(isPlainObject(result) ? result : {}), ok: true };
}

function normalizeCustomerImportDefaults(defaults) {
  if (defaults === undefined || defaults === null) return {};
  if (!isPlainObject(defaults)) throw new PortalRequestError('INVALID_IMPORT', 'defaults must be an object');
  const normalized = {};
  for (const [fieldCode, rawValue] of Object.entries(defaults)) {
    if (!CUSTOMER_ONBOARDING_FIELDS.has(fieldCode)) {
      throw new PortalRequestError('INVALID_IMPORT', 'defaults may only contain customer-editable onboarding fields: ' + fieldCode);
    }
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw new PortalRequestError('INVALID_IMPORT', 'invalid default value for field: ' + fieldCode);
    }
    normalized[fieldCode] = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  }
  return normalized;
}

function normalizeTrustedDefaults(source, whitelist) {
  if (!isPlainObject(source)) return {};
  const normalized = {};
  for (const [fieldCode, rawValue] of Object.entries(source)) {
    if (!whitelist.has(fieldCode)) continue;
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) continue;
    normalized[fieldCode] = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  }
  return normalized;
}

function normalizeTrustedPortalRules(value, expectedCustomerId) {
  if (!isPlainObject(value) || value.customerId !== expectedCustomerId) {
    throw new PortalRequestError('BACKEND_RESPONSE_INVALID', 'customer rule response does not match the signed customer');
  }
  const salaryRules = isPlainObject(value.salaryRules) ? value.salaryRules : {};
  const billingDay = Number.isInteger(salaryRules.billingDay) && salaryRules.billingDay >= 1 && salaryRules.billingDay <= 28
    ? salaryRules.billingDay
    : null;
  const sharedEmailRules = isPlainObject(value.sharedEmailRules) ? value.sharedEmailRules : {};
  return {
    onboardingDefaults: normalizeTrustedDefaults(value.onboardingDefaults, INTERNAL_ONBOARDING_DEFAULT_FIELDS),
    resignationDefaults: normalizeTrustedDefaults(value.resignationDefaults, INTERNAL_RESIGNATION_DEFAULT_FIELDS),
    salaryRules: {
      billingDay,
      reminderEnabled: salaryRules.reminderEnabled !== false,
      reminderWorkdayOffsets: [...SALARY_REMINDER_OFFSETS],
    },
    sharedEmailRules: {
      mailbox: typeof sharedEmailRules.mailbox === 'string' ? sharedEmailRules.mailbox.trim().toLowerCase() : '',
      routeKey: typeof sharedEmailRules.routeKey === 'string' ? sharedEmailRules.routeKey.trim() : '',
    },
  };
}

async function getTrustedPortalRules(link, options) {
  if (typeof options.customerRuleProvider === 'function') {
    return normalizeTrustedPortalRules(await options.customerRuleProvider(link.customerId), link.customerId);
  }
  const body = await requestBackend('/api/customer-rules/' + encodeURIComponent(link.customerId) + '/portal-defaults', { method: 'GET' }, options);
  return normalizeTrustedPortalRules(body, link.customerId);
}

function backendFormData(file, fields = {}) {
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimeType || 'application/octet-stream' }), file.name);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return form;
}

export async function createOnboardingDraft(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const fields = normalizeOnboardingFields(payload?.fields);
  const trustedRules = await getTrustedPortalRules(link, options);
  const extraData = {
    ...fields,
    ...trustedRules.onboardingDefaults,
    customer_name: link.customerName,
    ...(link.customerCode ? { customer_code: link.customerCode } : {}),
  };
  if (Array.isArray(payload.attachmentIds) && payload.attachmentIds.length > 0) extraData.attachment_ids = payload.attachmentIds;

  const draft = await requestBackend('/api/work-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': String(payload.requestId || ''),
    },
    body: JSON.stringify({ orderType: 'onboarding', customerId: link.customerId, extraData }),
  }, options);
  if (!isPlainObject(draft) || (typeof draft.orderNo !== 'string' && typeof draft.order_no !== 'string')) {
    throw new PortalRequestError('BACKEND_RESPONSE_INVALID', 'local backend did not return a work order number');
  }

  return {
    ok: true,
    status: 'DRAFT_CREATED',
    workOrderId: draft.id || draft.workOrderId || draft.work_order_id || null,
    workOrderNo: draft.orderNo || draft.order_no,
    message: '\u5df2\u6536\u5230\u5165\u804c\u8d44\u6599\uff0c\u4e1a\u52a1\u4eba\u5458\u5c06\u6838\u5bf9\u5e76\u5b8c\u5584\u540e\u63d0\u4ea4\u3002',
  };
}

export async function uploadOnboardingAttachments(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const workOrderId = requiredText(payload?.workOrderId, 'work order id');
  const files = normalizePortalAttachments(payload?.files);
  const uploaded = [];
  for (const file of files) {
    const body = await requestBackend('/api/attachments/upload', {
      method: 'POST',
      body: backendFormData({
        buffer: Buffer.from(file.contentBase64, 'base64'),
        name: file.name,
        mimeType: file.mimeType,
      }, {
        work_order_id: workOrderId,
        biz_purpose: file.bizPurpose,
        metadata: { source: 'customer-portal', customerId: link.customerId },
      }),
    }, options);
    uploaded.push({
      attachmentId: body.id || body.attachmentId || body.attachment_id || null,
      fileId: body.fileId || body.file_id || body.upload?.fileId || null,
      fileName: body.fileName || body.originalName || body.original_name || file.name,
      bizPurpose: file.bizPurpose,
    });
  }
  return { ok: true, status: 'ATTACHMENTS_UPLOADED', customerId: link.customerId, workOrderId, files: uploaded };
}

export async function previewOnboardingImport(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const content = decodeBase64(payload?.contentBase64, 'Excel content');
  const fileName = requiredText(payload?.fileName, 'Excel file name');
  if (!/\.(xlsx|xls)$/i.test(fileName)) throw new PortalRequestError('INVALID_IMPORT', 'fileName must be an Excel file');
  if (content.length > 10 * 1024 * 1024) throw new PortalRequestError('INVALID_IMPORT', 'Excel file exceeds 10MB');
  const preview = await requestBackend('/api/work-orders/import/preview', {
    method: 'POST',
    body: backendFormData({ buffer: content, name: fileName, mimeType: payload?.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, {
      orderType: 'onboarding',
      sampleRows: 10,
    }),
  }, options);
  return { ...normalizeStandardTemplateResult(preview, 'onboarding'), customerId: link.customerId };
}

export async function confirmOnboardingImport(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const fileId = requiredText(payload?.fileId, 'import file id');
  const mapping = normalizeImportMapping(payload?.mapping);
  const customerDefaults = normalizeCustomerImportDefaults(payload?.defaults);
  const trustedRules = await getTrustedPortalRules(link, options);
  const defaults = {
    ...customerDefaults,
    ...trustedRules.onboardingDefaults,
    customerId: link.customerId,
    customer_name: link.customerName,
    ...(link.customerCode ? { customer_code: link.customerCode } : {}),
  };
  const job = await requestBackend('/api/work-orders/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, orderType: 'onboarding', mapping, defaults, autoSubmit: false, jobName: '客户门户入职批量导入' }),
  }, options);
  return { ...job, ok: true, status: job.status || 'IMPORT_QUEUED', customerId: link.customerId, fileId };
}

export async function createResignationDraft(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const fields = normalizeResignationFields(payload?.fields);
  const trustedRules = await getTrustedPortalRules(link, options);
  const extraData = {
    ...fields,
    ...trustedRules.resignationDefaults,
    customer_name: link.customerName,
    ...(link.customerCode ? { customer_code: link.customerCode } : {}),
  };
  const draft = await requestBackend('/api/work-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': String(payload.requestId || ''),
    },
    body: JSON.stringify({ orderType: 'resignation', customerId: link.customerId, extraData }),
  }, options);
  if (!isPlainObject(draft) || (typeof draft.orderNo !== 'string' && typeof draft.order_no !== 'string')) {
    throw new PortalRequestError('BACKEND_RESPONSE_INVALID', 'local backend did not return a work order number');
  }
  return {
    ok: true,
    status: 'DRAFT_CREATED',
    workOrderId: draft.id || draft.workOrderId || draft.work_order_id || null,
    workOrderNo: draft.orderNo || draft.order_no,
    message: '已收到离职资料，业务人员将核对并完善后提交。',
  };
}

export async function previewResignationImport(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const content = decodeBase64(payload?.contentBase64, 'Excel content');
  const fileName = requiredText(payload?.fileName, 'Excel file name');
  if (!/\.(xlsx|xls)$/i.test(fileName)) throw new PortalRequestError('INVALID_IMPORT', 'fileName must be an Excel file');
  if (content.length > 10 * 1024 * 1024) throw new PortalRequestError('INVALID_IMPORT', 'Excel file exceeds 10MB');
  const preview = await requestBackend('/api/work-orders/import/preview', {
    method: 'POST',
    body: backendFormData({ buffer: content, name: fileName, mimeType: payload?.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, {
      orderType: 'resignation',
      sampleRows: 10,
    }),
  }, options);
  return { ...normalizeStandardTemplateResult(preview, 'resignation'), customerId: link.customerId };
}

export async function confirmResignationImport(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const fileId = requiredText(payload?.fileId, 'import file id');
  const mapping = payload?.mapping === undefined ? {} : payload.mapping;
  if (!isPlainObject(mapping) || Object.keys(mapping).length > 0) {
    throw new PortalRequestError('INVALID_IMPORT', 'resignation standard template mapping must be empty');
  }
  const trustedRules = await getTrustedPortalRules(link, options);
  const job = await requestBackend('/api/work-orders/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, orderType: 'resignation', mapping: {}, defaults: { ...trustedRules.resignationDefaults, customerId: link.customerId, customer_name: link.customerName, ...(link.customerCode ? { customer_code: link.customerCode } : {}) }, autoSubmit: false, jobName: '客户门户离职批量导入' }),
  }, options);
  return { ...job, ok: true, status: job.status || 'IMPORT_QUEUED', customerId: link.customerId, fileId };
}

export async function sendSharedEmailAttachments(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const businessType = requiredText(payload?.businessType, 'business type');
  if (!['onboarding', 'resignation', 'salary'].includes(businessType)) {
    throw new PortalRequestError('INVALID_ATTACHMENT', 'business type must be onboarding, resignation, or salary');
  }
  const files = normalizePortalAttachments(payload?.files);
  const trustedRules = await getTrustedPortalRules(link, options);
  const envelope = {
    customerId: link.customerId,
    customerName: link.customerName,
    businessType,
    files,
    sharedEmailRules: trustedRules.sharedEmailRules,
    requestId: String(payload.requestId || ''),
  };
  if (typeof options.sharedEmailSender !== 'function') {
    throw new PortalRequestError('SHARED_EMAIL_UNAVAILABLE', '共享邮箱投递服务尚未配置，附件未发送，请联系业务人员。');
  }
  await options.sharedEmailSender(envelope);
  return {
    ok: true,
    status: 'SHARED_EMAIL_QUEUED',
    customerId: link.customerId,
    businessType,
    files: files.map(({ name, size, mimeType, bizPurpose }) => ({ name, size, mimeType, bizPurpose })),
    message: '附件已提交至共享邮箱，办结后将通过邮件发送结果。',
  };
}

export async function submitSalary(payload, options = {}) {
  const link = verifyPortalLinkToken(payload?.linkToken, options.portalLinkSecret || process.env.PORTAL_LINK_SECRET, options.nowSeconds);
  const fields = normalizeSalaryFields(payload?.fields);
  const trustedRules = await getTrustedPortalRules(link, options);
  const envelope = {
    requestId: String(payload.requestId || ''),
    customerId: link.customerId,
    customerName: link.customerName,
    fields,
    salaryRules: trustedRules.salaryRules,
  };
  if (typeof options.salarySubmitter === 'function') {
    const result = await options.salarySubmitter(envelope);
    return { ...(isPlainObject(result) ? result : {}), ok: true, customerId: link.customerId };
  }
  throw new PortalRequestError('SALARY_SERVICE_UNAVAILABLE', '薪资受理服务尚未配置，信息未提交，请联系业务人员。');
}

export async function handlePortalAction(payload, options = {}) {
  if (payload?.action === 'test.echo' || !payload?.action) return 'connector-ok:' + String(payload?.message || '');
  try {
    if (payload.action === 'portal_account.login') return await loginPortalAccount(payload, options);
    const sessionActions = { 'portal_account.session': 'session', 'portal_account.change_password': 'change-password' };
    if (sessionActions[payload.action]) {
      const body = { linkToken: payload.linkToken, ...(payload.action === 'portal_account.change_password' ? { oldPassword: payload.oldPassword, newPassword: payload.newPassword } : {}) };
      const result = await requestBackend('/api/portal-auth/' + sessionActions[payload.action], { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }, options);
      return {ok:true,...result};
    }
    const intakeActions = {
      'onboarding.create_draft':['submit','onboarding'], 'resignation.create_draft':['submit','resignation'], 'salary.submit':['submit','salary'],
      'onboarding.import_preview':['import/preview','onboarding'], 'onboarding.import_confirm':['import/confirm','onboarding'],
      'resignation.import_preview':['import/preview','resignation'], 'resignation.import_confirm':['import/confirm','resignation'],
      'shared_email.send_attachments':['attachments',payload.businessType], 'portal.schema':['schema',payload.businessType],
      'portal.template':['template',payload.businessType], 'portal.resubmit':['resubmit',payload.businessType], 'portal.progress':['progress',undefined],
    };
    const intake = intakeActions[payload.action];
    if (intake) {
      const body = {linkToken:payload.linkToken, ...(intake[1] ? {businessType:intake[1]} : {})};
      for(const key of ['requestId','submissionId','fields','files','fileName','contentBase64']) if(payload[key]!==undefined)body[key]=payload[key];
      const traceId = payload._monitor?.traceId;
      const connectorToken = options.token || process.env.CONNECTOR_TOKEN;
      const monitorHeaders = /^[0-9a-f-]{36}$/i.test(traceId || '') && connectorToken
        ? { 'X-Portal-Trace-Id': traceId, 'X-Connector-Token': connectorToken } : {};
      const result = await requestBackend('/api/customer-portal/' + intake[0], {method:'POST',headers:{'Content-Type':'application/json',...monitorHeaders},body:JSON.stringify(body)},options);
      return {ok:true,...result};
    }
    return { ok: false, code: 'UNSUPPORTED_ACTION', message: 'unsupported portal action' };
  } catch (error) {
    if (error instanceof PortalRequestError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: 'PORTAL_REQUEST_FAILED', message: 'portal request failed' };
  }
}
