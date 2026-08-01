/**
 * 权限配置中心的共享类型。
 *
 * PermissionConfig 的 JSON 形状由 config/permission-schema.json 校验；
 * 本文件只描述编译期契约，不替代运行时校验。
 */

/**
 * 字段可见性模式的序列化值。
 */
export type FieldViewMode = 'visible' | 'hidden' | 'readonly' | 'masked';

/**
 * 字段权限模式常量。
 *
 * 使用 type + const 的组合，同时支持：
 * - 配置对象中的字面量值（例如 'visible'）
 * - 既有调用方的 FieldViewMode.VISIBLE 写法
 */
export const FieldViewMode = {
  VISIBLE: 'visible',
  HIDDEN: 'hidden',
  READONLY: 'readonly',
  MASKED: 'masked',
} as const;

/**
 * 角色层级。
 */
export type RoleLevel =
  | 'execution'
  | 'supervisor'
  | 'management'
  | 'global'
  | 'SYSTEM'
  | 'MANAGEMENT'
  | 'BUSINESS'
  | 'OPERATIONAL';

/**
 * 角色层级常量，值与现有角色实体保持一致。
 */
export const RoleLevel = {
  EXECUTION: 'execution',
  SUPERVISOR: 'supervisor',
  MANAGEMENT: 'management',
  GLOBAL: 'global',
  SYSTEM: 'SYSTEM',
  BUSINESS: 'BUSINESS',
  OPERATIONAL: 'OPERATIONAL',
  MANAGEMENT_LEGACY: 'MANAGEMENT',
} as const;

/**
 * 角色定义。
 */
export interface RoleDefinition {
  /** 角色唯一标识（UUID）。 */
  id: string;
  /** 后端角色代码。 */
  code: string;
  /** 角色显示名称。 */
  name: string;
  /** 前端使用的规范化角色代码。 */
  canonicalCode: string;
  /** 是否启用。 */
  isActive: boolean;
  /** 角色描述。 */
  description?: string;
  /** 角色层级。 */
  level?: RoleLevel;
}

/**
 * 菜单配置。
 */
export interface MenuConfig {
  /** 菜单标题。 */
  title: string;
  /** 菜单图标（Ant Design 图标名）。 */
  icon?: string;
  /** 菜单排序。 */
  order?: number;
  /** 是否隐藏菜单项。 */
  hidden?: boolean;
  /** 父级菜单路由路径。 */
  parentPath?: string;
}

/**
 * 路由权限配置。
 */
export interface RoutePermission {
  /** 路由路径。 */
  path: string;
  /** 允许访问的角色代码列表。 */
  allowedRoles: string[];
  /** 对应的后端操作权限码。 */
  backendActions?: string[];
  /** 菜单配置。 */
  menu?: MenuConfig;
}

/**
 * 场景下的角色-字段权限映射。
 */
export type RoleFieldRules = Record<string, Record<string, FieldViewMode>>;

/**
 * 字段权限配置。
 */
export interface FieldPermissionRule {
  /** 字段权限场景标识，例如 dispatched:contract。 */
  scenario: string;
  /** 场景描述。 */
  description?: string;
  /** 角色代码到字段权限模式的映射。 */
  roleFieldRules: RoleFieldRules;
}

/**
 * 配置元数据。
 */
export interface PermissionConfigMetadata {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  comment?: string;
}

/**
 * 完整权限配置。
 */
export interface PermissionConfig {
  /** 配置版本号（语义化版本，例如 1.0.0）。 */
  version: string;
  /** 角色定义列表。 */
  roles: RoleDefinition[];
  /** 路由权限配置列表。 */
  routePermissions: RoutePermission[];
  /** 字段权限配置列表。 */
  fieldPermissions: FieldPermissionRule[];
  /** 可选的创建/更新元数据。 */
  metadata?: PermissionConfigMetadata;
}

/**
 * 权限配置版本（数据库实体对应的传输类型）。
 */
export interface PermissionConfigVersion {
  id: string;
  version: string;
  config: PermissionConfig;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  activatedAt?: Date;
  description?: string;
}

/**
 * 权限变更类型。
 */
export type PermissionChangeType =
  | 'create_role'
  | 'update_role'
  | 'delete_role'
  | 'update_route'
  | 'update_field'
  | 'activate_version';

/**
 * 权限变更审计日志。
 */
export interface PermissionChangeLog {
  id: string;
  versionId: string;
  changeType: PermissionChangeType;
  targetResource: string;
  oldValue?: unknown;
  newValue?: unknown;
  changedBy?: string;
  changedAt: Date;
  reason?: string;
}

/**
 * 角色权限摘要（查询辅助类型）。
 */
export interface RolePermissionSummary {
  roleCode: string;
  roleName: string;
  allowedRoutes: string[];
  backendActions: string[];
  fieldPermissionScenarios: string[];
  /** 旧查询接口的兼容字段，新的摘要查询使用上面的统一命名。 */
  accessibleRoutes?: string[];
  businessActions?: string[];
  fieldPermissions?: Record<string, Record<string, FieldViewMode>>;
}
