import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { DispatchedOrderController } from 'src/modules/dispatched-orders/dispatched-order.controller';
import { WorkOrderController } from 'src/modules/work-orders/work-order.controller';

function makeHttpContext(handler: (...args: never[]) => unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => DispatchedOrderController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'u1', username: 'u1', roles } }),
    }),
  } as never;
}

describe('delete endpoint admin guards', () => {
  const reflector = new Reflector();
  const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
  const guard = new RolesGuard(reflector, roleActionPermissionService as never);

  it('marks dispatched order DELETE as admin only and rejects non-admin users', async () => {
    const roles = reflector.get<string[]>(ROLES_KEY, DispatchedOrderController.prototype.remove);
    expect(roles).toEqual(['admin']);

    await expect(guard.canActivate(makeHttpContext(DispatchedOrderController.prototype.remove, ['social_insurance_team']))).rejects.toThrow(ForbiddenException);
  });

  it('marks work order DELETE as admin only', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, WorkOrderController.prototype.remove);
    expect(roles).toEqual(['admin']);
  });
});
