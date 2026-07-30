const fs = require('fs');
const ExcelJS = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/exceljs');

const base = 'http://127.0.0.1:3000/api';
const tempDir = 'D:/ai/speceappdate/工单系统/.tmp_local_e2e';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('authorization', 'Bearer ' + token);
  const response = await fetch(base + path, { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || (body && body.code !== undefined && body.code !== 0)) {
    const error = new Error(path + ': ' + response.status + ' ' + JSON.stringify(body));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body && body.data !== undefined ? body.data : body;
}

async function login(username, password) {
  return api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

function validIdCard() {
  const sequence = String(Date.now() % 1000).padStart(3, '0');
  const first17 = '33020319900101' + sequence;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = first17.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  return first17 + checks[sum % 11];
}

function setByHeader(sheet, rowNumber, values) {
  const headerToCol = new Map();
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    headerToCol.set(sheet.getCell(1, col).text.trim(), col);
  }
  for (const [header, value] of Object.entries(values)) {
    const col = headerToCol.get(header);
    if (!col) throw new Error('Template header missing: ' + header);
    sheet.getCell(rowNumber, col).value = value;
  }
}

async function uploadPreview(filePath, token) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('orderType', 'onboarding');
  form.append('sampleRows', '10');
  form.append('file', new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), 'onboarding-local-e2e.xlsx');
  return api('/work-orders/import/preview', { method: 'POST', body: form }, token);
}

async function runImport(preview, token, jobName) {
  const mapping = preview.suggestedMapping || preview.suggestion || {};
  const created = await api('/work-orders/import/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileId: preview.fileId,
      orderType: 'onboarding',
      mapping,
      autoSubmit: true,
      jobName,
    }),
  }, token);
  const jobId = created.jobId || created.id;
  if (!jobId) throw new Error('Import confirm did not return job id: ' + JSON.stringify(created));
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await api('/work-orders/import/' + jobId, {}, token);
    const status = String(job.status || job.state || '').toLowerCase();
    if (!['processing', 'pending', 'queued'].includes(status)) return job;
    await sleep(500);
  }
  throw new Error('Import job timeout: ' + jobId);
}

