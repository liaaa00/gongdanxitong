import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PortalRequestError,
  handlePortalAction,
  loginPortalAccount,
  createOnboardingDraft,
  confirmOnboardingImport,
  previewOnboardingImport,
  sendSharedEmailAttachments,
  createResignationDraft,
  submitSalary,
  normalizeResignationFields,
  normalizeSalaryFields,
  createPortalLinkToken,
  normalizeOnboardingFields,
  normalizePortalAttachments,
  verifyPortalLinkToken,
} from '../connector/portal-onboarding.mjs';

const secret = 'this-is-a-test-only-link-secret-with-more-than-32-chars';
const nowSeconds = 1_800_000_000;

test('connector preserves backend attachment delivery failure instead of reporting success', async () => {
  const result = await handlePortalAction({ action: 'shared_email.send_attachments', linkToken: 'session', businessType: 'salary', requestId: 'attachment-1', files: [] }, {
    backendUrl: 'http://backend.local',
    fetchImpl: async () => new Response(JSON.stringify({ data: { ok: false, message: '共享邮箱尚未配置，附件已保存但投递失败' } }), { status: 201 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /投递失败/);
});

test('account sessions use public portal APIs without an internal employee token', async () => {
  const calls = [];
  const result = await handlePortalAction({ action: 'portal_account.session', linkToken: 'signed-session' }, {
    backendUrl: 'http://backend.local',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { businessPermissions: ['salary'] } }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'http://backend.local/api/portal-auth/session');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), { linkToken: 'signed-session' });
});

test('portal account login calls the public backend login endpoint with normalized email', async () => {
  const calls = [];
  const result = await loginPortalAccount({ loginEmail: ' Customer@Example.COM ', password: 'Password123' }, {
    backendUrl: 'http://backend.local',
    backendToken: 'connector-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { linkToken: 'signed-token', expiresAt: 1_900_000_000, customer: { id: 'customer-1' } } }), { status: 200 });
    },
  });

  assert.equal(calls[0].url, 'http://backend.local/api/portal-auth/login');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer connector-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), { loginEmail: 'customer@example.com', password: 'Password123' });
  assert.equal(result.ok, true);
  assert.equal(result.linkToken, 'signed-token');
});

function completeFields() {
  return {
    employee_name: '测试员工',
    id_card_type: '中国居民身份证',
    id_card_no: '330102199001010011',
    mobile: '13800138000',
    email: 'employee@example.com',
    position: '测试岗位',
    position_type: '非管理类',
    contract_term_type: '固定期限',
    contract_term: '36',
    contract_start_date: '2026-09-01',
    contract_end_date: '2029-09-01',
    probation_start_date: '2026-09-01',
    probation_months: '3',
    probation_end_date: '2026-12-01',
    work_city: '宁波',
    work_hour_system: '标准工时制',
    salary_form: '按月',
    base_salary: '5000',
    social_location: '宁波',
    start_month: '9月',
    social_base: '5000',
    fund_base: '5000',
    bank_location: '宁波北仑',
    bank_account: '6222000000000000',
    bank_name: '测试银行',
  };
}

test('signed portal links bind a customer and expire', () => {
  const token = createPortalLinkToken({
    customerId: '11111111-1111-4111-8111-111111111111',
    customerName: '测试客户',
    customerCode: 'C-001',
    exp: nowSeconds + 3600,
  }, secret);

  assert.deepEqual(verifyPortalLinkToken(token, secret, nowSeconds), {
    customerId: '11111111-1111-4111-8111-111111111111',
    customerName: '测试客户',
    customerCode: 'C-001',
    expiresAt: nowSeconds + 3600,
  });
  assert.throws(() => verifyPortalLinkToken(token, secret, nowSeconds + 3600), PortalRequestError);
});

test('customer intake accepts the phase-one fields and rejects internal-only fields', () => {
  assert.deepEqual(normalizeOnboardingFields(completeFields()), completeFields());
  assert.throws(() => normalizeOnboardingFields({
    ...completeFields(),
    need_company_contract: '是',
  }), /not available to the customer/);
});

