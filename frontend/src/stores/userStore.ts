import { create } from 'zustand';
import type { UserInfo, RoleInfo } from '@/services/types';
import { getMe } from '@/services/auth';
import {
  getToken,
  setToken as setTokenStorage,
  removeToken,
  getRefreshToken,
  setRefreshToken as setRefreshTokenStorage,
  removeRefreshToken,
  clearAll,
} from '@/utils/storage';

interface UserState {
  user: UserInfo | null;
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  mustChangePassword: boolean;  // ★ 首登强制改密标记

  setToken: (token: string, refreshToken?: string) => void;
  setUser: (user: UserInfo) => void;
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

  setUser: (user: UserInfo) => {
    set({ user });
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, isLoggedIn: true, loading: false });
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
    set({ user: null, token: null, refreshToken: null, isLoggedIn: false });
  },

  hasRole: (roleCode: string) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    return user.roles.some((r: RoleInfo) => r.code === roleCode);
  },

  hasAnyRole: (roleCodes: string[]) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    return user.roles.some((r: RoleInfo) => roleCodes.includes(r.code));
  },

  setMustChangePassword: (v: boolean) => set({ mustChangePassword: v }),
}));
