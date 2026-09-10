import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagePath = new URL('../web/index.html', import.meta.url);

test('phase-one customer portal exposes the agreed entry points', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));

  for (const id of ['login-form', 'dashboard', 'onboarding', 'resignation', 'salary', 'progress']) {
    assert.match(page, new RegExp('id="' + id + '"'));
  }

  assert.match(page, /class="brand-logo" src="\/assets\/company-logo\.png"/);
  assert.match(page, /--teal: #0080cc;/);

  assert.doesNotMatch(page, /\u65e9\u4e0a\u597d\uff0c\u5f20\u5973\u58eb/);
  assert.match(page, /Customer portal visual refresh/);
  assert.match(page, /#onboarding \.page-head/);
  assert.match(page, /#resignation \.page-head/);
  assert.match(page, /#salary \.page-head/);

  assert.match(page, /账号密码登录/);
  assert.match(page, /id="login-email"[^>]+type="email"/);
  assert.match(page, /id="login-password"[^>]+type="password"/);
  assert.match(page, /fetch\(gatewayUrl\(\) \+ '\/portal\/auth\/login'/);
  assert.match(page, /customer_portal_session/);
  assert.match(page, /savedPortalSession\(\)\?\.linkToken/);
  assert.match(page, /id="portal-customer-name"/);
  assert.match(page, /id="portal-customer-code"/);
  assert.doesNotMatch(page, /验证码登录|获取验证码|任意 6 位数字|不发送真实验证码|海曙未来科技有限公司/);
  assert.match(page, /<h1 id="onboarding-title">入职办理<\/h1>/);
  assert.match(page, /<h1 id="resignation-title">离职办理<\/h1>/);
  assert.match(page, /薪资确认/);
  assert.doesNotMatch(page, /提交员工入职资料|提交员工离职资料|本月薪资信息确认|本月待确认/);
  assert.doesNotMatch(page, /reminder-title|本月提醒/);
  assert.doesNotMatch(page, /id="config"|内部客户配置|保存演示配置/);
  assert.doesNotMatch(page, /内部客户规则已自动带入默认规则/);
});

test('onboarding keeps the four-step layered intake and backend field mapping', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));

  for (const step of ['基本信息', '合同与岗位', '薪资与社保', '银行卡与确认']) {
    assert.match(page, new RegExp(step));
  }

  for (const fieldCode of [
    'employee_name',
    'id_card_type',
    'contract_type',
    'contract_start_date',
    'working_hours',
    'base_salary',
    'social_location',
    'bank_account',
  ]) {
    assert.match(page, new RegExp('name="' + fieldCode + '"'));
  }

  assert.doesNotMatch(page, /name="bank_location"/);
  assert.match(page, /name="bank_account"[^>]+pattern="\[0-9\]\{8,30\}"/);

  for (const backendFieldCode of [
    'contract_term_type', 'contract_term', 'work_hour_system', 'salary_form',
    'start_month', 'contract_end_date', 'probation_end_date',
  ]) {
    assert.match(page, new RegExp(backendFieldCode));
  }
  assert.match(page, /合同终止日期/);
  assert.match(page, /自动计算/);
});

test('onboarding submits through the portal gateway instead of the internal backend', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));

  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\('token'\)/);
  assert.match(page, /portalCall\('\/portal\/onboarding'/);
  assert.match(page, /new FormData\(form\)/);
  assert.match(page, /result\.workOrderNo/);
  assert.match(page, /refreshPortalProgress\(\)/);
  assert.match(page, /escapeHtml\(value\|\|'-'\)/);
  assert.match(page, /submittingOnboarding/);
  assert.doesNotMatch(page, /\/api\/work-orders/);
});

test('inline portal script has valid JavaScript syntax', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('resignation attachments use the same guided picker as onboarding', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));

  for (const id of [
    'resignation-attachment-dropzone',
    'resignation-attachments',
    'resignation-attachment-list',
    'resignation-attachment-status',
  ]) {
    assert.match(page, new RegExp('id="' + id + '"'));
  }

  assert.match(page, /id="resignation-attachments"[^>]+multiple/);
  assert.doesNotMatch(page, /resignation-attachment-purpose|attachment-purpose/);
  assert.match(page, /data-remove-resignation-attachment/);
  assert.match(page, /resignationFiles/);
  assert.match(page, /id="resignation-form"[^>]*>/);
  assert.doesNotMatch(page, /id="resignation_attachment"/);
});


test('customer-facing pages keep templates and hide internal operating rules', async () => {
  const page = (await readFile(pagePath, 'utf8')) + '\n' + (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8'));
  assert.match(page, /id="download-onboarding-template"/);
  assert.match(page, /先下载入职 Excel 模板/);
  assert.match(page, /id="download-resignation-template"/);
  assert.match(page, /先下载离职 Excel 模板/);
  assert.match(page, /function downloadStandardTemplate\(businessType\)/);
  assert.match(page, /最近200条记录/);
  assert.doesNotMatch(page, /近两年记录|账单日前 3 个工作日提醒客户|前 2 个工作日再次催办客户|前 1 个工作日升级提醒业务员/);
  assert.doesNotMatch(page, /附件统一走共享邮箱|不绑定工单附件 ID|内部客户规则已自动带入默认规则|离职证明由后台|业务员审核流程/);
  assert.ok(page.includes('onboarding-change-mode'));
  assert.ok(page.includes('resignation-change-mode'));
  assert.match(page, /function resetOnboardingMode\(\)/);
  assert.match(page, /function resetResignationMode\(\)/);
  assert.match(page, /className='table-wrap import-results'/);
  assert.match(page, /\.import-results th, \.import-results td \{ white-space: normal; overflow-wrap: anywhere; vertical-align: top; \}/);
  assert.match(page, /@media \(max-width: 440px\)/);
  assert.match(page, /\.app-frame \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(page, /need_certificate|needCertificate|salary-rows|add-salary-item|salary-people/);
  assert.doesNotMatch(page, /name="payroll_cycle"|name="payroll_date"|name="need_payslip"/);
  assert.match(page, /name="salary-mode" value="same" data-salary-mode="same"/);
  assert.match(page, /name="salary-mode" value="changed" data-salary-mode="changed"/);
  assert.match(page, /name="salary-change-channel" value="text" data-salary-channel="text"/);
  assert.match(page, /name="salary-change-channel" value="attachment" data-salary-channel="attachment"/);
  assert.match(page, /id="salary-text-view" class="salary-method-panel hidden"/);
  assert.match(page, /id="salary-attachment-view" class="salary-method-panel hidden"/);
  assert.match(page, /function validateSalarySubmission\(\)/);
  assert.match(page, /salaryMode: null, salaryChannel: null/);
  assert.match(page, /id="salary-month" type="month"/);
  assert.match(page, /month: document\.getElementById\('salary-month'\)\.value/);
  assert.match(page, /salary-period-heading/);
  assert.doesNotMatch(page, /校验模板|超过 20MB|超过20MB/);
  assert.doesNotMatch(page, /请按提醒时间完成本月薪资确认|先选择本月是否有变动，再提交确认/);
});
