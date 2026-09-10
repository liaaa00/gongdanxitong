import { fileURLToPath } from 'node:url';
import { handlePortalAction } from './portal-onboarding.mjs';
import { runMonitorCollector } from './monitor-collector.mjs';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18080';
const DEFAULT_TOKEN = 'test-connector-token';
const RECONNECT_DELAY_MS = 500;

function parseSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trim());
    }
  }
  if (data.length === 0) {
    return null;
  }
  return { event, data: data.join('\n') };
}

async function consumeSse(response, onEvent, signal) {
  if (!response.body) {
    throw new Error('gateway returned an empty stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let separator;
    while ((separator = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const parsed = parseSseBlock(block);
      if (parsed) {
        await onEvent(parsed);
      }
    }
  }
  await reader.cancel();
}

async function postResult(gatewayUrl, token, payload, fetchImpl) {
  const response = await fetchImpl(gatewayUrl + '/agent/respond', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Connector-Token': token,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    if (await isExpiredAttempt(response)) return;
    throw new Error('gateway rejected connector response with ' + response.status);
  }
}

async function isExpiredAttempt(response) {
  if (![404, 409].includes(response.status)) return false;
  try {
    const body = await response.json();
    return ['REQUEST_NOT_FOUND', 'REQUEST_ATTEMPT_MISMATCH'].includes(body.code);
  } catch { return false; }
}

export async function runConnector(options = {}) {
  const gatewayUrl = (options.gatewayUrl || process.env.GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
  const token = options.token || process.env.CONNECTOR_TOKEN || DEFAULT_TOKEN;
  const fetchImpl = options.fetchImpl || fetch;
  const signal = options.signal || new AbortController().signal;
  const actionHandler = options.actionHandler || ((payload) => handlePortalAction(payload, options));
  const backendUrl = (options.backendUrl || process.env.LOCAL_BACKEND_URL || '').replace(/\/$/, '');
  const monitorAbort = new AbortController();
  const monitorSignal = AbortSignal.any([signal, monitorAbort.signal]);
  const monitorJob = backendUrl && options.monitorEnabled !== false
    ? runMonitorCollector({ gatewayUrl, backendUrl, token, fetchImpl, signal: monitorSignal, intervalMs: options.monitorIntervalMs }) : null;

  try {
  while (!signal.aborted) {
    try {
      const response = await fetchImpl(gatewayUrl + '/agent/stream', {
        headers: { 'X-Connector-Token': token },
        signal,
      });
      if (!response.ok) {
        throw new Error('gateway stream rejected with ' + response.status);
      }
      await consumeSse(response, async (event) => {
        if (event.event !== 'relay') {
          return;
        }
        const payload = JSON.parse(event.data);
        if (payload._monitor?.traceId) {
          const received = await fetchImpl(gatewayUrl + '/agent/received', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Connector-Token': token }, signal,
            body: JSON.stringify({ requestId: payload.requestId, attemptId: payload.attemptId, traceId: payload._monitor.traceId }),
          });
          if (!received.ok) {
            if (await isExpiredAttempt(received)) return;
            throw new Error('gateway no longer accepts this request');
          }
        }
        const result = await actionHandler(payload);
        await postResult(gatewayUrl, token, {
          requestId: payload.requestId,
          attemptId: payload.attemptId,
          result,
        }, fetchImpl);
      }, signal);
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      console.error('connector stream error: ' + error.message);
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }
  } finally { monitorAbort.abort(); if (monitorJob) await monitorJob; }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runConnector();
}
