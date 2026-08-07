import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_PERMISSION_KEY } from 'src/common/decorators/business-permission.decorator';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import {
  hasDefaultRoleActionPermission,
  RoleActionPermissionService,
} from 'src/modules/role-action-permissions/role-action-permission.service';
import { PermissionCenterService } from 'src/modules/permission-center/services/permission-center.service';
import { PermissionConfig } from 'src/modules/permission-center/types/permission-config.types';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roleActionPermissionService: RoleActionPermissionService,
    @Optional() private readonly permissionCenterService?: PermissionCenterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const businessPermission = this.reflector.getAllAndOverride<string>(BUSINESS_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{ user?: JwtUserPayload; query?: Record<string, unknown> }>();
    const userRoles = request.user?.roles ?? [];
    const businessScope = this.resolveRequestScope(request.user, request.query?.businessScope);

    if (businessPermission) {
      const configResult = await this.checkActiveConfigBusinessPermission(userRoles, businessPermission, businessScope);
      const allowed = configResult ?? await this.checkFallbackBusinessPermission(userRoles, businessPermission, businessScope);
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

    const configResult = await this.checkActiveConfigRoles(userRoles, requiredRoles, businessScope);
    const hasRole = configResult ?? requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('角色权限不足');
    }

    return true;
  }

  /**
   * A null result means the configuration center could not be read. The
   * role-action service is retained as a narrowly scoped emergency fallback
   * for existing deployments that have not activated a permission version.
   */
  private async checkActiveConfigBusinessPermission(
    userRoles: readonly string[],
    businessPermission: string,
    businessScope?: import('src/entities').BusinessScope,
  ): Promise<boolean | null> {
    const config = await this.readActiveConfig(businessScope);
    if (!config) return null;

    try {
      const activeRoleGroups = this.activeRoleGroups(config);
      return config.routePermissions.some((route) =>
        route.backendActions?.includes(businessPermission)
        && route.allowedRoles.some((allowedRole) => this.userHasRoleAlias(userRoles, allowedRole, activeRoleGroups)));
    } catch {
      return null;
    }
  }

  private async checkActiveConfigRoles(
    userRoles: readonly string[],
    requiredRoles: readonly string[],
    businessScope?: import('src/entities').BusinessScope,
  ): Promise<boolean | null> {
    const config = await this.readActiveConfig(businessScope);
    if (!config) return null;

    try {
      const activeRoleGroups = this.activeRoleGroups(config);
      return requiredRoles.some((requiredRole) =>
        this.userHasRoleAlias(userRoles, requiredRole, activeRoleGroups));
    } catch {
      return null;
    }
  }

  private async readActiveConfig(businessScope?: import('src/entities').BusinessScope): Promise<PermissionConfig | null> {
    if (!this.permissionCenterService) return null;
    try {
      return await this.permissionCenterService.getActiveConfig(businessScope);
    } catch {
      return null;
    }
  }

  private async checkFallbackBusinessPermission(
    userRoles: readonly string[],
    businessPermission: string,
    businessScope?: import('src/entities').BusinessScope,
  ): Promise<boolean> {
    if (this.roleActionPermissionService?.hasAnyRoleAction) {
      try {
        return businessScope === undefined
          ? await this.roleActionPermissionService.hasAnyRoleAction(userRoles, businessPermission)
          : await this.roleActionPermissionService.hasAnyRoleAction(userRoles, businessPermission, businessScope);
      } catch {
        // A failed emergency store must fail closed.
      }
    }

    // Keep the emergency baseline for two-argument construction and legacy
    // deployments; this path is reached only when the center and its store
    // are unavailable.
    return hasDefaultRoleActionPermission(userRoles, businessPermission);
  }

  private resolveRequestScope(user: JwtUserPayload | undefined, requestedScope: unknown): import('src/entities').BusinessScope | undefined {
    if (user?.roles?.includes('admin') && (requestedScope === 'beilun' || requestedScope === 'out_of_province')) {
      return requestedScope as import('src/entities').BusinessScope;
    }
    return user?.businessScope;
  }

  private activeRoleGroups(config: PermissionConfig): ReadonlySet<string>[] {
    return config.roles
      .filter((role) => role.isActive)
      .map((role) => new Set([role.code, role.canonicalCode].filter(Boolean)));
  }

  private userHasRoleAlias(
    userRoles: readonly string[],
    requestedRole: string,
    activeRoleGroups: readonly ReadonlySet<string>[],
  ): boolean {
    if (userRoles.includes(requestedRole)) {
      return activeRoleGroups.some((group) => group.has(requestedRole)
        && userRoles.some((userRole) => group.has(userRole)));
    }

    return activeRoleGroups.some((group) =>
      group.has(requestedRole) && userRoles.some((userRole) => group.has(userRole)));
  }
}
