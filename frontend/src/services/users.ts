import request from './request';
import { isMockMode, mockDelay, type PageParams, type PageResult } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface UserItem {
  id: string;
  username: string;
  real_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  roles: { role_id: string; role_name: string; role_code?: string }[];
  group_name: string;
  position?: string;           // 岗位
  department_name?: string;    // 部门名称（与 group_name 可能不同）
  department_id?: string;      // 部门ID
  created_at: string;
  password?: string;
  // aliases for camelCase backend compatibility
  realName?: string;
  userName?: string;
  isActive?: boolean;
  groupName?: string;
  createdAt?: string;
  roleId?: string;
  roleName?: string;
}

/**
 * 归一化后端用户数据为前端 snake_case 格式。
 * 后端 User 实体：
 *   { id, username, realName, isActive, userRoles: [{ roleId, departmentId, isPrimary, role: { id, code, name }, department: { id, name } }] }
 * 归一化为：
 *   { id, username, real_name, is_active, roles: [{ role_id, role_name, role_code }], group_name, position, department_name, department_id }
 */
export function normalizeUserItem(raw: any): UserItem {
  // 从 userRoles 提取角色信息（兼容 userRoles / roles / user_roles）
  const rawRoles: any[] = Array.isArray(raw.userRoles)
    ? raw.userRoles
    : Array.isArray(raw.roles)
      ? raw.roles
      : Array.isArray(raw.user_roles)
        ? raw.user_roles
        : [];
  const roles = rawRoles.map((ur: any) => ({
    role_id: ur.roleId ?? ur.role_id ?? ur.role?.id ?? ur.id ?? '',
    role_name: ur.role?.name ?? ur.roleName ?? ur.role_name ?? ur.name ?? '',
    role_code: ur.role?.code ?? ur.roleCode ?? ur.role_code ?? ur.code ?? '',
  }));

  // 从 userRoles 提取主部门（优先 isPrimary）
  const primaryUserRole = rawRoles.find((ur: any) => ur.isPrimary === true) || rawRoles[0];
  const department = primaryUserRole?.department;
  const group_name =
    raw.groupName ?? raw.group_name
    ?? department?.name
    ?? raw.department_name ?? raw.departmentName
    ?? '';
  const department_name = department?.name ?? raw.department_name ?? raw.departmentName ?? group_name;
  const department_id = primaryUserRole?.departmentId ?? primaryUserRole?.department_id ?? raw.department_id ?? raw.departmentId ?? '';

  return {
    id: raw.id ?? raw.ID ?? '',
    username: raw.username ?? raw.userName ?? raw.user_name ?? '',
    real_name: raw.real_name ?? raw.realName ?? raw.realName ?? '',
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    is_active: raw.is_active ?? raw.isActive ?? raw.isActive ?? true,
    roles,
    group_name,
    position: raw.position ?? raw.job_title ?? raw.jobTitle ?? '',
    department_name,
    department_id,
    created_at: raw.created_at ?? raw.createdAt ?? raw.created_at ?? '',
    password: raw.password,
  };
}

const KEY = 'mock_admin_users_v3'; // ★ v3: 新增福利保障部/福保负责人傅倩雯
const PASSWORDS_KEY = 'mock_admin_passwords_v1';

interface PasswordEntry {
  username: string;
  password_hash: string;
  must_change_password?: boolean;
  password_updated_at?: string | null;
}

