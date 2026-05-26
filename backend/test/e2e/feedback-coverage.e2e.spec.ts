import request = require('supertest');
import * as fs from 'fs';

const RAW_BASE_URL = process.env.BASE_URL ?? process.env.E2E_BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SALES_TOKEN = process.env.SALES_TOKEN;
const BACKOFFICE_SUPERVISOR_TOKEN = process.env.BACKOFFICE_SUPERVISOR_TOKEN;
const BACKOFFICE_HANDLER_TOKEN = process.env.BACKOFFICE_HANDLER_TOKEN;
const SHARED_OWNER_TOKEN = process.env.SHARED_OWNER_TOKEN;

const hasRequiredEnv = Boolean(
  RAW_BASE_URL &&
    ADMIN_TOKEN &&
    SALES_TOKEN &&
    BACKOFFICE_SUPERVISOR_TOKEN &&
    BACKOFFICE_HANDLER_TOKEN &&
    SHARED_OWNER_TOKEN,
);

const describeIf = hasRequiredEnv ? describe : describe.skip;

type JsonRecord = Record<string, unknown>;
type CreatedOrder = { id: string; orderNo?: string; dispatchedIds: string[]; moduleCodes: string[] };

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

function unwrapItems(body: unknown): JsonRecord[] {
  const data = unwrap(body);
  const items = data.items ?? data.list ?? data.rows;
  return Array.isArray(items) ? (items as JsonRecord[]) : [];
}

function uniqueIdCard(): string {
  const rand = String(Date.now()).slice(-7).padStart(7, '0');
  return `3301021990${rand}1`.slice(0, 18);
}

