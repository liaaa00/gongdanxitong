export interface JwtUserPayload {
  sub: string;
  username: string;
  roles: string[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    realName: string;
    email: string | null;
    phone: string | null;
    roles: string[];
    permissions: string[];
    action_permissions: string[];
    mustChangePassword: boolean;
    must_change_password: boolean;
  };
}
