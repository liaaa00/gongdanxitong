import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MonitorJournal, MONITORED_ACTIONS } from './monitor-journal.mjs';

const DEFAULT_PORT = 18080;
const DEFAULT_TOKEN = 'test-connector-token';
const DEFAULT_TIMEOUT_MS = 10_000;
// JSON is used at the public boundary so the browser can upload files without
// a second public object-storage service. Keep this bounded; the connector
// still applies per-file and per-request limits before forwarding anything.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

function writeJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.PORTAL_ALLOWED_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Connector-Token');
}

async function readJson(request) {
  let size = 0;
  let raw = '';
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('request body too large');
    }
    raw += chunk;
  }
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
}

function isValidAttemptId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateTestRequest(body) {
  if (!isValidRequestId(body.requestId)) {
    return 'requestId must contain 1-100 ASCII letters, digits, dots, underscores, colons, or hyphens';
  }
  if (typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > 2000) {
    return 'message must contain 1-2000 characters';
  }
  return null;
}

function validatePortalLogin(body) {
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.loginEmail !== 'string' || body.loginEmail.trim().length < 3 || body.loginEmail.trim().length > 320) return 'loginEmail is required';
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 200) return 'password is required';
  return null;
}

function validateOnboardingRequest(body) {
  if (!isValidRequestId(body.requestId)) {
    return 'requestId must contain 1-100 ASCII letters, digits, dots, underscores, colons, or hyphens';
  }
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) {
    return 'linkToken is required';
  }
  if (!isPlainObject(body.fields) || Object.keys(body.fields).length > 40) {
    return 'fields must be an object with at most 40 entries';
  }
  if (body.attachmentIds !== undefined && (!Array.isArray(body.attachmentIds) || body.attachmentIds.some((id) => typeof id !== 'string' || id.length > 120))) {
    return 'attachmentIds must be an array of upload ids';
  }
  return null;
}

const PORTAL_BUSINESS_TYPES = new Set(['onboarding', 'resignation', 'salary']);

function validatePortalSubmission(body) {
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) return 'linkToken is required';
  if (!isPlainObject(body.fields) || Object.keys(body.fields).length > 80) return 'fields must be an object with at most 80 entries';
  return null;
}

function validateSharedEmailAttachments(body) {
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) return 'linkToken is required';
  if (!PORTAL_BUSINESS_TYPES.has(body.businessType)) return 'businessType must be onboarding, resignation, or salary';
  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 5) return 'files must contain 1-5 items';
  for (const file of body.files) {
    if (!isPlainObject(file) || typeof file.name !== 'string' || file.name.length < 1 || file.name.length > 180) return 'each file needs a valid name';
    if (typeof file.mimeType !== 'string' || file.mimeType.length > 160) return 'each file needs a valid mimeType';
    if (typeof file.bizPurpose !== 'string' || file.bizPurpose.length < 1 || file.bizPurpose.length > 80) return 'each file needs a business purpose';
    if (typeof file.contentBase64 !== 'string' || file.contentBase64.length < 1 || file.contentBase64.length > 28 * 1024 * 1024) return 'each file content is invalid or too large';
  }
  return null;
}
function validateAttachmentUpload(body) {
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) return 'linkToken is required';
  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 5) return 'files must contain 1-5 items';
  for (const file of body.files) {
    if (!isPlainObject(file) || typeof file.name !== 'string' || file.name.length < 1 || file.name.length > 180) return 'each file needs a valid name';
    if (typeof file.contentBase64 !== 'string' || file.contentBase64.length < 1 || file.contentBase64.length > 28 * 1024 * 1024) return 'each file content is invalid or too large';
    if (typeof file.bizPurpose !== 'string' || file.bizPurpose.length < 1 || file.bizPurpose.length > 80) return 'each file needs a business purpose';
  }
  return null;
}

function validateImportPreview(body) {
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) return 'linkToken is required';
  if (typeof body.fileName !== 'string' || !/\.(xlsx|xls)$/i.test(body.fileName)) return 'fileName must be an Excel file';
  if (typeof body.contentBase64 !== 'string' || body.contentBase64.length < 1 || body.contentBase64.length > 28 * 1024 * 1024) return 'Excel content is invalid or too large';
  return null;
}

