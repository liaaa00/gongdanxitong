import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
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
import {
  DISPATCH_MODULE_LABELS,
  PHASE1_VISIBLE_DISPATCH_MODULE_CODES,
  filterPhase1VisibleDispatchModules,
  isPhase1VisibleDispatchModule,
  resolveDispatchModuleCode,
} from 'src/common/constants/dispatch-modules';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { RoleActionPermissionService } from 'src/modules/role-action-permissions/role-action-permission.service';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { DashboardCardsDto } from './dto/dashboard-cards.dto';

const LEADER_TREND_STATEMENT_TIMEOUT_MS = 7_000;
const DASHBOARD_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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

interface DashboardCardsRow {
  totalThisMonth?: number | string;
  processing?: number | string;
  completed?: number | string;
  completionRate?: number | string;
  completion_rate?: number | string;
  voided?: number | string;
  voidCount?: number | string;
  void_count?: number | string;
  pendingTotal?: number | string;
  pending_total?: number | string;
  totalPending?: number | string;
  total_pending?: number | string;
  pendingThisMonth?: number | string;
  pending_this_month?: number | string;
  monthPending?: number | string;
  month_pending?: number | string;
}

interface BackendDashboardScope {
  modules: string[];
  includeModuleAll: boolean;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workOrderValidationService: WorkOrderValidationService,
    @Optional()
    private readonly roleActionPermissionService?: RoleActionPermissionService,
  ) {}

  async getDashboardCards(user: JwtUserPayload, requestedScope?: 'mine' | 'team', month?: string): Promise<DashboardCardsDto> {
    const selectedMonth = this.resolveDashboardMonth(month);
    const myMessages = await this.countUnreadMessages(user.sub);

    if (this.isBackendHandler(user)) {
      const backendScope = await this.resolveBackendDashboardScope(user);
      return { ...(await this.queryDispatchedOrderCards(user, selectedMonth, backendScope)), myMessages, scope: 'backend_module' };
    }

    if (requestedScope === 'mine') {
      return { ...(await this.queryWorkOrderCards('owner', user.sub, selectedMonth)), myMessages, scope: 'mine' };
    }

    if (requestedScope === 'team' && (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES))) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) return { ...this.emptyCards(), myMessages, scope: 'team' };
      return { ...(await this.queryWorkOrderCards('department', departmentIds, selectedMonth)), myMessages, scope: 'team' };
    }

    if (await this.canViewAllWorkOrders(user)) {
      return { ...(await this.queryWorkOrderCards(null, null, selectedMonth)), myMessages, scope: 'global' };
    }

    if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) return { ...this.emptyCards(), myMessages, scope: 'team' };
      return { ...(await this.queryWorkOrderCards('department', departmentIds, selectedMonth)), myMessages, scope: 'team' };
    }

    return { ...(await this.queryWorkOrderCards('owner', user.sub, selectedMonth)), myMessages, scope: 'mine' };
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
    if (!isPhase1VisibleDispatchModule(normalizedModuleCode)) {
      return this.emptyTeam(normalizedModuleCode, true);
    }
    const canViewAll = await this.canViewBackendModuleAll(user, normalizedModuleCode);
    if (!canViewAll && !(await this.hasModuleAccess(user.sub, normalizedModuleCode, user.roles))) {
      return this.emptyTeam(normalizedModuleCode, true);
    }
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AS cur_start,
          date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 month' AS cur_end
      ),
      cur_do AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN work_orders wo ON wo.id = d.parent_order_id
          CROSS JOIN bounds b
         WHERE d.module_code = $1
           AND wo.order_type::text IN ('onboarding','resignation')
           AND COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND ($2::boolean = true OR d.handler_id = $3 OR d.handler_id IS NULL)
      ),
      counts AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending' AND void_at IS NULL) AS pending,
          COUNT(*) FILTER (WHERE status = 'processing' AND void_at IS NULL) AS processing,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'returned' AND void_at IS NULL) AS returned,
          COUNT(*) FILTER (WHERE status = 'void' OR void_at IS NOT NULL) AS voided,
          COUNT(*) FILTER (
            WHERE status IN ('pending','processing')
              AND void_at IS NULL
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
          COUNT(d.id) FILTER (WHERE d.status IN ('pending','processing') AND d.void_at IS NULL) AS in_flight
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
    const params: unknown[] = [hasDeptFilter, departmentIds ?? [], [...PHASE1_VISIBLE_DISPATCH_MODULE_CODES]];

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
           AND wo.order_type::text IN ('onboarding','resignation')
           AND ($1::boolean = false OR wo.department_id = ANY($2::uuid[]))
      ),
      module_summary AS (
        SELECT
          d.module_code,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE d.status = 'pending' AND d.void_at IS NULL) AS pending,
          COUNT(*) FILTER (WHERE d.status = 'processing' AND d.void_at IS NULL) AS processing,
          COUNT(*) FILTER (WHERE d.status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE d.status = 'returned' AND d.void_at IS NULL) AS returned,
          COUNT(*) FILTER (WHERE d.status = 'void' OR d.void_at IS NOT NULL) AS voided,
          ROUND(AVG(EXTRACT(EPOCH FROM (d.completed_at - d.dispatched_at))/3600)
            FILTER (WHERE d.status = 'completed'), 2) AS avg_h
        FROM dispatched_orders d, bounds b
        WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
          AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
          AND d.module_code = ANY($3::text[])
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
         AND biz_type NOT IN (
           'dispatch', 'dispatch_created', 'dispatched_new', 'dispatched_accepted', 'dispatched_completed',
           'urge_feedback', 'backend_urge_creator'
         )`,
      [userId],
    ) as Array<{ count: number | string }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async queryWorkOrderCards(scope: 'owner' | 'department' | null, value: string | string[] | null, month: string): Promise<Omit<DashboardCardsDto, 'myMessages'>> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          $4::timestamp AS cur_start,
          ($4::timestamp + interval '1 month') AS cur_end
      ), scoped_wo AS (
        SELECT wo.*
          FROM work_orders wo
         WHERE wo.status <> 'draft'
           AND ($1::text IS NULL
             OR ($1::text = 'owner' AND wo.created_by = $2::uuid)
             OR ($1::text = 'department' AND wo.department_id = ANY($3::uuid[])))
      ), scoped_all AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN scoped_wo wo ON wo.id = d.parent_order_id
         WHERE wo.order_type::text IN ('onboarding','resignation')
           AND d.module_code = ANY($5::text[])
      ), scoped_month AS (
        SELECT d.*
          FROM scoped_all d
          CROSS JOIN bounds b
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
      )
      SELECT
        (SELECT COUNT(*)::int FROM scoped_month) AS "totalThisMonth",
        (SELECT COUNT(*)::int FROM scoped_all WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS processing,
        (SELECT COUNT(*)::int FROM scoped_month WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS "pendingThisMonth",
        (SELECT COUNT(*)::int FROM scoped_all WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS "pendingTotal",
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'void' OR void_at IS NOT NULL)::int AS voided
      FROM scoped_month
      `,
      [scope, scope === 'owner' ? value : null, scope === 'department' ? value : [], this.toMonthStart(month), [...PHASE1_VISIBLE_DISPATCH_MODULE_CODES]],
    ) as DashboardCardsRow[];
    return this.toCardsWithoutMessages(rows[0]);
  }

  private async queryDispatchedOrderCards(user: JwtUserPayload, month: string, scope?: BackendDashboardScope): Promise<Omit<DashboardCardsDto, 'myMessages'>> {
    const backendScope = scope ?? await this.resolveBackendDashboardScope(user);
    const moduleCodes = this.filterModulesByRoleAllowList(user.roles, backendScope.modules);
    if (moduleCodes.length === 0) return this.emptyCards();

    const rows = (await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          $2::timestamp AS cur_start,
          ($2::timestamp + interval '1 month') AS cur_end
      ), accessible_modules AS (
        SELECT module_code FROM module_handlers WHERE handler_id = $1::uuid AND is_active = true AND module_code = ANY($3::text[])
        UNION
        SELECT module_code FROM module_supervisors WHERE supervisor_id = $1::uuid AND is_active = true AND module_code = ANY($3::text[])
      ), current_role_scope AS (
        SELECT COALESCE(bool_or(r.level IN ('supervisor','management','global')), false) AS can_view_module_all
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1::uuid
      ), scoped_all AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN work_orders wo ON wo.id = d.parent_order_id
          CROSS JOIN current_role_scope rs
         WHERE wo.order_type::text IN ('onboarding','resignation')
           AND d.module_code = ANY($3::text[])
           AND (
             d.handler_id = $1::uuid
             OR (d.handler_id IS NULL AND d.module_code IN (SELECT module_code FROM accessible_modules))
             OR (rs.can_view_module_all = true AND d.module_code IN (SELECT module_code FROM accessible_modules))
           )
      ), scoped_month AS (
        SELECT d.*
          FROM scoped_all d, bounds b
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
      )
      SELECT
        (SELECT COUNT(*)::int FROM scoped_month) AS "totalThisMonth",
        (SELECT COUNT(*)::int FROM scoped_all WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS processing,
        (SELECT COUNT(*)::int FROM scoped_month WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS "pendingThisMonth",
        (SELECT COUNT(*)::int FROM scoped_all WHERE status::text NOT IN ('completed','void','withdrawn') AND void_at IS NULL) AS "pendingTotal",
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'void' OR void_at IS NOT NULL)::int AS voided
      FROM scoped_month
      `,
      [user.sub, this.toMonthStart(month), moduleCodes],
    ) ?? []) as DashboardCardsRow[];
    return this.toCardsWithoutMessages(rows[0]);
  }

  private toCardsWithoutMessages(row?: DashboardCardsRow): Omit<DashboardCardsDto, 'myMessages'> {
    const totalThisMonth = Number(row?.totalThisMonth ?? 0);
    const completed = Number(row?.completed ?? 0);
    const voided = Number(row?.voided ?? row?.voidCount ?? row?.void_count ?? 0);
    const pendingTotal = Number(row?.pendingTotal ?? row?.pending_total ?? row?.totalPending ?? row?.total_pending ?? row?.processing ?? 0);
    const pendingThisMonth = Number(row?.pendingThisMonth ?? row?.pending_this_month ?? row?.monthPending ?? row?.month_pending ?? row?.processing ?? 0);
    const completionRate = this.calculateCompletionRate(completed, totalThisMonth, voided);
    return {
      totalThisMonth,
      processing: pendingTotal,
      pendingTotal,
      pending_total: pendingTotal,
      totalPending: pendingTotal,
      total_pending: pendingTotal,
      pendingThisMonth,
      pending_this_month: pendingThisMonth,
      monthPending: pendingThisMonth,
      month_pending: pendingThisMonth,
      completed,
      completionRate,
      completion_rate: completionRate,
      voided,
      voidCount: voided,
      void_count: voided,
    };
  }

  private calculateCompletionRate(completed: number, total: number, voided: number): number {
    const denominator = total - voided;
    if (denominator <= 0) return 0;
    return Number(((completed / denominator) * 100).toFixed(1));
  }

  private resolveDashboardMonth(month?: string): string {
    if (month && DASHBOARD_MONTH_PATTERN.test(month)) return month;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const monthPart = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${monthPart}`;
  }

  private toMonthStart(month: string): string {
    return `${month}-01 00:00:00`;
  }

  private async resolveDepartmentScope(
    user: JwtUserPayload,
  ): Promise<{ departmentIds: string[] | null; empty: boolean }> {
    if (await this.canViewAllWorkOrders(user)) {
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

  private async canViewAllWorkOrders(user: JwtUserPayload): Promise<boolean> {
    if (this.isGlobalBusinessOverview(user)) return true;
    return this.roleActionPermissionService?.hasAnyRoleAction(user.roles, 'work_order.view_all') ?? false;
  }

  private isBackendHandler(user: JwtUserPayload): boolean {
    return hasAnyRole(user.roles, BACKEND_HANDLER_ROLES) || user.roles.some((role) => role.endsWith('_supervisor'));
  }

  private async canViewBackendModuleAll(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (await this.canViewAllWorkOrders(user) || hasManagementScopeRole(user.roles)) return true;
    if (!hasModuleSupervisorRole(user.roles) && !user.roles.some((role) => role.endsWith('_supervisor'))) return false;
    return this.hasModuleAccess(user.sub, moduleCode, user.roles);
  }

  private async resolveBackendDashboardScope(user: JwtUserPayload): Promise<BackendDashboardScope> {
    const modules = await this.getAccessibleModules(user.sub, user.roles);
    const includeModuleAll = await this.canViewAllWorkOrders(user)
      || hasManagementScopeRole(user.roles)
      || hasModuleSupervisorRole(user.roles)
      || await this.hasSupervisorLevel(user.sub);
    return { modules: this.filterModulesByRoleAllowList(user.roles, modules), includeModuleAll };
  }

  private async getAccessibleModules(userId: string, roles: readonly string[] = []): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
      SELECT module_code FROM module_handlers WHERE handler_id = $1 AND is_active = true
      UNION
      SELECT module_code FROM module_supervisors WHERE supervisor_id = $1 AND is_active = true
      `,
      [userId],
    ) as Array<{ module_code: string }>;
    return this.filterModulesByRoleAllowList(roles, filterPhase1VisibleDispatchModules([
      ...rows.map((row) => row.module_code).filter(Boolean),
      ...this.roleAccessibleModules(roles),
    ]));
  }

  private roleAccessibleModules(roles: readonly string[]): string[] {
    const modules: string[] = [];
    if (this.hasSharedTeamRole(roles)) modules.push(...this.sharedTeamModuleCodes());
    else {
      if (hasAnyRole(roles, ['contract_specialist', 'labor_contract_member', 'contract_team'])) modules.push('contract');
      if (hasAnyRole(roles, ['onboarding_specialist', 'onboarding_resignation_member', 'onboarding_team'])) modules.push('onboarding_contact', 'resignation_contact');
    }
    if (hasAnyRole(roles, ['data_entry_leader', 'data_entry_team', 'data_entry_supervisor', 'data_entry_specialist'])) modules.push('data_entry', 'data_entry_resign');
    if (hasAnyRole(roles, ['social_insurance_specialist', 'social_insurance_team', 'social_insurance_supervisor', 'social_security_supervisor'])) modules.push('social_insurance', 'resignation_social_insurance');
    return filterPhase1VisibleDispatchModules(modules);
  }

  private filterModulesByRoleAllowList(roles: readonly string[], moduleCodes: string[]): string[] {
    if (roles.includes('admin') || hasAnyRole(roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(roles, BUSINESS_LEADER_ROLES)) {
      return filterPhase1VisibleDispatchModules(moduleCodes);
    }
    const allowed = new Set(this.roleAccessibleModules(roles));
    if (allowed.size === 0) return filterPhase1VisibleDispatchModules(moduleCodes);
    return filterPhase1VisibleDispatchModules(moduleCodes).filter((moduleCode) => allowed.has(moduleCode));
  }

  private hasSharedTeamRole(roles: readonly string[]): boolean {
    return hasAnyRole(roles, ['shared_leader', 'shared_team_owner']);
  }

  private sharedTeamModuleCodes(): string[] {
    return ['contract', 'onboarding_contact', 'resignation_contact'];
  }

  private async hasModuleAccess(userId: string, moduleCode: string, roles: readonly string[] = []): Promise<boolean> {
    if (roles.length > 0 && !this.filterModulesByRoleAllowList(roles, [moduleCode]).includes(moduleCode)) return false;
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


  private async hasSupervisorLevel(userId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `
      SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
         AND r.level IN ('supervisor','management','global')
       LIMIT 1
      `,
      [userId],
    ) ?? []) as Array<{ '?column?'?: number }>;
    return rows.length > 0;
  }

  private emptyCards(): Omit<DashboardCardsDto, 'myMessages'> {
    return { totalThisMonth: 0, processing: 0, pendingTotal: 0, pending_total: 0, totalPending: 0, total_pending: 0, pendingThisMonth: 0, pending_this_month: 0, monthPending: 0, month_pending: 0, completed: 0, completionRate: 0, completion_rate: 0, voided: 0, voidCount: 0, void_count: 0 };
  }

  private emptySalesperson(): Record<string, unknown> {
    return { current: { created: 0, submitted: 0, completed: 0, returned: 0, withdrawn: 0 }, previous: { created: 0, submitted: 0, completed: 0 }, deltaPct: { submitted: null, completed: null }, trend: [] };
  }

  private emptyTeam(moduleCode: string, hidden = false): Record<string, unknown> {
    return hidden
      ? { moduleCode, hidden: true, counts: null, pool: null, top5: [], members: [] }
      : { moduleCode, counts: { pending: 0, processing: 0, completed: 0, returned: 0, voided: 0, slaBreach: 0 }, pool: { poolPending: 0 }, top5: [], members: [] };
  }

  private emptyManager(): Record<string, unknown> {
    return { modules: [], topCustomers: [], ratios: { totalSubmitted: 0, returnRatio: null, withdrawRatio: null, avgCloseHours: null }, trend: [] };
  }

  async getOrderTypeMatrix(user: JwtUserPayload, dimension: 'orderType' | 'node' = 'orderType', requestedScope?: 'mine' | 'team', month?: string): Promise<unknown> {
    const selectedMonth = this.resolveDashboardMonth(month);
    if (dimension === 'node' && this.isBackendHandler(user) && !this.isGlobalBusinessOverview(user)) {
      const backendScope = await this.resolveBackendDashboardScope(user);
      return { rows: await this.queryBackendNodeMatrixRows(user, selectedMonth, backendScope) };
    }

    const scope = await this.resolveDashboardScope(user, requestedScope);
    if (scope.empty) {
      return { rows: [] };
    }

    const hasScopeFilter = scope.departmentIds !== null || scope.ownerId !== null;
    const params: unknown[] = [
      hasScopeFilter,
      scope.departmentIds ?? [],
      scope.ownerId ?? null,
      this.toMonthStart(selectedMonth),
      [...PHASE1_VISIBLE_DISPATCH_MODULE_CODES],
    ];

    if (dimension === 'node') {
      if (this.isBackendHandler(user) && !this.isGlobalBusinessOverview(user)) {
        const backendScope = await this.resolveBackendDashboardScope(user);
        return { rows: await this.queryBackendNodeMatrixRows(user, selectedMonth, backendScope) };
      }
      return { rows: await this.queryNodeMatrixRows(params, selectedMonth) };
    }

    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          $4::timestamp AS cur_start,
          ($4::timestamp + interval '1 month') AS cur_end
      ),
      order_types AS (
        SELECT * FROM (VALUES
          ('onboarding', '入职工单', 1),
          ('resignation', '离职工单', 2)
        ) AS t(order_type, label, sort_order)
      ),
      scoped_wo AS (
        SELECT wo.*
          FROM work_orders wo
         WHERE wo.status::text <> 'draft'
           AND wo.order_type::text IN ('onboarding','resignation')
           AND ($1::boolean = false
             OR ($2::uuid[] IS NOT NULL AND array_length($2::uuid[], 1) > 0 AND wo.department_id = ANY($2::uuid[]))
             OR ($3::uuid IS NOT NULL AND wo.created_by = $3::uuid))
      ), scoped_do AS (
        SELECT d.*, wo.order_type
          FROM dispatched_orders d
          JOIN scoped_wo wo ON wo.id = d.parent_order_id
          CROSS JOIN bounds b
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND d.module_code = ANY($5::text[])
      )
      SELECT
        ot.order_type AS "orderType",
        ot.label,
        COALESCE(COUNT(d.id), 0)::int AS total,
        COALESCE(COUNT(d.id) FILTER (WHERE d.status::text NOT IN ('completed','void') AND d.void_at IS NULL), 0)::int AS processing,
        COALESCE(COUNT(d.id) FILTER (WHERE d.status::text = 'completed'), 0)::int AS completed,
        COALESCE(COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL), 0)::int AS voided,
        CASE
          WHEN (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)) <= 0 THEN 0
          ELSE ROUND(
            COUNT(d.id) FILTER (WHERE d.status::text = 'completed')::numeric * 100
            / (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)),
            1
          )
        END AS "completionRate"
      FROM order_types ot
      LEFT JOIN scoped_do d ON d.order_type::text = ot.order_type
      GROUP BY ot.order_type, ot.label, ot.sort_order
      ORDER BY ot.sort_order
      `,
      params,
    );

    return { rows };
  }

  private async queryBackendNodeMatrixRows(user: JwtUserPayload, month: string, scope?: BackendDashboardScope): Promise<Array<Record<string, unknown>>> {
    const backendScope = scope ?? await this.resolveBackendDashboardScope(user);
    const moduleCodes = this.filterModulesByRoleAllowList(user.roles, backendScope.modules);
    if (moduleCodes.length === 0) return [];

    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          $2::timestamp AS cur_start,
          ($2::timestamp + interval '1 month') AS cur_end
      ), accessible_modules AS (
        SELECT module_code FROM module_handlers WHERE handler_id = $1::uuid AND is_active = true AND module_code = ANY($3::text[])
        UNION
        SELECT module_code FROM module_supervisors WHERE supervisor_id = $1::uuid AND is_active = true AND module_code = ANY($3::text[])
      ), current_role_scope AS (
        SELECT COALESCE(bool_or(r.level IN ('supervisor','management','global')), false) AS can_view_module_all
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1::uuid
      ), scoped_do AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN work_orders wo ON wo.id = d.parent_order_id
          CROSS JOIN bounds b
          CROSS JOIN current_role_scope rs
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND wo.order_type::text IN ('onboarding','resignation')
           AND d.module_code = ANY($3::text[])
           AND (
             d.handler_id = $1::uuid
             OR (d.handler_id IS NULL AND d.module_code IN (SELECT module_code FROM accessible_modules))
             OR (rs.can_view_module_all = true AND d.module_code IN (SELECT module_code FROM accessible_modules))
           )
      )
      SELECT
        d.module_code AS "moduleCode",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status::text NOT IN ('completed','void') AND d.void_at IS NULL)::int AS processing,
        COUNT(*) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)::int AS voided,
        CASE
          WHEN (COUNT(*) - COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)) <= 0 THEN 0
          ELSE ROUND(
            COUNT(*) FILTER (WHERE d.status::text = 'completed')::numeric * 100
            / (COUNT(*) - COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)),
            1
          )
        END AS "completionRate"
      FROM scoped_do d
      GROUP BY d.module_code
      ORDER BY d.module_code
      `,
      [user.sub, this.toMonthStart(month), moduleCodes],
    ) as Array<Record<string, unknown> & { moduleCode: string }>;

    return rows.map((row) => ({
      ...row,
      label: DISPATCH_MODULE_LABELS[row.moduleCode] ?? row.moduleCode,
    }));
  }

  private async queryNodeMatrixRows(params: unknown[], month: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.dataSource.query(
      `
      WITH bounds AS (
        SELECT
          $4::timestamp AS cur_start,
          ($4::timestamp + interval '1 month') AS cur_end
      ),
      scoped_wo AS (
        SELECT wo.*
          FROM work_orders wo
         WHERE wo.status <> 'draft'
           AND wo.order_type::text IN ('onboarding','resignation')
           AND ($1::boolean = false
             OR ($2::uuid[] IS NOT NULL AND array_length($2::uuid[], 1) > 0 AND wo.department_id = ANY($2::uuid[]))
             OR ($3::uuid IS NOT NULL AND wo.created_by = $3::uuid))
      ),
      scoped_do AS (
        SELECT d.*
          FROM dispatched_orders d
          JOIN scoped_wo wo ON wo.id = d.parent_order_id
          CROSS JOIN bounds b
         WHERE COALESCE(d.dispatched_at, d.created_at) >= b.cur_start
           AND COALESCE(d.dispatched_at, d.created_at) < b.cur_end
           AND d.module_code = ANY($5::text[])
      )
      SELECT
        d.module_code AS "moduleCode",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status::text NOT IN ('completed','void') AND d.void_at IS NULL)::int AS processing,
        COUNT(*) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)::int AS voided,
        CASE
          WHEN (COUNT(*) - COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)) <= 0 THEN 0
          ELSE ROUND(
            COUNT(*) FILTER (WHERE d.status::text = 'completed')::numeric * 100
            / (COUNT(*) - COUNT(*) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)),
            1
          )
        END AS "completionRate"
      FROM scoped_do d
      GROUP BY d.module_code
      ORDER BY d.module_code
      `,
      [...params.slice(0, 3), this.toMonthStart(month), params[4]],
    ) as Array<Record<string, unknown> & { moduleCode: string }>;

    return rows.map((row) => ({
      ...row,
      label: DISPATCH_MODULE_LABELS[row.moduleCode] ?? row.moduleCode,
    }));
  }

  async getLeaderTrend(orderType: string, user: JwtUserPayload, moduleCode?: string, requestedScope?: 'mine' | 'team', month?: string): Promise<unknown> {
    const normalizedOrderType = this.normalizeLeaderTrendOrderType(orderType);
    const resolvedModuleFilter = resolveDispatchModuleCode(moduleCode) ?? null;
    const moduleFilter = resolvedModuleFilter && isPhase1VisibleDispatchModule(resolvedModuleFilter) ? resolvedModuleFilter : null;
    const selectedMonth = this.resolveDashboardMonth(month);

    if (!['onboarding', 'resignation'].includes(normalizedOrderType)) {
      return this.emptyLeaderTrend(normalizedOrderType, moduleFilter, selectedMonth);
    }

    try {
      const scope = await this.resolveDashboardScope(user, requestedScope);
      if (!scope.empty) {
        const rows = await this.queryLeaderTrendByDashboardScope(normalizedOrderType, scope, moduleFilter, selectedMonth);
        return { orderType: normalizedOrderType, moduleCode: moduleFilter, buckets: this.normalizeLeaderTrendBuckets(rows) };
      }

      if (this.isBackendHandler(user)) {
        const backendScope = await this.resolveBackendDashboardScope(user);
        const rows = await this.queryLeaderTrendByBackendScope(normalizedOrderType, user, backendScope, moduleFilter, selectedMonth);
        return { orderType: normalizedOrderType, moduleCode: moduleFilter, buckets: this.normalizeLeaderTrendBuckets(rows) };
      }

      return this.emptyLeaderTrend(normalizedOrderType, moduleFilter, selectedMonth);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`leader-trend fallback: ${message}`);
      return this.emptyLeaderTrend(normalizedOrderType, moduleFilter, selectedMonth);
    }
  }

  private async queryLeaderTrendByDashboardScope(
    orderType: string,
    scope: { departmentIds: string[] | null; ownerId: string | null; empty: boolean },
    moduleFilter: string | null,
    month: string,
  ): Promise<Array<Record<string, unknown>>> {
    const hasScopeFilter = scope.departmentIds !== null || scope.ownerId !== null;
    const params: unknown[] = [
      orderType,
      hasScopeFilter,
      scope.departmentIds ?? [],
      scope.ownerId ?? null,
      moduleFilter,
      this.toMonthStart(month),
      [...PHASE1_VISIBLE_DISPATCH_MODULE_CODES],
    ];

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL statement_timeout = $1', [LEADER_TREND_STATEMENT_TIMEOUT_MS]);
      return manager.query(
        `
      WITH selected_month AS (
        SELECT $6::timestamp AS month_start
      ), months AS (
        SELECT generate_series(
          (SELECT month_start FROM selected_month) - interval '11 months',
          (SELECT month_start FROM selected_month),
          interval '1 month'
        ) AS month_start
      ),
      scoped_wo AS (
        SELECT wo.*
        FROM work_orders wo
        WHERE wo.order_type::text = $1
          AND wo.status::text <> 'draft'
          AND ($2::boolean = false
            OR ($3::uuid[] IS NOT NULL AND array_length($3::uuid[], 1) > 0 AND wo.department_id = ANY($3::uuid[]))
            OR ($4::uuid IS NOT NULL AND wo.created_by = $4::uuid))
      ),
      scoped_do AS (
        SELECT
          d.*,
          date_trunc('month', COALESCE(d.dispatched_at, d.created_at) AT TIME ZONE 'Asia/Shanghai') AS bucket_month
        FROM dispatched_orders d
        JOIN scoped_wo wo ON wo.id = d.parent_order_id
        WHERE COALESCE(d.dispatched_at, d.created_at) >= (SELECT MIN(month_start) FROM months)
          AND d.module_code = ANY($7::text[])
          AND ($5::text IS NULL OR d.module_code = $5::text)
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        COUNT(d.id)::int AS total,
        COUNT(d.id) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)::int AS voided,
        CASE
          WHEN (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)) <= 0 THEN 0
          ELSE ROUND(
            COUNT(d.id) FILTER (WHERE d.status::text = 'completed')::numeric * 100
            / (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)),
            1
          )
        END AS rate
      FROM months m
      LEFT JOIN scoped_do d ON d.bucket_month = m.month_start
      GROUP BY m.month_start
      ORDER BY m.month_start
      `,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    });
  }

  private async queryLeaderTrendByBackendScope(
    orderType: string,
    user: JwtUserPayload,
    scope: BackendDashboardScope,
    moduleFilter: string | null,
    month: string,
  ): Promise<Array<Record<string, unknown>>> {
    const visibleScopeModules = filterPhase1VisibleDispatchModules(scope.modules);
    const moduleCodes = moduleFilter
      ? (visibleScopeModules.includes(moduleFilter) ? [moduleFilter] : [])
      : visibleScopeModules;
    const params: unknown[] = [
      orderType,
      scope.includeModuleAll,
      user.sub,
      moduleFilter,
      moduleCodes,
      this.toMonthStart(month),
    ];

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL statement_timeout = $1', [LEADER_TREND_STATEMENT_TIMEOUT_MS]);
      return manager.query(
        `
      WITH selected_month AS (
        SELECT $6::timestamp AS month_start
      ), months AS (
        SELECT generate_series(
          (SELECT month_start FROM selected_month) - interval '11 months',
          (SELECT month_start FROM selected_month),
          interval '1 month'
        ) AS month_start
      ),
      scoped_do AS (
        SELECT
          d.*,
          date_trunc('month', COALESCE(d.dispatched_at, d.created_at) AT TIME ZONE 'Asia/Shanghai') AS bucket_month
        FROM dispatched_orders d
        JOIN work_orders wo ON wo.id = d.parent_order_id
        WHERE wo.order_type::text = $1
          AND wo.status::text <> 'draft'
          AND COALESCE(d.dispatched_at, d.created_at) >= (SELECT MIN(month_start) FROM months)
          AND ($4::text IS NULL OR d.module_code = $4::text)
          AND (
            d.handler_id = $3::uuid
            OR (array_length($5::text[], 1) > 0 AND d.handler_id IS NULL AND d.module_code = ANY($5::text[]))
            OR ($2::boolean = true AND array_length($5::text[], 1) > 0 AND d.module_code = ANY($5::text[]))
          )
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        COUNT(d.id)::int AS total,
        COUNT(d.id) FILTER (WHERE d.status::text = 'completed')::int AS completed,
        COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)::int AS voided,
        CASE
          WHEN (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)) <= 0 THEN 0
          ELSE ROUND(
            COUNT(d.id) FILTER (WHERE d.status::text = 'completed')::numeric * 100
            / (COUNT(d.id) - COUNT(d.id) FILTER (WHERE d.status::text = 'void' OR d.void_at IS NOT NULL)),
            1
          )
        END AS rate
      FROM months m
      LEFT JOIN scoped_do d ON d.bucket_month = m.month_start
      GROUP BY m.month_start
      ORDER BY m.month_start
      `,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    });
  }

  private normalizeLeaderTrendOrderType(orderType: string): string {
    const normalized = String(orderType || '').trim();
    return normalized.length > 0 ? normalized : 'onboarding';
  }

  private normalizeLeaderTrendBuckets(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    if (!rows.length) {
      return this.emptyLeaderTrendBuckets();
    }

    return rows.map((row) => {
      const total = Number(row.total ?? 0);
      const completed = Number(row.completed ?? 0);
      const voided = Number(row.voided ?? 0);
      const rate = row.rate === null || row.rate === undefined
        ? this.calculateCompletionRate(completed, total, voided)
        : Number(row.rate);
      return {
        month: String(row.month ?? ''),
        total,
        completed,
        voided,
        rate,
      };
    });
  }

  private emptyLeaderTrend(orderType: string, moduleCode: string | null, month?: string): Record<string, unknown> {
    return { orderType, moduleCode, buckets: this.emptyLeaderTrendBuckets(month) };
  }

  private emptyLeaderTrendBuckets(month?: string): Array<Record<string, unknown>> {
    const selectedMonth = this.resolveDashboardMonth(month);
    const [year, monthNumber] = selectedMonth.split('-').map(Number);
    const currentMonth = new Date(year, monthNumber - 1, 1);
    return Array.from({ length: 12 }, (_, index) => {
      const bucket = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11 + index, 1);
      return {
        month: `${bucket.getFullYear()}-${String(bucket.getMonth() + 1).padStart(2, '0')}`,
        total: 0,
        completed: 0,
        voided: 0,
        rate: 0,
      };
    });
  }

  private async resolveDashboardScope(
    user: JwtUserPayload,
    requestedScope?: 'mine' | 'team',
  ): Promise<{ departmentIds: string[] | null; ownerId: string | null; empty: boolean }> {
    if (requestedScope === 'mine') {
      return { departmentIds: null, ownerId: user.sub, empty: false };
    }
    if (requestedScope === 'team' && (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES))) {
      const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.length === 0) {
        return { departmentIds: [], ownerId: null, empty: true };
      }
      return { departmentIds, ownerId: null, empty: false };
    }
    if (await this.canViewAllWorkOrders(user)) {
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
