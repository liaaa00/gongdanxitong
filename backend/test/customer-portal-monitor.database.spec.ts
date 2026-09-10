import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { CustomerPortalMonitorService } from 'src/modules/customer-portal-monitor/customer-portal-monitor.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

// Optional real PostgreSQL verification. Fixtures are SELECT-only CTEs inside a
// READ ONLY transaction: no migration, temporary table or business row is written.
const databaseDescribe = process.env.PORTAL_MONITOR_DB_TESTS === '1' ? describe : describe.skip;
databaseDescribe('Portal lifecycle calculations on real PostgreSQL (read only)', () => {
  let client: any;
  const customer = '22222222-2222-4222-8222-222222222222';
  const account = '33333333-3333-4333-8333-333333333333';
  const admin = { sub: 'admin', username: 'admin', roles: ['admin'] } as JwtUserPayload;
  const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
  const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
  const requestFields = `id uuid,request_key text,action text,business_type text,customer_id uuid,account_id uuid,
    gateway_received_at timestamptz,connector_received_at timestamptz,backend_received_at timestamptz,backend_responded_at timestamptz,
    portal_responded_at timestamptz,timed_out_at timestamptz,failed_at timestamptz,failure_code text,backend_succeeded boolean,
    submission_ids jsonb,returned_submission_ids jsonb`;
  beforeAll(async () => {
    const environment = require('dotenv').parse(readFileSync(resolve(process.cwd(), '.env')));
    const { Client } = require('pg');
    client = new Client({ host: environment.DB_HOST, port: Number(environment.DB_PORT), user: environment.DB_USERNAME,
      password: environment.DB_PASSWORD, database: environment.DB_DATABASE });
    await client.connect(); await client.query('BEGIN READ ONLY');
  });
  afterAll(async () => { if (client) { await client.query('ROLLBACK'); await client.end(); } });

  function service(fixture: unknown) {
    return new CustomerPortalMonitorService({ query: async (sql: string, parameters: unknown[]) => {
      const data = `$${parameters.length + 1}::jsonb`;
      const ctes = `WITH customer_portal_monitor_requests AS (SELECT * FROM jsonb_to_recordset(${data}->'requests') AS r(${requestFields})),
        customer_portal_submissions AS (SELECT * FROM jsonb_to_recordset(${data}->'submissions') AS s(id uuid,monitor_trace_id uuid,
          customer_id uuid,account_id uuid,request_no text,business_type text,work_order_id uuid,created_at timestamptz,updated_at timestamptz,status text,completed_at timestamptz)),
        work_orders AS (SELECT * FROM jsonb_to_recordset(${data}->'orders') AS w(id uuid,customer_id uuid,status text,completed_at timestamptz,updated_at timestamptz))`;
      // CTE fixtures have no physical primary key, so expand the equivalent GROUP BY.
      const groupedColumns = requestFields.split(',').map((field) => `r.${field.trim().split(' ')[0]}`).join(',');
      const fixtureSql = ctes + sql.replace(/^WITH/, ',').replace('GROUP BY r.id', `GROUP BY ${groupedColumns}`);
      return (await client.query(fixtureSql, [...parameters, JSON.stringify(fixture)])).rows;
    } } as unknown as DataSource);
  }

  it('distinguishes missing acceptance, committed business, completion, actual result return, and transport failures', async () => {
    const requests = Array.from({ length: 7 }, (_, index) => ({ id: uuid(index + 1), request_key: 'a'.repeat(64), action: 'salary.submit',
      business_type: 'salary', customer_id: customer, account_id: account, gateway_received_at: at(index === 0 ? 5 : 120),
      backend_received_at: at(110), backend_succeeded: true, submission_ids: [], returned_submission_ids: [],
      ...(index === 5 ? { timed_out_at: at(100), failure_code: 'CONNECTOR_TIMEOUT' } : {}),
      ...(index === 6 ? { failed_at: at(100), failure_code: 'BACKEND_REJECTED' } : {}) }));
    const submissions = [2, 3, 4, 5].map((index) => ({ id: uuid(index + 101), monitor_trace_id: uuid(index + 1), customer_id: customer,
      account_id: account, request_no: `SAL-${index}`, business_type: 'salary', work_order_id: null, created_at: at(105),
      status: [3, 4].includes(index) ? 'completed' : 'received', completed_at: [3, 4].includes(index) ? at(60) : null }));
    const progress = { id: uuid(200), action: 'portal.progress', customer_id: customer, account_id: account, backend_succeeded: true,
      backend_received_at: at(10), portal_responded_at: at(5), submission_ids: [], returned_submission_ids: [uuid(105)] };
    const result = await service({ requests: [...requests, progress], submissions, orders: [] }).list({ page: 1, pageSize: 20 }, admin);
    const statuses = Object.fromEntries(result.list.map((row) => [row.id, row.status]));
    expect(result.total).toBe(7);
    expect(statuses).toEqual({ [uuid(1)]: 'awaiting_receipt', [uuid(2)]: 'missing_receipt', [uuid(3)]: 'processing',
      [uuid(4)]: 'completed', [uuid(5)]: 'returned', [uuid(6)]: 'timeout', [uuid(7)]: 'failed' });
    expect(result.list.find((row) => row.id === uuid(6))?.acceptedAt).toBeTruthy();
    const filtered = await service({ requests: [...requests, progress], submissions, orders: [] }).list({ page: 1, pageSize: 1, status: 'returned', businessType: 'salary' }, admin);
    expect(filtered.total).toBe(1); expect(filtered.list[0].id).toBe(uuid(5));
  });

  it('does not treat a completed main order as returned without an authenticated completed-result response for that customer', async () => {
    const base = { id: uuid(1), action: 'onboarding.create_draft', business_type: 'onboarding', customer_id: customer, account_id: account,
      gateway_received_at: at(120), backend_received_at: at(110), backend_succeeded: true, submission_ids: [], returned_submission_ids: [] };
    const submission = { id: uuid(100), monitor_trace_id: uuid(1), customer_id: customer, account_id: account, request_no: 'ON-100',
      business_type: 'onboarding', work_order_id: uuid(300), created_at: at(100), status: 'received' };
    const order = { id: uuid(300), customer_id: customer, status: 'completed', completed_at: at(60) };
    for (const progress of [
      { customer_id: uuid(999), backend_succeeded: true, portal_responded_at: at(5) },
      { customer_id: customer, backend_succeeded: false, portal_responded_at: at(5) },
      { customer_id: customer, backend_succeeded: true, portal_responded_at: null },
      { customer_id: customer, backend_succeeded: true, portal_responded_at: at(90) },
      { customer_id: customer, backend_succeeded: true, backend_received_at: at(90), portal_responded_at: at(5) },
    ]) {
      const result = await service({ requests: [base, { id: uuid(200), action: 'portal.progress', returned_submission_ids: [uuid(100)], ...progress }],
        submissions: [submission], orders: [order] }).list({ page: 1, pageSize: 20 }, admin);
      expect(result.list[0].status).toBe('completed'); expect(result.list[0].resultReturnedAt).toBeNull();
    }
  });
});
