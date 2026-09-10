import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { MonitorJournal } from '../gateway/monitor-journal.mjs';
import { createGatewayServer } from '../gateway/server.mjs';
import { runConnector } from '../connector/client.mjs';
import { collectMonitorOnce } from '../connector/monitor-collector.mjs';

const token = 'monitor-test-secret-at-least-32-characters';
const context = () => ({ traceId: randomUUID(), requestKey: createHash('sha256').update('request').digest('hex'), action: 'salary.submit', businessType: 'salary' });
const temp = () => mkdtempSync(join(tmpdir(), 'portal-monitor-'));
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
const endpoint = (server) => 'http://127.0.0.1:' + server.address().port;

test('journal stores only allowlisted metadata and recovers an acknowledged in-flight request after restart', () => {
  const directory = temp();
  const journal = new MonitorJournal(directory);
  const trace = context();
  journal.record({ ...trace, stage: 'gateway_received', password: 'secret-pass', linkToken: 'signed-token', fields: { employee_name: '张三' }, files: [{ contentBase64: 'private-file' }] });
  journal.acknowledge(journal.journalId, journal.batch().events.at(-1).sequence);
  assert.equal(journal.batch().events.length, 0);
  const restarted = new MonitorJournal(directory);
  assert.equal(restarted.journalId, journal.journalId);
  assert.ok(restarted.batch().events.some((event) => event.traceId === trace.traceId && event.stage === 'timeout' && event.failureCode === 'GATEWAY_RESTARTED'));
  const disk = readFileSync(join(directory, 'events.jsonl'), 'utf8');
  for (const value of ['secret-pass', 'signed-token', '张三', 'private-file', 'password', 'linkToken', 'fields', 'files']) assert.equal(disk.includes(value), false);
});

test('acknowledged completed requests are compacted and never become restarted timeouts', () => {
  const directory = temp(); const journal = new MonitorJournal(directory); const trace = context();
  journal.record({ ...trace, stage: 'gateway_received' });
  journal.record({ ...trace, stage: 'portal_responded' });
  journal.acknowledge(journal.journalId, journal.batch().events.at(-1).sequence);
  assert.equal(new MonitorJournal(directory).batch().events.length, 0);
  assert.throws(() => journal.acknowledge(randomUUID(), 1), /acknowledgement/);
});

test('a crash immediately after durable ACK keeps acknowledged open requests recoverable', () => {
  const directory = temp(); const journal = new MonitorJournal(directory);
  const pendingTrace = context(); const finishedTrace = context();
  journal.record({ ...pendingTrace, stage: 'gateway_received' });
  journal.record({ ...finishedTrace, stage: 'gateway_received' });
  journal.record({ ...finishedTrace, stage: 'portal_responded' });
  const append = journal.append.bind(journal);
  journal.append = (record) => { append(record); if (record.kind === 'ack') throw new Error('simulated process crash'); };
  assert.throws(() => journal.acknowledge(journal.journalId, 3), /simulated process crash/);
  const recovered = new MonitorJournal(directory);
  assert.deepEqual(recovered.batch().events.map((event) => ({ traceId: event.traceId, stage: event.stage, failureCode: event.failureCode })), [
    { traceId: pendingTrace.traceId, stage: 'timeout', failureCode: 'GATEWAY_RESTARTED' },
  ]);
});

test('torn final writes preserve completed lines and an interrupted first header is recreated durably', () => {
  const directory = temp(); const journal = new MonitorJournal(directory); const trace = context();
  journal.record({ ...trace, stage: 'gateway_received' });
  appendFileSync(join(directory, 'events.jsonl'), '{"kind":"event","event":');
  const recovered = new MonitorJournal(directory);
  assert.equal(recovered.journalId, journal.journalId);
  assert.ok(recovered.batch().events.some((event) => event.failureCode === 'GATEWAY_RESTARTED'));
  const emptyDirectory = temp(); writeFileSync(join(emptyDirectory, 'events.jsonl'), '{"kind":');
  const recreated = new MonitorJournal(emptyDirectory);
  assert.equal(new MonitorJournal(emptyDirectory).journalId, recreated.journalId);
});

test('metadata retries never acknowledge a failed intranet transaction and use connector authentication', async () => {
  const calls = []; const event = { sequence: 4 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/events')) return Response.json({ journalId: randomUUID(), events: [event], connectorConnected: true });
    return Response.json({}, { status: 503 });
  };
  await assert.rejects(collectMonitorOnce({ gatewayUrl: 'http://gateway', backendUrl: 'http://backend', token, fetchImpl }), /rejected/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.init.headers['X-Connector-Token'] === token));
  assert.equal(calls.some((call) => call.url.endsWith('/ack')), false);
});

