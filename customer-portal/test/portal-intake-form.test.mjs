import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

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

test('entering contract dates does not opt an employee into probation; clearing probation removes its requirements', () => {
  const ids = ['contract_type', 'contract_duration', 'contract-duration-row', 'contract-end-row', 'contract_start_date', 'contract_end_date', 'social_start_month', 'probation_start_date', 'probation_months', 'probation-month-row', 'probation-end-row', 'probation_end_date', 'probation_salary', 'probation_other_salary', 'probation-salary-row', 'probation-other-salary-row'];
  const nodes = Object.fromEntries(ids.map((id) => [id, element()]));
  nodes.contract_type.value = 'fixed';
  nodes.contract_duration.value = '12';
  nodes.contract_start_date.value = '2026-09-10';
  const code = page.slice(page.indexOf('    function addMonths('), page.indexOf("    ['contract_type', 'contract_start_date'"));
  const context = runFunctions(code, { document: { getElementById: (id) => nodes[id] } });

  context.updateContractDates();
  assert.equal(nodes.probation_start_date.value, '');
  assert.equal(nodes.probation_months.required, false);
  assert.equal(nodes.probation_salary.required, false);
  assert.equal(nodes.probation_months.disabled, true);
  assert.equal(nodes['probation-end-row'].classList.contains('visible'), false);

  nodes.probation_start_date.value = '2026-09-10';
  nodes.probation_months.value = '3';
  context.updateProbationDates();
  assert.equal(nodes.probation_months.required, true);
  assert.equal(nodes.probation_salary.required, true);
  assert.equal(nodes.probation_other_salary.disabled, false);
  assert.match(nodes.probation_end_date.textContent, /^\d{4}-\d{2}-\d{2}$/);

  nodes.probation_start_date.value = '';
  context.updateProbationDates();
  assert.equal(nodes.probation_months.required, false);
  assert.equal(nodes.probation_salary.required, false);
  assert.equal(nodes.probation_salary.disabled, true);
  assert.equal(nodes.probation_other_salary.disabled, true);
  assert.doesNotMatch(nodes.probation_end_date.textContent, /^\d{4}-\d{2}-\d{2}$/);
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

test('resignation submits the full stop year-month and actual contribution location', async () => {
  const button = element();
  const form = { reportValidity: () => true, querySelector: () => button };
  const feedback = element();
  let sent;
  const context = runFunctions(businessFunction('submitResignation'), {
    document: { getElementById: (id) => id === 'resignation-form' ? form : feedback },
    FormData: class { entries() { return Object.entries({ employee_name: '测试员工', social_stop_month: '2027-01', social_location: '上海' }); } },
    portalSessionGeneration: 1, activePortalSession: { account: { id: 'account-a' } }, portalLinkToken: () => 'token-a',
    portalState: { resignationFiles: [] }, filesForPortal: async () => [], assertPortalSession() {}, isPortalSessionChanged: () => false,
    portalCall: async (path, payload) => { sent = { path, payload }; return { workOrderNo: 'RS-1' }; }, refreshPortalProgress: async () => {},
  });
  await context.submitResignation();
  assert.equal(sent.path, '/portal/resignation');
  assert.equal(sent.payload.fields.social_stop_month, '2027-01');
  assert.equal(sent.payload.fields.social_location, '上海');
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
