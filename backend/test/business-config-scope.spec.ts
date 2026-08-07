import { BusinessScope } from 'src/entities';
import { BranchesService } from 'src/modules/admin/branches/branches.service';
import { AiSettingsService } from 'src/modules/admin/ai-settings/ai-settings.service';
import { SystemSettingsService } from 'src/modules/admin/system-settings/system-settings.service';
import { PermissionCenterService } from 'src/modules/permission-center/services/permission-center.service';
import { RoleActionPermissionService } from 'src/modules/role-action-permissions/role-action-permission.service';

const OUT_SCOPE = BusinessScope.OUT_OF_PROVINCE;

describe('business configuration scope isolation', () => {
  it('stores role action matrices under independent scope keys', async () => {
    const rows = new Map<string, { key: string; value: string; isEncrypted: boolean }>();
    const repo = {
      findOne: jest.fn(async ({ where }: any) => rows.get(where.key) ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        rows.set(value.key, value);
        return value;
      }),
    };
    const service = new RoleActionPermissionService(repo as never);

    await service.setRolePermissions('scope_only_role', ['work_order.export'], OUT_SCOPE);

    expect(rows.has('roleActionPermissions.v1.out_of_province')).toBe(true);
    expect((await service.getMatrix(OUT_SCOPE)).scope_only_role).toEqual(['work_order.export']);
    expect((await service.getMatrix(BusinessScope.BEILUN)).scope_only_role).toBeUndefined();
  });

  it('stores AI and system settings under independent scope keys', async () => {
    const aiRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const aiService = new AiSettingsService(aiRepo as never, { get: jest.fn() } as never);
    await aiService.updateConfig({
      provider: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'scope-model',
      apiKey: 'scope-key',
    }, OUT_SCOPE);
    expect(aiRepo.save).toHaveBeenCalledWith(expect.objectContaining({ key: 'ai.config.out_of_province' }));

    const settingsRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const systemService = new SystemSettingsService(settingsRepo as never, { get: jest.fn(() => 365) } as never);
    await systemService.updateOperationLogRetention({ days: 30 }, OUT_SCOPE);
    expect(settingsRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      key: 'operationLog.retentionDays.out_of_province',
    }));
  });

  it('activates a permission version without disabling the other business scope', async () => {
    const configRepo = {
      findOne: jest.fn(async () => ({ id: 'version-out', business_scope: OUT_SCOPE })),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const service = new PermissionCenterService(configRepo as never, {} as never);

    await service.activateVersion('version-out', OUT_SCOPE);

    expect(configRepo.update).toHaveBeenNthCalledWith(
      1,
      { is_active: true, business_scope: OUT_SCOPE },
      { is_active: false },
    );
    expect(configRepo.update).toHaveBeenNthCalledWith(
      2,
      { id: 'version-out', business_scope: OUT_SCOPE },
      { is_active: true, activated_at: expect.any(Date) },
    );
  });

  it('queries permission versions and branches inside the selected scope', async () => {
    const config = { version: '1.0.0', roles: [], routePermissions: [], fieldPermissions: [] };
    const configRepo = {
      findOne: jest.fn(async () => ({ config })),
    };
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const permissionService = new PermissionCenterService(configRepo as never, cache as never);

    await expect(permissionService.getActiveConfig(OUT_SCOPE)).resolves.toEqual(config);
    expect(configRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_active: true, business_scope: OUT_SCOPE },
    }));
    expect(cache.set).toHaveBeenCalledWith('active_config:out_of_province', config, 3600);

    const branchRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        ...value,
        id: 'branch-1',
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
      })),
    };
    const customerRepo = {
      findOne: jest.fn(async () => ({ id: 'customer-1' })),
    };
    const branchesService = new BranchesService(branchRepo as never, customerRepo as never);

    await branchesService.create({
      customerId: 'customer-1',
      branchCode: 'OUT-001',
      branchName: '省外分支',
      businessScope: OUT_SCOPE,
    });

    expect(customerRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'customer-1', businessScope: OUT_SCOPE, isActive: true },
    });
    expect(branchRepo.findOne).toHaveBeenCalledWith({
      where: { branchCode: 'OUT-001', businessScope: OUT_SCOPE },
    });
    expect(branchRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessScope: OUT_SCOPE }));
  });
});
