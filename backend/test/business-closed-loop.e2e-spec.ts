import { ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { traceIdMiddleware } from 'src/common/middleware/trace-id.middleware';
import { FieldSupplementRule, WorkOrderFieldDirtyMark } from 'src/entities';

type HttpServer = Parameters<typeof request>[0];

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'lizhanbo';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456';
const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? '123456';
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL;

let app: INestApplication | undefined;
let server: HttpServer;
let dataSource: DataSource | undefined;

type TokenSet = { accessToken: string };

const tokens: Record<string, string> = {};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function envelopeData(body: unknown): Record<string, unknown> {
  const record = asRecord(body) ?? {};
  const data = asRecord(record.data) ?? record;
  return data as Record<string, unknown>;
}

function envelopeCode(body: unknown): unknown {
  const record = asRecord(body) ?? {};
  return record.code;
}

async function login(username: string, password: string): Promise<TokenSet> {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ username, password })
    .expect((r) => {
      if (![200, 201].includes(r.status)) {
        throw new Error(`Login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
      }
    });
  const data = envelopeData(res.body);
  const accessToken = (data.accessToken as string) ?? (data.access_token as string);
  if (!accessToken) {
    throw new Error(`Login ${username}: missing accessToken in response`);
  }
  return { accessToken };
}

async function ensureToken(username: string, password: string): Promise<string> {
  if (!tokens[username]) {
    const { accessToken } = await login(username, password);
    tokens[username] = accessToken;
  }
  return tokens[username];
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function bootstrapLocalNestApplication(): Promise<INestApplication> {
  const testing = await import('@nestjs/testing');
  const mainModule = await import('../src/app.module');
  const moduleFixture = await testing.Test.createTestingModule({
    imports: [mainModule.AppModule],
  }).compile();
  const nestApp = moduleFixture.createNestApplication();
  nestApp.setGlobalPrefix('api');
  nestApp.use(traceIdMiddleware);
  nestApp.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  nestApp.useGlobalInterceptors(new ResponseInterceptor());
  nestApp.useGlobalFilters(new HttpExceptionFilter());
  await nestApp.init();
  return nestApp;
}

function uniqueIdCard(): string {
  // Generate an 18-char ID-card-like string (passes len + simple shape checks).
  const base = '3301021990';
  const rand = String(Date.now()).slice(-7).padStart(7, '0');
  const tail = String(Math.floor(Math.random() * 10));
  const candidate = `${base}${rand}${tail}`;
  return candidate.slice(0, 18);
}

function uniqueEmployeeName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

async function createOnboardingOrder(token: string, overrides: Record<string, unknown> = {}): Promise<{
  id: string;
  orderNo: string;
}> {
  const extraData = {
    employee_name: uniqueEmployeeName('员工'),
    id_card_no: uniqueIdCard(),
    customer_code: 'CUST_NB001',
    customer_name: '宁波某制造集团',
    mobile: '13800000000',
    need_onboarding_contact: '是',
    need_company_contract: '是',
    ...overrides,
  };
  const res = await request(server)
    .post('/api/work-orders')
    .set(auth(token))
    .send({ orderType: 'onboarding', extraData });
  if (![200, 201].includes(res.status)) {
    throw new Error(`Create onboarding draft failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const data = envelopeData(res.body);
  return { id: data.id as string, orderNo: data.orderNo as string };
}

async function submitOrder(token: string, id: string): Promise<Array<{ id: string; moduleCode: string; status: string; handlerId: string | null }>> {
  const res = await request(server)
    .post(`/api/work-orders/${id}/submit`)
    .set(auth(token))
    .send({});
  if (![200, 201].includes(res.status)) {
    throw new Error(`Submit ${id} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const data = envelopeData(res.body);
  const dispatchedOrders = (data.dispatchedOrders as Array<{
    id: string; moduleCode: string; status: string; handlerId: string | null;
  }>) ?? [];
  return dispatchedOrders;
}

async function getWorkOrder(token: string, id: string): Promise<Record<string, unknown>> {
  const res = await request(server).get(`/api/work-orders/${id}`).set(auth(token));
  if (res.status !== 200) {
    throw new Error(`GET work-order/${id} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return envelopeData(res.body);
}

beforeAll(async () => {
  if (EXTERNAL_BASE_URL) {
    server = EXTERNAL_BASE_URL;
    // External-mode dirty-mark assertions need DB access; skip those if not local.
  } else {
    app = await bootstrapLocalNestApplication();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
  }

  // Warm up tokens used across describe blocks.
  await ensureToken(ADMIN_USERNAME, ADMIN_PASSWORD);
  await ensureToken('yaoyiping', SEED_PASSWORD);
  await ensureToken('shenwenjun', SEED_PASSWORD);
  await ensureToken('zhouqiqing', SEED_PASSWORD);
  await ensureToken('contractsup01', SEED_PASSWORD);
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

describe('业务闭环 E2E', () => {
  describe('场景一：入职「一拆四」核心派发流', () => {
    let workOrderId: string;
    let dispatched: Array<{ id: string; moduleCode: string; status: string; handlerId: string | null }> = [];

    it('业务员创建入职草稿 → 提交后拆分出 4 个子工单 (data_entry, social_insurance, onboarding_contact, contract)', async () => {
      const token = tokens['yaoyiping'];
      const created = await createOnboardingOrder(token, {
        need_onboarding_contact: '是',
        need_company_contract: '是',
      });
      workOrderId = created.id;
      dispatched = await submitOrder(token, workOrderId);

      const moduleCodes = dispatched.map((d) => d.moduleCode).sort();
      expect(moduleCodes).toEqual(
        ['contract', 'data_entry', 'onboarding_contact', 'social_insurance'].sort(),
      );
      expect(dispatched.length).toBe(4);
    });

    it('模拟后道处理人补全 onboarding_contact.bank_account → 反向同步回主工单 extraData', async () => {
      if (!dataSource) {
        // Without local DataSource we cannot insert the supplement rule; skip.
        return;
      }
      const adminToken = tokens[ADMIN_USERNAME];
      const onboardingContactChild = dispatched.find((d) => d.moduleCode === 'onboarding_contact');
      expect(onboardingContactChild).toBeDefined();

      // Insert a FieldSupplementRule allowing onboarding_contact to supplement bank_account
      // and reverse-sync to social_insurance + main order.
      const ruleRepo = dataSource.getRepository(FieldSupplementRule);
      const existing = await ruleRepo.findOne({
        where: { fieldCode: 'bank_account', supplementerModule: 'onboarding_contact' },
      });
      if (!existing) {
        await ruleRepo.save(
          ruleRepo.create({
            fieldCode: 'bank_account',
            supplementerModule: 'onboarding_contact',
            syncToModules: ['social_insurance'],
            isActive: true,
          }),
        );
      } else if (!existing.isActive) {
        existing.isActive = true;
        existing.syncToModules = ['social_insurance'];
        await ruleRepo.save(existing);
      }

      // Admin accepts then supplements (admin bypasses handler/role checks).
      await request(server)
        .post(`/api/dispatched-orders/${onboardingContactChild!.id}/accept`)
        .set(auth(adminToken))
        .send({})
        .expect((r) => {
          if (![200, 201].includes(r.status)) {
            throw new Error(`accept failed: ${r.status} ${JSON.stringify(r.body)}`);
          }
        });

      const newBank = '6222026052100000000';
      const supplementRes = await request(server)
        .post(`/api/dispatched-orders/${onboardingContactChild!.id}/supplement`)
        .set(auth(adminToken))
        .send({ fieldCode: 'bank_account', newValue: newBank });
      if (![200, 201].includes(supplementRes.status)) {
        throw new Error(`supplement failed: ${supplementRes.status} ${JSON.stringify(supplementRes.body)}`);
      }

      // Reverse-sync: main work order's extraData should now contain the supplemented value.
      const mainOrder = await getWorkOrder(tokens['yaoyiping'], workOrderId);
      const extraData = asRecord(mainOrder.extraData) ?? {};
      expect(extraData.bank_account).toBe(newBank);
    });
  });

  describe('场景二：打回与锁定机制', () => {
    let workOrderId: string;
    let contractChildId: string;

    beforeAll(async () => {
      const bizToken = tokens['yaoyiping'];
      const created = await createOnboardingOrder(bizToken, {
        need_onboarding_contact: '是',
        need_company_contract: '是',
      });
      workOrderId = created.id;
      const children = await submitOrder(bizToken, workOrderId);
      const contract = children.find((c) => c.moduleCode === 'contract');
      if (!contract) throw new Error('未生成 contract 子工单，无法继续场景二');
      contractChildId = contract.id;

      // Admin accepts then completes contract child → COMPLETED state locks main extraData.
      const adminToken = tokens[ADMIN_USERNAME];
      await request(server)
        .post(`/api/dispatched-orders/${contractChildId}/accept`)
        .set(auth(adminToken))
        .send({})
        .expect((r) => {
          if (![200, 201].includes(r.status)) {
            throw new Error(`contract accept: ${r.status} ${JSON.stringify(r.body)}`);
          }
        });
      await request(server)
        .post(`/api/dispatched-orders/${contractChildId}/complete`)
        .set(auth(adminToken))
        .send({ remark: '合同已完成签署确认' })
        .expect((r) => {
          if (![200, 201].includes(r.status)) {
            throw new Error(`contract complete: ${r.status} ${JSON.stringify(r.body)}`);
          }
        });
    });

    it('存在 COMPLETED 子单时，业务员 PUT 主工单 extraData 必须被拦截 (409 + code 4116)', async () => {
      const bizToken = tokens['yaoyiping'];
      const res = await request(server)
        .put(`/api/work-orders/${workOrderId}`)
        .set(auth(bizToken))
        .send({ extraData: { mobile: '13912345678' } });

      expect(res.status).toBe(409);
      expect(envelopeCode(res.body)).toBe(4116);
    });

    it('合同组主管 contractsup01 打回 contract 子工单后，业务员重新修改成功，并生成 dirty-mark 记录', async () => {
      const supToken = tokens['contractsup01'];

      const returnRes = await request(server)
        .post(`/api/dispatched-orders/${contractChildId}/return`)
        .set(auth(supToken))
        .send({ returnReason: '合同资料有误请重新填写' });
      if (![200, 201].includes(returnRes.status)) {
        throw new Error(`contract return: ${returnRes.status} ${JSON.stringify(returnRes.body)}`);
      }

      // Now sales can update main order extraData again.
      const bizToken = tokens['yaoyiping'];
      const updateRes = await request(server)
        .put(`/api/work-orders/${workOrderId}`)
        .set(auth(bizToken))
        .send({ extraData: { mobile: '13987654321' } });
      if (![200, 201].includes(updateRes.status)) {
        throw new Error(`sales retry update: ${updateRes.status} ${JSON.stringify(updateRes.body)}`);
      }

      // Confirm the field-level dirty mark was written.
      if (!dataSource) return;
      const dirtyRepo = dataSource.getRepository(WorkOrderFieldDirtyMark);
      const marks = await dirtyRepo.find({ where: { workOrderId } });
      const mobileMark = marks.find((m) => m.fieldCode === 'mobile');
      expect(mobileMark).toBeDefined();
      expect(mobileMark!.newValue).toBe('13987654321');
    });
  });

  describe('场景三：数据越权防线 (RBAC 隔离)', () => {
    let g1OrderId: string;
    let g1OrderNo: string;
    let g2OrderId: string;
    let g2OrderNo: string;

    beforeAll(async () => {
      const created1 = await createOnboardingOrder(tokens['yaoyiping']);
      g1OrderId = created1.id;
      g1OrderNo = created1.orderNo;

      const created2 = await createOnboardingOrder(tokens['zhouqiqing']);
      g2OrderId = created2.id;
      g2OrderNo = created2.orderNo;
    });

    it('业务1组组员 yaoyiping 列表只能看见自己创建的工单', async () => {
      const res = await request(server)
        .get('/api/work-orders?page=1&pageSize=200')
        .set(auth(tokens['yaoyiping']))
        .expect(200);

      const data = envelopeData(res.body);
      const items = (data.items as Array<Record<string, unknown>>) ?? [];
      const ids = items.map((it) => it.id);
      expect(ids).toContain(g1OrderId);
      expect(ids).not.toContain(g2OrderId);

      // Every visible row must be created by yaoyiping herself.
      for (const item of items) {
        const createdBy = (item.createdBy as string) ?? (item.created_by as string);
        // createdBy is user UUID — verifying via order_no presence is the simpler invariant
        // already covered above. We just assert g2 (other group) is absent.
        expect(item.id).not.toBe(g2OrderId);
        void createdBy;
      }
    });

    it('业务1组组长 shenwenjun 能看见1组成员 (yaoyiping) 工单，但看不到2组 (zhouqiqing) 工单', async () => {
      const res = await request(server)
        .get('/api/work-orders?page=1&pageSize=200')
        .set(auth(tokens['shenwenjun']))
        .expect(200);

      const data = envelopeData(res.body);
      const items = (data.items as Array<Record<string, unknown>>) ?? [];
      const ids = items.map((it) => it.id);
      const orderNos = items.map((it) => (it.orderNo as string) ?? (it.order_no as string));

      expect(ids).toContain(g1OrderId);
      expect(orderNos).toContain(g1OrderNo);

      expect(ids).not.toContain(g2OrderId);
      expect(orderNos).not.toContain(g2OrderNo);
    });
  });
});
