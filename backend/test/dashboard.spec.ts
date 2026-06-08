import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { DashboardController } from 'src/modules/dashboard/dashboard.controller';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';

describe('DashboardService', () => {
  const validationStub = { resolveUserDepartmentIds: jest.fn(async () => ['dept-1']) } as never;
  const zeroVoided = { voided: 0, voidCount: 0, void_count: 0 };
  const zeroPending = { pendingTotal: 0, pending_total: 0, totalPending: 0, total_pending: 0, pendingThisMonth: 0, pending_this_month: 0, monthPending: 0, month_pending: 0 };
  const pendingFields = (value: number) => ({ pendingTotal: value, pending_total: value, totalPending: value, total_pending: value, pendingThisMonth: value, pending_this_month: value, monthPending: value, month_pending: value });
  const phase1Modules = expect.arrayContaining([
    'onboarding_contact',
    'contract',
    'data_entry',
    'social_insurance',
    'resignation_contact',
    'data_entry_resign',
    'resignation_social_insurance',
  ]);
  const rateFields = (completionRate: number) => ({ completionRate, completion_rate: completionRate });
  const dataSourceWithTransaction = (rows: unknown[] = []) => {
    const query = jest.fn(async () => rows);
    return {
      query,
      transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })),
    };
  };

  it('returns dashboard cards for admin with global work order scope', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: 8 }])
      .mockResolvedValueOnce([{ totalThisMonth: 45, processing: 12, completed: 30 }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getDashboardCards({ sub: 'admin-1', roles: ['admin'] } as never);

    expect(result).toEqual({ totalThisMonth: 45, processing: 12, ...pendingFields(12), completed: 30, ...rateFields(66.7), ...zeroVoided, myMessages: 8, scope: 'global' });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining('notifications'), ['admin-1']);
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM dispatched_orders'), [null, null, [], expect.any(String), phase1Modules]);
    expect(dataSource.query.mock.calls[1][0]).toContain("- COUNT(*) FILTER (WHERE status::text = 'completed')");
    expect(dataSource.query.mock.calls[1][0]).toContain("- COUNT(*) FILTER (WHERE status::text IN ('void','voided') OR void_at IS NOT NULL)");
    expect(dataSource.query.mock.calls[1][0]).not.toContain("- COUNT(*) FILTER (WHERE status::text IN ('withdraw_pending','withdrawn') AND void_at IS NULL)");
    expect(dataSource.query.mock.calls[1][0]).toContain('AS voided');
  });

  it('returns dashboard cards for salesperson with owner work order scope', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([{ totalThisMonth: '5', processing: '3', completed: '1' }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getDashboardCards({ sub: 'sales-1', roles: ['salesperson'] } as never);

    expect(result).toEqual({ totalThisMonth: 5, processing: 3, ...pendingFields(3), completed: 1, ...rateFields(20), ...zeroVoided, myMessages: 2, scope: 'mine' });
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('wo.created_by = $2::uuid'), ['owner', 'sales-1', [], expect.any(String), phase1Modules]);
  });

  it('returns dashboard cards for business leader with personal scope by default', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ totalThisMonth: 9, processing: 4, completed: 5 }]) };
    const resolve = jest.fn(async () => ['dept-a', 'dept-b']);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    const result = await service.getDashboardCards({ sub: 'leader-1', roles: ['biz_leader'] } as never);

    expect(resolve).not.toHaveBeenCalled();
    expect(result).toEqual({ totalThisMonth: 9, processing: 4, ...pendingFields(4), completed: 5, ...rateFields(55.6), ...zeroVoided, myMessages: 1, scope: 'mine' });
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('wo.created_by = $2::uuid'), ['owner', 'leader-1', [], expect.any(String), phase1Modules]);
  });

  it('returns dashboard cards for business leader with department scope only when team scope is requested', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ totalThisMonth: 9, processing: 4, completed: 5 }]) };
    const resolve = jest.fn(async () => ['dept-a', 'dept-b']);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    const result = await service.getDashboardCards({ sub: 'leader-1', roles: ['biz_leader'] } as never, 'team');

    expect(resolve).toHaveBeenCalledWith('leader-1');
    expect(result).toEqual({ totalThisMonth: 9, processing: 4, ...pendingFields(4), completed: 5, ...rateFields(55.6), ...zeroVoided, myMessages: 1, scope: 'team' });
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('wo.department_id = ANY($3::uuid[])'), ['department', null, ['dept-a', 'dept-b'], expect.any(String), phase1Modules]);
  });

  it('returns dashboard cards for business manager with global work order scope', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ totalThisMonth: 30, processing: 8, completed: 20 }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getDashboardCards({ sub: 'manager-1', roles: ['business_owner'] } as never);

    expect(result).toEqual({ totalThisMonth: 30, processing: 8, ...pendingFields(8), completed: 20, ...rateFields(66.7), ...zeroVoided, myMessages: 3, scope: 'global' });
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM dispatched_orders'), [null, null, [], expect.any(String), phase1Modules]);
  });

  it('returns dashboard cards for backend handler with dispatched order scope', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('notifications')) return [{ count: 4 }];
      if (sql.includes('scoped_all AS (')) return [{ totalThisMonth: 7, processing: 2, completed: 5 }];
      if (sql.includes('SELECT module_code FROM module_handlers') && !sql.includes('scoped_all AS (')) return [{ module_code: 'contract' }];
      if (sql.includes("FROM user_roles ur") && sql.includes("r.level IN ('supervisor','management','global')")) return [];
      return [];
    });
    const service = new DashboardService({ query, transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })) } as never, validationStub);

    const result = await service.getDashboardCards({ sub: 'handler-1', roles: ['contract_specialist'] } as never);

    expect(result).toEqual({ totalThisMonth: 7, processing: 2, ...pendingFields(2), completed: 5, ...rateFields(71.4), ...zeroVoided, myMessages: 4, scope: 'backend_module' });
    const cardsCall = (query.mock.calls as unknown[][]).find(([sql]) => String(sql).includes('FROM dispatched_orders'));
    expect(cardsCall).toBeDefined();
    expect(cardsCall![1]).toEqual(['handler-1', expect.any(String), ['contract']]);
    expect(String(cardsCall![0])).toContain("- COUNT(*) FILTER (WHERE status::text = 'completed')");
    expect(String(cardsCall![0])).toContain("- COUNT(*) FILTER (WHERE status::text IN ('void','voided') OR void_at IS NOT NULL)");
    expect(String(cardsCall![0])).not.toContain("- COUNT(*) FILTER (WHERE status::text IN ('withdraw_pending','withdrawn') AND void_at IS NULL)");
    expect(String(cardsCall![0])).toContain('AS voided');
  });

  it('calculates dashboard card completion rate with voided orders excluded from denominator', async () => {
    const cases = [
      { totalThisMonth: 100, completed: 98, voided: 2, expected: 100 },
      { totalThisMonth: 100, completed: 97, voided: 2, expected: 99 },
      { totalThisMonth: 2, completed: 0, voided: 2, expected: 0 },
      { totalThisMonth: 0, completed: 0, voided: 0, expected: 0 },
    ];

    for (const item of cases) {
      const dataSource = { query: jest.fn()
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ totalThisMonth: item.totalThisMonth, processing: 0, completed: item.completed, voided: item.voided }]) };
      const service = new DashboardService(dataSource as never, validationStub);

      const result = await service.getDashboardCards({ sub: 'admin-1', roles: ['admin'] } as never);

      expect(result).toMatchObject({
        totalThisMonth: item.totalThisMonth,
        completed: item.completed,
        voided: item.voided,
        voidCount: item.voided,
        void_count: item.voided,
        completionRate: item.expected,
        completion_rate: item.expected,
      });
    }
  });

  it('keeps matrix and leader-trend SQL rates on completed over total minus voided', async () => {
    const dataSource = { query: jest.fn(async () => []) };
    const service = new DashboardService(dataSource as never, validationStub);

    await service.getOrderTypeMatrix({ sub: 'admin-1', roles: ['admin'] } as never);
    await service.getOrderTypeMatrix({ sub: 'admin-1', roles: ['admin'] } as never, 'node');
    await service.getLeaderTrend('onboarding', { sub: 'admin-1', roles: ['admin'] } as never);

    const sqlText = (dataSource.query.mock.calls as unknown[][]).map((call) => String(call[0])).join('\n');
    expect(sqlText).toContain('AS voided');
    expect(sqlText).toContain("COUNT(d.id)");
    expect(sqlText).toContain("COUNT(*)");
    expect(sqlText).toContain("- COUNT(d.id) FILTER (WHERE d.status::text IN ('void','voided') OR d.void_at IS NOT NULL)");
    expect(sqlText).toContain("- COUNT(*) FILTER (WHERE d.status::text IN ('void','voided') OR d.void_at IS NOT NULL)");
    expect(sqlText).not.toContain("completed')::numeric * 100 / COUNT(d.id)");
    expect(sqlText).not.toContain("completed')::numeric * 100 / COUNT(*)");
  });

  it('exposes totalPending/monthPending aliases for dashboard cards', async () => {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ totalThisMonth: 6, pendingTotal: 5, pendingThisMonth: 2, completed: 1, voided: 0 }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getDashboardCards({ sub: 'admin-1', roles: ['admin'] } as never);

    expect(result).toMatchObject({
      processing: 5,
      pendingTotal: 5,
      pending_total: 5,
      totalPending: 5,
      total_pending: 5,
      pendingThisMonth: 2,
      pending_this_month: 2,
      monthPending: 2,
      month_pending: 2,
    });
  });

  it('normalizes leader trend fallback rates with voided orders excluded from denominator', async () => {
    const dataSource = dataSourceWithTransaction([
      { month: '2026-01', total: 100, completed: 98, voided: 2 },
      { month: '2026-02', total: 100, completed: 97, voided: 2 },
      { month: '2026-03', total: 2, completed: 0, voided: 2 },
      { month: '2026-04', total: 0, completed: 0, voided: 0 },
    ]);
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getLeaderTrend('onboarding', { sub: 'admin-1', roles: ['admin'] } as never);

    expect(result).toEqual({
      orderType: 'onboarding',
      moduleCode: null,
      buckets: [
        { month: '2026-01', total: 100, completed: 98, voided: 2, rate: 100 },
        { month: '2026-02', total: 100, completed: 97, voided: 2, rate: 99 },
        { month: '2026-03', total: 2, completed: 0, voided: 2, rate: 0 },
        { month: '2026-04', total: 0, completed: 0, voided: 0, rate: 0 },
      ],
    });
  });

  it('returns empty dashboard cards when business leader requests team scope but has no departments', async () => {
    const dataSource = { query: jest.fn().mockResolvedValueOnce([{ count: 6 }]) };
    const resolve = jest.fn(async () => []);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    await expect(service.getDashboardCards({ sub: 'leader-2', roles: ['business_group_leader'] } as never, 'team'))
      .resolves.toEqual({ totalThisMonth: 0, processing: 0, ...zeroPending, completed: 0, ...rateFields(0), ...zeroVoided, myMessages: 6, scope: 'team' });
    expect(resolve).toHaveBeenCalledWith('leader-2');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('returns salesperson payload from SQL baseline', async () => {
    const dataSource = { query: jest.fn(async () => [{ payload: { current: { submitted: 3 }, trend: [] } }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getSalespersonMetrics('user-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('work_orders'), ['user-1']);
    expect(result).toEqual({ current: { submitted: 3 }, trend: [] });
  });

  it('scopes team dashboard by module and current user for processors', async () => {
    const dataSource = { query: jest.fn(async () => [{ payload: { moduleCode: 'data_entry', counts: { pending: 1 } } }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    await service.getTeamMetrics('data_entry', { sub: 'handler-1', roles: ['data_entry_team'] } as never);

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('module_handlers'), ['data_entry', false, 'handler-1']);
  });

  it('returns empty manager metrics when SQL has no payload (admin scope)', async () => {
    const dataSource = { query: jest.fn(async () => []) };
    const service = new DashboardService(dataSource as never, validationStub);

    await expect(
      service.getManagerMetrics({ sub: 'admin-1', roles: ['admin'] } as never),
    ).resolves.toMatchObject({ modules: [], topCustomers: [] });
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [false, [], phase1Modules]);
  });

  it('restricts manager metrics to leader department ids', async () => {
    const dataSource = { query: jest.fn(async () => [{ payload: { modules: [], topCustomers: [], ratios: {}, trend: [] } }]) };
    const resolve = jest.fn(async () => ['dept-a', 'dept-b']);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    await service.getManagerMetrics({ sub: 'leader-1', roles: ['biz_leader'] } as never);

    expect(resolve).toHaveBeenCalledWith('leader-1');
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('scoped_wo'), [true, ['dept-a', 'dept-b'], phase1Modules]);
  });

  it('returns empty manager metrics when leader has no departments', async () => {
    const dataSource = { query: jest.fn() };
    const resolve = jest.fn(async () => []);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    await expect(
      service.getManagerMetrics({ sub: 'leader-2', roles: ['biz_leader'] } as never),
    ).resolves.toMatchObject({ modules: [], topCustomers: [] });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('forbids non-admin / non-manager / non-leader roles from manager metrics', async () => {
    const dataSource = { query: jest.fn() };
    const service = new DashboardService(dataSource as never, validationStub);

    await expect(
      service.getManagerMetrics({ sub: 'member-1', roles: ['salesperson'] } as never),
    ).rejects.toThrow();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns order matrix by dispatched node when dimension is node', async () => {
    const dataSource = { query: jest.fn(async () => [{ moduleCode: 'onboarding_contact', total: 2, processing: 1, completed: 1, completionRate: '50.0' }]) };
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getOrderTypeMatrix({ sub: 'admin-1', roles: ['admin'] } as never, 'node');

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('FROM dispatched_orders d'), [false, [], null, expect.any(String), phase1Modules]);
    expect(result).toEqual({ rows: [expect.objectContaining({ moduleCode: 'onboarding_contact', label: '入职联系' })] });
  });

  it('defaults business leader order matrix to personal scope and uses department only for team scope', async () => {
    const dataSource = { query: jest.fn(async () => [{ orderType: 'onboarding', label: '入职工单', total: 1, processing: 1, completed: 0, voided: 0, completionRate: '0.0' }]) };
    const resolve = jest.fn(async () => ['dept-a']);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    await service.getOrderTypeMatrix({ sub: 'leader-1', roles: ['business_group_leader'] } as never, 'orderType');
    expect(resolve).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM dispatched_orders d'), [true, [], 'leader-1', expect.any(String), phase1Modules]);

    await service.getOrderTypeMatrix({ sub: 'leader-1', roles: ['business_group_leader'] } as never, 'orderType', 'team');
    expect(resolve).toHaveBeenCalledWith('leader-1');
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM dispatched_orders d'), [true, ['dept-a'], null, expect.any(String), phase1Modules]);
  });

  it('filters shared leader backend dashboard card modules by 0603 role allow-list even with stale social configs', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('notifications')) return [{ count: 0 }];
      if (sql.includes('SELECT module_code FROM module_handlers')) {
        return [
          { module_code: 'contract' },
          { module_code: 'onboarding_contact' },
          { module_code: 'resignation_contact' },
          { module_code: 'social_insurance' },
        ];
      }
      if (sql.includes('FROM dispatched_orders')) return [{ totalThisMonth: 3, pendingTotal: 2, pendingThisMonth: 1, completed: 1, voided: 0 }];
      return [];
    });
    const service = new DashboardService({ query, transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })) } as never, validationStub);

    await service.getDashboardCards({ sub: 'jianglu', roles: ['shared_leader', 'contract_specialist', 'onboarding_specialist'] } as never);

    const cardsCall = (query.mock.calls as unknown[][]).find(([sql]) => String(sql).includes('FROM dispatched_orders'));
    expect(cardsCall).toBeDefined();
    expect(cardsCall![1]).toEqual(['jianglu', expect.any(String), ['contract', 'onboarding_contact', 'resignation_contact']]);
  });

  it('filters shared leader backend node matrix modules by 0603 role allow-list even with stale social configs', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT module_code FROM module_handlers')) {
        return [
          { module_code: 'contract' },
          { module_code: 'onboarding_contact' },
          { module_code: 'resignation_contact' },
          { module_code: 'social_insurance' },
          { module_code: 'resignation_social_insurance' },
        ];
      }
      if (sql.includes('current_role_scope')) return [{ can_view_module_all: true }];
      return [];
    });
    const service = new DashboardService({ query, transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })) } as never, validationStub);

    await service.getOrderTypeMatrix({ sub: 'jianglu', roles: ['shared_leader', 'contract_specialist', 'onboarding_specialist'] } as never, 'node');

    const nodeMatrixCall = (query.mock.calls as unknown[][]).find(([sql]) => String(sql).includes('current_role_scope'));
    expect(nodeMatrixCall).toBeDefined();
    expect(nodeMatrixCall![1]).toEqual(['jianglu', expect.any(String), ['contract', 'onboarding_contact', 'resignation_contact']]);
  });

  it('filters leader trend by moduleCode or Chinese module name', async () => {
    const dataSource = dataSourceWithTransaction([{ month: '2026-05', total: 1, completed: 0, rate: 0 }]);
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getLeaderTrend('onboarding', { sub: 'admin-1', roles: ['admin'] } as never, '入职联系');

    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('d.module_code = $5::text'), ['onboarding', false, [], null, 'onboarding_contact', expect.any(String), phase1Modules]);
    expect(result).toEqual({ orderType: 'onboarding', moduleCode: 'onboarding_contact', buckets: [{ month: '2026-05', total: 1, completed: 0, voided: 0, rate: 0 }] });
  });

  it('hides in-service order types from leader trend instead of returning onboarding data', async () => {
    const dataSource = dataSourceWithTransaction([{ month: '2026-05', total: 9, completed: 9, voided: 0 }]);
    const service = new DashboardService(dataSource as never, validationStub);

    const result = await service.getLeaderTrend('renewal', { sub: 'admin-1', roles: ['admin'] } as never);

    expect(dataSource.query).not.toHaveBeenCalledWith(expect.stringContaining('work_orders'), expect.any(Array));
    expect(result).toMatchObject({ orderType: 'renewal', moduleCode: null });
    expect((result as { buckets: Array<{ total: number }> }).buckets.every((bucket) => bucket.total === 0)).toBe(true);
  });

  it('allows all frontend-visible leader trend roles at controller metadata level', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, DashboardController.prototype.leaderTrend);

    expect(roles).toEqual(expect.arrayContaining([
      'admin',
      'business_owner',
      'biz_manager',
      'manager',
      'business_group_leader',
      'biz_leader',
      'data_entry_leader',
      'shared_team_owner',
      'shared_leader',
    ]));
  });
});
