const fs = require('fs');
const JSZip = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/jszip');

const origin = 'http://127.0.0.1:3000';
const base = origin + '/api';
const tempDir = 'D:/ai/speceappdate/工单系统/.tmp_local_e2e';

function normalizeBody(value) {
  let current = value;
  for (let i = 0; i < 3 && typeof current === 'string'; i += 1) {
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }
  if (current && typeof current === 'object' && current.data !== undefined) {
    return normalizeBody(current.data);
  }
  return current;
}

async function api(path, options = {}, token, allowError = false) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('authorization', 'Bearer ' + token);
  const response = await fetch(base + path, { ...options, headers });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  const body = normalizeBody(parsed);
  const topCode = parsed && typeof parsed === 'object' ? parsed.code : undefined;
  if (!allowError && (!response.ok || (topCode !== undefined && topCode !== 0))) {
    throw new Error(path + ': ' + response.status + ' ' + JSON.stringify(parsed));
  }
  return { status: response.status, data: body, raw: parsed };
}

async function login(username, password) {
  return (await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })).data.accessToken;
}

async function post(path, body, token, allowError = false) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  }, token, allowError);
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return value.list || value.items || value.rows || [];
}

async function completeLifecycle(id, token) {
  const statuses = [];
  for (const [suffix, body] of [
    ['accept', {}],
    ['confirm', {}],
    ['start-processing', { handleChannel: 'online' }],
    ['complete', { remark: '本地独立工单完整流程完成' }],
  ]) {
    const result = (await post('/in-service-orders/' + id + '/' + suffix, body, token)).data;
    statuses.push(result.status);
  }
  if (statuses.join(',') !== 'accepted,ready,processing,completed') {
    throw new Error('Unexpected lifecycle for ' + id + ': ' + statuses.join(','));
  }
  return statuses;
}

async function downloadCertificate(id, token, fileName, expectedName) {
  const response = await fetch(base + '/in-service-orders/' + id + '/certificate-template', {
    headers: { authorization: 'Bearer ' + token },
  });
  if (!response.ok) throw new Error('Certificate download failed: ' + response.status + ' ' + await response.text());
  const buffer = Buffer.from(await response.arrayBuffer());
  const output = tempDir + '/' + fileName;
  fs.writeFileSync(output, buffer);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  const text = String(xml || '').replace(/<[^>]+>/g, '');
  if (!text.includes(expectedName)) {
    throw new Error('Certificate does not include employee name: ' + expectedName);
  }
  return { output, bytes: buffer.length, includesEmployee: true };
}

