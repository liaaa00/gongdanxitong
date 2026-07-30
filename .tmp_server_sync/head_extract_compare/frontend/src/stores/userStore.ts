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

function readMustChangePassword(user: UserInfo | null | undefined): boolean {
  return Boolean(user?.must_change_password ?? user?.mustChangePassword ?? false);
}

interface UserState {
  user: UserInfo | null;
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  mustChangePassword: boolean;  // ★ 首登强制改密标记

  setToken: (token: string, refreshToken?: string) => void;
  setUser: (user: UserInfo | null) => void;
  setMustChangePassword: (v: boolean) => void;
  fetchUser: () => Promise<void>;
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

  setToken: (token: string, refreshToken?: string) => {
    setTokenStorage(token);
    if (refreshToken) {
      setRefreshTokenStorage(refreshToken);
    }
    set({ token, refreshToken: refreshToken || null, isLoggedIn: true });
  },

  setUser: (user: UserInfo | null) => {
    set({ user, mustChangePassword: readMustChangePassword(user) });
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, isLoggedIn: true, loading: false, mustChangePassword: readMustChangePassword(user) });
    } catch {
      set({ loading: false });
      get().logout();
    }
  },

  logout: () => {
    clearAll();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('mock_session_user_v1');
    }
    set({ user: null, token: null, refreshToken: null, isLoggedIn: false, mustChangePassword: false });
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
