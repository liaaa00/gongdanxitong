import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGatewayServer } from '../gateway/server.mjs';
import { runConnector } from '../connector/client.mjs';
import { createPortalLinkToken } from '../connector/portal-onboarding.mjs';

const secret = 'e2e-link-secret-that-is-longer-than-thirty-two-characters';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function waitForConnector(gatewayUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const health = await fetch(gatewayUrl + '/health').then((response) => response.json());
    if (health.connectorConnected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('connector did not connect');
}

test('onboarding travels from public gateway through connector to the internal work-order API', async () => {
  let capturedBackendRequest;
  const backend = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;

    if (request.method === 'GET' && request.url === '/api/customer-rules/11111111-1111-4111-8111-111111111111/portal-defaults') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: {
        customerId: '11111111-1111-4111-8111-111111111111',
        customerCode: 'E2E-001',
        configured: true,
        onboardingDefaults: { contract_subject: '浙江企服', need_esign: true },
      } }));
      return;
    }

    if (request.method === 'POST' && request.url === '/api/customer-portal/submit') {
      capturedBackendRequest = {
        url: request.url,
        method: request.method,
        authorization: request.headers.authorization,
        idempotencyKey: request.headers['idempotency-key'],
        body: JSON.parse(raw),
      };
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: { ok:true, status:'received', workOrderId:'draft-id', workOrderNo:'ON20260902001' } }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'not found' }));
  });
  const gateway = createGatewayServer({ connectorToken: 'e2e-connector-token', requestTimeoutMs: 2000 }).server;
  const abortController = new AbortController();
  let connectorTask;

  try {
    await listen(backend);
    await listen(gateway);
    const backendUrl = 'http://127.0.0.1:' + backend.address().port;
    const gatewayUrl = 'http://127.0.0.1:' + gateway.address().port;
    connectorTask = runConnector({
      gatewayUrl,
      token: 'e2e-connector-token',
      portalLinkSecret: secret,
      backendUrl,
      backendToken: 'service-token',
      signal: abortController.signal,
    });
    await waitForConnector(gatewayUrl);

    const linkToken = createPortalLinkToken({
      customerId: '11111111-1111-4111-8111-111111111111',
      customerName: '端到端测试客户',
      customerCode: 'E2E-001',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, secret);
    const fields = {
      employee_name: '端到端员工',
      id_card_type: '中国居民身份证',
      id_card_no: '330102199001010011',
      mobile: '13800138000',
      position: '测试岗位',
      position_type: '非管理类',
      work_city: '宁波',
      contract_term_type: '固定期限',
      contract_term: '36',
      contract_start_date: '2026-09-02',
      contract_end_date: '2029-09-02',
      work_hour_system: '标准工时制',
      salary_form: '按月',
      base_salary: '5000',
      social_location: '宁波',
      start_month: '9月',
      social_base: '5000',
      fund_base: '5000',
      bank_account: '6222000000000000',
    };
    const response = await fetch(gatewayUrl + '/portal/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'portal-e2e-001', linkToken, fields }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: {
        requestId: 'portal-e2e-001',
        result: {
          ok: true,
          status: 'received',
          workOrderId: 'draft-id',
          workOrderNo: 'ON20260902001',
        },
      },
    });
    assert.equal(capturedBackendRequest.url, '/api/customer-portal/submit');
    assert.equal(capturedBackendRequest.method, 'POST');
    assert.equal(capturedBackendRequest.authorization, 'Bearer service-token');
    assert.equal(capturedBackendRequest.body.requestId, 'portal-e2e-001');
    assert.deepEqual(capturedBackendRequest.body, {
      businessType:'onboarding',requestId:'portal-e2e-001',linkToken,fields,
    });
  } finally {
    abortController.abort();
    if (connectorTask) await connectorTask;
    if (gateway.listening) await close(gateway);
    if (backend.listening) await close(backend);
  }
});