async function main() {
  const [sales, admin] = await Promise.all([
    login('zhaotianqi', 'LocalBiz#2026'),
    login('lizhanbo', 'LocalAdmin#2026'),
  ]);
  const customerResponse = (await api('/admin/customers?page=1&pageSize=100', {}, admin)).data;
  const departmentResponse = (await api('/admin/departments', {}, admin)).data;
  const customer = listFrom(customerResponse).find((item) => item.isActive !== false && item.is_active !== false);
  const department = listFrom(departmentResponse).find((item) => item.isActive !== false && item.is_active !== false);
  if (!customer?.id || !department?.id) {
    throw new Error('Missing customer or department: ' + JSON.stringify({ customerResponse, departmentResponse }));
  }

  const stamp = Date.now();
  const basePayload = {
    customerId: customer.id,
    departmentId: department.id,
  };
  const definitions = [
    {
      key: 'renewal',
      payload: {
        ...basePayload,
        orderKind: 'contract_renewal',
        employeeName: '本地续签_' + stamp,
        idCardNo: '33020319910101' + String(stamp % 1000).padStart(3, '0') + 'X',
        extraData: {
          contract_signing_method: '续签',
          contract_term_type: '固定期限',
          contract_term: '3年',
          contract_start_date: '2026-09-01',
          contract_end_date: '2029-08-31',
          mobile: '13800138001',
          position: '续签测试岗位',
          contract_subject: '本地续签主体',
          contract_template: '标准模板',
        },
      },
    },
    {
      key: 'employment',
      payload: {
        ...basePayload,
        orderKind: 'certificate',
        employeeName: '本地在职证明_' + stamp,
        idCardNo: '33020319920202' + String((stamp + 1) % 1000).padStart(3, '0') + 'X',
        extraData: {
          certificateType: 'employment',
          hireDate: '2022-03-01',
          jobTitle: '项目专员',
          purpose: '本地银行业务验收',
        },
      },
    },
    {
      key: 'income',
      payload: {
        ...basePayload,
        orderKind: 'certificate',
        employeeName: '本地收入证明_' + stamp,
        idCardNo: '33020319930303' + String((stamp + 2) % 1000).padStart(3, '0') + 'X',
        extraData: {
          certificateType: 'income',
          hireDate: '2021-05-01',
          jobTitle: '客户经理',
          purpose: '本地贷款业务验收',
          averageMonthlyIncome: 12800,
        },
      },
    },
    {
      key: 'singleBusiness',
      payload: {
        ...basePayload,
        orderKind: 'single_business',
        employeeName: '本地单项业务_' + stamp,
        idCardNo: '33020319940404' + String((stamp + 3) % 1000).padStart(3, '0') + 'X',
        expectedCompletionDate: '2026-09-05',
        businessReason: '本地完整流程验收',
        businessType: 'registration',
        processType: 'supplementary_payment',
        requirementType: 'unpaid_supplement',
        province: '浙江',
        city: '宁波市',
        district: '北仑区',
        businessDescription: '测试未缴补缴业务及补充材料重提',
        serviceFee: 100,
        attachments: [],
      },
    },
    {
      key: 'resignationCertificate',
      payload: {
        ...basePayload,
        orderKind: 'resignation_certificate',
        employeeName: '本地离职证明_' + stamp,
        idCardNo: '33020319950505' + String((stamp + 4) % 1000).padStart(3, '0') + 'X',
        extraData: {
          resignationDate: '2026-08-31',
          resignationReason: '合同到期',
          deliveryMethod: '电子版',
        },
      },
    },
  ];

  const created = {};
  for (const definition of definitions) {
    const order = (await post('/in-service-orders', definition.payload, sales)).data;
    if (order.orderKind !== definition.payload.orderKind || order.status !== 'dispatched') {
      throw new Error('Create failed for ' + definition.key + ': ' + JSON.stringify(order));
    }
    if ('parentOrderId' in order || 'children' in order || 'dispatchedOrders' in order) {
      throw new Error('Direct order unexpectedly contains split structure: ' + JSON.stringify(order));
    }
    created[definition.key] = order;
  }

  const socialCertificate = await post('/in-service-orders', {
    ...basePayload,
    orderKind: 'certificate',
    employeeName: '本地社保证明_' + stamp,
    idCardNo: '33020319960606' + String((stamp + 5) % 1000).padStart(3, '0') + 'X',
    extraData: {
      certificateType: 'social_insurance',
      hireDate: '2023-01-01',
      jobTitle: '测试专员',
      purpose: '本地验收',
    },
  }, sales, true);
  if (socialCertificate.status !== 400 || !/4812|社保|模板/.test(JSON.stringify(socialCertificate.raw))) {
    throw new Error('Social insurance certificate should be rejected: ' + JSON.stringify(socialCertificate));
  }

  const certificates = {
    employment: await downloadCertificate(created.employment.id, admin, 'employment-certificate-e2e.docx', created.employment.employeeName),
    income: await downloadCertificate(created.income.id, admin, 'income-certificate-e2e.docx', created.income.employeeName),
  };

  const singleId = created.singleBusiness.id;
  const acceptedSingle = (await post('/in-service-orders/' + singleId + '/accept', {}, admin)).data;
  if (acceptedSingle.status !== 'accepted') throw new Error('Single business accept failed');
  const pendingInfo = (await post('/in-service-orders/' + singleId + '/request-info', {
    reason: '请补充具体补缴情形',
  }, admin)).data;
  if (pendingInfo.status !== 'pending_info') throw new Error('Request info failed: ' + JSON.stringify(pendingInfo));
  const resubmitted = (await api('/in-service-orders/' + singleId + '/resubmit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessDescription: '已补充：2026年6月至8月未缴补缴',
    }),
  }, sales)).data;
  if (resubmitted.status !== 'accepted' || !resubmitted.businessDescription.includes('已补充')) {
    throw new Error('Single business resubmit failed: ' + JSON.stringify(resubmitted));
  }
  const singleStatuses = ['accepted'];
  for (const [suffix, body] of [
    ['confirm', {}],
    ['start-processing', { handleChannel: 'online' }],
    ['complete', { remark: '本地单项业务办理成功' }],
  ]) {
    const result = (await post('/in-service-orders/' + singleId + '/' + suffix, body, admin)).data;
    singleStatuses.push(result.status);
  }

  const lifecycles = {};
  for (const key of ['renewal', 'employment', 'income', 'resignationCertificate']) {
    lifecycles[key] = await completeLifecycle(created[key].id, admin);
  }
  lifecycles.singleBusiness = singleStatuses;

  for (const definition of definitions) {
    const list = (await api('/in-service-orders?page=1&pageSize=20&orderKind=' + definition.payload.orderKind, {}, sales)).data;
    if (!listFrom(list).some((item) => item.id === created[definition.key].id)) {
      throw new Error('Order missing from independent list: ' + definition.key);
    }
  }

  console.log(JSON.stringify({
    customer: { id: customer.id, name: customer.customerName || customer.customer_name },
    department: { id: department.id, name: department.name },
    created: Object.fromEntries(Object.entries(created).map(([key, order]) => [key, {
      id: order.id,
      orderNo: order.orderNo || order.order_no,
      orderKind: order.orderKind,
      status: order.status,
      handlerId: order.handlerId,
    }])),
    certificates,
    socialCertificateRejected: true,
    singleBusinessResubmit: {
      pendingInfo: pendingInfo.status,
      afterResubmit: resubmitted.status,
      description: resubmitted.businessDescription,
    },
    lifecycles,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
