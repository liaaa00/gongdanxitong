export type PermissionCode = string;

export function hasPermission(
  userPermissions: PermissionCode[],
  requiredPermissions: PermissionCode[],
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  return requiredPermissions.some((p) => userPermissions.includes(p));
}

export function hasRole(
  userRoles: string[],
  requiredRoles: string[],
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }
  return requiredRoles.some((r) => userRoles.includes(r));
}
