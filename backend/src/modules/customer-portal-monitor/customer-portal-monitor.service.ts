import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { JwtUserPayload } from '../auth/auth.types';
import { CollectPortalMonitorDto, MONITOR_STATUSES, PortalMonitorQueryDto } from './customer-portal-monitor.dto';
import { monitorConfigured } from './portal-monitor-auth';

const STAGE_COLUMNS: Record<string, string> = {
  gateway_received: 'gateway_received_at', connector_received: 'connector_received_at',
  backend_responded: 'backend_responded_at', portal_responded: 'portal_responded_at',
  timeout: 'timed_out_at', failed: 'failed_at',
};

// Acceptance and completion are read from committed business rows, never from gateway claims.
const SUBMISSION_SQL = `SELECT s.id, s.monitor_trace_id, s.customer_id, s.account_id,
  s.request_no, s.business_type, s.work_order_id, s.created_at AS accepted_at,
  GREATEST(s.updated_at, w.updated_at) AS result_version_at,
  COALESCE(w.status::text, s.status) AS business_status,
  CASE WHEN s.work_order_id IS NULL AND s.status = 'completed' THEN s.completed_at
       WHEN w.status = 'completed' THEN w.completed_at ELSE NULL END AS completed_at
  FROM customer_portal_submissions s
  LEFT JOIN work_orders w ON w.id = s.work_order_id AND w.customer_id = s.customer_id`;

const LIFECYCLE_CTE = `WITH business_rows AS (${SUBMISSION_SQL}),
  receipts AS (SELECT s.*, (SELECT MAX(p.portal_responded_at)
    FROM customer_portal_monitor_requests p
    WHERE p.action = 'portal.progress' AND p.backend_succeeded IS TRUE
      AND p.customer_id = s.customer_id AND p.portal_responded_at >= s.completed_at
      AND p.backend_received_at >= COALESCE(s.result_version_at, s.completed_at)
      AND p.returned_submission_ids @> jsonb_build_array(s.id::text)
    ) AS result_returned_at FROM business_rows s),
  aggregate_rows AS (
    SELECT r.*, COUNT(s.id)::int AS submission_count,
      COUNT(s.completed_at)::int AS completed_count, COUNT(s.result_returned_at)::int AS returned_count,
      MIN(s.accepted_at) AS accepted_at,
      CASE WHEN COUNT(s.id) > 0 AND COUNT(s.completed_at) = COUNT(s.id) THEN MAX(s.completed_at) END AS completed_at,
      CASE WHEN COUNT(s.id) > 0 AND COUNT(s.result_returned_at) = COUNT(s.id) THEN MAX(s.result_returned_at) END AS result_returned_at
    FROM customer_portal_monitor_requests r LEFT JOIN receipts s
      ON (s.monitor_trace_id = r.id OR r.submission_ids @> jsonb_build_array(s.id::text))
        AND s.customer_id = r.customer_id
    WHERE r.action <> 'portal.progress'
    GROUP BY r.id
  ), lifecycle AS (SELECT a.*, CASE
      WHEN result_returned_at IS NOT NULL THEN 'returned'
      WHEN completed_at IS NOT NULL THEN 'completed'
      WHEN timed_out_at IS NOT NULL THEN 'timeout'
      WHEN failure_code IS NOT NULL THEN 'failed'
      WHEN submission_count > 0 THEN 'processing'
      WHEN COALESCE(gateway_received_at, backend_received_at) < NOW() - INTERVAL '60 seconds' THEN 'missing_receipt'
      ELSE 'awaiting_receipt' END AS status
    FROM aggregate_rows a)`;

interface MonitorDbRow {
  id: string; request_key: string; action: string; business_type: string | null; status: string;
  gateway_received_at: Date | null; connector_received_at: Date | null; backend_received_at: Date | null;
  backend_responded_at: Date | null; portal_responded_at: Date | null; timed_out_at: Date | null;
  failed_at: Date | null; failure_code: string | null;
  accepted_at: Date | null; completed_at: Date | null; result_returned_at: Date | null;
  submission_count: number; completed_count: number; returned_count: number;
}

@Injectable()
export class CustomerPortalMonitorService {
  constructor(private readonly dataSource: DataSource) {}

  private assertAdmin(user: JwtUserPayload) {
    if (!user?.roles?.includes('admin')) throw new ForbiddenException('仅管理员可查看客户门户运行监控');
  }

