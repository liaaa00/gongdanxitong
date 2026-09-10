import { BusinessScope, FieldPermissionMode } from 'src/entities';
import { FieldPermissionService } from 'src/modules/admin/field-permissions/field-permission.service';

function fixture() {
  const manager = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((_entity, value) => value), save: jest.fn(async (_entity, value) => value) };
  const transaction = jest.fn(async (operation) => operation(manager));
  const service = new FieldPermissionService({ transaction } as never, {} as never, {} as never, {} as never);
  return { service, transaction, manager };
}
const item = { roleId: 'role-1', scenario: 'create:onboarding', fieldCode: 'mobile', permission: FieldPermissionMode.HIDDEN };

describe('Batch field permission conflict protection', () => {
  it('rejects conflicting entries before any transaction or write', async () => {
    const { service, transaction } = fixture();
    await expect(service.batchUpsert([item, { ...item, permission: FieldPermissionMode.VISIBLE }])).rejects.toThrow('冲突权限');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('accepts identical duplicates and preserves the selected business scope', async () => {
    const { service, manager } = fixture();
    await expect(service.batchUpsert([item, item], BusinessScope.OUT_OF_PROVINCE)).resolves.toEqual({ affected: 2 });
    expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), { where: { roleId: item.roleId, scenario: item.scenario, fieldCode: item.fieldCode, businessScope: BusinessScope.OUT_OF_PROVINCE } });
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessScope: BusinessScope.OUT_OF_PROVINCE }));
  });
  it('keeps different role and scenario grants independent', async () => {
    const { service } = fixture();
    await expect(service.batchUpsert([item, { ...item, roleId: 'role-2', permission: FieldPermissionMode.VISIBLE }, { ...item, scenario: 'create:resignation', permission: FieldPermissionMode.VISIBLE }])).resolves.toEqual({ affected: 3 });
  });
});
