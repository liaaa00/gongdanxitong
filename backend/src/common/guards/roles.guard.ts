import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_PERMISSION_KEY } from 'src/common/decorators/business-permission.decorator';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RoleActionPermissionService } from 'src/modules/role-action-permissions/role-action-permission.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roleActionPermissionService: RoleActionPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const businessPermission = this.reflector.getAllAndOverride<string>(BUSINESS_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const userRoles = request.user?.roles ?? [];

    if (businessPermission) {
      const allowed = await this.roleActionPermissionService.hasAnyRoleAction(userRoles, businessPermission);
      if (!allowed) {
        throw new ForbiddenException('业务权限不足');
      }
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('角色权限不足');
    }

    return true;
  }
}