test('customer intake validates required, date, month, mobile and bank fields', () => {
  const missing = completeFields();
  delete missing.position;
  assert.throws(() => normalizeOnboardingFields(missing), /missing required fields: position/);

  assert.throws(() => normalizeOnboardingFields({ ...completeFields(), contract_start_date: '2026\/09\/01' }), /YYYY-MM-DD/);
  assert.throws(() => normalizeOnboardingFields({ ...completeFields(), start_month: '2026-09' }), /1月-12月/);
  assert.throws(() => normalizeOnboardingFields({ ...completeFields(), mobile: '12345' }), /11-digit/);
  assert.throws(() => normalizeOnboardingFields({ ...completeFields(), bank_location: '宁波（北仑）' }), /spaces or brackets/);
  assert.throws(() => normalizeOnboardingFields({ ...completeFields(), bank_account: '6222 0000' }), /spaces or brackets/);
});

test('draft creation uses the signed customer binding and existing backend API', async () => {
  const linkToken = createPortalLinkToken({
    customerId: '11111111-1111-4111-8111-111111111111',
    customerName: '测试客户',
    customerCode: 'C-001',
    exp: nowSeconds + 3600,
  }, secret);
  const calls = [];

  const result = await createOnboardingDraft({
    requestId: 'portal-001',
    linkToken,
    fields: completeFields(),
  }, {
    portalLinkSecret: secret,
    nowSeconds,
    backendUrl: 'http://127.0.0.1:3000/',
    backendToken: 'backend-test-token',
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      if (url.endsWith('/api/customer-rules/11111111-1111-4111-8111-111111111111/portal-defaults')) {
        return new Response(JSON.stringify({ data: {
          customerId: '11111111-1111-4111-8111-111111111111',
          customerCode: 'C-001', configured: true,
          onboardingDefaults: { contract_subject: '浙江企服', need_esign: true, ignored_field: '不得进入工单' },
        } }), { status: 200 });
      }
      if (url.endsWith('/api/work-orders')) {
        return new Response(JSON.stringify({ data: { id: 'draft-id', orderNo: 'ON20260901001' } }), { status: 201 });
      }
      throw new Error('unexpected backend URL: ' + url);
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/api/customer-rules/11111111-1111-4111-8111-111111111111/portal-defaults');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer backend-test-token');
  assert.equal(calls[1].url, 'http://127.0.0.1:3000/api/work-orders');
  assert.equal(calls[1].request.headers.Authorization, 'Bearer backend-test-token');
  assert.equal(calls[1].request.headers['Idempotency-Key'], 'portal-001');
  assert.deepEqual(JSON.parse(calls[1].request.body), {
    orderType: 'onboarding',
    customerId: '11111111-1111-4111-8111-111111111111',
    extraData: {
      ...completeFields(),
      contract_subject: '\u6d59\u6c5f\u4f01\u670d',
      need_esign: true,
      customer_name: '测试客户',
      customer_code: 'C-001',
    },
  });
  assert.deepEqual(result, {
    ok: true,
    status: 'DRAFT_CREATED',
    workOrderId: 'draft-id',
    workOrderNo: 'ON20260901001',
    message: '已收到入职资料，业务人员将核对并完善后提交。',
  });
});


test('draft creation rejects customer rule data for a different signed customer', async () => {
  const linkToken = createPortalLinkToken({ customerId: '11111111-1111-4111-8111-111111111111', customerName: '\u6d4b\u8bd5\u5ba2\u6237', customerCode: 'C-001', exp: nowSeconds + 3600 }, secret);
  let callCount = 0;
  await assert.rejects(() => createOnboardingDraft({ requestId: 'portal-002', linkToken, fields: completeFields() }, {
    portalLinkSecret: secret, nowSeconds, backendUrl: 'http://backend', backendToken: 'token',
    fetchImpl: async () => {
      callCount += 1;
      return new Response(JSON.stringify({ data: { customerId: '22222222-2222-4222-8222-222222222222', onboardingDefaults: { contract_subject: '\u6d59\u6c5f\u4f01\u670d' } } }), { status: 200 });
    },
  }), /does not match the signed customer/);
  assert.equal(callCount, 1);
});

test('customer portal adapters send attachments through shared email without work-order binding', async () => {
  const linkToken = createPortalLinkToken({
    customerId: '11111111-1111-4111-8111-111111111111', customerName: '测试客户', customerCode: 'C-001', exp: nowSeconds + 3600,
  }, secret);
  let envelope;
  const result = await sendSharedEmailAttachments({
    requestId: 'portal-attachment-1', linkToken, businessType: 'onboarding',
    files: [{ name: 'id.pdf', mimeType: 'application/pdf', bizPurpose: 'employee_identity', contentBase64: Buffer.from('pdf').toString('base64') }],
  }, {
    portalLinkSecret: secret,
    nowSeconds,
    customerRuleProvider: async (customerId) => ({
      customerId,
      sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'C-001' },
    }),
    sharedEmailSender: async (value) => { envelope = value; },
  });
  assert.equal(result.status, 'SHARED_EMAIL_QUEUED');
  assert.equal(result.businessType, 'onboarding');
  assert.equal(envelope.customerId, '11111111-1111-4111-8111-111111111111');
  assert.equal(envelope.files[0].name, 'id.pdf');
  assert.deepEqual(envelope.sharedEmailRules, { mailbox: 'shared@example.com', routeKey: 'C-001' });
  assert.equal('workOrderId' in envelope, false);
});

