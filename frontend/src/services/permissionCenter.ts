import request from './request';
import { isMockMode, mockDelay } from './mock';

export type FieldViewMode = 'visible' | 'hidden' | 'readonly' | 'masked';
export type RoleLevel = 'execution' | 'supervisor' | 'management' | 'global';

export interface PermissionRole {
  id: string;
  code: string;
  name: string;
  canonicalCode: string;
  isActive: boolean;
  description?: string;
  level?: RoleLevel;
}

export interface RoutePermission {
  path: string;
  allowedRoles: string[];
  backendActions?: string[];
  menu?: {
    title: string;
    icon?: string;
    order?: number;
    hidden?: boolean;
    parentPath?: string;
  };
}

export interface FieldPermissionRule {
  scenario: string;
  description?: string;
  roleFieldRules: Record<string, Record<string, FieldViewMode>>;
}

export interface PermissionConfig {
  version: string;
  roles: PermissionRole[];
  routePermissions: RoutePermission[];
  fieldPermissions: FieldPermissionRule[];
  metadata?: {
    createdAt?: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    comment?: string;
  };
}

export interface PermissionConfigVersion {
  id: string;
  version: string;
  config: PermissionConfig;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  activatedAt?: string;
  description?: string;
}

const MOCK_KEY = 'mock_permission_center_versions_v1';

const MOCK_CONFIG: PermissionConfig = {
  version: '1.0.0',
  roles: [
    { id: '00000000-0000-4000-8000-000000000001', code: 'admin', canonicalCode: 'admin', name: '系统管理员', level: 'global', isActive: true },
    { id: '00000000-0000-4000-8000-000000000002', code: 'business_owner', canonicalCode: 'business_owner', name: '业务负责人', level: 'management', isActive: true },
    { id: '00000000-0000-4000-8000-000000000003', code: 'business_group_leader', canonicalCode: 'business_group_leader', name: '业务组长', level: 'supervisor', isActive: true },
    { id: '00000000-0000-4000-8000-000000000004', code: 'business_group_member', canonicalCode: 'business_group_member', name: '业务员', level: 'execution', isActive: true },
    { id: '00000000-0000-4000-8000-000000000005', code: 'labor_contract_member', canonicalCode: 'labor_contract_member', name: '合同专员', level: 'execution', isActive: true },
  ],
  routePermissions: [
    { path: '/dashboard', allowedRoles: ['admin', 'business_owner', 'business_group_leader', 'business_group_member', 'labor_contract_member'], backendActions: ['route.dashboard'], menu: { title: '仪表盘', order: 10 } },
    { path: '/work-orders', allowedRoles: ['admin', 'business_owner', 'business_group_leader', 'business_group_member'], backendActions: ['route.work_orders'], menu: { title: '工单列表', order: 20 } },
    { path: '/admin/permission-center', allowedRoles: ['admin'], backendActions: ['system.admin'], menu: { title: '权限配置中心', order: 90 } },
  ],
  fieldPermissions: [
    {
      scenario: 'create:onboarding',
      description: '入职工单创建',
      roleFieldRules: {
        admin: { employee_name: 'visible', id_card_no: 'visible' },
        business_group_member: { employee_name: 'visible', id_card_no: 'masked' },
      },
    },
  ],
};

function mockVersions(): PermissionConfigVersion[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(MOCK_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* use seed */ }
  }
  const seed: PermissionConfigVersion[] = [{
    id: '00000000-0000-4000-8000-100000000001',
    version: MOCK_CONFIG.version,
    config: MOCK_CONFIG,
    isActive: true,
    createdAt: '2026-08-02T00:00:00.000Z',
    activatedAt: '2026-08-02T00:00:00.000Z',
    description: '初始权限配置',
  }];
  window.localStorage.setItem(MOCK_KEY, JSON.stringify(seed));
  return seed;
}

function saveMockVersions(versions: PermissionConfigVersion[]) {
  window.localStorage.setItem(MOCK_KEY, JSON.stringify(versions));
}

function normalizeVersion(raw: any): PermissionConfigVersion {
  return {
    id: String(raw.id),
    version: String(raw.version),
    config: raw.config,
    isActive: Boolean(raw.isActive ?? raw.is_active),
    createdBy: raw.createdBy ?? raw.created_by ?? undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    activatedAt: raw.activatedAt ?? raw.activated_at ?? undefined,
    description: raw.description ?? undefined,
  };
}

export async function getActivePermissionConfig(): Promise<PermissionConfig> {
  if (isMockMode) {
    const active = mockVersions().find((item) => item.isActive) || mockVersions()[0];
    return mockDelay(structuredClone(active.config), 0);
  }
  return request.get('/permission-center/config') as Promise<PermissionConfig>;
}

export async function getPermissionVersions(): Promise<PermissionConfigVersion[]> {
  if (isMockMode) return mockDelay(mockVersions().map((item) => structuredClone(item)), 0);
  const result = await request.get('/permission-center/versions') as any;
  const list = Array.isArray(result) ? result : result?.list || result?.items || [];
  return list.map(normalizeVersion);
}

export async function getPermissionVersion(id: string): Promise<PermissionConfigVersion> {
  if (isMockMode) {
    const version = mockVersions().find((item) => item.id === id);
    if (!version) throw new Error('权限配置版本不存在');
    return mockDelay(structuredClone(version), 0);
  }
  return normalizeVersion(await request.get(`/permission-center/versions/${id}`));
}

export async function createPermissionVersion(config: PermissionConfig, description?: string): Promise<PermissionConfigVersion> {
  if (isMockMode) {
    const versions = mockVersions();
    if (versions.some((item) => item.version === config.version)) throw new Error('版本号已存在');
    const created: PermissionConfigVersion = {
      id: `00000000-0000-4000-8000-${String(versions.length + 1).padStart(12, '0')}`,
      version: config.version,
      config: structuredClone(config),
      isActive: false,
      createdAt: new Date().toISOString(),
      description,
    };
    saveMockVersions([created, ...versions]);
    return mockDelay(created, 0);
  }
  return normalizeVersion(await request.post('/permission-center/config', { config, description }));
}

export async function activatePermissionVersion(id: string): Promise<void> {
  if (isMockMode) {
    const now = new Date().toISOString();
    const versions = mockVersions().map((item) => ({
      ...item,
      isActive: item.id === id,
      activatedAt: item.id === id ? now : item.activatedAt,
    }));
    if (!versions.some((item) => item.id === id)) throw new Error('权限配置版本不存在');
    saveMockVersions(versions);
    return mockDelay(undefined, 0);
  }
  await request.post(`/permission-center/config/${id}/activate`);
}
