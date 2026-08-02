import { create } from 'zustand';
import type { UserInfo, RoleInfo } from '@/services/types';
import { getMe } from '@/services/auth';
import {
  getToken,
  setToken as setTokenStorage,
  getRefreshToken,
  setRefreshToken as setRefreshTokenStorage,
  clearAll,
} from '@/utils/storage';
import { canonicalRoleCode } from '@/constants/roles';
import { getActivePermissionConfig } from '@/services/permissionCenter';
import { closePermissionConfigUpdates, subscribePermissionConfigUpdates } from '@/services/permissionConfigRealtime';
import { setDynamicPermissionConfig } from '@/config/routeVisibility';
import type { PermissionConfig } from '@/services/permissionCenter';

function readMustChangePassword(user: UserInfo | null | undefined): boolean {
  return Boolean(user?.must_change_password ?? user?.mustChangePassword ?? false);
}

let permissionConfigRequest: Promise<void> | null = null;
let unsubscribePermissionUpdates: (() => void) | null = null;

interface UserState {
  user: UserInfo | null;
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  mustChangePassword: boolean;  // ★ 首登强制改密标记
  permissionConfig: PermissionConfig | null;
  permissionConfigLoading: boolean;

  setToken: (token: string, refreshToken?: string) => void;
  setUser: (user: UserInfo | null) => void;
  setMustChangePassword: (v: boolean) => void;
  fetchUser: () => Promise<void>;
  loadPermissionConfig: () => Promise<void>;
  logout: () => void;
  hasRole: (roleCode: string) => boolean;
  hasAnyRole: (roleCodes: string[]) => boolean;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  token: getToken(),
  refreshToken: getRefreshToken(),
  isLoggedIn: !!getToken(),
  loading: false,
  mustChangePassword: false,
  permissionConfig: null,
  permissionConfigLoading: false,

  setToken: (token: string, refreshToken?: string) => {
    setTokenStorage(token);
    if (refreshToken) {
      setRefreshTokenStorage(refreshToken);
    }
    set({ token, refreshToken: refreshToken || null, isLoggedIn: true });
    void get().loadPermissionConfig();
  },

  setUser: (user: UserInfo | null) => {
    set({ user, mustChangePassword: readMustChangePassword(user) });
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, isLoggedIn: true, loading: false, mustChangePassword: readMustChangePassword(user) });
      void get().loadPermissionConfig();
    } catch {
      set({ loading: false });
      get().logout();
    }
  },

  loadPermissionConfig: async () => {
    if (permissionConfigRequest) return permissionConfigRequest;
    set({ permissionConfigLoading: true });
    permissionConfigRequest = (async () => {
      try {
        const config = await getActivePermissionConfig();
        setDynamicPermissionConfig(config);
        set({ permissionConfig: config });
        if (!unsubscribePermissionUpdates) {
          unsubscribePermissionUpdates = subscribePermissionConfigUpdates(() => {
            void get().loadPermissionConfig();
          });
        }
      } catch {
        // Dynamic configuration is an enhancement; static routeVisibility remains authoritative fallback.
        setDynamicPermissionConfig(null);
        set({ permissionConfig: null });
      } finally {
        set({ permissionConfigLoading: false });
        permissionConfigRequest = null;
      }
    })();
    return permissionConfigRequest;
  },

  logout: () => {
    clearAll();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('mock_session_user_v1');
    }
    unsubscribePermissionUpdates?.();
    unsubscribePermissionUpdates = null;
    closePermissionConfigUpdates();
    setDynamicPermissionConfig(null);
    set({ user: null, token: null, refreshToken: null, isLoggedIn: false, mustChangePassword: false, permissionConfig: null, permissionConfigLoading: false });
  },

  hasRole: (roleCode: string) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    const required = canonicalRoleCode(roleCode);
    return user.roles.some((r: RoleInfo) => canonicalRoleCode(r.code) === required);
  },

  hasAnyRole: (roleCodes: string[]) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    const required = new Set(roleCodes.map((code) => canonicalRoleCode(code)));
    return user.roles.some((r: RoleInfo) => required.has(canonicalRoleCode(r.code)));
  },

  setMustChangePassword: (v: boolean) => set({ mustChangePassword: v }),
}));
