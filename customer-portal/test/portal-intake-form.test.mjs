import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { normalizeResignationFields } from '../connector/portal-onboarding.mjs';

const page = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const business = await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8');

function element(value = '') {
  const classes = new Set();
  return {
    value, textContent: '', disabled: false, required: false, options: [], files: [],
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } },
    replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; },
  };
}

function businessFunction(name) {
  const start = business.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'function is present: ' + name);
  const prefix = business.slice(Math.max(0, start - 6), start) === 'async ' ? 'async ' : '';
  return prefix + business.slice(start, business.indexOf('\n}', start) + 2);
}

function runFunctions(code, context) {
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('onboarding maps every portal work-hour label to the internal canonical value', () => {
  const formValues = {
    working_hours: '标准工时',
    contract_type: 'fixed',
    contract_duration: '36',
    salary_type: '按月',
    social_start_month: '9月',
  };
  const form = { entries: () => Object.entries(formValues) };
  const controls = {
    'contract_end_date': element(''),
    'contract_end_date_manual': element(''),
    'probation_end_date': element(''),
  };
  const code = page.slice(page.indexOf('    function onboardingPayload('), page.indexOf('    function gatewayUrl('));
  const context = runFunctions(code, {
    FormData: function FormData() { return form; },
    document: { getElementById: (id) => id === 'onboarding-form' ? form : controls[id] },
  });
  const expected = new Map([
    ['标准工时', '标准工时制'],
    ['综合工时', '综合工时制'],
    ['不定时工时', '不定时工时制'],
  ]);
  for (const [label, canonical] of expected) {
    formValues.working_hours = label;
    assert.equal(context.onboardingPayload().work_hour_system, canonical);
  }
});

test('entering contract dates does not opt an employee into probation; clearing probation removes its requirements', () => {
  const ids = ['contract_type', 'contract-end-row', 'contract_start_date', 'contract_end_date', 'social_start_month', 'probation_start_date', 'probation-end-row', 'probation_end_date', 'probation_salary', 'probation_other_salary', 'probation-salary-row', 'probation-other-salary-row'];
  const nodes = Object.fromEntries(ids.map((id) => [id, element()]));
  nodes.contract_type.value = 'fixed';
  nodes.contract_end_date.value = '2027-09-09';
  nodes.contract_start_date.value = '2026-09-10';
  const code = page.slice(page.indexOf('    function addMonths('), page.indexOf("    ['contract_type', 'contract_start_date'"));
  const context = runFunctions(code, { document: { getElementById: (id) => nodes[id] } });

  context.updateContractDates();
  assert.equal(nodes.probation_start_date.value, '');
  assert.equal(nodes.probation_end_date.required, false);
  assert.equal(nodes.probation_salary.required, false);
  assert.equal(nodes.probation_end_date.max, '2026-11-10');
  nodes.contract_start_date.value = '2026-08-21';
  nodes.contract_end_date.value = '2029-08-20';
  context.updateContractDates();
  assert.equal(nodes.probation_end_date.max, '2027-02-21');
  nodes.contract_end_date.value = '2029-08-19';
  context.updateContractDates();
  assert.equal(nodes.probation_end_date.max, '2026-10-21');
  nodes.contract_start_date.value = '2026-09-10';
  nodes.contract_end_date.value = '2027-09-09';

  nodes.probation_start_date.value = '2026-09-10';
  context.updateProbationDates();
  assert.equal(nodes.probation_end_date.required, false);
  assert.equal(nodes.probation_salary.required, false);
  assert.equal(nodes.probation_other_salary.disabled, false);
  assert.equal(nodes.probation_end_date.min, '2026-09-10');

  nodes.probation_start_date.value = '';
  context.updateProbationDates();
  assert.equal(nodes.probation_end_date.required, false);
  assert.equal(nodes.probation_salary.required, false);
  assert.equal(nodes.probation_salary.disabled, false);
  assert.equal(nodes.probation_other_salary.disabled, false);
  assert.equal(nodes.probation_end_date.value, '');
  assert.equal(context.addMonths('2028-01-31', 1), '2028-02-29');
});

test('fund ratios follow the selected location, discard the previous location choice, and allow an unknown location without a guessed ratio', () => {
  const nodes = { social_location: element('上海'), fund_ratio: element(), 'fund-ratio-help': element() };
  const context = runFunctions(businessFunction('updatePortalFundRatios'), {
    document: { getElementById: (id) => nodes[id] },
    Option: function Option(text, value) { return { text, value }; },
    portalState: { locations: { onboarding: [{ name: '上海', fundRatios: ['5%+5%', '7%+7%'] }, { name: '宁波', fundRatios: ['12%+12%'] }] }, fundRatioLocation: '' },
  });
  context.updatePortalFundRatios();
  assert.deepEqual(Array.from(nodes.fund_ratio.options, (item) => item.value), ['', '5%+5%', '7%+7%']);
  assert.equal(nodes.fund_ratio.required, true);
  nodes.fund_ratio.value = '7%+7%';
  context.updatePortalFundRatios();
  assert.equal(nodes.fund_ratio.value, '7%+7%');

  nodes.social_location.value = '宁波';
  context.updatePortalFundRatios();
  assert.equal(nodes.fund_ratio.value, '');
  assert.deepEqual(Array.from(nodes.fund_ratio.options, (item) => item.value), ['', '12%+12%']);
  nodes.social_location.value = '新办理城市';
  context.updatePortalFundRatios();
  assert.equal(nodes.fund_ratio.value, '');
  assert.equal(nodes.fund_ratio.required, false);
  assert.equal(nodes.fund_ratio.disabled, true);
  assert.match(nodes['fund-ratio-help'].textContent, /可继续提交/);
});

test('salary uses the configured period across a year boundary without replacing a month the customer has edited', () => {
  const month = element('2027-01');
  let renders = 0;
  const context = runFunctions(businessFunction('applyPortalSalaryMonth'), {
    document: { getElementById: () => month }, renderSalaryPeriod: () => { renders += 1; },
  });
  context.applyPortalSalaryMonth('2026-12', '2027-01');
  assert.equal(month.value, '2026-12');
  assert.equal(renders, 1);
  month.value = '2026-11';
  context.applyPortalSalaryMonth('2026-12', '2027-01');
  assert.equal(month.value, '2026-11');
  context.applyPortalSalaryMonth('2026-13', '2026-11');
  assert.equal(month.value, '2026-11');
});

test('resignation omits a blank optional email and submits a valid full stop year-month and contribution location', async () => {
  const button = element();
  const form = { reportValidity: () => true, querySelector: () => button };
  const feedback = element();
  let sent;
  const context = runFunctions(businessFunction('submitResignation'), {
    document: { getElementById: (id) => id === 'resignation-form' ? form : feedback },
    FormData: class { entries() { return Object.entries({
      employee_name: '测试员工', id_card_no: '330102199001010011', mobile: '13800138000', email: '',
      resignation_date: '2027-01-04', social_stop_month: '2027-01', social_location: '上海', resignation_reason: '个人原因',
    }); } },
    portalSessionGeneration: 1, activePortalSession: { account: { id: 'account-a' } }, portalLinkToken: () => 'token-a',
    portalState: { resignationFiles: [] }, filesForPortal: async () => [], assertPortalSession() {}, isPortalSessionChanged: () => false,
    portalCall: async (path, payload) => { sent = { path, payload }; return { workOrderNo: 'RS-1' }; }, refreshPortalProgress: async () => {},
  });
  await context.submitResignation();
  assert.equal(sent.path, '/portal/resignation');
  assert.equal(sent.payload.fields.social_stop_month, '2027-01');
  assert.equal(sent.payload.fields.social_location, '上海');
  assert.equal(Object.hasOwn(sent.payload.fields, 'email'), false);
  assert.equal(normalizeResignationFields(sent.payload.fields).social_stop_month, '1月');
  assert.equal(button.disabled, false);
});

for (const kind of ['onboarding', 'resignation']) {
  test(`${kind} Excel preview and confirmation carry the selected batch attachments`, async () => {
    const attachment = { name: '申请材料.pdf', mimeType: 'application/pdf', bizPurpose: 'supporting_material', contentBase64: 'cGRm' };
    const nodes = new Map();
    const node = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
    node(kind === 'onboarding' ? 'onboarding-excel' : 'resignation-excel').files = [{ name: '标准模板.xlsx', size: 100 }];
    const selected = [{ file: { name: attachment.name } }];
    const calls = [];
    const context = runFunctions(businessFunction('runPortalImport'), {
      document: { getElementById: node }, portalState: { onboardingFiles: selected, resignationFiles: selected },
      portalSessionGeneration: 1, activePortalSession: { account: { id: 'account-a' } }, portalLinkToken: () => 'token-a',
      fileAsBase64: async () => 'eGxzeA==', filesForPortal: async (files) => { assert.equal(files, selected); return [attachment]; },
      assertPortalSession() {}, isPortalSessionChanged: () => false, setToolStatus() {}, escapeHtml: (value) => String(value),
      portalCall: async (path, payload) => { calls.push({ path, payload }); return { successCount: 1, failureCount: 0, details: [{ rowNumber: 2, success: true, message: '已受理' }] }; },
      refreshPortalProgress: async () => {},
    });
    await context.runPortalImport(kind, false);
    await context.runPortalImport(kind, true);
    assert.deepEqual(calls.map((call) => call.path), [`/portal/${kind}/import/preview`, `/portal/${kind}/import/confirm`]);
    for (const call of calls) {
      assert.equal(call.payload.contentBase64, 'eGxzeA==');
      assert.equal(call.payload.files[0], attachment);
    }
  });
}

test('portal correction guard allows returned fields and rejects changes to all other fields', () => {
  const context = runFunctions(businessFunction('correctionFieldViolation'), {});
  const original = { employee_name: '张三', social_location: '上海', mobile: '13800000000' };
  assert.equal(context.correctionFieldViolation(original, { ...original, employee_name: '张小三' }, ['employee_name']), null);
  assert.equal(context.correctionFieldViolation(original, { ...original, social_location: '宁波' }, ['employee_name']), 'social_location');
  assert.equal(context.correctionFieldViolation(original, { employee_name: '张三', social_location: '上海' }, ['employee_name']), 'mobile');
});

/* ---- portal drafts: localStorage kernel in portal-business.js ---- */
function draftKernel(context) {
  const start = business.indexOf('/* ---- portal drafts:');
  const end = business.indexOf('/* ---- end portal drafts ----');
  assert.ok(start >= 0 && end > start, 'portal drafts kernel block is present');
  const store = new Map();
  const ctx = {
    activePortalSession: { account: { id: 'acct-1' } },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { if (ctx.quotaFail) throw new Error('QuotaExceededError'); store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    },
    window: { clearTimeout: () => {}, setTimeout: () => 0 },
    document: { getElementById: () => null },
    escapeHtml: (value) => String(value),
    showToast: () => {},
    quotaFail: false,
    ...context,
  };
  vm.createContext(ctx);
  vm.runInContext(business.slice(start, end) + '\nthis.draft = { DraftStore, portalDraftKeyFor, portalDraftId, clearDraftAfterSubmit };', ctx);
  return ctx;
}

test('DraftStore round-trips fields and file names through the namespaced key', () => {
  const ctx = draftKernel();
  const saved = ctx.draft.DraftStore.save('onboarding', { employee_name: '张三', salary_type: '按月' }, ['身份证.png']);
  assert.ok(saved && Number.isFinite(saved.savedAt));
  const loaded = ctx.draft.DraftStore.load('onboarding');
  assert.equal(JSON.stringify(loaded.fields), JSON.stringify({ employee_name: '张三', salary_type: '按月' }));
  assert.equal(JSON.stringify(loaded.fileNames), JSON.stringify(['身份证.png']));
  assert.match(ctx.draft.portalDraftKeyFor('onboarding'), /^portalDraftStore:acct-1:onboarding:primary$/);
});

test('DraftStore keys isolate accounts and businesses; clearing after submit removes only that draft', () => {
  const ctx = draftKernel();
  ctx.draft.DraftStore.save('onboarding', { employee_name: '甲' }, []);
  ctx.draft.DraftStore.save('resignation', { employee_name: '乙' }, []);
  assert.ok(ctx.draft.DraftStore.load('onboarding'));
  assert.ok(ctx.draft.DraftStore.load('resignation'));
  ctx.draft.DraftStore.clear('onboarding');
  assert.equal(ctx.draft.DraftStore.load('onboarding'), null, 'submit clears this draft');
  assert.ok(ctx.draft.DraftStore.load('resignation'), 'other business draft untouched');
  ctx.activePortalSession = { account: { id: 'acct-2' } };
  assert.equal(ctx.draft.DraftStore.load('resignation'), null, 'a different account sees nothing');
  ctx.activePortalSession = { account: { id: 'acct-1' } };
  assert.ok(ctx.draft.DraftStore.load('resignation'), 'original account still sees its resignation draft');
});

test('DraftStore falls back to null on corrupted payloads and on quota failures', () => {
  const ctx = draftKernel();
  ctx.localStorage.setItem(ctx.draft.portalDraftKeyFor('onboarding'), 'not-json');
  assert.equal(ctx.draft.DraftStore.load('onboarding'), null);
  ctx.quotaFail = true;
  assert.equal(ctx.draft.DraftStore.save('onboarding', { employee_name: '张' }, []), null);
  assert.equal(ctx.draft.DraftStore.load('onboarding'), null, 'quota failure clears stale draft instead of faking success');
});

test('submitOnboarding and submitResignation clear their drafts; service result drops the mail suffix', () => {
  const onboardingBody = business.slice(business.indexOf('async function submitOnboarding'), business.indexOf('async function submitResignation'));
  const resignationBody = business.slice(business.indexOf('async function submitResignation'), business.indexOf('async function submitSalary'));
  assert.match(onboardingBody, /clearDraftAfterSubmit\('onboarding'\); resetOnboardingForm\(\);/);
  assert.match(resignationBody, /clearDraftAfterSubmit\('resignation'\); hideDraftRestoreCard\('resignation'\);/);
  assert.doesNotMatch(business, /const mail=row\.completionEmailStatus/);
  assert.doesNotMatch(business, /\[row\.result,mail\]\.filter\(Boolean\)\.join\(/);
  assert.match(business, /result:row\.result,/);
  assert.match(business, /function resetOnboardingForm\(\)\{[\s\S]*?form\.reset\(\);[\s\S]*?next\.disabled=false;[\s\S]*?hideDraftRestoreCard\('onboarding'\);[\s\S]*?resetOnboardingMode\(\);/);
});
