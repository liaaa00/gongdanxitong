import { useUserStore } from '@/stores/userStore';
import { hasPermission, hasRole } from '@/utils/permission';

export function useAuth() {
  const {
    user,
    isLoggedIn,
    hasRole: storeHasRole,
    hasAnyRole,
  } = useUserStore();

  return {
    user,
    isLoggedIn,
    hasRole: storeHasRole,
    hasAnyRole,
    hasPermission: (requiredPermissions: string[]) =>
      hasPermission(user?.permissions || [], requiredPermissions),
    checkRole: (requiredRoles: string[]) =>
      hasRole(
        (user?.roles || []).map((r) => r.code),
        requiredRoles,
      ),
  };
}
