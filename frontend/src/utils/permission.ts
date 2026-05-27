import { canonicalRoleCode } from '@/constants/roles';

export type PermissionCode = string;

export function hasPermission(
  userPermissions: PermissionCode[],
  requiredPermissions: PermissionCode[],
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  if (userPermissions.includes('*') || userPermissions.includes('role:admin')) return true;
  return requiredPermissions.some((p) => userPermissions.includes(p));
}

export function hasActionPermission(
  userPermissions: PermissionCode[],
  requiredActions: string[],
): boolean {
  if (!requiredActions || requiredActions.length === 0) return true;
  return hasPermission(userPermissions, requiredActions.map((action) => `action:${action}`));
}

export function hasRole(
  userRoles: string[],
  requiredRoles: string[],
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }
  const userRoleSet = new Set(userRoles.map((r) => canonicalRoleCode(r)));
  return requiredRoles.some((r) => userRoleSet.has(canonicalRoleCode(r)));
}