test('resignation and salary submissions consume trusted rules for the signed customer', async () => {
  const linkToken = createPortalLinkToken({
    customerId: '11111111-1111-4111-8111-111111111111', customerName: '测试客户', customerCode: 'C-001', exp: nowSeconds + 3600,
  }, secret);
  const customerRuleProvider = async (customerId) => ({
    customerId,
    resignationDefaults: {
      need_resignation_cert: '是',
      cert_delivery_address: 'hr@example.com',
      certificate_template: '标准模板',
      ignored_field: '不得进入工单',
    },
    salaryRules: { billingDay: 20, reminderEnabled: true, reminderWorkdayOffsets: [9, 8, 7] },
  });
  let resignationRequest;
  let salaryEnvelope;

  await createResignationDraft({
    requestId: 'portal-resignation-1',
    linkToken,
    fields: {
      employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', email: 'employee@example.com',
      resignation_date: '2026-09-04', social_stop_month: '2026-09', resignation_reason: '个人原因',
    },
  }, {
    portalLinkSecret: secret,
    nowSeconds,
    backendUrl: 'http://backend',
    backendToken: 'token',
    customerRuleProvider,
    fetchImpl: async (url, request) => {
      resignationRequest = { url, request };
      return new Response(JSON.stringify({ data: { id: 'resignation-draft', orderNo: 'RS20260907001' } }), { status: 201 });
    },
  });
  await submitSalary({
    requestId: 'portal-salary-1', linkToken, fields: { mode: 'same' },
  }, {
    portalLinkSecret: secret,
    nowSeconds,
    customerRuleProvider,
    salarySubmitter: async (value) => { salaryEnvelope = value; return { status: 'SUBMITTED' }; },
  });

  assert.equal(resignationRequest.url, 'http://backend/api/work-orders');
  assert.deepEqual(JSON.parse(resignationRequest.request.body).extraData, {
    employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', email: 'employee@example.com',
    resignation_date: '2026-09-04', social_stop_month: '9月', resignation_reason: '个人原因',
    need_resignation_cert: '是', cert_delivery_address: 'hr@example.com', certificate_template: '标准模板',
    customer_name: '测试客户', customer_code: 'C-001',
  });
  assert.deepEqual(salaryEnvelope.salaryRules, {
    billingDay: 20,
    reminderEnabled: true,
    reminderWorkdayOffsets: [3, 2, 1],
  });
});

