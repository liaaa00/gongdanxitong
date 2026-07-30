const base = 'http://127.0.0.1:3000/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}, token, allowError = false) {
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
  if (!allowError && (!response.ok || (body.code !== undefined && body.code !== 0))) {
    throw new Error(path + ': ' + response.status + ' ' + JSON.stringify(body));
  }
  return {
    status: response.status,
    data: body && body.data !== undefined ? body.data : body,
    body,
  };
}

async function login(username, password) {
  return (await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })).data.accessToken;
}

async function post(path, body, token) {
  return (await api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  }, token)).data;
}

async function main() {
  const [sales, social, supervisor, contact, dataEntry] = await Promise.all([
    login('zhaotianqi', 'LocalBiz#2026'),
    login('fuqianwen', 'LocalSocial#2026'),
    login('fuqianwen', 'LocalSocial#2026'),
    login('maoyani', 'LocalContact2#2026'),
    login('annazhen', 'LocalData#2026'),
  ]);

  const stamp = Date.now();
  const employeeName = '本地离职全流程_' + stamp;
  const idCardNo = '33020319881212' + String(stamp % 1000).padStart(3, '0') + 'X';
  const originalMobile = '136' + String(stamp).slice(-8);
  const updatedMobile = '137' + String(stamp).slice(-8);
  const email = 'resignation.' + stamp + '@example.com';

  const created = await post('/work-orders', {
    orderType: 'resignation',
    extraData: {
      customer_name: '本地离职E2E客户',
      customer_code: 'E2E-RESIGN',
      employee_name: employeeName,
      id_card_no: idCardNo,
      mobile: originalMobile,
      email,
      social_pay_region: '浙江省宁波市北仑区',
      social_stop_month: '8月',
      resignation_reason: '本地完整流程验收',
      resignation_date: '2026-08-15',
      need_resignation_share: '是',
      feedback_deadline: '2026-08-10',
      is_common_template: '是',
    },
  }, sales);
  const orderId = created.id;
  if (!orderId) throw new Error('Create resignation missing id: ' + JSON.stringify(created));

  const submitted = await post('/work-orders/' + orderId + '/submit', {}, sales);
  const children = submitted.dispatchedOrders || submitted.children || [];
  const byModule = new Map(children.map((item) => [item.moduleCode || item.module_code, item]));
  const expectedModules = ['data_entry_resign', 'resignation_contact', 'resignation_social_insurance'];
  const moduleCodes = Array.from(byModule.keys()).sort();
  if (JSON.stringify(moduleCodes) !== JSON.stringify(expectedModules)) {
    throw new Error('Unexpected resignation children: ' + JSON.stringify(children));
  }

  const initialDetails = [];
  for (const moduleCode of expectedModules) {
    const detail = (await api('/dispatched-orders/' + byModule.get(moduleCode).id, {}, sales)).data;
    const extra = detail.extraData || detail.extra_data || {};
    for (const [field, expected] of Object.entries({
      employee_name: employeeName,
      mobile: originalMobile,
      email,
      social_pay_region: '浙江省宁波市北仑区',
      social_stop_month: '8月',
      resignation_reason: '本地完整流程验收',
      resignation_date: '2026-08-15',
    })) {
      if (String(extra[field] || '') !== expected) {
        throw new Error(moduleCode + ' missing ' + field + ': ' + JSON.stringify(extra));
      }
    }
    initialDetails.push({
      moduleCode,
      id: detail.id,
      mobile: extra.mobile,
      email: extra.email,
      region: extra.social_pay_region,
      stopMonth: extra.social_stop_month,
      reason: extra.resignation_reason,
    });
  }

  const socialId = byModule.get('resignation_social_insurance').id;
  await post('/dispatched-orders/' + socialId + '/accept', {}, social);
  await post('/dispatched-orders/' + socialId + '/return', {
    returnReason: '本地E2E退回补充联系方式',
  }, social);

  const modification = await post('/dispatched-orders/' + socialId + '/creator-update', {
    fields: { mobile: updatedMobile },
    reason: '本地E2E业务员修正手机号',
  }, sales);
  if (modification.status !== 'modify_pending') {
    throw new Error('Expected modify_pending: ' + JSON.stringify(modification));
  }

  const approval = await post('/dispatched-orders/batch-approve-modify', {
    ids: [socialId],
    approved: true,
    comment: '本地E2E批量同意修改',
  }, supervisor);
  if (Number(approval.processed) !== 1) {
    throw new Error('Batch approval failed: ' + JSON.stringify(approval));
  }

  const afterApproval = (await api('/dispatched-orders/' + socialId, {}, sales)).data;
  const afterExtra = afterApproval.extraData || afterApproval.extra_data || {};
  if (afterApproval.status !== 'pending' || afterExtra.mobile !== updatedMobile) {
    throw new Error('Approved modification did not return to pending: ' + JSON.stringify(afterApproval));
  }

  await post('/dispatched-orders/' + socialId + '/accept', {}, social);
  await post('/dispatched-orders/' + socialId + '/complete', {
    remark: '本地E2E社保减员完成',
    extraData: {
      social_insurance_result: '是',
      medical_insurance_result: '是',
      housing_fund_result: '是',
      social_insurance_remark: '8月停保完成',
    },
  }, social);

  const contactId = byModule.get('resignation_contact').id;
  await post('/dispatched-orders/' + contactId + '/accept', {}, contact);
  await post('/dispatched-orders/' + contactId + '/complete', {
    remark: '本地E2E离职材料收集完成',
  }, contact);

  const dataEntryId = byModule.get('data_entry_resign').id;
  await post('/dispatched-orders/' + dataEntryId + '/accept', {}, dataEntry);
  await post('/dispatched-orders/' + dataEntryId + '/complete', {
    remark: '本地E2E减员录入完成',
  }, dataEntry);

  await sleep(300);
  const finalOrder = (await api('/work-orders/' + orderId, {}, sales)).data;
  const finalChildren = finalOrder.dispatchedOrders || finalOrder.subOrders || finalOrder.sub_orders || [];
  const childStatuses = finalChildren.map((item) => ({
    moduleCode: item.moduleCode || item.module_code,
    status: item.status,
  })).sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));
  if (finalOrder.status !== 'completed' || childStatuses.some((item) => item.status !== 'completed')) {
    throw new Error('Resignation did not complete: ' + JSON.stringify({ finalOrder, childStatuses }));
  }

  console.log(JSON.stringify({
    order: {
      id: orderId,
      orderNo: finalOrder.orderNo || finalOrder.order_no,
      status: finalOrder.status,
      employeeName,
    },
    initialDetails,
    modification: {
      requestedStatus: modification.status,
      approvedProcessed: approval.processed,
      finalChildStatus: afterApproval.status,
      updatedMobile: afterExtra.mobile,
    },
    childStatuses,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
