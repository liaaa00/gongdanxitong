import request, { getFriendlyErrorMessage } from './request';
import { AxiosError } from 'axios';
import type { LoginRequest, LoginResponse, RoleInfo, UserInfo } from './types';
import { isMockMode, mockDelay } from './mock';
import { validateUserCredentials, changeUserPassword, getUserPasswordStatus } from './users';
import { loadList } from './_mockStore';
import type { RoleItem } from './roles';

const ROLES_KEY = 'mock_admin_roles_v3'; // ★ v3: 新增福保负责人角色（与 roles.ts 一致）
const ROLES_SEED: RoleItem[] = [
  // ★ 8 个核心角色 — 不区分具体业务组编号；业务组归属通过 department/group_name 动态表达
  { id: '1', code: 'admin', name: '系统管理员', level: '全局', description: '全部工单和系统配置', is_active: true },
  { id: '2', code: 'business_owner', name: '业务负责人', level: '管理层', description: '查看全部业务工单、全局看板、导出，不可操作工单', is_active: true },
  { id: '3', code: 'business_group_leader', name: '业务组长', level: '主管层', description: '查看本组全部工单；可发起/修改/撤回', is_active: true },
  { id: '4', code: 'business_group_member', name: '业务员', level: '执行层', description: '只看自己发起的工单', is_active: true },
  { id: '5', code: 'data_entry_leader', name: '数据录入组长', level: '主管层', description: '增员报岗录入/减员报岗录入模块全量', is_active: true },
  { id: '6', code: 'shared_team_owner', name: '共享团队负责人', level: '主管层', description: '江璐：合同新签/续签 + 入职联系/离职材料收集合集', is_active: true },
  { id: '7', code: 'labor_contract_member', name: '合同专员', level: '执行层', description: '劳动合同新签/续签，待遇申报一期隐藏', is_active: true },
  { id: '8', code: 'onboarding_resignation_member', name: '入离职联系专员', level: '执行层', description: '入职联系/离职材料收集', is_active: true },
  { id: '9', code: 'social_insurance_specialist', name: '福保负责人', level: '主管层', description: '社保公积金增员/减员子工单', is_active: true },
];

const MOCK_SESSION_KEY = 'mock_session_user_v1';

type RawRole = string | Partial<RoleInfo> & {
  roleCode?: string;
  roleName?: string;
};

type RawUser = Partial<UserInfo> & {
  realName?: string;
  isActive?: boolean;
  avatarUrl?: string | null;
  roles?: RawRole[];
  permissions?: string[];
  mustChangePassword?: boolean;
  passwordUpdatedAt?: string | null;
};

type RawLoginResponse = Partial<LoginResponse> & {
  accessToken?: string;
  refreshToken?: string;
  user?: RawUser;
  roles?: RawRole[];
  permissions?: string[];
};

function getRolesMap(): Map<string, RoleItem> {
  const roles = loadList<RoleItem>(ROLES_KEY, ROLES_SEED);
  const map = new Map<string, RoleItem>();
  for (const r of roles) map.set(r.id, r);
  return map;
}

function getMockSessionUser(): UserInfo | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserInfo;
  } catch { return null; }
}

function setMockSessionUser(user: UserInfo) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

function normalizeRole(role: RawRole, rolesMap = getRolesMap()): RoleInfo {
  if (typeof role === 'string') {
    const roleDef = Array.from(rolesMap.values()).find((item) => item.code === role);
    return {
      id: roleDef?.id || role,
      code: role,
      name: roleDef?.name || role,
      level: roleDef?.level || '',
    };
  }

  const code = role.code || role.roleCode || role.id || '';
  const roleDef = Array.from(rolesMap.values()).find((item) => item.code === code || item.id === role.id);
  return {
    id: role.id || roleDef?.id || code,
    code,
    name: role.name || role.roleName || roleDef?.name || code,
    level: role.level || roleDef?.level || '',
  };
}

function normalizeUserInfo(rawUser: RawUser | undefined, rawRoles?: RawRole[], rawPermissions?: string[]): UserInfo {
  const roles = (rawRoles || rawUser?.roles || []).map((role) => normalizeRole(role));
  const permissions = rawPermissions || rawUser?.permissions || roles.map((role) => `role:${role.code}`);

  return {
    id: rawUser?.id || '',
    username: rawUser?.username || '',
    real_name: rawUser?.real_name || rawUser?.realName || rawUser?.username || '',
    email: rawUser?.email || '',
    phone: rawUser?.phone || '',
    avatar_url: rawUser?.avatar_url ?? rawUser?.avatarUrl ?? null,
    is_active: rawUser?.is_active ?? rawUser?.isActive ?? true,
    roles,
    permissions,
    must_change_password: rawUser?.must_change_password ?? rawUser?.mustChangePassword ?? false,
    mustChangePassword: rawUser?.must_change_password ?? rawUser?.mustChangePassword ?? false,
    password_updated_at: rawUser?.password_updated_at ?? rawUser?.passwordUpdatedAt ?? null,
  };
}