function validateImportConfirm(body) {
  if (body.contentBase64 !== undefined) return validateImportPreview(body);
  if (!isValidRequestId(body.requestId)) return 'requestId is invalid';
  if (typeof body.linkToken !== 'string' || body.linkToken.length < 20 || body.linkToken.length > 4096) return 'linkToken is required';
  if (typeof body.fileId !== 'string' || body.fileId.length < 1 || body.fileId.length > 120) return 'fileId is required';
  if (!isPlainObject(body.mapping) || Object.keys(body.mapping).length > 200) return 'mapping must be an object';
  return null;
}

function isAuthorized(request, token) {
  return request.headers['x-connector-token'] === token;
}

function isConnectorResult(value) {
  return typeof value === 'string' || isPlainObject(value);
}

function createEvent(name, payload) {
  return 'event: ' + name + '\ndata: ' + JSON.stringify(payload) + '\n\n';
}

export function createGatewayServer(options = {}) {
  const connectorToken = options.connectorToken || process.env.CONNECTOR_TOKEN || DEFAULT_TOKEN;
  const requestTimeoutMs = options.requestTimeoutMs || DEFAULT_TIMEOUT_MS;
  const pending = new Map();
  const completed = new Map();
  const monitorDirectory = options.monitorStateDir || process.env.PORTAL_MONITOR_STATE_DIR;
  const monitor = monitorDirectory ? new MonitorJournal(monitorDirectory) : null;
  let monitorFault = false;
  const recordMonitor = (event) => {
    try { return monitor.record(event); }
    catch (error) { monitorFault = true; throw error; }
  };
  const observe = (event) => {
    try { recordMonitor(event); }
    catch { monitorFault = true; console.error('portal monitor journal write failed'); }
  };
  let connectorResponse = null;

  const state = {
    get connectorConnected() {
      return connectorResponse !== null;
    },
    pending,
    completed,
    monitor,
  };

  async function relayRequest(body, action, publicResponse) {
    const fingerprint = createHash('sha256').update(JSON.stringify({ action, body })).digest('hex');
    // Business requests must reach the authoritative session check on every call.
    const cached = action === 'test.echo' || action === 'portal_account.login' ? completed.get(body.requestId) : null;
    if (cached) {
      if (cached.fingerprint !== fingerprint || action === 'portal_account.login') {
        return { statusCode: 409, body: { code: 'REQUEST_ID_REUSED', message: 'requestId belongs to another request; use a new requestId' } };
      }
      return { statusCode: 200, body: cached.response };
    }
    if (pending.has(body.requestId)) {
      return {
        statusCode: 409,
        body: { code: 'DUPLICATE_REQUEST', message: 'requestId is already being processed' },
      };
    }
    // Public requestId remains the business idempotency key. Each transport
    // attempt gets an independent, gateway-generated correlation identifier.
    const attemptId = randomUUID();
    const tracking = monitor && MONITORED_ACTIONS.has(action) ? {
      traceId: attemptId, action,
      requestKey: createHash('sha256').update(body.requestId).digest('hex'),
      businessType: ['onboarding', 'resignation', 'salary'].find((type) => action.startsWith(type + '.')) || null,
    } : null;
    if (tracking) {
      recordMonitor({ ...tracking, stage: 'gateway_received' });
      publicResponse.once('finish', () => observe({ ...tracking, stage: 'portal_responded' }));
      publicResponse.once('close', () => {
        if (!publicResponse.writableFinished) observe({ ...tracking, stage: 'failed', failureCode: 'CLIENT_DISCONNECTED' });
      });
    }
    if (!connectorResponse) {
      if (tracking) recordMonitor({ ...tracking, stage: 'failed', failureCode: 'CONNECTOR_OFFLINE' });
      return {
        statusCode: 503,
        body: { code: 'CONNECTOR_OFFLINE', message: 'local connector is not connected' },
      };
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(body.requestId);
          if (tracking) observe({ ...tracking, stage: 'timeout', failureCode: 'CONNECTOR_TIMEOUT' });
          reject(new Error('connector response timeout'));
        }, requestTimeoutMs);

        pending.set(body.requestId, {
          attemptId,
          tracking,
          resolve: (value) => {
            clearTimeout(timer);
            pending.delete(body.requestId);
            const cachedResponse = { data: value };
            if(action === 'test.echo' || action === 'portal_account.login') completed.set(body.requestId, { attemptId, fingerprint, response: action === 'portal_account.login' ? null : cachedResponse });
            if (completed.size > 1000) {
              completed.delete(completed.keys().next().value);
            }
            resolve(cachedResponse);
          },
          reject,
        });

        try {
          connectorResponse.write(createEvent('relay', { ...body, action, attemptId, _monitor: tracking ? { traceId: tracking.traceId } : undefined }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(body.requestId);
          if (tracking) observe({ ...tracking, stage: 'failed', failureCode: 'RELAY_FAILED' });
          reject(error);
        }
      });
      return { statusCode: 200, body: result };
    } catch (error) {
      if (error.message === 'connector response timeout') {
        return { statusCode: 504, body: { code: 'CONNECTOR_TIMEOUT', message: error.message } };
      }
      return { statusCode: 502, body: { code: 'RELAY_FAILED', message: error.message } };
    }
  }

  const server = http.createServer(async (request, response) => {
    setCors(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        service: 'customer-portal-gateway',
        connectorConnected: state.connectorConnected,
        pendingRequests: pending.size,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/agent/stream') {
      if (!isAuthorized(request, connectorToken)) {
        writeJson(response, 401, { code: 'UNAUTHORIZED', message: 'invalid connector token' });
        return;
      }

      if (connectorResponse) {
        connectorResponse.end();
      }

      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      connectorResponse = response;

      const clearConnection = () => {
        if (connectorResponse === response) {
          connectorResponse = null;
        }
      };
      request.on('close', clearConnection);
      response.on('close', clearConnection);
      return;
    }

    if (['/agent/monitor/events', '/agent/monitor/ack', '/agent/received'].includes(url.pathname)) {
      if (!isAuthorized(request, connectorToken)) { writeJson(response, 401, { code: 'UNAUTHORIZED' }); return; }
      if (!monitor || monitorFault) { writeJson(response, 503, { code: 'MONITOR_UNAVAILABLE' }); return; }
      try {
        if (request.method === 'GET' && url.pathname === '/agent/monitor/events') {
          writeJson(response, 200, { ...monitor.batch(), connectorConnected: state.connectorConnected }); return;
        }
        if (request.method === 'POST') {
          const body = await readJson(request);
          if (url.pathname === '/agent/monitor/ack') {
            monitor.acknowledge(body.journalId, body.through);
            writeJson(response, 200, { acknowledged: true }); return;
          }
          if (url.pathname === '/agent/received') {
            if (!isValidAttemptId(body.attemptId)) { writeJson(response, 400, { code: 'INVALID_REQUEST' }); return; }
            const current = pending.get(body.requestId);
            if (!current) { writeJson(response, 404, { code: 'REQUEST_NOT_FOUND' }); return; }
            if (current.attemptId !== body.attemptId || !current.tracking || current.tracking.traceId !== body.traceId) {
              writeJson(response, 409, { code: 'REQUEST_ATTEMPT_MISMATCH' }); return;
            }
            const tracking = current.tracking;
            recordMonitor({ ...tracking, stage: 'connector_received' });
            writeJson(response, 202, { accepted: true }); return;
          }
        }
      } catch { writeJson(response, 400, { code: 'INVALID_MONITOR_REQUEST' }); return; }
      writeJson(response, 405, { code: 'METHOD_NOT_ALLOWED' }); return;
    }

    if (request.method === 'POST' && url.pathname === '/agent/respond') {
      if (!isAuthorized(request, connectorToken)) {
        writeJson(response, 401, { code: 'UNAUTHORIZED', message: 'invalid connector token' });
        return;
      }

      try {
        const body = await readJson(request);
        if (!isValidRequestId(body.requestId) || !isValidAttemptId(body.attemptId) || !isConnectorResult(body.result)) {
          writeJson(response, 400, { code: 'INVALID_REQUEST', message: 'requestId, attemptId, and result are required' });
          return;
        }

        const resolver = pending.get(body.requestId);
        if (!resolver) {
          const cached = completed.get(body.requestId);
          writeJson(response, cached?.attemptId === body.attemptId ? 200 : 404, cached?.attemptId === body.attemptId
            ? { accepted: true, requestId: body.requestId } : {
            code: 'REQUEST_NOT_FOUND',
            message: 'request is no longer pending',
          });
          return;
        }

        if (resolver.attemptId !== body.attemptId) {
          writeJson(response, 409, { code: 'REQUEST_ATTEMPT_MISMATCH', message: 'response belongs to an earlier request attempt' });
          return;
        }

        if (resolver.tracking) recordMonitor({ ...resolver.tracking,
          stage: body.result?.ok === false ? 'failed' : 'backend_responded',
          failureCode: body.result?.ok === false ? 'BACKEND_REJECTED' : null,
        });

        resolver.resolve({ requestId: body.requestId, result: body.result });
        writeJson(response, 202, { accepted: true, requestId: body.requestId });
      } catch (error) {
        writeJson(response, 400, { code: 'INVALID_JSON', message: error.message });
      }
      return;
    }

    if (request.method === 'POST' && [
      '/portal/test', '/portal/auth/login', '/portal/auth/session', '/portal/auth/change-password', '/portal/schema', '/portal/template', '/portal/progress', '/portal/onboarding', '/portal/resignation', '/portal/salary',
      '/portal/attachments/shared-email', '/portal/onboarding/attachments',
      '/portal/onboarding/import/preview', '/portal/onboarding/import/confirm',
      '/portal/resignation/import/preview', '/portal/resignation/import/confirm',
    ].includes(url.pathname)) {
      try {
        const body = await readJson(request);
        const route = url.pathname;
        const extraActions = {'/portal/auth/session':'portal_account.session','/portal/auth/change-password':'portal_account.change_password','/portal/schema':'portal.schema','/portal/template':'portal.template','/portal/progress':'portal.progress'};
        const action = extraActions[route] || (route === '/portal/test' ? 'test.echo'
          : route === '/portal/auth/login' ? 'portal_account.login'
            : route === '/portal/onboarding' ? 'onboarding.create_draft'
            : route === '/portal/resignation' ? 'resignation.create_draft'
              : route === '/portal/salary' ? 'salary.submit'
                : route === '/portal/attachments/shared-email' || route === '/portal/onboarding/attachments' ? 'shared_email.send_attachments'
                  : route.endsWith('/import/preview') ? (route.startsWith('/portal/resignation') ? 'resignation.import_preview' : 'onboarding.import_preview')
                    : route.startsWith('/portal/resignation') ? 'resignation.import_confirm' : 'onboarding.import_confirm');
        const validationError = extraActions[route] ? (!isValidRequestId(body.requestId) || typeof body.linkToken !== 'string' ? 'requestId and linkToken are required' : null) : route === '/portal/test' ? validateTestRequest(body)
          : route === '/portal/auth/login' ? validatePortalLogin(body)
            : route === '/portal/onboarding' ? validateOnboardingRequest(body)
            : route === '/portal/resignation' || route === '/portal/salary' ? validatePortalSubmission(body)
              : route === '/portal/attachments/shared-email' ? validateSharedEmailAttachments(body)
                : route === '/portal/onboarding/attachments' ? validateSharedEmailAttachments({ ...body, businessType: 'onboarding' })
                  : route.endsWith('/import/preview') ? validateImportPreview(body)
                    : validateImportConfirm(body);
        if (validationError) {
          writeJson(response, 400, { code: 'INVALID_REQUEST', message: validationError });
          return;
        }
        const relayBody = route === '/portal/onboarding/attachments' ? { ...body, businessType: 'onboarding' } : body;
        const relayed = await relayRequest(relayBody, action, response);
        writeJson(response, relayed.statusCode, relayed.body);
      } catch (error) {
        if (error instanceof SyntaxError || error.message === 'request body too large') {
          writeJson(response, 400, { code: 'INVALID_JSON', message: error.message });
        } else {
          writeJson(response, 502, { code: 'RELAY_FAILED', message: error.message });
        }
      }
      return;
    }
    writeJson(response, 404, { code: 'NOT_FOUND', message: 'route not found' });
  });

  return { server, state };
}

export async function startGateway(options = {}) {
  const port = Number(options.port || process.env.PORTAL_PORT || DEFAULT_PORT);
  const host = options.host || process.env.PORTAL_HOST || '0.0.0.0';
  const { server, state } = createGatewayServer({ ...options, monitorStateDir: options.monitorStateDir || process.env.PORTAL_MONITOR_STATE_DIR || fileURLToPath(new URL('../.codex-monitor', import.meta.url)) });
  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log('customer portal gateway listening on ' + host + ':' + server.address().port);
  return { server, state };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startGateway();
}