test('resignation and salary adapters enforce the final portal fields', async () => {
  assert.deepEqual(normalizeResignationFields({
    employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', email: 'employee@example.com',
    resignation_date: '2026-09-04', stop_month: '2026-09', resignation_reason: '个人原因',
  }), {
    employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', email: 'employee@example.com',
    resignation_date: '2026-09-04', social_stop_month: '9月', resignation_reason: '个人原因',
  });
  assert.throws(() => normalizeResignationFields({
    employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', resignation_date: '2026-09-04', social_stop_month: '2026-09', resignation_reason: '个人原因', need_certificate: '是',
  }), /not available to the customer/);
  assert.deepEqual(normalizeSalaryFields({ mode: 'changed', note: '本月有奖金变动', channel: 'text' }), { mode: 'changed', note: '本月有奖金变动', channel: 'text' });
  assert.deepEqual(normalizeSalaryFields({ mode: 'same' }), { mode: 'same', note: '', channel: null });
  assert.deepEqual(normalizeSalaryFields({ mode: 'same', month: '2026-08' }), { mode: 'same', note: '', channel: null, month: '2026-08' });
  assert.throws(() => normalizeSalaryFields({ mode: 'same', month: '2026-13' }), /YYYY-MM/);
  assert.throws(() => normalizeSalaryFields({ mode: 'changed', channel: 'spreadsheet' }), /text or attachment/);
});


test('Excel import cannot map or default internal customer-rule fields', async () => {
  const linkToken = createPortalLinkToken({ customerId: '11111111-1111-4111-8111-111111111111', customerName: '\u6d4b\u8bd5\u5ba2\u6237', customerCode: 'C-001', exp: nowSeconds + 3600 }, secret);
  const options = { portalLinkSecret: secret, nowSeconds, backendUrl: 'http://backend', backendToken: 'token', fetchImpl: async () => { throw new Error('backend must not be called for invalid customer input'); } };
  await assert.rejects(() => confirmOnboardingImport({ linkToken, fileId: 'excel-1', mapping: { '客户自定义字段': 'contract_subject' } }, options), /customer-editable onboarding fields/);
  await assert.rejects(() => confirmOnboardingImport({ linkToken, fileId: 'excel-1', mapping: { '内部字段': 'employee_name' }, defaults: { contract_subject: '\u6d59\u6c5f\u4f01\u670d' } }, options), /defaults may only contain customer-editable onboarding fields/);
});


test('unconfigured attachment and salary adapters reject instead of reporting a fictitious submission', async () => {
  const linkToken = createPortalLinkToken({ customerId: '11111111-1111-4111-8111-111111111111', customerName: '测试客户', exp: nowSeconds + 3600 }, secret);
  const options = { portalLinkSecret: secret, nowSeconds, customerRuleProvider: async (customerId) => ({ customerId, sharedEmailRules: { mailbox: 'shared@example.com' } }) };
  await assert.rejects(() => sendSharedEmailAttachments({ requestId: 'unconfigured-attachment', linkToken, businessType: 'onboarding', files: [{ name: 'id.pdf', mimeType: 'application/pdf', bizPurpose: 'employee_identity', contentBase64: Buffer.from('pdf').toString('base64') }] }, options), (error) => error.code === 'SHARED_EMAIL_UNAVAILABLE');
  await assert.rejects(() => submitSalary({ requestId: 'unconfigured-salary', linkToken, fields: { mode: 'same' } }, options), (error) => error.code === 'SALARY_SERVICE_UNAVAILABLE');
});

test('portal attachments allow the expanded 30 MB single-file limit', () => {
  const withinLimit = Buffer.alloc(30 * 1024 * 1024, 1).toString('base64');
  const accepted = normalizePortalAttachments([{ name: 'salary.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bizPurpose: 'other', contentBase64: withinLimit }]);
  assert.equal(accepted[0].size, 30 * 1024 * 1024);

  const overLimit = Buffer.alloc(30 * 1024 * 1024 + 1, 1).toString('base64');
  assert.throws(() => normalizePortalAttachments([{ name: 'salary.xlsx', bizPurpose: 'other', contentBase64: overLimit }]), /allowed size limit/);
});
