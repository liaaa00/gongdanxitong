/**
 * 权限配置类型定义
 * 与 config/permission-schema.json 保持一致
 */

/**
 * 字段可见性模式
 */
export type FieldViewMode = 'visible' | 'hidden' | 'readonly' | 'masked';

/**
 * 角色级别
 */
export type RoleLevel = 'SYSTEM' | 'MANAGEMENT' | 'BUSINESS' | 'OPERATIONAL';

/**
 * 角色定义
 */
export interface RoleDefinition {
  /** 角色唯一标识（UUID） */
  id: string;
  /** 角色代码（后端使用） */
  code: string;
  /** 角色显示名称 */
  name: string;
  /** 规范化角色代码（前端使用） */
  canonicalCode: string;
  /** 是否启用 */
  isActive: boolean;
  /** 角色描述 */
  description?: string;
  /** 角色级别 */
  level?: RoleLevel;
}

/**
 * 菜单配置
 */
export interface MenuConfig {
  /** 菜单标题 */
  title: string;
  /** 菜单图标（Ant Design图标名） */
  icon?: string;
  /** 菜单排序 */
  order?: number;
  /** 是否隐藏菜单项 */
  hidden?: boolean;
  /** 父菜单路径 */
  parent?: string;
}

/**
 * 路由权限配置
 */
export interface RoutePermission {
  /** 路由路径 */
  path: string;
  /** 允许访问的角色代码列表 */
  allowedRoles: string[];
  /** 对应的后端权限操作 */
  backendActions?: string[];
  /** 菜单配置 */
  menu?: MenuConfig;
}

/**
 * 字段权限规则
 * 格式：{ [roleCode]: { [fieldKey]: FieldViewMode } }
 */
export type RoleFieldRules = Record<string, Record<string, FieldViewMode>>;

/**
 * 字段权限配置
 */
export interface FieldPermissionRule {
  /** 场景标识，格式：模块:操作 */
  scenario: string;
  /** 场景描述 */
  description?: string;
  /** 角色×字段权限映射 */
  roleFieldRules: RoleFieldRules;
}

/**
 * 配置元数据
 */
export interface PermissionConfigMetadata {
  /** 创建时间 */
  createdAt?: string;
  /** 创建人 */
  createdBy?: string;
  /** 更新时间 */
  updatedAt?: string;
  /** 更新人 */
  updatedBy?: string;
  /** 变更说明 */
  comment?: string;
}

/**
 * 权限配置（完整）
 */
export interface PermissionConfig {
  /** 配置版本号 */
  version: string;
  /** 角色定义列表 */
  roles: RoleDefinition[];
  /** 路由权限配置列表 */
  routePermissions: RoutePermission[];
  /** 字段权限配置列表 */
  fieldPermissions: FieldPermissionRule[];
  /** 元数据 */
  metadata?: PermissionConfigMetadata;
}

/**
 * 权限配置版本（数据库实体）
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
 * 权限变更日志（数据库实体）
 */
export interface PermissionChangeLog {
  id: string;
  versionId: string;
  changeType: string;
  targetResource: string;
  oldValue?: any;
  newValue?: any;
  changedBy?: string;
  changedAt: Date;
  reason?: string;
}

/**
 * 角色权限摘要（查询辅助类型）
 */
export interface RolePermissionSummary {
  roleCode: string;
  roleName: string;
  allowedRoutes: string[];
  backendActions: string[];
  fieldPermissionScenarios: string[];
}
