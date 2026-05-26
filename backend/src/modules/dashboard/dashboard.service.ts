import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ADMIN_ROLE,
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  hasAnyRole,
  hasManagementScopeRole,
  hasModuleSupervisorRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { DISPATCH_MODULE_LABELS, resolveDispatchModuleCode } from 'src/common/constants/dispatch-modules';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { DashboardCardsDto } from './dto/dashboard-cards.dto';

const BACKEND_HANDLER_ROLES = [
  'contract_specialist',
  'labor_contract_member',
  'contract_team',
  'contract_supervisor',
  'onboarding_specialist',
  'onboarding_resignation_member',
  'onboarding_team',
  'onboarding_supervisor',
  'data_entry_leader',
  'data_entry_team',
  'data_entry_supervisor',
  'social_insurance_specialist',
  'social_insurance_team',
  'social_insurance_supervisor',
  'social_security_team',
  'social_security_supervisor',
  'shared_leader',
  'shared_team_owner',
] as const;

interface DashboardRow {
  payload?: unknown;
}

interface BackendDashboardScope {
  modules: string[];
  includeModuleAll: boolean;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workOrderValidationService: WorkOrderValidationService,
  ) {}

  async getDashboardCards(user: JwtUserPayload): Promise<DashboardCardsDto> {
    const myMessages = await this.countUnreadMessages(user.sub);

    if (this.isGlobalBusinessOverview(user)) {
      return { ...(await this.queryWorkOrderCards(null, null)), myMessages, scope: 'global' };
    }

    if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) return { ...this.emptyCards(), myMessages, scope: 'team' };
      return { ...(await this.queryWorkOrderCards('department', departmentIds)), myMessages, scope: 'team' };
    }

    if (this.isBackendHandler(user)) {
      return { ...(await this.queryDispatchedOrderCards(user)), myMessages, scope: 'backend_module' };
    }

    return { ...(await this.queryWorkOrderCards('owner', user.sub)), myMessages, scope: 'mine' };
  }

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
          AND COALESCE(wo.submitted_at, wo.created_at) >= bounds.cur_start
          AND COALESCE(wo.submitted_at, wo.created_at) < bounds.cur_end
      ),
      prev AS (
        SELECT
          COUNT(*) FILTER (WHERE wo.status <> 'draft') AS submitted,
          COUNT(*) AS created,
          COUNT(*) FILTER (WHERE wo.status = 'completed') AS completed
        FROM work_orders wo, bounds
        WHERE wo.created_by = $1
          AND COALESCE(wo.submitted_at, wo.created_at) >= bounds.prev_start
          AND COALESCE(wo.submitted_at, wo.created_at) < bounds.prev_end
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
         AND date_trunc('day', COALESCE(wo.submitted_at, wo.created_at) AT TIME ZONE 'Asia/Shanghai') = d
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
    const normalizedModuleCode = resolveDispatchModuleCode(moduleCode) ?? moduleCode;
    const canViewAll = await this.canViewBackendModuleAll(user, normalizedModuleCode);
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ),
      cur_do AS (
        SELECT d.*
          FROM dispatched_orders d, bounds b
         WHERE d.module_code = $1
           AND COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
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
              AND due_at IS NOT NULL
              AND due_at < now()
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
        'scope', CASE WHEN $2::boolean THEN 'team' ELSE 'personal' END,
        'counts', (SELECT row_to_json(counts.*) FROM counts),
        'pool', (SELECT row_to_json(pool.*) FROM pool),
        'top5', (SELECT COALESCE(json_agg(row_to_json(top5.*)), '[]'::json) FROM top5),
        'members', (SELECT COALESCE(json_agg(row_to_json(per_member.*) ORDER BY real_name), '[]'::json) FROM per_member)
      ) AS payload
      `,
      [normalizedModuleCode, canViewAll, user.sub],
    ) as DashboardRow[];
    return rows[0]?.payload ?? this.emptyTeam(normalizedModuleCode);
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
         WHERE COALESCE(wo.submitted_at, wo.created_at) >= b.cur_start
           AND COALESCE(wo.submitted_at, wo.created_at) < b.cur_end
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
        WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
          AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
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
          ON date_trunc('day', COALESCE(wo.submitted_at, wo.created_at) AT TIME ZONE 'Asia/Shanghai') = d.day
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

  private async countUnreadMessages(userId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1
         AND is_read = false
         AND biz_type NOT IN ('dispatch', 'dispatch_created', 'dispatched_new', 'dispatched_accepted', 'dispatched_completed')`,
      [userId],
    ) as Array<{ count: number | string }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async queryWorkOrderCards(scope: 'owner' | 'department' | null, value: string | string[] | null): Promise<Omit<DashboardCardsDto, 'myMessages'>> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ), scoped AS (
        SELECT wo.*
          FROM work_orders wo, bounds b
         WHERE COALESCE(wo.submitted_at, wo.created_at) >= b.cur_start
           AND COALESCE(wo.submitted_at, wo.created_at) < b.cur_end
           AND wo.status <> 'draft'
           AND ($1::text IS NULL
             OR ($1::text = 'owner' AND wo.created_by = $2::uuid)
             OR ($1::text = 'department' AND wo.department_id = ANY($3::uuid[])))
      )
      SELECT
        COUNT(*)::int AS "totalThisMonth",
        COUNT(*) FILTER (WHERE status::text NOT IN ('completed','withdrawn','void','draft'))::int AS processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
      FROM scoped
      `,
      [scope, scope === 'owner' ? value : null, scope === 'department' ? value : []],
    ) as Array<{ totalThisMonth: number | string; processing: number | string; completed: number | string }>;
    return this.toCardsWithoutMessages(rows[0]);
  }

  private async queryDispatchedOrderCards(user: JwtUserPayload): Promise<Omit<DashboardCardsDto, 'myMessages'>> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ), accessible_modules AS (
        SELECT module_code FROM module_handlers WHERE handler_id = $1::uuid AND is_active = true
        UNION
        SELECT module_code FROM module_supervisors WHERE supervisor_id = $1::uuid AND is_active = true
      ), current_role_scope AS (
        SELECT COALESCE(bool_or(r.level IN ('supervisor','management','global')), false) AS can_view_module_all
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1::uuid
      ), scoped AS (
        SELECT d.*
          FROM dispatched_orders d, bounds b, current_role_scope rs
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND (
             d.handler_id = $1::uuid
             OR (d.handler_id IS NULL AND d.module_code IN (SELECT module_code FROM accessible_modules))
             OR (rs.can_view_module_all = true AND d.module_code IN (SELECT module_code FROM accessible_modules))
           )
      )
      SELECT
        COUNT(*)::int AS "totalThisMonth",
        COUNT(*) FILTER (WHERE status::text NOT IN ('completed','withdrawn','void','draft'))::int AS processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
      FROM scoped
      `,
      [user.sub],
    ) as Array<{ totalThisMonth: number | string; processing: number | string; completed: number | string }>;
    return this.toCardsWithoutMessages(rows[0]);
  }

  private toCardsWithoutMessages(row?: { totalThisMonth?: number | string; processing?: number | string; completed?: number | string }): Omit<DashboardCardsDto, 'myMessages'> {
    return {
      totalThisMonth: Number(row?.totalThisMonth ?? 0),
      processing: Number(row?.processing ?? 0),
      completed: Number(row?.completed ?? 0),
    };
  }

  private async resolveDepartmentScope(
    user: JwtUserPayload,
  ): Promise<{ departmentIds: string[] | null; empty: boolean }> {
    if (this.isGlobalBusinessOverview(user)) {
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
    throw new ForbiddenException(`角色无权访问管理看板（需 ${ADMIN_ROLE} / manager / leader 角色）`);
  }

  private isGlobalBusinessOverview(user: JwtUserPayload): boolean {
    return isAdminRole(user.roles) || user.roles.includes('business_owner') || user.roles.includes('manager');
  }

  private isBackendHandler(user: JwtUserPayload): boolean {
    return hasAnyRole(user.roles, BACKEND_HANDLER_ROLES) || user.roles.some((role) => role.endsWith('_supervisor'));
  }

  private async canViewBackendModuleAll(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (isAdminRole(user.roles) || hasManagementScopeRole(user.roles)) return true;
    if (!hasModuleSupervisorRole(user.roles) && !user.roles.some((role) => role.endsWith('_supervisor'))) return false;
    if (await this.hasModuleAccess(user.sub, moduleCode)) return true;
    if (await this.hasModuleSupervisorConfig(user.sub, moduleCode)) return true;
    return false;
  }

  private async resolveBackendDashboardScope(user: JwtUserPayload): Promise<BackendDashboardScope> {
    const modules = await this.getAccessibleModules(user.sub);
    const includeModuleAll = isAdminRole(user.roles)
      || hasManagementScopeRole(user.roles)
      || hasModuleSupervisorRole(user.roles)
      || await this.hasSupervisorLevel(user.sub);
    return { modules, includeModuleAll };
  }

  private async getAccessibleModules(userId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
      SELECT module_code FROM module_handlers WHERE handler_id = $1 AND is_active = true
      UNION
      SELECT module_code FROM module_supervisors WHERE supervisor_id = $1 AND is_active = true
      `,
      [userId],
    ) as Array<{ module_code: string }>;
    return Array.from(new Set(rows.map((row) => row.module_code).filter(Boolean)));
  }

  private async hasModuleAccess(userId: string, moduleCode: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT 1 FROM module_handlers WHERE handler_id = $1 AND module_code = $2 AND is_active = true
      UNION ALL
      SELECT 1 FROM module_supervisors WHERE supervisor_id = $1 AND module_code = $2 AND is_active = true
      LIMIT 1
      `,
      [userId, moduleCode],
    ) as Array<{ '?column?'?: number }>;
    return rows.length > 0;
  }

  private async hasModuleSupervisorConfig(userId: string, moduleCode: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM module_supervisors WHERE supervisor_id = $1 AND module_code = $2 AND is_active = true LIMIT 1`,
      [userId, moduleCode],
    ) as Array<{ '?column?'?: number }>;
    return rows.length > 0;
  }

  private async hasSupervisorLevel(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
         AND r.level IN ('supervisor','management','global')
       LIMIT 1
      `,
      [userId],
    ) as Array<{ '?column?'?: number }>;
    return rows.length > 0;
  }

  private emptyCards(): Omit<DashboardCardsDto, 'myMessages'> {
    return { totalThisMonth: 0, processing: 0, completed: 0 };
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

  async getOrderTypeMatrix(user: JwtUserPayload, dimension: 'orderType' | 'node' = 'orderType'): Promise<unknown> {
    if (dimension === 'node' && this.isBackendHandler(user) && !this.isGlobalBusinessOverview(user)) {
      return { rows: await this.queryBackendNodeMatrixRows(user) };
    }

    const scope = await this.resolveDashboardScope(user);
    if (scope.empty) {
      return { rows: [] };
    }

    const hasScopeFilter = scope.departmentIds !== null || scope.ownerId !== null;
    const params: unknown[] = [
      hasScopeFilter,
      scope.departmentIds ?? [],
      scope.ownerId ?? null,
    ];

    if (dimension === 'node') {
      if (this.isBackendHandler(user) && !this.isGlobalBusinessOverview(user)) {
        return { rows: await this.queryBackendNodeMatrixRows(user) };
      }
      return { rows: await this.queryNodeMatrixRows(params) };
    }

    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ),
      order_types AS (
        SELECT * FROM (VALUES
          ('onboarding', '入职工单', 1),
          ('renewal', '续签工单', 2),
          ('resignation', '离职工单', 3),
          ('benefit', '待遇申报', 4)
        ) AS t(order_type, label, sort_order)
      ),
      scoped_wo AS (
        SELECT wo.*
          FROM work_orders wo, bounds b
         WHERE COALESCE(wo.submitted_at, wo.created_at) >= b.cur_start
           AND COALESCE(wo.submitted_at, wo.created_at) < b.cur_end
           AND wo.status::text <> 'draft'
           AND ($1::boolean = false
             OR ($2::uuid[] IS NOT NULL AND array_length($2::uuid[], 1) > 0 AND wo.department_id = ANY($2::uuid[]))
             OR ($3::uuid IS NOT NULL AND wo.created_by = $3::uuid))
      )
      SELECT
        ot.order_type AS "orderType",
        ot.label,
        COALESCE(COUNT(wo.id), 0)::int AS total,
        COALESCE(COUNT(wo.id) FILTER (WHERE wo.status::text NOT IN ('completed','withdrawn','void','draft')), 0)::int AS processing,
        COALESCE(COUNT(wo.id) FILTER (WHERE wo.status::text = 'completed'), 0)::int AS completed,
        CASE
          WHEN COUNT(wo.id) = 0 THEN 0
          ELSE ROUND(COUNT(wo.id) FILTER (WHERE wo.status::text = 'completed')::numeric * 100 / COUNT(wo.id), 1)
        END AS "completionRate"
      FROM order_types ot
      LEFT JOIN scoped_wo wo ON wo.order_type::text = ot.order_type
      GROUP BY ot.order_type, ot.label, ot.sort_order
      ORDER BY ot.sort_order
      `,
      params,
    );

    return { rows };
  }

  private async queryBackendNodeMatrixRows(user: JwtUserPayload): Promise<Array<Record<string, unknown>>> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ), accessible_modules AS (
        SELECT module_code FROM module_handlers WHERE handler_id = $1::uuid AND is_active = true
        UNION
        SELECT module_code FROM module_supervisors WHERE supervisor_id = $1::uuid AND is_active = true
      ), current_role_scope AS (
        SELECT COALESCE(bool_or(r.level IN ('supervisor','management','global')), false) AS can_view_module_all
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1::uuid
      ), scoped_do AS (
        SELECT d.*
          FROM dispatched_orders d, bounds b, current_role_scope rs
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND (
             d.handler_id = $1::uuid
             OR (d.handler_id IS NULL AND d.module_code IN (SELECT module_code FROM accessible_modules))
             OR (rs.can_view_module_all = true AND d.module_code IN (SELECT module_code FROM accessible_modules))
           )
      )
      SELECT
        d.module_code AS "moduleCode",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status::text <> 'completed')::int AS processing,
        COUNT(*) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(COUNT(*) FILTER (WHERE d.status::text = 'completed')::numeric * 100 / COUNT(*), 1)
        END AS "completionRate"
      FROM scoped_do d
      GROUP BY d.module_code
      ORDER BY d.module_code
      `,
      [user.sub],
    ) as Array<Record<string, unknown> & { moduleCode: string }>;

    return rows.map((row) => ({
      ...row,
      label: DISPATCH_MODULE_LABELS[row.moduleCode] ?? row.moduleCode,
    }));
  }

  private async queryNodeMatrixRows(params: unknown[]): Promise<Array<Record<string, unknown>>> {
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
         WHERE COALESCE(wo.submitted_at, wo.created_at) >= b.cur_start
           AND COALESCE(wo.submitted_at, wo.created_at) < b.cur_end
           AND wo.status <> 'draft'
           AND ($1::boolean = false
             OR ($2::uuid[] IS NOT NULL AND array_length($2::uuid[], 1) > 0 AND wo.department_id = ANY($2::uuid[]))
             OR ($3::uuid IS NOT NULL AND wo.created_by = $3::uuid))
      ),
      scoped_do AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN scoped_wo wo ON wo.id = d.parent_order_id
      )
      SELECT
        d.module_code AS "moduleCode",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status::text <> 'completed')::int AS processing,
        COUNT(*) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(COUNT(*) FILTER (WHERE d.status::text = 'completed')::numeric * 100 / COUNT(*), 1)
        END AS "completionRate"
      FROM scoped_do d
      GROUP BY d.module_code
      ORDER BY d.module_code
      `,
      params,
    ) as Array<Record<string, unknown> & { moduleCode: string }>;

    return rows.map((row) => ({
      ...row,
      label: DISPATCH_MODULE_LABELS[row.moduleCode] ?? row.moduleCode,
    }));
  }

  async getLeaderTrend(orderType: string, user: JwtUserPayload, moduleCode?: string): Promise<unknown> {
    const scope = await this.resolveDashboardScope(user);
    if (scope.empty) {
      return { orderType, buckets: [] };
    }

    const hasScopeFilter = scope.departmentIds !== null || scope.ownerId !== null;
    const moduleFilter = resolveDispatchModuleCode(moduleCode) ?? null;
    const params: unknown[] = [
      orderType,
      hasScopeFilter,
      scope.departmentIds ?? [],
      scope.ownerId ?? null,
      moduleFilter,
    ];

    const rows = await this.dataSource.query(
      `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') - interval '11 months',
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai'),
          interval '1 month'
        ) AS month_start
      ),
      scoped_wo AS (
        SELECT
          wo.*,
          date_trunc('month', COALESCE(wo.submitted_at, wo.created_at) AT TIME ZONE 'Asia/Shanghai') AS wo_month
        FROM work_orders wo
        WHERE wo.order_type = $1
          AND wo.status <> 'draft'
          AND COALESCE(wo.submitted_at, wo.created_at) >= (SELECT MIN(month_start) FROM months)
          AND ($2::boolean = false
            OR ($3::uuid[] IS NOT NULL AND array_length($3::uuid[], 1) > 0 AND wo.department_id = ANY($3::uuid[]))
            OR ($4::uuid IS NOT NULL AND wo.created_by = $4::uuid))
          AND ($5::text IS NULL OR EXISTS (
            SELECT 1 FROM dispatched_orders d
             WHERE d.parent_order_id = wo.id
               AND d.module_code = $5::text
          ))
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        COUNT(wo.id)::int AS total,
        COUNT(wo.id) FILTER (WHERE wo.status = 'completed')::int AS completed,
        CASE
          WHEN COUNT(wo.id) = 0 THEN 0
          ELSE ROUND(COUNT(wo.id) FILTER (WHERE wo.status = 'completed')::numeric * 100 / COUNT(wo.id), 1)
        END AS rate
      FROM months m
      LEFT JOIN scoped_wo wo ON wo.wo_month = m.month_start
      GROUP BY m.month_start
      ORDER BY m.month_start
      `,
      params,
    );

    return { orderType, moduleCode: moduleFilter, buckets: rows };
  }

  private async resolveDashboardScope(
    user: JwtUserPayload,
  ): Promise<{ departmentIds: string[] | null; ownerId: string | null; empty: boolean }> {
    if (this.isGlobalBusinessOverview(user)) {
      return { departmentIds: null, ownerId: null, empty: false };
    }
    if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) {
        return { departmentIds: [], ownerId: null, empty: true };
      }
      return { departmentIds, ownerId: null, empty: false };
    }
    if (this.isBackendHandler(user)) {
      return { departmentIds: null, ownerId: null, empty: true };
    }
    return { departmentIds: null, ownerId: user.sub, empty: false };
  }
}