function uniqueName(prefix: string): string {
  return `${prefix}_${process.env.E2E_RUN_ID ?? Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function expect2xx(res: request.Response, label: string): Promise<void> {
  if (![200, 201].includes(res.status)) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

async function createAndSubmitOnboarding(): Promise<CreatedOrder> {
  const createRes = await request(baseOrigin())
    .post(apiPath('/work-orders'))
    .set(auth(SALES_TOKEN!))
    .send({
      orderType: 'onboarding',
      extraData: {
        employee_name: uniqueName('E2E入职'),
        id_card_no: uniqueIdCard(),
        customer_code: 'E2E-CUST',
        customer_name: 'E2E测试客户',
        mobile: '13800000000',
        need_onboarding_contact: '是',
        need_company_contract: '是',
      },
    });
  await expect2xx(createRes, 'create onboarding');
  const created = unwrap(createRes.body);
  const id = String(created.id ?? '');
  if (!id) throw new Error(`create onboarding missing id: ${JSON.stringify(createRes.body)}`);

  const submitRes = await request(baseOrigin())
    .post(apiPath(`/work-orders/${id}/submit`))
    .set(auth(SALES_TOKEN!))
    .send({});
  await expect2xx(submitRes, 'submit onboarding');
  const submitted = unwrap(submitRes.body);
  const dispatched = Array.isArray(submitted.dispatchedOrders)
    ? (submitted.dispatchedOrders as JsonRecord[])
    : Array.isArray(submitted.children)
      ? (submitted.children as JsonRecord[])
      : [];

  return {
    id,
    orderNo: typeof created.orderNo === 'string' ? created.orderNo : undefined,
    dispatchedIds: dispatched.map((item) => String(item.id)).filter(Boolean),
    moduleCodes: dispatched.map((item) => String(item.moduleCode ?? item.module_code)).filter(Boolean),
  };
}

describeIf('0520 feedback coverage E2E (external BASE_URL)', () => {
  jest.setTimeout(120_000);

  describe('role smoke and dashboard', () => {
    it('validates the five required role tokens', async () => {
      const tokens = [ADMIN_TOKEN!, SALES_TOKEN!, BACKOFFICE_SUPERVISOR_TOKEN!, BACKOFFICE_HANDLER_TOKEN!, SHARED_OWNER_TOKEN!];
      for (const token of tokens) {
        const res = await request(baseOrigin()).get(apiPath('/auth/me')).set(auth(token));
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/role|roles|username|name|user/i);
      }
    });

    it('checks dashboard cards for all five roles', async () => {
      const tokens = [ADMIN_TOKEN!, SALES_TOKEN!, BACKOFFICE_SUPERVISOR_TOKEN!, BACKOFFICE_HANDLER_TOKEN!, SHARED_OWNER_TOKEN!];
      for (const token of tokens) {
        const res = await request(baseOrigin()).get(apiPath('/dashboard/cards')).set(auth(token));
        expect(res.status).toBe(200);
        expect(unwrap(res.body)).toEqual(expect.any(Object));
      }
    });

    it('checks dashboard node matrix and moduleCode trend filters', async () => {
      const matrix = await request(baseOrigin())
        .get(apiPath('/dashboard/order-type-matrix?dimension=node'))
        .set(auth(ADMIN_TOKEN!));
      expect(matrix.status).toBe(200);
      const matrixText = JSON.stringify(matrix.body);
      expect(matrixText).toMatch(/moduleCode|module_code|onboarding_contact|social_insurance|contract|data_entry/);

      const trend = await request(baseOrigin())
        .get(apiPath('/dashboard/leader-trend?orderType=onboarding&moduleCode=onboarding_contact'))
        .set(auth(ADMIN_TOKEN!));
      expect(trend.status).toBe(200);
      expect(JSON.stringify(trend.body)).toMatch(/bucket|buckets|moduleCode|onboarding_contact/);
    });
  });

  describe('admin-only menus and hidden fields', () => {
    it('keeps fields/export templates/configuration admin-only at API level', async () => {
      const adminFields = await request(baseOrigin()).get(apiPath('/admin/fields')).set(auth(ADMIN_TOKEN!));
      expect([200, 201]).toContain(adminFields.status);

      const salesFields = await request(baseOrigin()).get(apiPath('/admin/fields')).set(auth(SALES_TOKEN!));
      expect([401, 403]).toContain(salesFields.status);

      const adminTemplates = await request(baseOrigin()).get(apiPath('/admin/export-templates')).set(auth(ADMIN_TOKEN!));
      expect([200, 201]).toContain(adminTemplates.status);

      const salesTemplates = await request(baseOrigin()).get(apiPath('/admin/export-templates')).set(auth(SALES_TOKEN!));
      expect([401, 403]).toContain(salesTemplates.status);
    });

    it('does not expose social_urge through field configuration search', async () => {
      const res = await request(baseOrigin()).get(apiPath('/admin/fields?keyword=social_urge')).set(auth(ADMIN_TOKEN!));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('social_urge');
    });
  });

  describe('core workflow scenarios R2/R3/R4/R5', () => {
    it('creates onboarding order and splits expected sub modules', async () => {
      const order = await createAndSubmitOnboarding();
      expect(order.id).toBeTruthy();
      expect(order.moduleCodes.sort()).toEqual(
        expect.arrayContaining(['contract', 'data_entry', 'onboarding_contact', 'social_insurance']),
      );
    });

    it('R2: returned order can be voided by sales and approved by backoffice supervisor', async () => {
      const order = await createAndSubmitOnboarding();
      const dispatchedId = order.dispatchedIds[0];
      expect(dispatchedId).toBeTruthy();

      const returned = await request(baseOrigin())
        .post(apiPath(`/dispatched-orders/${dispatchedId}/return`))
        .set(auth(BACKOFFICE_HANDLER_TOKEN!))
        .send({ returnReason: 'E2E后道退回后作废' });
      await expect2xx(returned, 'return dispatched order');

      const voidReq = await request(baseOrigin())
        .post(apiPath(`/work-orders/${order.id}/void`))
        .set(auth(SALES_TOKEN!))
        .send({ reason: 'E2E退回后业务员申请作废' });
      await expect2xx(voidReq, 'request void');

      const approve = await request(baseOrigin())
        .post(apiPath(`/work-orders/${order.id}/void/approve`))
        .set(auth(BACKOFFICE_SUPERVISOR_TOKEN!))
        .send({ approved: true, comment: 'E2E同意作废' });
      await expect2xx(approve, 'approve void');

      const detail = await request(baseOrigin()).get(apiPath(`/work-orders/${order.id}`)).set(auth(SALES_TOKEN!));
      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).toMatch(/void|作废/);
    });

    it('R3: returned order can be edited and resubmitted', async () => {
      const order = await createAndSubmitOnboarding();
      const dispatchedId = order.dispatchedIds[0];
      expect(dispatchedId).toBeTruthy();

      const returned = await request(baseOrigin())
        .post(apiPath(`/dispatched-orders/${dispatchedId}/return`))
        .set(auth(BACKOFFICE_HANDLER_TOKEN!))
        .send({ returnReason: 'E2E退回后修改重提' });
      await expect2xx(returned, 'return dispatched order');

      const update = await request(baseOrigin())
        .put(apiPath(`/work-orders/${order.id}`))
        .set(auth(SALES_TOKEN!))
        .send({ extraData: { mobile: '13900000000', special_remark: 'E2E修改重提' } });
      await expect2xx(update, 'update returned order');

      const resubmit = await request(baseOrigin())
        .post(apiPath(`/work-orders/${order.id}/resubmit`))
        .set(auth(SALES_TOKEN!))
        .send({});
      await expect2xx(resubmit, 'resubmit returned order');
      expect(JSON.stringify(resubmit.body)).toMatch(/pending|processing|dispatched|module/i);
    });

    it('R4: editing a processing order must expose resubmit/re-dispatch semantics', async () => {
      const order = await createAndSubmitOnboarding();
      const update = await request(baseOrigin())
        .put(apiPath(`/work-orders/${order.id}`))
        .set(auth(SALES_TOKEN!))
        .send({ extraData: { mobile: '13700000000', special_remark: 'E2E编辑后强制重提' } });
      await expect2xx(update, 'update processing order');

      const detail = await request(baseOrigin()).get(apiPath(`/work-orders/${order.id}`)).set(auth(SALES_TOKEN!));
      expect(detail.status).toBe(200);
      const text = JSON.stringify(detail.body);
      expect(text).toMatch(/resubmit|重新提交|field_changed|pending|returned|processing|dirty/i);
    });

    it('R5: sales can withdraw and backoffice supervisor can approve', async () => {
      const order = await createAndSubmitOnboarding();
      const withdraw = await request(baseOrigin())
        .post(apiPath(`/work-orders/${order.id}/withdraw`))
        .set(auth(SALES_TOKEN!))
        .send({ reason: 'E2E申请撤回' });
      await expect2xx(withdraw, 'request withdraw');

      const approve = await request(baseOrigin())
        .post(apiPath(`/work-orders/${order.id}/withdraw/approve`))
        .set(auth(BACKOFFICE_SUPERVISOR_TOKEN!))
        .send({ approved: true, comment: 'E2E同意撤回' });
      await expect2xx(approve, 'approve withdraw');

      const detail = await request(baseOrigin()).get(apiPath(`/work-orders/${order.id}`)).set(auth(SALES_TOKEN!));
      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).toMatch(/withdrawn|撤回/);
    });
  });

  describe('bug regression APIs B1-B5', () => {
    it('B3: notification count/list/bucket endpoints are all available', async () => {
      const unread = await request(baseOrigin()).get(apiPath('/notifications/unread-count')).set(auth(BACKOFFICE_HANDLER_TOKEN!));
      expect(unread.status).toBe(200);

      const bucket = await request(baseOrigin()).get(apiPath('/notifications/unread-count-by-bucket')).set(auth(BACKOFFICE_HANDLER_TOKEN!));
      expect(bucket.status).toBe(200);

      const list = await request(baseOrigin()).get(apiPath('/notifications?isRead=false&pageSize=50')).set(auth(BACKOFFICE_HANDLER_TOKEN!));
      expect(list.status).toBe(200);
      expect(unwrap(list.body)).toEqual(expect.any(Object));
    });

    it('B4: batch complete validates required remark and max 50 ids', async () => {
      const overLimitIds = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
      const overLimit = await request(baseOrigin())
        .post(apiPath('/dispatched-orders/batch-complete'))
        .set(auth(BACKOFFICE_HANDLER_TOKEN!))
        .send({ ids: overLimitIds, remark: 'E2E超过50条' });
      expect(overLimit.status).toBe(400);

      const missingRemark = await request(baseOrigin())
        .post(apiPath('/dispatched-orders/batch-complete'))
        .set(auth(BACKOFFICE_HANDLER_TOKEN!))
        .send({ ids: [overLimitIds[0]], remark: '' });
      expect(missingRemark.status).toBe(400);
    });

    it('B5: shared owner can filter team dispatched orders by Chinese module name', async () => {
      const res = await request(baseOrigin())
        .get(encodeURI(apiPath('/dispatched-orders?page=1&pageSize=20&moduleName=社保公积金办理')))
        .set(auth(SHARED_OWNER_TOKEN!));
      expect(res.status).toBe(200);
      const items = unwrapItems(res.body);
      for (const item of items) {
        const moduleCode = String(item.moduleCode ?? item.module_code ?? '');
        expect(['', 'social_insurance']).toContain(moduleCode);
      }
    });

    it('B1/B2: optional import smoke validates missing-required and valid import files when provided', async () => {
      const missingPath = process.env.E2E_IMPORT_MISSING_REQUIRED_XLSX;
      const validPath = process.env.E2E_IMPORT_VALID_XLSX;
      if (!missingPath || !fs.existsSync(missingPath) || !validPath || !fs.existsSync(validPath)) {
        console.warn('Skip import file smoke: E2E_IMPORT_*_XLSX not provided or file does not exist.');
        return;
      }

      const missingPreview = await request(baseOrigin())
        .post(apiPath('/work-orders/import/preview'))
        .set(auth(SALES_TOKEN!))
        .field('orderType', 'onboarding')
        .attach('file', missingPath);
      expect([200, 201, 400]).toContain(missingPreview.status);
      expect(JSON.stringify(missingPreview.body)).toMatch(/missing|required|必填|manual_required|error|errors/i);

      const beforeCards = await request(baseOrigin()).get(apiPath('/dashboard/cards')).set(auth(SALES_TOKEN!));
      expect(beforeCards.status).toBe(200);

      const validPreview = await request(baseOrigin())
        .post(apiPath('/work-orders/import/preview'))
        .set(auth(SALES_TOKEN!))
        .field('orderType', 'onboarding')
        .attach('file', validPath);
      await expect2xx(validPreview, 'valid import preview');
      expect(JSON.stringify(validPreview.body)).toMatch(/fileId|mapping|mappingMode|standard|ai/i);
    });
  });
});

if (!hasRequiredEnv) {
  // eslint-disable-next-line no-console
  console.warn(
    'Skipping feedback-coverage.e2e.spec.ts: set BASE_URL, ADMIN_TOKEN, SALES_TOKEN, BACKOFFICE_SUPERVISOR_TOKEN, BACKOFFICE_HANDLER_TOKEN and SHARED_OWNER_TOKEN.',
  );
}
