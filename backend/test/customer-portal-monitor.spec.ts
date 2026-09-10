import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import request = require('supertest');
import { DataSource, InsertEvent } from 'typeorm';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalMonitorController, PortalMonitorCollectionController } from 'src/modules/customer-portal-monitor/customer-portal-monitor.controller';
import { PortalMonitorConnectorGuard } from 'src/modules/customer-portal-monitor/portal-monitor-auth';
import { CustomerPortalMonitorService } from 'src/modules/customer-portal-monitor/customer-portal-monitor.service';
import { PortalMonitorInterceptor } from 'src/modules/customer-portal-monitor/portal-monitor.interceptor';
import { portalMonitorContext } from 'src/modules/customer-portal-monitor/portal-monitor-context';
import { PortalMonitorSubscriber } from 'src/modules/customer-portal-monitor/portal-monitor.subscriber';
import { CollectPortalMonitorDto } from 'src/modules/customer-portal-monitor/customer-portal-monitor.dto';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

const TRACE = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const SUBMISSION = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'monitor-unit-secret-with-at-least-32-characters';
const admin = { sub: 'admin', username: 'admin', roles: ['admin'] } as JwtUserPayload;
const member = { sub: 'biz', username: 'biz', roles: ['biz_member'] } as JwtUserPayload;
const event = (): CollectPortalMonitorDto => ({ journalId: TRACE, connectorConnected: true, events: [{
  id: SUBMISSION, sequence: 1, traceId: TRACE, requestKey: 'a'.repeat(64), action: 'salary.submit',
  stage: 'gateway_received', businessType: 'salary', at: new Date().toISOString(), failureCode: null,
}] });

