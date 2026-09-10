import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayServer } from '../gateway/server.mjs';

let server;
let baseUrl;
let reader;

before(async () => {
  const created = createGatewayServer({ connectorToken: 'unit-test-token', requestTimeoutMs: 1000 });
  server = created.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (reader) {
    await reader.cancel();
  }
  await new Promise((resolve) => server.close(resolve));
});

async function readRelayEvent(response) {
  if (!reader) reader = response.body.getReader();
  let buffer = '';
  const decoder = new TextDecoder();
  while (true) {
    const next = await reader.read();
    if (next.done) {
      throw new Error('stream closed before relay event');
    }
    buffer += decoder.decode(next.value).replace(/\r/g, '');
    const end = buffer.indexOf('\n\n');
    if (end < 0) {
      continue;
    }
    const block = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    if (!block.includes('event: relay')) {
      continue;
    }
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    return JSON.parse(dataLine.slice(5).trim());
  }
}

async function connectConnector() {
  const response = await fetch(baseUrl + '/agent/stream', {
    headers: { 'X-Connector-Token': 'unit-test-token' },
  });
  assert.equal(response.status, 200);
  return response;
}

async function respond(requestId, result) {
  const response = await fetch(baseUrl + '/agent/respond', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Connector-Token': 'unit-test-token',
    },
    body: JSON.stringify({ requestId, result }),
  });
  assert.equal(response.status, 202);
}

test('health reports connector offline before registration', async () => {
  const response = await fetch(baseUrl + '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'customer-portal-gateway',
    connectorConnected: false,
    pendingRequests: 0,
  });
});

test('test request is relayed and completed exactly once', async () => {
  const streamResponse = await connectConnector();
  const requestPromise = fetch(baseUrl + '/portal/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'req-001', message: 'hello' }),
  });

  const relay = await readRelayEvent(streamResponse);
  assert.deepEqual(relay, { requestId: 'req-001', message: 'hello', action: 'test.echo' });
  await respond(relay.requestId, 'connector-ok:hello');

  const completed = await requestPromise;
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), {
    data: { requestId: 'req-001', result: 'connector-ok:hello' },
  });

  const duplicate = await fetch(baseUrl + '/portal/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'req-001', message: 'hello' }),
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), {
    data: { requestId: 'req-001', result: 'connector-ok:hello' },
  });

  const changed = await fetch(baseUrl + '/portal/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'req-001', message: 'different payload' }),
  });
  assert.equal(changed.status, 409);

  await reader.cancel();
  reader = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('portal account login is relayed as a dedicated action', async () => {
  const streamResponse = await connectConnector();
  const requestBody = { requestId: 'login-001', loginEmail: 'customer@example.com', password: 'Password123' };
  const requestPromise = fetch(baseUrl + '/portal/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const relay = await readRelayEvent(streamResponse);
  assert.deepEqual(relay, { ...requestBody, action: 'portal_account.login' });
  const result = { ok: true, linkToken: 'signed-token', customer: { id: 'customer-1' } };
  await respond(relay.requestId, result);
  const completed = await requestPromise;
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { data: { requestId: 'login-001', result } });
  const reused = await fetch(baseUrl + '/portal/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
  });
  assert.equal(reused.status, 409);
  assert.equal(JSON.stringify(await reused.json()).includes('signed-token'), false);


  await reader.cancel();
  reader = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('portal account login validates email and password before relay', async () => {
  const response = await fetch(baseUrl + '/portal/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'login-invalid', loginEmail: '', password: '' }),
  });
  assert.equal(response.status, 400);
});

