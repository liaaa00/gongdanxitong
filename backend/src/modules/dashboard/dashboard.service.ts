import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ADMIN_ROLE,
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  hasAnyRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';

interface DashboardRow {
  payload?: unknown;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workOrderValidationService: WorkOrderValidationService,
  ) {}

  async getSalespersonMetrics(userId: string): Promise<unknown> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') - interval '1 month' AS prev_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS prev_end
      ),
      cur AS (
        SELECT
          COUNT(*) FILTER (WHERE wo.status <> 'draft') AS submitted,
          COUNT(*) AS created,
          COUNT(*) FILTER (WHERE wo.status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM dispatched_orders d
             WHERE d.parent_order_id = wo.id AND d.status = 'returned'
          )) AS returned,
          COUNT(*) FILTER (WHERE wo.status = 'withdrawn') AS withdrawn
        FROM work_orders wo, bounds
        WHERE wo.created_by = $1
          AND wo.created_at >= bounds.cur_start
          AND wo.created_at < bounds.cur_end
      ),
      prev AS (
        SELECT
          COUNT(*) FILTER (WHERE wo.status <> 'draft') AS submitted,
          COUNT(*) AS created,
          COUNT(*) FILTER (WHERE wo.status = 'completed') AS completed
        FROM work_orders wo, bounds
        WHERE wo.created_by = $1
          AND wo.created_at >= bounds.prev_start
          AND wo.created_at < bounds.prev_end
      ),
      trend AS (
        SELECT
          to_char(d::date, 'YYYY-MM-DD') AS bucket,
          COUNT(wo.id) FILTER (WHERE wo.status <> 'draft') AS submitted,
          COUNT(wo.id) FILTER (WHERE wo.status = 'completed') AS completed
        FROM bounds b
        CROSS JOIN generate_series(b.cur_start, b.cur_end - interval '1 day', interval '1 day') d
        LEFT JOIN work_orders wo
          ON wo.created_by = $1
         AND date_trunc('day', wo.created_at AT TIME ZONE 'Asia/Shanghai') = d
        GROUP BY d
        ORDER BY d
      )
      SELECT json_build_object(
        'current', row_to_json(cur.*),
        'previous', row_to_json(prev.*),
        'deltaPct', json_build_object(
          'submitted', CASE WHEN prev.submitted = 0 THEN NULL ELSE round((cur.submitted - prev.submitted)::numeric * 100 / prev.submitted, 1) END,
          'completed', CASE WHEN prev.completed = 0 THEN NULL ELSE round((cur.completed - prev.completed)::numeric * 100 / prev.completed, 1) END
        ),
        'trend', (SELECT COALESCE(json_agg(row_to_json(trend.*) ORDER BY bucket), '[]'::json) FROM trend)
      ) AS payload
      FROM cur, prev
      `,
      [userId],
    ) as DashboardRow[];
    return rows[0]?.payload ?? this.emptySalesperson();
  }

  async getTeamMetrics(moduleCode: string, user: JwtUserPayload): Promise<unknown> {
    const rows = await this.dataSource.query(
      `
      WITH cur_do AS (
        SELECT d.*
          FROM dispatched_orders d
         WHERE d.module_code = $1
           AND d.created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai')
           AND ($2::boolean = true OR d.handler_id = $3 OR d.handler_id IS NULL)
      ),
      counts AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'returned') AS returned,
          COUNT(*) FILTER (
            WHERE status IN ('pending','processing')
              AND dispatched_at IS NOT NULL
              AND EXTRACT(EPOCH FROM (now() - dispatched_at)) / 3600 > 48
          ) AS sla_breach
        FROM cur_do
      ),
      per_member AS (
        SELECT
          u.id AS user_id,
          u.real_name,
          COUNT(d.id) AS total,
          COUNT(d.id) FILTER (WHERE d.status = 'completed') AS completed,
          AVG(EXTRACT(EPOCH FROM (d.completed_at - d.accepted_at))) FILTER (WHERE d.status = 'completed') AS avg_handle_seconds,
          COUNT(d.id) FILTER (WHERE d.status IN ('pending','processing')) AS in_flight
        FROM module_handlers mh
        JOIN users u ON u.id = mh.handler_id
        LEFT JOIN cur_do d ON d.handler_id = u.id
        WHERE mh.module_code = $1 AND mh.is_active = true
        GROUP BY u.id, u.real_name
      ),
      top5 AS (
        SELECT user_id, real_name, completed, avg_handle_seconds
          FROM per_member
         WHERE completed > 0
         ORDER BY avg_handle_seconds ASC NULLS LAST, completed DESC
         LIMIT 5
      ),
      pool AS (
        SELECT COUNT(*) AS pool_pending
          FROM cur_do
         WHERE status = 'pending' AND handler_id IS NULL
      )
      SELECT json_build_object(
        'moduleCode', $1,
        'counts', (SELECT row_to_json(counts.*) FROM counts),
        'pool', (SELECT row_to_json(pool.*) FROM pool),
        'top5', (SELECT COALESCE(json_agg(row_to_json(top5.*)), '[]'::json) FROM top5),
        'members', (SELECT COALESCE(json_agg(row_to_json(per_member.*) ORDER BY real_name), '[]'::json) FROM per_member)
      ) AS payload
      `,
      [moduleCode, this.isManagerOrAdmin(user), user.sub],
    ) as DashboardRow[];
    return rows[0]?.payload ?? this.emptyTeam(moduleCode);
  }

  async getManagerMetrics(user: JwtUserPayload): Promise<unknown> {
    const scope = await this.resolveDepartmentScope(user);
    if (scope.empty) {
      return this.emptyManager();
    }

    const departmentIds = scope.departmentIds;
    const hasDeptFilter = departmentIds !== null;
    const params: unknown[] = [hasDeptFilter, departmentIds ?? []];

    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ),
      scoped_wo AS (
        SELECT wo.*
          FROM work_orders wo, bounds b
         WHERE wo.created_at >= b.cur_start
           AND wo.created_at < b.cur_end
           AND ($1::boolean = false OR wo.department_id = ANY($2::uuid[]))
      ),
      module_summary AS (
        SELECT
          d.module_code,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE d.status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE d.status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE d.status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE d.status = 'returned') AS returned,
          ROUND(AVG(EXTRACT(EPOCH FROM (d.completed_at - d.dispatched_at))/3600)
            FILTER (WHERE d.status = 'completed'), 2) AS avg_h
        FROM dispatched_orders d, bounds b
        WHERE d.created_at >= b.cur_start AND d.created_at < b.cur_end
          AND ($1::boolean = false OR d.parent_order_id IN (SELECT id FROM scoped_wo))
        GROUP BY d.module_code
      ),
      customer_top AS (
        SELECT
          wo.extra_data->>'customer_code' AS customer_code,
          wo.extra_data->>'customer_name' AS customer_name,
          COUNT(*) AS orders
        FROM scoped_wo wo
        WHERE wo.status <> 'draft'
        GROUP BY 1, 2
        ORDER BY orders DESC
        LIMIT 10
      ),
      ratios AS (
        SELECT
          COUNT(*) AS total_submitted,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM dispatched_orders d WHERE d.parent_order_id = wo.id AND d.status = 'returned'
          ))::numeric / NULLIF(COUNT(*),0) AS return_ratio,
          COUNT(*) FILTER (WHERE wo.status = 'withdrawn')::numeric / NULLIF(COUNT(*),0) AS withdraw_ratio,
          AVG(EXTRACT(EPOCH FROM (wo.completed_at - wo.submitted_at)) / 3600)
            FILTER (WHERE wo.status = 'completed') AS avg_close_hours
        FROM scoped_wo wo
        WHERE wo.status <> 'draft'
      ),
      daily_trend AS (
        SELECT
          to_char(d.day, 'YYYY-MM-DD') AS bucket,
          COUNT(wo.id) FILTER (WHERE wo.status <> 'draft') AS submitted,
          COUNT(wo.id) FILTER (WHERE wo.status = 'completed') AS completed
        FROM bounds b
        CROSS JOIN generate_series(b.cur_start, b.cur_end - interval '1 day', interval '1 day') d(day)
        LEFT JOIN scoped_wo wo
          ON date_trunc('day', wo.created_at AT TIME ZONE 'Asia/Shanghai') = d.day
        GROUP BY d.day
        ORDER BY d.day
      )
      SELECT json_build_object(
        'modules', (SELECT COALESCE(json_agg(row_to_json(module_summary.*)), '[]'::json) FROM module_summary),
        'topCustomers', (SELECT COALESCE(json_agg(row_to_json(customer_top.*)), '[]'::json) FROM customer_top),
        'ratios', (SELECT row_to_json(ratios.*) FROM ratios),
        'trend', (SELECT COALESCE(json_agg(row_to_json(daily_trend.*)), '[]'::json) FROM daily_trend)
      ) AS payload
      `,
      params,
    ) as DashboardRow[];
    return rows[0]?.payload ?? this.emptyManager();
  }

  private async resolveDepartmentScope(
    user: JwtUserPayload,
  ): Promise<{ departmentIds: string[] | null; empty: boolean }> {
    if (isAdminRole(user.roles)) {
      return { departmentIds: null, empty: false };
    }
    if (
      hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) ||
      hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)
    ) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) {
        return { departmentIds: [], empty: true };
      }
      return { departmentIds, empty: false };
    }
    throw new ForbiddenException(`角色无权访问管理看板 (${ADMIN_ROLE} / manager / leader required)`);
  }

  private isManagerOrAdmin(user: JwtUserPayload): boolean {
    return user.roles.includes('admin') || user.roles.includes('manager') || user.roles.some((role) => role.endsWith('_supervisor'));
  }

  private emptySalesperson(): Record<string, unknown> {
    return { current: { created: 0, submitted: 0, completed: 0, returned: 0, withdrawn: 0 }, previous: { created: 0, submitted: 0, completed: 0 }, deltaPct: { submitted: null, completed: null }, trend: [] };
  }

  private emptyTeam(moduleCode: string): Record<string, unknown> {
    return { moduleCode, counts: { pending: 0, processing: 0, completed: 0, returned: 0, slaBreach: 0 }, pool: { poolPending: 0 }, top5: [], members: [] };
  }

  private emptyManager(): Record<string, unknown> {
    return { modules: [], topCustomers: [], ratios: { totalSubmitted: 0, returnRatio: null, withdrawRatio: null, avgCloseHours: null }, trend: [] };
  }
}
