import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { BusinessScope } from 'src/entities';
import { CustomerRulesController } from 'src/modules/customer-rules/customer-rules.controller';
import { CustomerRulesService } from 'src/modules/customer-rules/customer-rules.service';
import { PortalRuleApplicationService } from 'src/modules/customer-rules/portal-rule-application.service';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('CustomerRulesController HTTP validation', () => {
  let app: INestApplication;
  let save: jest.Mock;

  beforeEach(async () => {
    save = jest.fn(async (value) => ({ id: 'rule-id', ...value }));
    let requestedId = '';
    let requestedScope = BusinessScope.BEILUN;
    const qb: any = {
      where: jest.fn((_sql, params) => { requestedId = params?.customerId; return qb; }),
      andWhere: jest.fn((_sql, params) => { requestedScope = params?.businessScope; return qb; }),
      getOne: jest.fn(async () => requestedId === CUSTOMER_ID && requestedScope === BusinessScope.BEILUN ? {
        id: CUSTOMER_ID, customerCode: 'CODE', customerName: '真实接口客户', isActive: true, businessScope: BusinessScope.BEILUN,
      } : null),
    };
    const service = new CustomerRulesService({ findOne: jest.fn(async () => null), create: (value: unknown) => value, save } as any,
      { createQueryBuilder: () => qb } as any, {} as any, {
        find: jest.fn(async () => [{ id: BRANCH_ID, branchCode: 'B01', branchName: '宁波商社', city: '宁波' }]),
        findOne: jest.fn(async ({ where }) => where.id === BRANCH_ID && where.customerId === CUSTOMER_ID && where.businessScope === BusinessScope.BEILUN && where.isActive
          ? { id: BRANCH_ID } : null),
      } as any);
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerRulesController],
      providers: [
        { provide: CustomerRulesService, useValue: service },
        { provide: PortalRuleApplicationService, useValue: { syncPending: jest.fn() } },
        { provide: DataSource, useValue: { getRepository: () => ({ create: (value: unknown) => value, save: async (value: unknown) => value }) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => { req.user = { sub: 'user-1', username: 'tester', roles: ['admin'] }; next(); });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it('keeps per-row validation behind the batch endpoint and returns physical row details', async () => {
    const response = await request(app.getHttpServer()).post('/customer-rules/batch').send({ rows: [
      { customerId: 'not-a-uuid', rule: { salaryRules: { billingDay: 20 } }, rowNumber: 6 },
      { customerId: CUSTOMER_ID, rule: { onboardingDefaults: { employee_type: '正式员工', need_esign: false }, salaryRules: { billingDay: 20 } }, rowNumber: 10 },
      { customerId: '22222222-2222-4222-8222-222222222222', rule: { completionEmailTo: ['bad-email'] }, rowNumber: 14 },
    ] }).expect(201);
    expect(response.body).toMatchObject({ total: 3, successCount: 1, failedCount: 2 });
    expect(response.body.results[1]).toMatchObject({ customerId: CUSTOMER_ID, rowNumber: 10, success: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ onboardingDefaults: { employee_type: '正式员工', need_esign: false }, salaryRules: { billingDay: 20, reminderWorkdayOffsets: [3, 2, 1] } });
  });

  it('preserves false booleans through HTTP and rejects string false without coercion', async () => {
    const response = await request(app.getHttpServer()).put('/customer-rules/' + CUSTOMER_ID)
      .send({ isActive: false, completionEmailEnabled: false }).expect(200);
    expect(response.body).toMatchObject({ isActive: false, completionEmailEnabled: false });
    await request(app.getHttpServer()).put('/customer-rules/' + CUSTOMER_ID)
      .send({ isActive: 'false', completionEmailEnabled: 'false' }).expect(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects forged fixed reminders, unknown rule keys and malformed row structures with row errors', async () => {
    const response = await request(app.getHttpServer()).post('/customer-rules/batch').send({ rows: [
      { customerId: CUSTOMER_ID, rule: { salaryRules: { reminderWorkdayOffsets: [5, 3, 1] } } },
      null,
      { customerId: '22222222-2222-4222-8222-222222222222', rule: { injectedKey: 'bad' } },
    ] }).expect(201);
    expect(response.body).toMatchObject({ successCount: 0, failedCount: 3 });
    expect(save).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/customer-rules/batch').send({ rows: 'wrong-shape' }).expect(400);
    await request(app.getHttpServer()).post('/customer-rules/batch').send({ rows: [], unknown: true }).expect(400);
  });

  it('provides the customer branch options under the existing business-role boundary', async () => {
    const response = await request(app.getHttpServer()).get(`/customer-rules/${CUSTOMER_ID}/location-options`).expect(200);
    expect(response.body).toEqual([{ id: BRANCH_ID, branchCode: 'B01', branchName: '宁波商社', city: '宁波' }]);
    const roles = Reflect.getMetadata(ROLES_KEY, CustomerRulesController) as string[];
    expect(roles).toEqual(expect.arrayContaining(['admin', 'business_group_member']));
    expect(roles).not.toContain('social_insurance_specialist');
    await request(app.getHttpServer()).get('/customer-rules/not-a-uuid/location-options').expect(400);
  });

  it('preserves location rules through DTO validation and rejects malformed nested entries', async () => {
    const location = { socialLocation: ' 宁波 ', branchId: BRANCH_ID, onboardingDefaults: { employee_type: '正式员工', need_payroll_slip: '否' }, resignationDefaults: { need_resignation_cert: '否' } };
    const response = await request(app.getHttpServer()).put(`/customer-rules/${CUSTOMER_ID}`)
      .send({ paymentLocationRules: [location], salaryRules: { payrollMonthMode: 'previous' } }).expect(200);
    expect(response.body).toMatchObject({ paymentLocationRules: [{ ...location, socialLocation: '宁波' }], salaryRules: { payrollMonthMode: 'previous' } });
    for (const paymentLocationRules of [null, {}, [null], [{ ...location, customerCode: 'SPOOF' }]]) {
      await request(app.getHttpServer()).put(`/customer-rules/${CUSTOMER_ID}`).send({ paymentLocationRules }).expect(400);
    }
    expect(save).toHaveBeenCalledTimes(1);
  });
});
