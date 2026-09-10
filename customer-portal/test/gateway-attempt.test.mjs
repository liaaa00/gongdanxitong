import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGatewayServer } from '../gateway/server.mjs';
import { runConnector } from '../connector/client.mjs';

const token = 'attempt-test-connector-secret';
const headers = { 'Content-Type': 'application/json', 'X-Connector-Token': token };
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
const post = (url, path, body) => fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
async function waitUntil(predicate) {
  for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  throw new Error('test condition was not reached');
}

function nextRelay(reader) {
  let buffer = ''; const decoder = new TextDecoder();
  return async () => {
    for (;;) {
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (!block.includes('event: relay')) continue;
        return JSON.parse(block.split('\n').find((line) => line.startsWith('data:')).slice(5));
      }
      const part = await reader.read(); if (part.done) throw new Error('relay stream closed');
      buffer += decoder.decode(part.value, { stream: true }).replace(/\r/g, '');
    }
  };
}

for (const route of ['/portal/salary', '/portal/auth/login']) {
  test(`${route}: late responses cannot resolve a newer attempt using the same public requestId`, async () => {
    const { server, state } = createGatewayServer({ connectorToken: token, requestTimeoutMs: 700,
      ...(route.endsWith('salary') ? { monitorStateDir: mkdtempSync(join(tmpdir(), 'portal-attempt-')) } : {}) });
    await listen(server); const url = 'http://127.0.0.1:' + server.address().port;
    const stream = await fetch(url + '/agent/stream', { headers }); const reader = stream.body.getReader(); const relay = nextRelay(reader);
    const publicAttempt = randomUUID();
    const input = route.endsWith('salary') ? { linkToken: 'a'.repeat(25), fields: { mode: 'same' } } : { loginEmail: 'first@example.com', password: 'test-password' };
    try {
      const firstResponse = post(url, route, { ...input, requestId: 'reused-public-id', attemptId: publicAttempt });
      const first = await relay();
      assert.notEqual(first.attemptId, publicAttempt);
      assert.equal((await firstResponse).status, 504);
      const secondResponse = post(url, route, { ...input, requestId: 'reused-public-id', attemptId: first.attemptId });
      const second = await relay();
      assert.equal(second.requestId, first.requestId);
      assert.notEqual(second.attemptId, first.attemptId);
      const withoutAttempt = await post(url, '/agent/respond', { requestId: first.requestId, result: { ok: true, value: 'missing-attempt' } });
      assert.equal(withoutAttempt.status, 400);
      if (first._monitor) {
        const staleReceipt = await post(url, '/agent/received', { requestId: first.requestId, attemptId: first.attemptId, traceId: first._monitor.traceId });
        assert.equal(staleReceipt.status, 409);
      }
      const late = await post(url, '/agent/respond', { requestId: first.requestId, attemptId: first.attemptId, result: { ok: true, value: 'old-customer-result' } });
      assert.equal(late.status, 409);
      assert.equal((await late.json()).code, 'REQUEST_ATTEMPT_MISMATCH');
      assert.equal(state.pending.get(first.requestId)?.attemptId, second.attemptId);
      assert.equal((await post(url, '/agent/respond', { requestId: second.requestId, attemptId: second.attemptId, result: { ok: true, value: 'current-result' } })).status, 202);
      const current = await secondResponse;
      assert.equal(current.status, 200);
      assert.deepEqual(await current.json(), { data: { requestId: 'reused-public-id', result: { ok: true, value: 'current-result' } } });
      if (state.monitor) {
        const responded = state.monitor.batch().events.filter((event) => event.stage === 'backend_responded');
        assert.deepEqual(responded.map((event) => event.traceId), [second.attemptId]);
      }
    } finally { await reader.cancel(); await close(server); }
  });
}

test('connector skips expired queued attempts and continues delivering the current attempt on the same stream', async () => {
  const { server, state } = createGatewayServer({ connectorToken: token, requestTimeoutMs: 700, monitorStateDir: mkdtempSync(join(tmpdir(), 'portal-attempt-')) });
  await listen(server); const url = 'http://127.0.0.1:' + server.address().port;
  const abort = new AbortController(); let releaseFirst;
  const holdFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const handled = [];
  const connector = runConnector({ gatewayUrl: url, token, signal: abort.signal, actionHandler: async (payload) => {
    handled.push(payload);
    if (handled.length === 1) await holdFirst;
    return { ok: true, value: payload.fields.value };
  } });
  const send = (value) => post(url, '/portal/salary', { requestId: 'retry-id', linkToken: 'a'.repeat(25), fields: { value } });
  try {
    await waitUntil(() => state.connectorConnected);
    const first = send('first'); await waitUntil(() => handled.length === 1);
    assert.equal((await first).status, 504);
    assert.equal((await send('expired-queued')).status, 504);
    const current = send('current');
    await waitUntil(() => state.pending.has('retry-id'));
    releaseFirst();
    const result = await current;
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { data: { requestId: 'retry-id', result: { ok: true, value: 'current' } } });
    assert.deepEqual(handled.map((item) => item.fields.value), ['first', 'current']);
    assert.notEqual(handled[0].attemptId, handled[1].attemptId);
    assert.equal(state.connectorConnected, true);
  } finally { releaseFirst(); abort.abort(); await connector; await close(server); }
});