  async collect(input: CollectPortalMonitorDto) {
    // A transaction makes retries safe even when an acknowledgement is lost.
    await this.dataSource.transaction(async (manager) => {
      for (const event of input.events) {
        if (new Date(event.at).getTime() > Date.now() + 300_000) throw new BadRequestException('监控时间超出允许范围');
        const column = STAGE_COLUMNS[event.stage];
        if (!column) throw new BadRequestException('监控阶段无效');
        const inserted: unknown[] = await manager.query(`INSERT INTO customer_portal_monitor_events
          (id, journal_id, sequence, trace_id, stage, at, failure_code) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT DO NOTHING RETURNING id`, [event.id, input.journalId, event.sequence, event.traceId, event.stage, event.at, event.failureCode ?? null]);
        if (!inserted.length) continue;
        await manager.query(`INSERT INTO customer_portal_monitor_requests
          (id, request_key, action, business_type, ${column}, failure_code)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET
          request_key = EXCLUDED.request_key,
          ${column} = LEAST(customer_portal_monitor_requests.${column}, EXCLUDED.${column}),
          failure_code = COALESCE(EXCLUDED.failure_code, customer_portal_monitor_requests.failure_code)`,
        [event.traceId, event.requestKey, event.action, event.businessType ?? null, event.at, event.failureCode ?? null]);
      }
      await manager.query(`INSERT INTO customer_portal_monitor_connections (id,last_heartbeat_at,connector_connected)
        VALUES ($1,NOW(),$2) ON CONFLICT (id) DO UPDATE SET last_heartbeat_at=NOW(),connector_connected=$2`, [input.journalId, input.connectorConnected]);
    });
    return { accepted: input.events.length };
  }

  async backendStart(id: string, action: string, businessType: string | undefined, requestId: unknown) {
    const requestKey = createHash('sha256').update(typeof requestId === 'string' ? requestId : '').digest('hex');
    await this.dataSource.query(`INSERT INTO customer_portal_monitor_requests (id,request_key,action,business_type,backend_received_at)
      VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (id) DO UPDATE SET
      backend_received_at=COALESCE(customer_portal_monitor_requests.backend_received_at,NOW())`, [id, requestKey, action, businessType ?? null]);
  }

  async backendIdentity(id: string, customerId: string, accountId: string) {
    await this.dataSource.query(`UPDATE customer_portal_monitor_requests SET customer_id=$2,account_id=$3 WHERE id=$1`, [id, customerId, accountId]);
  }

  async backendResult(id: string, customerId: string, result: unknown, action: string) {
    const response = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    // Global interceptors can observe the standard API envelope depending on
    // registration order. Keep the evidence attached to its business payload.
    const wrapped = typeof response.code === 'number' && Object.prototype.hasOwnProperty.call(response, 'data');
    const value = wrapped && response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown> : response;
    const ids = isUUID(String(value.submissionId ?? '')) ? [String(value.submissionId)] : [];
    // Import receipts contain internal work-order numbers. Only existing rows for
    // the authenticated customer may be linked, including idempotent retries.
    const requestNumbers = Array.isArray(value.details) ? value.details
      .filter((row) => row?.success === true && typeof row.workOrderNo === 'string')
      .map((row) => row.workOrderNo).slice(0, 500) : [];
    const accepted: { id: string }[] = ids.length || requestNumbers.length ? await this.dataSource.query(
      `SELECT id FROM customer_portal_submissions WHERE customer_id=$1 AND (id=ANY($2::uuid[]) OR request_no=ANY($3::text[]))`, [customerId, ids, requestNumbers]) : [];
    const returned = action === 'portal.progress' && Array.isArray(value.list) ? value.list
      .filter((row) => row?.status === 'completed' && isUUID(String(row.id)))
      .map((row) => String(row.id)).slice(0, 200) : [];
    const validReturned: { id: string }[] = returned.length ? await this.dataSource.query(
      `SELECT id FROM customer_portal_submissions WHERE customer_id=$1 AND id=ANY($2::uuid[])`, [customerId, returned]) : [];
    const succeeded = (!wrapped || response.code === 0) && value.ok !== false && value.successCount !== 0;
    await this.dataSource.query(`UPDATE customer_portal_monitor_requests SET backend_succeeded=$2,
      backend_responded_at=NOW(),submission_ids=$3::jsonb,returned_submission_ids=$4::jsonb,
      failure_code=CASE WHEN $2 THEN failure_code ELSE 'BACKEND_REJECTED' END WHERE id=$1`,
    [id, succeeded, JSON.stringify(accepted.map((row) => row.id)), JSON.stringify(validReturned.map((row) => row.id))]);
  }

