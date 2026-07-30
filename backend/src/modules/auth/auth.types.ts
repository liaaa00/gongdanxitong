import { BusinessScope } from 'src/entities';

export interface JwtUserPayload {
  sub: string;
  username: string;
  realName?: string;
  real_name?: string;
  roles: string[];
  businessScope?: BusinessScope;
  authVersion?: number;
  mustChangePassword?: boolean;
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
    businessScope: BusinessScope;
    business_scope: BusinessScope;
    mustChangePassword: boolean;
    must_change_password: boolean;
  };
}