describe('Portal monitor authorization and metadata boundary', () => {
  let app: INestApplication; let query: jest.Mock; let collect: jest.SpyInstance;
  const previousToken = process.env.CONNECTOR_TOKEN;
  beforeEach(async () => {
    process.env.CONNECTOR_TOKEN = TOKEN;
    query = jest.fn().mockResolvedValue([]);
    const service = new CustomerPortalMonitorService({ query, transaction: async (fn: (manager: unknown) => unknown) => fn({ query }) } as unknown as DataSource);
    collect = jest.spyOn(service, 'collect');
    const module = await Test.createTestingModule({ controllers: [CustomerPortalMonitorController, PortalMonitorCollectionController],
      providers: [{ provide: CustomerPortalMonitorService, useValue: service }, PortalMonitorConnectorGuard] }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => { req.user = req.headers['x-test-user'] === 'admin' ? admin : member; next(); });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalGuards(new RolesGuard(new Reflector(), {} as never));
    await app.init();
  });
  afterEach(async () => { await app.close(); if (previousToken === undefined) delete process.env.CONNECTOR_TOKEN; else process.env.CONNECTOR_TOKEN = previousToken; });

  it('rejects every monitoring read for ordinary staff, including a valid connector token', async () => {
    for (const path of ['summary', 'requests', `requests/${TRACE}`]) {
      await request(app.getHttpServer()).get('/customer-portal-monitor/' + path).set('X-Connector-Token', TOKEN).expect(403);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it('requires the connector secret for collection even when an administrator is logged in', async () => {
    await request(app.getHttpServer()).post('/customer-portal-monitor/collect').set('X-Test-User', 'admin').send(event()).expect(401);
    await request(app.getHttpServer()).post('/customer-portal-monitor/collect').set('X-Connector-Token', 'wrong').send(event()).expect(401);
    expect(collect).not.toHaveBeenCalled();
  });
  it('rejects payloads containing passwords, arbitrary error text, or invalid pagination', async () => {
    const body = event();
    await request(app.getHttpServer()).post('/customer-portal-monitor/collect').set('X-Connector-Token', TOKEN)
      .send({ ...body, events: [{ ...body.events[0], password: 'do-not-store', failureCode: 'contains-private-data' }] }).expect(400);
    await request(app.getHttpServer()).get('/customer-portal-monitor/requests?pageSize=1000').set('X-Test-User', 'admin').expect(400);
    await request(app.getHttpServer()).get('/customer-portal-monitor/requests?status=healthy').set('X-Test-User', 'admin').expect(400);
    expect(collect).not.toHaveBeenCalled();
  });
  it('accepts only metadata with the authenticated connector and reports no heartbeat as disconnected', async () => {
    await request(app.getHttpServer()).post('/customer-portal-monitor/collect').set('X-Connector-Token', TOKEN).send(event()).expect(201);
    const response = await request(app.getHttpServer()).get('/customer-portal-monitor/summary').set('X-Test-User', 'admin').expect(200);
    expect(response.body.connection).toMatchObject({ status: 'disconnected', label: '监控未连接', lastHeartbeatAt: null });
  });
});

describe('Portal monitor persistence and truthful lifecycle', () => {
  it('records completed submissions inside the real API response envelope',async()=>{
    const query=jest.fn().mockResolvedValue([{id:SUBMISSION}]);
    const service=new CustomerPortalMonitorService({query} as unknown as DataSource);
    await service.backendResult(TRACE,CUSTOMER,{code:0,data:{list:[{id:SUBMISSION,status:'completed'}]},message:'ok',traceId:'request'},'portal.progress');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE customer_portal_monitor_requests'),[TRACE,true,'[]',JSON.stringify([SUBMISSION])]);
  });
  afterEach(() => { jest.useRealTimers(); });
  it('uses a single transaction and skips duplicate event updates after lost acknowledgements', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn(async (fn) => fn({ query }));
    const service = new CustomerPortalMonitorService({ transaction } as unknown as DataSource);
    await service.collect(event());
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('ON CONFLICT DO NOTHING RETURNING id'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO customer_portal_monitor_requests'))).toBe(false);
  });
  it('keeps unconfigured and stale monitoring disconnected even when old successful events exist', async () => {
    const prior = process.env.CONNECTOR_TOKEN;
    try {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T08:00:00Z'));
      const query = jest.fn(async (sql: string) => sql.includes('connections') ? [{ last_heartbeat_at: new Date('2026-09-10T07:00:00Z'), connector_connected: true }] : [{ status: 'returned', count: 3 }]);
      const service = new CustomerPortalMonitorService({ query } as unknown as DataSource);
      delete process.env.CONNECTOR_TOKEN;
      expect((await service.summary(admin)).connection.status).toBe('unconfigured');
      process.env.CONNECTOR_TOKEN = TOKEN;
      expect((await service.summary(admin)).connection.status).toBe('disconnected');
      query.mockImplementation(async (sql: string) => sql.includes('connections') ? [{ last_heartbeat_at: new Date(), connector_connected: true }] : []);
      expect((await service.summary(admin)).connection.status).toBe('connected');
    } finally { if (prior === undefined) delete process.env.CONNECTOR_TOKEN; else process.env.CONNECTOR_TOKEN = prior; }
  });
  it('checks administrator access inside the service before any data is fetched', async () => {
    const query = jest.fn(); const service = new CustomerPortalMonitorService({ query } as unknown as DataSource);
    await expect(service.list({ page: 1, pageSize: 20 }, member)).rejects.toThrow(ForbiddenException);
    await expect(service.detail(TRACE, member)).rejects.toThrow(ForbiddenException);
    await expect(service.summary(member)).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
  it('paginates after lifecycle filters and returns no customer secrets or internal account IDs', async () => {
    const query = jest.fn(async (sql: string, _values?: unknown[]) => sql.includes('AS total') ? [{ total: 31 }] : [{ id: TRACE, status: 'processing', request_key: 'a'.repeat(64), customer_id: CUSTOMER, account_id: ACCOUNT, submission_count: 1, completed_count: 0, returned_count: 0 }]);
    const service = new CustomerPortalMonitorService({ query } as unknown as DataSource);
    const result = await service.list({ page: 2, pageSize: 10, status: 'processing', businessType: 'salary' }, admin);
    expect(result.total).toBe(31); expect(result.page).toBe(2);
    expect(query.mock.calls[0][1]).toEqual(['processing', 'salary', 10, 10]);
    expect(result.list[0]).not.toHaveProperty('account_id'); expect(result.list[0]).not.toHaveProperty('customer_id');
  });
  it('ties accepted submissions to committed rows and validates returned IDs within the authenticated customer', async () => {
    const query = jest.fn().mockResolvedValue([{ id: SUBMISSION }]);
    const service = new CustomerPortalMonitorService({ query } as unknown as DataSource);
    await service.backendResult(TRACE, CUSTOMER, { list: [{ id: SUBMISSION, status: 'completed', subject: '私密员工', result: 'private-result' }] }, 'portal.progress');
    expect(query.mock.calls[0][1]).toEqual([CUSTOMER, [SUBMISSION]]);
    const lastValues = query.mock.calls.at(-1)[1];
    expect(lastValues).toEqual([TRACE, true, '[]', JSON.stringify([SUBMISSION])]);
    expect(JSON.stringify(query.mock.calls)).not.toContain('私密员工');
    expect(JSON.stringify(query.mock.calls)).not.toContain('private-result');
  });
});

describe('Atomic submission tracing and backend evidence', () => {
  it('links only the authenticated customer/account and keeps concurrent requests isolated', async () => {
    const subscriber = new PortalMonitorSubscriber({ subscribers: [] } as unknown as DataSource);
    const capture = async (traceId: string, customerId: string, accountId: string) => portalMonitorContext.run({ traceId, customerId, accountId }, async () => {
      await Promise.resolve();
      const entity = { customerId, accountId } as CustomerPortalSubmission;
      subscriber.beforeInsert({ entity } as InsertEvent<CustomerPortalSubmission>);
      return entity;
    });
    const [left, right] = await Promise.all([capture(TRACE, CUSTOMER, ACCOUNT), capture(SUBMISSION, CUSTOMER, ACCOUNT)]);
    expect(left.monitorTraceId).toBe(TRACE); expect(right.monitorTraceId).toBe(SUBMISSION);
    portalMonitorContext.run({ traceId: TRACE, customerId: CUSTOMER, accountId: ACCOUNT }, () => {
      const entity = { customerId: 'different-customer', accountId: ACCOUNT } as CustomerPortalSubmission;
      subscriber.beforeInsert({ entity } as InsertEvent<CustomerPortalSubmission>);
      expect(entity.monitorTraceId).toBeUndefined();
    });
  });
  it('records a real backend failure without persisting the exception or a successful receipt', async () => {
    const previous = process.env.CONNECTOR_TOKEN; process.env.CONNECTOR_TOKEN = TOKEN;
    try {
      const monitor = { backendStart: jest.fn(), backendIdentity: jest.fn(), backendFailure: jest.fn(), backendResult: jest.fn() };
      const auth = { session: jest.fn().mockResolvedValue({ customer: { id: CUSTOMER }, account: { id: ACCOUNT } }) };
      const interceptor = new PortalMonitorInterceptor(monitor as never, auth as never);
      const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', path: '/api/customer-portal/submit', headers: { 'x-portal-trace-id': TRACE, 'x-connector-token': TOKEN }, body: { requestId: 'req-1', businessType: 'salary', linkToken: 'private-session' } }) }) };
      const observable = await interceptor.intercept(context as never, { handle: () => throwError(() => new Error('sensitive exception')) });
      await expect(firstValueFrom(observable)).rejects.toThrow('sensitive exception');
      expect(monitor.backendFailure).toHaveBeenCalledWith(TRACE);
      expect(monitor.backendResult).not.toHaveBeenCalled();
      expect(JSON.stringify(monitor.backendStart.mock.calls)).not.toContain('private-session');
    } finally { if (previous === undefined) delete process.env.CONNECTOR_TOKEN; else process.env.CONNECTOR_TOKEN = previous; }
  });
  it('does not trust caller-invented trace headers without connector authentication', async () => {
    const monitor = { backendStart: jest.fn() };
    const interceptor = new PortalMonitorInterceptor(monitor as never, {} as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', path: '/api/customer-portal/submit', headers: { 'x-portal-trace-id': TRACE }, body: {} }) }) };
    expect(await firstValueFrom(await interceptor.intercept(context as never, { handle: () => of('ok') }))).toBe('ok');
    expect(monitor.backendStart).not.toHaveBeenCalled();
  });
});