async function main() {
  const auth = await login('zhaotianqi', 'LocalBiz#2026');
  const token = auth.accessToken;
  const employeeName = '本地全流程厦门_' + Date.now();
  const idCardNo = validIdCard();
  const mobile = '139' + String(Date.now()).slice(-8);
  const email = 'local.e2e.' + Date.now() + '@example.com';

  const templateResponse = await fetch(base + '/work-orders/import/template?orderType=onboarding', {
    headers: { authorization: 'Bearer ' + token },
  });
  if (!templateResponse.ok) throw new Error('template download: ' + templateResponse.status);
  const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const sheet = workbook.worksheets[0];

  setByHeader(sheet, 5, {
    '客户名称': '本地E2E客户',
    '客户代码': 'E2E-XM',
    '外包类型': '全风险',
    '岗位': '本地测试专员',
    '岗位类型': '非管理类',
    '姓名': employeeName,
    '证件类型': '中国居民身份证',
    '证件号码': idCardNo,
    '户籍性质': '外地城市',
    '民族': '汉族',
    '学历': '大学本科',
    '毕业院校': '厦门大学',
    '专业': '人力资源管理',
    '毕业时间': '2012-06-30',
    '婚姻状况': '未婚',
    '移动电话': mobile,
    '电子邮件': email,
    '户籍地址': '福建省厦门市思明区本地测试路1号',
    '合同期限形式': '固定期限',
    '合同期限': '3年',
    '合同开始日期': '2026-08-01',
    '合同终止日期': '2029-07-31',
    '工作城市': '厦门市',
    '工时制': '标准工时制',
    '工资形式': '按月',
    '基本工资': 6500,
    '发薪周期': '当月',
    '发薪日期': '15',
    '参保地': '福建省厦门市',
    '参保起始月': '8月',
    '社保基数': 6500,
    '公积金基数': 6500,
    '公积金比例': '12%+12%',
    '业务模式': '北仑自营',
    '人员类型': '全日制',
    '是否企服发起劳动合同': '是',
    '是否电子签': '1.是',
    '电子签平台': '速创',
    '劳动合同主体': '本地E2E签约主体',
    '项目名称': '本地E2E项目',
    '劳动合同模板（标准模板/特殊模板）': '标准模板',
    '劳动合同签署是否需要催办员工': '是',
    '入职材料是否需要集约收集': '是',
    '反馈截止日期': '2026-08-05',
    '是否为通用模板': '是',
    '是否企服发薪': '是',
    '发薪地': '北仑分公司',
    '社保公积金未办是否需要催办': '是',
    '特殊备注': '仅本地隔离库完整流程测试',
  });

  const inputPath = tempDir + '/onboarding-local-e2e-input.xlsx';
  await workbook.xlsx.writeFile(inputPath);

  const preview = await uploadPreview(inputPath, token);
  if (preview.rowCount !== 1) throw new Error('Expected one data row: ' + JSON.stringify(preview));
  if ((preview.missingRequired || []).length > 0) {
    throw new Error('Preview missing required: ' + JSON.stringify(preview.missingRequired));
  }
  const unmatched = (preview.unmatched || preview.unmatchedHeaders || []).filter((item) => !String(item).startsWith('__col_'));
  if (unmatched.length > 0) throw new Error('Preview unmatched headers: ' + JSON.stringify(unmatched));

  const firstJob = await runImport(preview, token, 'local-full-e2e-' + Date.now());
  if (String(firstJob.status).toLowerCase() !== 'completed' || Number(firstJob.successRows) !== 1) {
    throw new Error('First import failed: ' + JSON.stringify(firstJob));
  }

  const list = await api('/work-orders?page=1&pageSize=20&keyword=' + encodeURIComponent(employeeName), {}, token);
  const items = list.items || list.list || [];
  const order = items.find((item) => item.employeeName === employeeName || item.employee_name === employeeName);
  if (!order) throw new Error('Imported work order not found: ' + JSON.stringify(list));
  const subOrders = order.subOrders || order.sub_orders || order.dispatchedOrders || [];
  const moduleCodes = subOrders.map((item) => item.moduleCode || item.module_code).sort();
  const expectedModules = ['contract', 'data_entry', 'onboarding_contact', 'social_insurance'];
  if (JSON.stringify(moduleCodes) !== JSON.stringify(expectedModules)) {
    throw new Error('Expected four sub orders: ' + JSON.stringify(subOrders));
  }

  const detail = await api('/work-orders/' + order.id, {}, token);
  const mainExtra = detail.extraData || detail.extra_data || {};
  const childDetails = [];
  for (const child of subOrders) {
    childDetails.push(await api('/dispatched-orders/' + child.id, {}, token));
  }
  const allExtra = [mainExtra, ...childDetails.map((item) => item.extraData || item.extra_data || {})];
  const expected = {
    mobile,
    email,
    graduation_school: '厦门大学',
    major: '人力资源管理',
    graduation_date: '2012-06-30',
    birth_date: '1990-01-01',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (!allExtra.some((extra) => String(extra[field] || '') === value)) {
      throw new Error('Missing expected field ' + field + '=' + value);
    }
  }
  if (!allExtra.some((extra) => ['男', '女'].includes(extra.gender))) {
    throw new Error('Derived gender missing: ' + JSON.stringify(allExtra));
  }
  if (!allExtra.some((extra) => Number.isInteger(Number(extra.age)))) {
    throw new Error('Derived age missing: ' + JSON.stringify(allExtra));
  }

  const duplicatePreview = await uploadPreview(inputPath, token);
  const duplicateJob = await runImport(duplicatePreview, token, 'local-duplicate-e2e-' + Date.now());
  if (String(duplicateJob.status).toLowerCase() !== 'failed' || Number(duplicateJob.failRows) !== 1) {
    throw new Error('Duplicate import was not rejected: ' + JSON.stringify(duplicateJob));
  }
  const duplicateText = JSON.stringify(duplicateJob);
  if (!/DUPLICATE_ID_CARD_IN_MONTH|4120|重复/.test(duplicateText)) {
    throw new Error('Duplicate rejection lacks a clear reason: ' + duplicateText);
  }

  const result = {
    employeeName,
    idCardNo,
    mobile,
    email,
    inputPath,
    preview: {
      rowCount: preview.rowCount,
      mappingMode: preview.modelUsed,
      unmatched,
      missingRequired: preview.missingRequired || [],
    },
    importJob: {
      id: firstJob.id || firstJob.jobId,
      status: firstJob.status,
      successRows: firstJob.successRows,
      failRows: firstJob.failRows,
    },
    order: {
      id: order.id,
      orderNo: order.orderNo || order.order_no,
      status: order.status,
      moduleCodes,
    },
    derived: {
      gender: allExtra.map((item) => item.gender).find(Boolean),
      birthDate: allExtra.map((item) => item.birth_date).find(Boolean),
      age: allExtra.map((item) => item.age).find((item) => item !== undefined && item !== null),
    },
    education: {
      school: allExtra.map((item) => item.graduation_school).find(Boolean),
      major: allExtra.map((item) => item.major).find(Boolean),
      graduationDate: allExtra.map((item) => item.graduation_date).find(Boolean),
    },
    childContacts: childDetails.map((item) => ({
      id: item.id,
      moduleCode: item.moduleCode || item.module_code,
      mobile: (item.extraData || item.extra_data || {}).mobile,
      email: (item.extraData || item.extra_data || {}).email,
    })),
    duplicateJob: {
      id: duplicateJob.id || duplicateJob.jobId,
      status: duplicateJob.status,
      failRows: duplicateJob.failRows,
      errorMessage: duplicateJob.errorMessage,
      validationErrors: duplicateJob.validationErrors,
    },
  };

  fs.writeFileSync(tempDir + '/local-import-e2e-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error && error.body) console.error(JSON.stringify(error.body, null, 2));
  process.exitCode = 1;
});
