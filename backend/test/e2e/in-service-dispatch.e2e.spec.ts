import request = require('supertest');

const RAW_BASE_URL = process.env.BASE_URL ?? process.env.E2E_BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const BIZ_MEMBER_TOKEN = process.env.BIZ_MEMBER_TOKEN;
const BIZ_LEADER_TOKEN = process.env.BIZ_LEADER_TOKEN;

const hasRequiredEnv = Boolean(
  RAW_BASE_URL && ADMIN_TOKEN && BIZ_MEMBER_TOKEN && BIZ_LEADER_TOKEN,
);

const describeIf = hasRequiredEnv ? describe : describe.skip;

type JsonRecord = Record<string, unknown>;

function baseOrigin(): string {
  if (!RAW_BASE_URL) return 'http://127.0.0.1:3000';
  const url = new URL(RAW_BASE_URL);
  return url.origin;
}

function apiPath(path: string): string {
  if (!RAW_BASE_URL) return `/api${path}`;
  const url = new URL(RAW_BASE_URL);
  const prefix = url.pathname.replace(/\/$/, '');
  return `${prefix}${path}`;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function unwrap(body: unknown): JsonRecord {
  const record = body && typeof body === 'object' ? (body as JsonRecord) : {};
  const data = record.data && typeof record.data === 'object' ? (record.data as JsonRecord) : record;
  return data;
}

async function expect2xx(res: request.Response, label: string): Promise<void> {
  if (![200, 201].includes(res.status)) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describeIf('in-service order → dispatch → supplement → complete', () => {
  it('creates an in-service order, dispatches, requests supplement, and completes', async () => {
    // ponytail: basic E2E skeleton. Expand once test DB fixture and Sheet4 config exist.
    const createRes = await request(baseOrigin())
      .post(apiPath('/in-service-orders'))
      .set(auth(BIZ_MEMBER_TOKEN!))
      .send({
        businessType: 'social_insurance',
        processType: 'social_insurance_change',
        requirementType: 'social_insurance_add',
        province: '福建',
        contactPhone: '13800000000',
        businessDescription: '社保增员',
        serviceFee: 100,
        handleChannel: 'online',
      });
    await expect2xx(createRes, 'create in-service order');
    const created = unwrap(createRes.body);
    const orderId = String(created.id ?? '');
    expect(orderId).toBeTruthy();

    // Approve (biz_leader → processing, Sheet4 auto-dispatch)
    const approveRes = await request(baseOrigin())
      .post(apiPath(`/in-service-orders/${orderId}/approve`))
      .set(auth(BIZ_LEADER_TOKEN!))
      .send({});
    await expect2xx(approveRes, 'approve order');
    const approved = unwrap(approveRes.body);
    expect(approved.status).toBe('processing');
    expect(approved.handlerId).toBeTruthy(); // ponytail: assumes Sheet4 config present

    // Request supplement (handler → pending_info)
    const supplementRes = await request(baseOrigin())
      .post(apiPath(`/in-service-orders/${orderId}/request-supplement`))
      .set(auth(BIZ_LEADER_TOKEN!))
      .send({ pendingInfoReason: '需补充社保卡照片' });
    await expect2xx(supplementRes, 'request supplement');
    const supplement = unwrap(supplementRes.body);
    expect(supplement.status).toBe('pending_info');

    // Resubmit (creator → processing, keeps handler)
    const resubmitRes = await request(baseOrigin())
      .post(apiPath(`/in-service-orders/${orderId}/resubmit`))
      .set(auth(BIZ_MEMBER_TOKEN!))
      .send({});
    await expect2xx(resubmitRes, 'resubmit after supplement');
    const resubmitted = unwrap(resubmitRes.body);
    expect(resubmitted.status).toBe('processing');
    expect(resubmitted.handlerId).toBe(approved.handlerId);

    // Complete (handler → completed)
    const completeRes = await request(baseOrigin())
      .post(apiPath(`/in-service-orders/${orderId}/complete`))
      .set(auth(BIZ_LEADER_TOKEN!))
      .send({});
    await expect2xx(completeRes, 'complete order');
    const completed = unwrap(completeRes.body);
    expect(completed.status).toBe('completed');
  }, 20000);
});