function loadPasswords(): PasswordEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PASSWORDS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function savePasswords(entries: PasswordEntry[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(PASSWORDS_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export function validateUserCredentials(username: string, password: string): UserItem | null {
  const list = store();
  const user = list.find((u) => u.username === username && u.is_active);
  if (!user) return null;

  const pwds = loadPasswords();
  const entry = pwds.find((p) => p.username === username);
  if (!entry) return null;

  if (entry.password_hash === password) return user;
  return null;
}

const DEFAULT_SEED_PASSWORDS: Record<string, string> = {
  lizhanbo: '123456',
  wangzixi: '123456',
  aolei: '123456',
  xuekun: '123456',
  yuqinxia: '123456',
  shenwenjun: '123456',
  yaoyiping: '123456',
  yanqiuyue: '123456',
  chengyu: '123456',
  chenyuchen: '123456',
  zhouqiqing: '123456',
  wuyufei: '123456',
  gaolulu: '123456',
  zhaotianqi: '123456',
  liucheng: '123456',
  xujing: '123456',
  taomingyue: '123456',
  xujiayin: '123456',
  yuweiwei: '123456',
  zhangpuwei: '123456',
  annazhen: '123456',
  jianglu: '123456',
  yangchun: '123456',
  maoyani: '123456',
  fuqianwen: '123456',
};

function ensureSeedPasswords() {
  const existing = loadPasswords();
  const existingMap = new Map(existing.map(p => [p.username, p]));
  let changed = false;

  for (const [username, password_hash] of Object.entries(DEFAULT_SEED_PASSWORDS)) {
    const entry = existingMap.get(username);
    if (!entry) {
      existing.push({ username, password_hash, must_change_password: true, password_updated_at: null });
      changed = true;
    } else if (entry.password_hash === 'admin123') {
      // admin123 is an obsolete demo default: it returns 401 and must not be used for demos.
      // Migrate that old default only; do not overwrite custom passwords users changed in mock mode.
      entry.password_hash = password_hash;
      entry.must_change_password = true;
      entry.password_updated_at = null;
      changed = true;
    } else if (entry.must_change_password === undefined || entry.password_updated_at === undefined) {
      const hasChangedPassword = entry.password_hash !== password_hash;
      entry.must_change_password = hasChangedPassword ? false : true;
      entry.password_updated_at = hasChangedPassword ? entry.password_updated_at ?? new Date().toISOString() : null;
      changed = true;
    }
  }

  if (changed) {
    savePasswords(existing);
  }
}

function setUserPassword(username: string, password: string, options?: { mustChangePassword?: boolean; updatedAt?: string | null }) {
  const pwds = loadPasswords();
  const idx = pwds.findIndex((p) => p.username === username);
  const mustChangePassword = options?.mustChangePassword ?? true;
  const passwordUpdatedAt = options?.updatedAt ?? null;
  if (idx >= 0) {
    pwds[idx].password_hash = password;
    pwds[idx].must_change_password = mustChangePassword;
    pwds[idx].password_updated_at = passwordUpdatedAt;
  } else {
    pwds.push({ username, password_hash: password, must_change_password: mustChangePassword, password_updated_at: passwordUpdatedAt });
  }
  savePasswords(pwds);
}

const SEED: UserItem[] = [
  // ★ 25 人，role_id 全部映射到核心角色 code，group_name 区分组别
  { id: '1', username: 'lizhanbo', real_name: '李占博', email: 'lizhanbo@example.com', phone: '13800001001', is_active: true, roles: [{ role_id: '1', role_name: '系统管理员' }], group_name: '系统管理', created_at: new Date().toISOString() },
  { id: '2', username: 'wangzixi', real_name: '王梓曦', email: 'wangzixi@example.com', phone: '13800001002', is_active: true, roles: [{ role_id: '1', role_name: '系统管理员' }], group_name: '系统管理', created_at: new Date().toISOString() },
  // 业务负责人（3人）
  { id: '3', username: 'aolei', real_name: '敖蕾', email: 'aolei@example.com', phone: '13800001003', is_active: true, roles: [{ role_id: '2', role_name: '业务负责人' }], group_name: '业务团队', created_at: new Date().toISOString() },
  { id: '4', username: 'xuekun', real_name: '薛锟', email: 'xuekun@example.com', phone: '13800001004', is_active: true, roles: [{ role_id: '2', role_name: '业务负责人' }], group_name: '业务团队', created_at: new Date().toISOString() },
  { id: '5', username: 'yuqinxia', real_name: '余琴霞', email: 'yuqinxia@example.com', phone: '13800001005', is_active: true, roles: [{ role_id: '2', role_name: '业务负责人' }], group_name: '业务团队', created_at: new Date().toISOString() },
  // 业务1组：组长+3组员
  { id: '6', username: 'shenwenjun', real_name: '沈文君', email: 'shenwenjun@example.com', phone: '13800001006', is_active: true, roles: [{ role_id: '3', role_name: '业务组长' }], group_name: '业务1组', created_at: new Date().toISOString() },
  { id: '7', username: 'yaoyiping', real_name: '姚怡萍', email: 'yaoyiping@example.com', phone: '13800001007', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务1组', created_at: new Date().toISOString() },
  { id: '8', username: 'yanqiuyue', real_name: '闫秋月', email: 'yanqiuyue@example.com', phone: '13800001008', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务1组', created_at: new Date().toISOString() },
  { id: '9', username: 'chengyu', real_name: '程裕', email: 'chengyu@example.com', phone: '13800001009', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务1组', created_at: new Date().toISOString() },
  // 业务2组：组长+2组员
  { id: '10', username: 'chenyuchen', real_name: '陈宇辰', email: 'chenyuchen@example.com', phone: '13800001010', is_active: true, roles: [{ role_id: '3', role_name: '业务组长' }], group_name: '业务2组', created_at: new Date().toISOString() },
  { id: '11', username: 'zhouqiqing', real_name: '周琦青', email: 'zhouqiqing@example.com', phone: '13800001011', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务2组', created_at: new Date().toISOString() },
  { id: '12', username: 'wuyufei', real_name: '吴宇飞', email: 'wuyufei@example.com', phone: '13800001012', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务2组', created_at: new Date().toISOString() },
  // 业务3组：组长+1组员
  { id: '13', username: 'gaolulu', real_name: '高璐璐', email: 'gaolulu@example.com', phone: '13800001013', is_active: true, roles: [{ role_id: '3', role_name: '业务组长' }], group_name: '业务3组', created_at: new Date().toISOString() },
  { id: '14', username: 'zhaotianqi', real_name: '赵天琪', email: 'zhaotianqi@example.com', phone: '13800001014', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务3组', created_at: new Date().toISOString() },
  // 业务4组：组长+3组员
  { id: '15', username: 'liucheng', real_name: '刘程', email: 'liucheng@example.com', phone: '13800001015', is_active: true, roles: [{ role_id: '3', role_name: '业务组长' }], group_name: '业务4组', created_at: new Date().toISOString() },
  { id: '16', username: 'xujing', real_name: '许靖', email: 'xujing@example.com', phone: '13800001016', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务4组', created_at: new Date().toISOString() },
  { id: '17', username: 'taomingyue', real_name: '陶明月', email: 'taomingyue@example.com', phone: '13800001017', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务4组', created_at: new Date().toISOString() },
  { id: '18', username: 'xujiayin', real_name: '徐嘉胤', email: 'xujiayin@example.com', phone: '13800001018', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务4组', created_at: new Date().toISOString() },
  // 业务5组：组长+1组员
  { id: '19', username: 'yuweiwei', real_name: '余维维', email: 'yuweiwei@example.com', phone: '13800001019', is_active: true, roles: [{ role_id: '3', role_name: '业务组长' }], group_name: '业务5组', created_at: new Date().toISOString() },
  { id: '20', username: 'zhangpuwei', real_name: '张埔微', email: 'zhangpuwei@example.com', phone: '13800001020', is_active: true, roles: [{ role_id: '4', role_name: '业务员' }], group_name: '业务5组', created_at: new Date().toISOString() },
  // 数据录入组长
  { id: '21', username: 'annazhen', real_name: '安娜祯', email: 'annazhen@example.com', phone: '13800001021', is_active: true, roles: [{ role_id: '5', role_name: '数据录入组长' }], group_name: '业务团队', created_at: new Date().toISOString() },
  // 共享团队：负责人+合同专员+入离职专员
  { id: '22', username: 'jianglu', real_name: '江璐', email: 'jianglu@example.com', phone: '13800001022', is_active: true, roles: [{ role_id: '6', role_name: '共享团队负责人' }], group_name: '共享团队', created_at: new Date().toISOString() },
  { id: '23', username: 'yangchun', real_name: '杨纯', email: 'yangchun@example.com', phone: '13800001023', is_active: true, roles: [{ role_id: '7', role_name: '合同专员' }], group_name: '共享团队', created_at: new Date().toISOString() },
  { id: '24', username: 'maoyani', real_name: '毛雅妮', email: 'maoyani@example.com', phone: '13800001024', is_active: true, roles: [{ role_id: '8', role_name: '入离职联系专员' }], group_name: '共享团队', created_at: new Date().toISOString() },
  { id: '25', username: 'fuqianwen', real_name: '傅倩雯', email: 'fuqianwen@example.com', phone: '13800001025', is_active: true, roles: [{ role_id: '9', role_name: '福保负责人' }], group_name: '福利保障部', created_at: new Date().toISOString() },
];

const store = () => {
  const list = loadList<UserItem>(KEY, SEED);
  ensureSeedPasswords();
  return list;
};
const commit = (l: UserItem[]) => saveList(KEY, l);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const clampPageSize = (value: unknown) => {
  const pageSize = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
};

export async function getUsers(params: PageParams): Promise<PageResult<UserItem>> {
  const safeParams: PageParams = { ...params, pageSize: clampPageSize(params.pageSize) };
  if (isMockMode) {
    const list = store();
    const page = safeParams.page || 1;
    const pageSize = safeParams.pageSize || DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);
    return mockDelay({ list: paged, page, pageSize, total: list.length, totalPages: Math.ceil(list.length / pageSize), success: true });
  }
  try {
    const result = await request.get('/admin/users', { params: safeParams }) as any;
    const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
    // Normalize: map camelCase backend fields (userRoles → roles, department → group_name)
    const list = (Array.isArray(rawList) ? rawList : []).map((u: any) => normalizeUserItem(u));
    return {
      list,
      page: result?.page ?? safeParams.page ?? 1,
      pageSize: result?.pageSize ?? safeParams.pageSize ?? DEFAULT_PAGE_SIZE,
      total: result?.total ?? list.length,
      totalPages: result?.totalPages ?? 1,
      success: result?.success ?? true,
    } as PageResult<UserItem>;
  } catch {
    // ★ 后端不可用时返回空列表，防止 ProTable crash
    return { list: [], page: 1, pageSize: safeParams.pageSize || DEFAULT_PAGE_SIZE, total: 0, totalPages: 0, success: false };
  }
}

export async function getUsersByTeam(teamCode: string): Promise<UserItem[]> {
  if (isMockMode) {
    const list = store().filter((u) => u.is_active);
    const sharedTeam = ['contract', 'contract_signing', 'onboarding_contact', 'shared_team'];
    if (teamCode === 'data_entry') return mockDelay(list.filter((u) => u.username === 'annazhen'));
    if (teamCode === 'contract' || teamCode === 'contract_signing') return mockDelay(list.filter((u) => ['yangchun', 'jianglu'].includes(u.username)));
    if (teamCode === 'onboarding_contact') return mockDelay(list.filter((u) => ['maoyani', 'jianglu'].includes(u.username)));
    if (teamCode === 'social_insurance') return mockDelay(list.filter((u) => u.username === 'fuqianwen'));
    if (sharedTeam.includes(teamCode)) return mockDelay(list.filter((u) => u.group_name.includes('共享')));
    return mockDelay(list.filter((u) => u.group_name === teamCode || u.department_id === teamCode));
  }
  const raw = await request.get(`/users/by-team/${encodeURIComponent(teamCode)}`) as any;
  const rawList = Array.isArray(raw) ? raw : (raw?.list || raw?.items || raw?.data || []);
  return (Array.isArray(rawList) ? rawList : []).map((u: any) => normalizeUserItem(u));
}

export async function getUser(id: string): Promise<UserItem> {
  if (isMockMode) {
    const u = store().find((x) => x.id === id);
    if (!u) return mockDelay(Promise.reject(new Error('用户不存在')));
    return mockDelay(u);
  }
  const raw = await request.get(`/admin/users/${id}`) as any;
  return normalizeUserItem(raw);
}

export async function createUser(data: Partial<UserItem>): Promise<UserItem> {
  if (isMockMode) {
    const list = store();

    const duplicateUsername = list.find(u => u.username === data.username);
    const duplicateRealName = list.find(u => u.real_name === data.real_name);

    if (duplicateUsername && duplicateRealName) {
      return mockDelay(Promise.reject(new Error('用户名和姓名均已存在')));
    }
    if (duplicateUsername) {
      return mockDelay(Promise.reject(new Error('用户名已存在，请使用其他用户名')));
    }
    if (duplicateRealName) {
      return mockDelay(Promise.reject(new Error('姓名已被使用，请使用其他姓名')));
    }

    const item: UserItem = {
      id: nextId(list),
      username: data.username || '',
      real_name: data.real_name || '',
      email: data.email || '',
      phone: data.phone || '',
      is_active: data.is_active ?? true,
      roles: data.roles || [],
      group_name: data.group_name || '',
      created_at: new Date().toISOString(),
    };
    list.push(item); commit(list);
    if (data.password) {
      setUserPassword(item.username, data.password);
    }
    const { password, ...result } = item;
    return mockDelay(result as UserItem);
  }
  return request.post('/admin/users', data) as Promise<UserItem>;
}

export async function updateUser(id: string, data: Partial<UserItem>): Promise<UserItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((u) => u.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('用户不存在')));

    const duplicateUsername = list.find(u => u.id !== id && u.username === data.username);
    const duplicateRealName = list.find(u => u.id !== id && u.real_name === data.real_name);

    if (duplicateUsername && duplicateRealName) {
      return mockDelay(Promise.reject(new Error('用户名和姓名均已存在')));
    }
    if (duplicateUsername) {
      return mockDelay(Promise.reject(new Error('用户名已存在，请使用其他用户名')));
    }
    if (duplicateRealName) {
      return mockDelay(Promise.reject(new Error('姓名已被使用，请使用其他姓名')));
    }

    const oldUsername = list[idx].username;
    list[idx] = { ...list[idx], ...data, id };
    commit(list);
    if (data.username && data.username !== oldUsername) {
      const pwds = loadPasswords();
      const pIdx = pwds.findIndex((p) => p.username === oldUsername);
      if (pIdx >= 0) {
        pwds[pIdx].username = data.username;
        savePasswords(pwds);
      }
    }
    if (data.password) {
      setUserPassword(data.username || oldUsername, data.password);
    }
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/users/${id}`, data) as Promise<UserItem>;
}

export async function deleteUser(id: string): Promise<void> {
  if (isMockMode) {
    const list = store();
    const user = list.find((u) => u.id === id);
    commit(list.filter((u) => u.id !== id));
    if (user) {
      const pwds = loadPasswords().filter((p) => p.username !== user.username);
      savePasswords(pwds);
    }
    return mockDelay(undefined);
  }
  return request.delete(`/admin/users/${id}`) as Promise<void>;
}

export async function resetUserPassword(id: string, newPassword?: string): Promise<void> {
  if (isMockMode) {
    const list = store();
    const user = list.find((u) => u.id === id);
    if (!user) return mockDelay(Promise.reject(new Error('用户不存在')));
    const defaultPwd = newPassword || DEFAULT_SEED_PASSWORDS[user.username] || '123456';
    setUserPassword(user.username, defaultPwd);
    return mockDelay(undefined);
  }
  // 后端需要 newPassword 参数，默认重置为当前种子默认密码 123456
  const resetPassword = newPassword || '123456';
  return request.post(`/admin/users/${id}/reset-password`, { newPassword: resetPassword }) as Promise<void>;
}

export async function toggleUserActive(id: string): Promise<UserItem> {
  if (isMockMode) {
    const list = store();
    const idx = list.findIndex((u) => u.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('用户不存在')));
    list[idx] = { ...list[idx], is_active: !list[idx].is_active };
    commit(list);
    return mockDelay(list[idx]);
  }
  return request.post(`/admin/users/${id}/toggle-active`) as Promise<UserItem>;
}

export interface PasswordStatus {
  username: string;
  real_name: string;
  is_active: boolean;
  has_password: boolean;
  password: string;
}

export function getAllUserPasswordStatus(): PasswordStatus[] {
  const users = store();
  const pwds = loadPasswords();
  const pwdMap = new Map(pwds.map((p) => [p.username, p.password_hash]));
  return users.map((u) => ({
    username: u.username,
    real_name: u.real_name,
    is_active: u.is_active,
    has_password: pwdMap.has(u.username),
    password: pwdMap.get(u.username) || '',
  }));
}

export function getUserPasswordStatus(username: string): {
  has_password: boolean;
  password: string;
  must_change_password: boolean;
  password_updated_at: string | null;
} {
  const pwds = loadPasswords();
  const entry = pwds.find((p) => p.username === username);
  return {
    has_password: !!entry,
    password: entry?.password_hash || '',
    must_change_password: entry?.must_change_password ?? false,
    password_updated_at: entry?.password_updated_at ?? null,
  };
}

export function changeUserPassword(username: string, oldPassword: string, newPassword: string): void {
  const pwds = loadPasswords();
  const entry = pwds.find((p) => p.username === username);
  if (!entry) throw new Error('用户不存在或无密码记录');
  if (entry.password_hash !== oldPassword) throw new Error('旧密码不正确');
  if (newPassword.length < 6) throw new Error('新密码至少6位');
  entry.password_hash = newPassword;
  entry.must_change_password = false;
  entry.password_updated_at = new Date().toISOString();
  savePasswords(pwds);
}

export function resetAllSeedPasswords(): { fixed: string[]; skipped: string[] } {
  const existing = loadPasswords();
  const existingMap = new Map(existing.map((p) => [p.username, p]));
  const result = { fixed: [] as string[], skipped: [] as string[] };
  const updated = [...existing];

  for (const [username, defaultPwd] of Object.entries(DEFAULT_SEED_PASSWORDS)) {
    const entry = existingMap.get(username);
    if (!entry) {
      updated.push({ username, password_hash: defaultPwd, must_change_password: true, password_updated_at: null });
      result.fixed.push(username);
    } else {
      entry.password_hash = defaultPwd;
      entry.must_change_password = true;
      entry.password_updated_at = null;
      result.fixed.push(username);
    }
  }
  savePasswords(updated);
  return result;
}

export function clearAllAuthCache(): string[] {
  const keys = ['mock_admin_users_v1', 'mock_admin_passwords_v1', 'mock_session_user_v1'];
  const cleared: string[] = [];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
      cleared.push(key);
    } catch { /* ignore */ }
  }
  return cleared;
}

export interface LoginVerifyResult {
  username: string;
  real_name: string;
  status: 'ok' | 'no_user' | 'no_password' | 'wrong_password' | 'disabled' | 'error';
  error?: string;
  expected_password: string;
}

export function verifyAllSeedUserCredentials(): LoginVerifyResult[] {
  const results: LoginVerifyResult[] = [];
  const users = store();
  const pwds = loadPasswords();
  const pwdMap = new Map(pwds.map((p) => [p.username, p.password_hash]));

  for (const [username, expectedPwd] of Object.entries(DEFAULT_SEED_PASSWORDS)) {
    const user = users.find((u) => u.username === username);
    if (!user) {
      results.push({
        username,
        real_name: '',
        status: 'no_user',
        expected_password: expectedPwd,
        error: '用户不存在于 localStorage',
      });
      continue;
    }
    if (!user.is_active) {
      results.push({
        username,
        real_name: user.real_name,
        status: 'disabled',
        expected_password: expectedPwd,
        error: '用户已被禁用',
      });
      continue;
    }
    const storedPwd = pwdMap.get(username);
    if (!storedPwd) {
      results.push({
        username,
        real_name: user.real_name,
        status: 'no_password',
        expected_password: expectedPwd,
        error: '没有密码记录',
      });
      continue;
    }
    if (storedPwd !== expectedPwd) {
      results.push({
        username,
        real_name: user.real_name,
        status: 'wrong_password',
        expected_password: expectedPwd,
        error: `密码不匹配 (存储: ${storedPwd}, 预期: ${expectedPwd})`,
      });
      continue;
    }
    results.push({
      username,
      real_name: user.real_name,
      status: 'ok',
      expected_password: expectedPwd,
    });
  }
  return results;
}