test('a lost ACK replays the same metadata IDs and clears the outbox only after collection succeeds', async () => {
  const { server, state } = createGatewayServer({ connectorToken: token, monitorStateDir: temp() });
  const receivedIds = new Set(); let receivedCount = 0;
  const backend = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    assert.equal(request.headers['x-connector-token'], token);
    const body = JSON.parse(raw);
    for (const event of body.events) { receivedIds.add(event.id); receivedCount++; }
    response.writeHead(201, { 'Content-Type': 'application/json' }); response.end('{"accepted":true}');
  });
  await listen(server); await listen(backend);
  try {
    const trace = context();
    state.monitor.record({ ...trace, stage: 'gateway_received' });
    state.monitor.record({ ...trace, stage: 'portal_responded' });
    const options = { gatewayUrl: endpoint(server), backendUrl: endpoint(backend), token };
    await assert.rejects(collectMonitorOnce({ ...options, fetchImpl: (url, init) => url.endsWith('/ack') ? Promise.resolve(Response.json({}, { status: 503 })) : fetch(url, init) }), /acknowledgement/);
    assert.equal(state.monitor.batch().events.length, 2);
    await collectMonitorOnce(options);
    assert.equal(state.monitor.batch().events.length, 0);
    assert.equal(receivedCount, 4); assert.equal(receivedIds.size, 2);
  } finally { await close(server); await close(backend); }
});

test('offline requests remain visible, private login data is never journaled, and metadata endpoints require authentication', async () => {
  const directory = temp(); const { server, state } = createGatewayServer({ connectorToken: token, monitorStateDir: directory });
  await listen(server); const url = endpoint(server);
  try {
    assert.equal((await fetch(url + '/agent/monitor/events')).status, 401);
    const body = { requestId: 'sensitive-name-13800138000', linkToken: 'portal-session-secret-123456789', fields: { employee_name: '张三' } };
    assert.equal((await fetch(url + '/portal/salary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 503);
    await fetch(url + '/portal/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'login-1', loginEmail: 'private@example.com', password: 'private-pass' }) });
    assert.ok(state.monitor.batch().events.some((event) => event.failureCode === 'CONNECTOR_OFFLINE'));
    const disk = readFileSync(join(directory, 'events.jsonl'), 'utf8');
    for (const value of [body.requestId, body.linkToken, '张三', 'private@example.com', 'private-pass']) assert.equal(disk.includes(value), false);
  } finally { await close(server); }
});

test('gateway and connector persist actual delivery stages and forward a server-generated trace', async () => {
  const directory = temp(); let captured;
  const backend = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    captured = { headers: request.headers, body: JSON.parse(raw) };
    response.writeHead(201, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: { ok: true, submissionId: randomUUID(), status: 'received' } }));
  });
  const { server, state } = createGatewayServer({ connectorToken: token, monitorStateDir: directory, requestTimeoutMs: 2000 });
  const abort = new AbortController(); let connector;
  await listen(backend); await listen(server); const url = endpoint(server);
  try {
    connector = runConnector({ gatewayUrl: url, backendUrl: endpoint(backend), token, signal: abort.signal, monitorEnabled: false });
    for (let count = 0; count < 50 && !state.connectorConnected; count++) await new Promise((resolve) => setTimeout(resolve, 10));
    const callerTrace = randomUUID();
    const response = await fetch(url + '/portal/salary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'salary-1', linkToken: 'a'.repeat(25), fields: { mode: 'same' }, _monitor: { traceId: callerTrace } }) });
    assert.equal(response.status, 200); await response.json();
    const events = state.monitor.batch().events;
    assert.deepEqual(events.map((event) => event.stage), ['gateway_received', 'connector_received', 'backend_responded', 'portal_responded']);
    assert.equal(new Set(events.map((event) => event.traceId)).size, 1);
    assert.notEqual(events[0].traceId, callerTrace);
    assert.equal(captured.headers['x-portal-trace-id'], events[0].traceId);
    assert.equal(captured.headers['x-connector-token'], token);
    assert.equal(captured.body._monitor, undefined);
    assert.equal(readFileSync(join(directory, 'events.jsonl'), 'utf8').includes('submissionId'), false);
  } finally { abort.abort(); if (connector) await connector; await close(server); await close(backend); }
});

test('a connector response timeout persists an explicit missing transport receipt', async () => {
  const { server, state } = createGatewayServer({ connectorToken: token, monitorStateDir: temp(), requestTimeoutMs: 30 });
  await listen(server); const url = endpoint(server); const abort = new AbortController();
  try {
    const stream = await fetch(url + '/agent/stream', { headers: { 'X-Connector-Token': token }, signal: abort.signal });
    const response = await fetch(url + '/portal/salary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'timeout-1', linkToken: 'a'.repeat(25), fields: {} }) });
    assert.equal(response.status, 504);
    assert.ok(state.monitor.batch().events.some((event) => event.stage === 'timeout' && event.failureCode === 'CONNECTOR_TIMEOUT'));
    await stream.body.cancel();
  } finally { abort.abort(); await close(server); }
});
