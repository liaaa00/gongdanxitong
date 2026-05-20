import { DashboardService } from 'src/modules/dashboard/dashboard.service';

describe('DashboardService', () => {
  const validationStub = { resolveUserDepartmentIds: jest.fn(async () => ['dept-1']) } as never;

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
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [false, []]);
  });

  it('restricts manager metrics to leader department ids', async () => {
    const dataSource = { query: jest.fn(async () => [{ payload: { modules: [], topCustomers: [], ratios: {}, trend: [] } }]) };
    const resolve = jest.fn(async () => ['dept-a', 'dept-b']);
    const service = new DashboardService(dataSource as never, { resolveUserDepartmentIds: resolve } as never);

    await service.getManagerMetrics({ sub: 'leader-1', roles: ['biz_leader'] } as never);

    expect(resolve).toHaveBeenCalledWith('leader-1');
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('scoped_wo'), [true, ['dept-a', 'dept-b']]);
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
});