test('onboarding intake is relayed as a controlled draft action', async () => {
  const streamResponse = await connectConnector();
  const requestBody = {
    requestId: 'onboarding-001',
    linkToken: 'x'.repeat(24),
    fields: { employee_name: '测试员工' },
  };
  const requestPromise = fetch(baseUrl + '/portal/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const relay = await readRelayEvent(streamResponse);
  assert.deepEqual(relay, { ...requestBody, action: 'onboarding.create_draft' });
  const result = { ok: true, status: 'DRAFT_CREATED', workOrderNo: 'ON20260901001' };
  await respond(relay.requestId, result);

  const completed = await requestPromise;
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), {
    data: { requestId: 'onboarding-001', result },
  });

  await reader.cancel();
  reader = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('onboarding attachments and Excel import routes relay dedicated actions', async () => {
  const streamResponse = await connectConnector();
  const linkToken = 'x'.repeat(24);

  const attachmentRequest = {
    requestId: 'onboarding-attachment-001',
    linkToken,
    businessType: 'onboarding',
    files: [{ name: 'id-card.pdf', mimeType: 'application/pdf', contentBase64: 'ZmlsZQ==', bizPurpose: 'employee_identity' }],
  };
  const attachmentPromise = fetch(baseUrl + '/portal/attachments/shared-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attachmentRequest),
  });
  const attachmentRelay = await readRelayEvent(streamResponse);
  assert.deepEqual(attachmentRelay, { ...attachmentRequest, action: 'shared_email.send_attachments' });
  const attachmentResult = { ok: true, attachmentIds: ['att-001'] };
  await respond(attachmentRelay.requestId, attachmentResult);
  const attachmentCompleted = await attachmentPromise;
  assert.equal(attachmentCompleted.status, 200);
  assert.deepEqual(await attachmentCompleted.json(), {
    data: { requestId: attachmentRequest.requestId, result: attachmentResult },
  });

  const previewRequest = {
    requestId: 'onboarding-import-preview-001',
    linkToken,
    fileName: 'employees.xlsx',
    contentBase64: 'UEsDBA==',
  };
  const previewPromise = fetch(baseUrl + '/portal/onboarding/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(previewRequest),
  });
  const previewRelay = await readRelayEvent(streamResponse);
  assert.deepEqual(previewRelay, { ...previewRequest, action: 'onboarding.import_preview' });
  const previewResult = { ok: true, fileId: 'import-001', headers: ['name'] };
  await respond(previewRelay.requestId, previewResult);
  const previewCompleted = await previewPromise;
  assert.equal(previewCompleted.status, 200);
  assert.deepEqual(await previewCompleted.json(), {
    data: { requestId: previewRequest.requestId, result: previewResult },
  });

  const confirmRequest = {
    requestId: 'onboarding-import-confirm-001',
    linkToken,
    fileId: 'import-001',
    mapping: { name: 'employee_name' },
  };
  const confirmPromise = fetch(baseUrl + '/portal/onboarding/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(confirmRequest),
  });
  const confirmRelay = await readRelayEvent(streamResponse);
  assert.deepEqual(confirmRelay, { ...confirmRequest, action: 'onboarding.import_confirm' });
  const confirmResult = { ok: true, jobId: 'job-001' };
  await respond(confirmRelay.requestId, confirmResult);
  const confirmCompleted = await confirmPromise;
  assert.equal(confirmCompleted.status, 200);
  assert.deepEqual(await confirmCompleted.json(), {
    data: { requestId: confirmRequest.requestId, result: confirmResult },
  });

  await reader.cancel();
  reader = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('portal requests reject invalid data and offline connector', async () => {
  const invalid = await fetch(baseUrl + '/portal/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'bad id', message: '' }),
  });
  assert.equal(invalid.status, 400);

  const invalidOnboarding = await fetch(baseUrl + '/portal/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'onboarding-invalid', linkToken: '', fields: [] }),
  });
  assert.equal(invalidOnboarding.status, 400);

  const invalidAttachment = await fetch(baseUrl + '/portal/onboarding/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'attachment-invalid', linkToken: 'x'.repeat(24), files: [] }),
  });
  assert.equal(invalidAttachment.status, 400);

  const invalidImportPreview = await fetch(baseUrl + '/portal/onboarding/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'import-invalid', linkToken: 'x'.repeat(24), fileName: 'employees.csv', contentBase64: 'ZmlsZQ==' }),
  });
  assert.equal(invalidImportPreview.status, 400);

  const invalidImportConfirm = await fetch(baseUrl + '/portal/onboarding/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'import-confirm-invalid', linkToken: 'x'.repeat(24), mapping: {} }),
  });
  assert.equal(invalidImportConfirm.status, 400);

  const offline = await fetch(baseUrl + '/portal/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'req-offline', message: 'hello' }),
  });
  assert.equal(offline.status, 503);
});