  async backendFailure(id: string) {
    await this.dataSource.query(`UPDATE customer_portal_monitor_requests SET backend_succeeded=false,
      failed_at=NOW(),failure_code='BACKEND_REJECTED' WHERE id=$1`, [id]);
  }

  async summary(user: JwtUserPayload) {
    this.assertAdmin(user);
    const [connections, rows] = await Promise.all([
      this.dataSource.query(`SELECT last_heartbeat_at,connector_connected FROM customer_portal_monitor_connections ORDER BY last_heartbeat_at DESC LIMIT 1`) as Promise<{ last_heartbeat_at: Date; connector_connected: boolean }[]>,
      this.dataSource.query(`${LIFECYCLE_CTE} SELECT status,COUNT(*)::int AS count FROM lifecycle GROUP BY status`) as Promise<{ status: string; count: number }[]>,
    ]);
    const connection = connections[0];
    const status = !monitorConfigured() ? 'unconfigured'
      : connection?.connector_connected && Date.now() - new Date(connection.last_heartbeat_at).getTime() <= 20_000 ? 'connected' : 'disconnected';
    const counts = Object.fromEntries(MONITOR_STATUSES.map((key) => [key, Number(rows.find((row) => row.status === key)?.count ?? 0)]));
    return { connection: { status, label: status === 'connected' ? '监控已连接' : '监控未连接', lastHeartbeatAt: connection?.last_heartbeat_at ?? null },
      total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts };
  }

  async list(query: PortalMonitorQueryDto, user: JwtUserPayload) {
    this.assertAdmin(user);
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('分页参数无效');
    const values = [query.status ?? null, query.businessType ?? null];
    const filter = `WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR business_type=$2)`;
    const [rows, totals] = await Promise.all([
      this.dataSource.query(`${LIFECYCLE_CTE} SELECT * FROM lifecycle ${filter}
        ORDER BY COALESCE(gateway_received_at,backend_received_at) DESC,id DESC LIMIT $3 OFFSET $4`, [...values, pageSize, (page - 1) * pageSize]) as Promise<MonitorDbRow[]>,
      this.dataSource.query(`${LIFECYCLE_CTE} SELECT COUNT(*)::int AS total FROM lifecycle ${filter}`, values) as Promise<{ total: number }[]>,
    ]);
    return { list: rows.map((row) => this.toView(row)), total: Number(totals[0]?.total ?? 0), page, pageSize };
  }

  async detail(id: string, user: JwtUserPayload) {
    this.assertAdmin(user);
    if (!isUUID(id)) throw new BadRequestException('监控编号无效');
    const rows: MonitorDbRow[] = await this.dataSource.query(`${LIFECYCLE_CTE} SELECT * FROM lifecycle WHERE id=$1`, [id]);
    if (!rows.length) throw new NotFoundException('监控记录不存在');
    const [submissions, events] = await Promise.all([
      this.dataSource.query(`${LIFECYCLE_CTE} SELECT s.id,s.request_no AS "requestNo",s.business_type AS "businessType",
        s.work_order_id AS "workOrderId",s.business_status AS status,s.accepted_at AS "acceptedAt",
        s.completed_at AS "completedAt",s.result_returned_at AS "resultReturnedAt"
        FROM receipts s JOIN customer_portal_monitor_requests r
        ON (s.monitor_trace_id=r.id OR r.submission_ids @> jsonb_build_array(s.id::text)) AND s.customer_id=r.customer_id WHERE r.id=$1
        ORDER BY s.accepted_at,s.id`, [id]),
      this.dataSource.query(`SELECT stage,at,failure_code AS "failureCode" FROM customer_portal_monitor_events WHERE trace_id=$1 ORDER BY at,sequence`, [id]),
    ]);
    return { ...this.toView(rows[0]), submissions, events };
  }

  private toView(row: MonitorDbRow) {
    return { id: row.id, requestKey: row.request_key, action: row.action, businessType: row.business_type, status: row.status,
      gatewayReceivedAt: row.gateway_received_at, connectorReceivedAt: row.connector_received_at,
      backendReceivedAt: row.backend_received_at, backendRespondedAt: row.backend_responded_at,
      portalRespondedAt: row.portal_responded_at, timedOutAt: row.timed_out_at, failedAt: row.failed_at,
      failureCode: row.failure_code, acceptedAt: row.accepted_at, completedAt: row.completed_at,
      resultReturnedAt: row.result_returned_at, submissionCount: row.submission_count,
      completedCount: row.completed_count, returnedCount: row.returned_count };
  }
}
