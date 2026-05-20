export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
  traceId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  accessToken?: string;
  refreshToken?: string;
  user: UserInfo;
  roles: RoleInfo[];
  permissions: string[];
  must_change_password?: boolean;  // ★ 首次登录强制改密标记
}

export interface UserInfo {
  id: string;
  username: string;
  real_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  is_active: boolean;
  roles: RoleInfo[];
  permissions: string[];
  must_change_password?: boolean;  // ★ 首次登录标记
  password_updated_at?: string | null;
}

export interface RoleInfo {
  id: string;
  code: string;
  name: string;
  level: string;
}