function normalizeLoginResponse(raw: RawLoginResponse): LoginResponse {
  const token = raw.token || raw.accessToken || '';
  const user = normalizeUserInfo(raw.user, raw.roles, raw.permissions);
  const mustChangePassword = raw.must_change_password ?? raw.mustChangePassword ?? user.must_change_password ?? false;
  const userWithPasswordFlag: UserInfo = { ...user, must_change_password: mustChangePassword, mustChangePassword };
  return {
    token,
    accessToken: raw.accessToken || token,
    refreshToken: raw.refreshToken,
    user: userWithPasswordFlag,
    roles: userWithPasswordFlag.roles,
    permissions: userWithPasswordFlag.permissions,
    must_change_password: mustChangePassword,
    mustChangePassword,
  };
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const user = validateUserCredentials(data.username, data.password);
    if (user) {
      const rolesMap = getRolesMap();
      const passwordStatus = getUserPasswordStatus(user.username);
      const userInfo: UserInfo = {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        email: user.email,
        phone: user.phone,
        avatar_url: null,
        is_active: user.is_active,
        roles: user.roles.map((r) => {
          const roleDef = rolesMap.get(r.role_id);
          return {
            id: r.role_id,
            code: roleDef?.code || r.role_id,
            name: roleDef?.name || r.role_name,
            level: roleDef?.level || '',
          };
        }),
        permissions: user.roles.some((r) => rolesMap.get(r.role_id)?.code === 'admin') ? ['*'] : [],
        must_change_password: passwordStatus.must_change_password,
        mustChangePassword: passwordStatus.must_change_password,
        password_updated_at: passwordStatus.password_updated_at,
      };
      setMockSessionUser(userInfo);
      return {
        token: 'mock-jwt-access-token',
        user: userInfo,
        roles: userInfo.roles,
        permissions: userInfo.permissions,
        must_change_password: userInfo.must_change_password,
        mustChangePassword: userInfo.must_change_password,
      };
    }
    throw new Error('用户名或密码错误');
  }
  try {
    const res = await request.post('/auth/login', data, { silentError: true } as any) as RawLoginResponse;
    return normalizeLoginResponse(res);
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new Error((error as AxiosError & { _friendlyMsg?: string })._friendlyMsg || getFriendlyErrorMessage(error));
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  if (isMockMode) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(MOCK_SESSION_KEY);
    }
    return;
  }
  return request.post('/auth/logout') as Promise<void>;
}

export async function refreshToken(): Promise<LoginResponse> {
  if (isMockMode) {
    const user = getMockSessionUser();
    if (!user) throw new Error('未登录');
    return {
      token: 'mock-jwt-refreshed-token',
      user,
      roles: user.roles,
      permissions: user.permissions,
      must_change_password: user.must_change_password,
      mustChangePassword: user.must_change_password,
    };
  }
  const res = await request.post('/auth/refresh') as RawLoginResponse;
  return normalizeLoginResponse(res);
}

export async function getMe(): Promise<UserInfo> {
  if (isMockMode) {
    const user = getMockSessionUser();
    if (!user) throw new Error('未登录');
    return mockDelay(user);
  }
  const res = await request.get('/auth/me') as RawUser;
  return normalizeUserInfo(res);
}

export type ChangePasswordPayload = {
  oldPassword?: string;
  newPassword?: string;
  /** @deprecated 仅保留 mock/旧调用兼容，真实后端 DTO 使用 oldPassword */
  old_password?: string;
  /** @deprecated 仅保留 mock/旧调用兼容，真实后端 DTO 使用 newPassword */
  new_password?: string;
};

export async function changePassword(data: ChangePasswordPayload): Promise<void> {
  const payload = {
    oldPassword: data.oldPassword ?? data.old_password ?? '',
    newPassword: data.newPassword ?? data.new_password ?? '',
  };
  if (isMockMode) {
    const session = getMockSessionUser();
    if (!session) throw new Error('未登录');
    changeUserPassword(session.username, payload.oldPassword, payload.newPassword);
    const changedAt = getUserPasswordStatus(session.username).password_updated_at;
    setMockSessionUser({
      ...session,
      must_change_password: false,
      mustChangePassword: false,
      password_updated_at: changedAt,
    });
    return;
  }
  return request.post('/auth/change-password', payload) as Promise<void>;
}
