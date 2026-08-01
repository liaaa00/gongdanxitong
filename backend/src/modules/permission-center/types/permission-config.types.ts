/**
 * 权限配置中心类型定义
 *
 * 对应 config/permission-schema.json
 */

/**
 * 字段可见性模式
 */
export enum FieldViewMode {
  VISIBLE = 'visible',   // 可见可编辑
  HIDDEN = 'hidden',     // 完全隐藏
  READONLY = 'readonly', // 可见只读
  MASKED = 'masked',     // 脱敏显示
}

/**
 * 角色定义
 */
export interface RoleDefinition {
  /** 角色唯一ID (UUID) */
  id: string;
  /** 角色代码（后端使用，如 biz_manager） */
  code: string;
  /** 角色显示名称 */
  name: string;
  /** 规范化角色代码（前端使用，如 business_owner） */
  canonicalCode: string;
  /** 角色是否启用 */
  isActive: boolean;
  /** 角色描述 */
  description?: string;
}

/**
 * 菜单配置
 */
export interface MenuConfig {
  /** 菜单标题 */
  title: string;
  /** Ant Design图标名称 */
  icon?: string;
  /** 菜单排序 */
  order?: number;
  /** 是否隐藏菜单项 */
  hidden?: boolean;
  /** 父级菜单路径 */
  parentPath?: string;
}

/**
 * 路由权限配置
 */
export interface RoutePermission {
  /** 路由路径（如 /work-orders） */
  path: string;
  /** 允许访问的角色代码列表 */
  allowedRoles: string[];
  /** 对应的后端业务权限码（如 ['route.work_orders', 'work_order.view']） */
  backendActions?: string[];
  /** 菜单配置（如果该路由显示在菜单中） */
  menu?: MenuConfig;
}

/**
 * 字段权限规则
 *
 * 场景 → 角色 → 字段 → 权限模式
 */
export interface FieldPermissionRule {
  /** 场景标识（如 dispatched:contract） */
  scenario: string;
  /** 场景描述 */
  description?: string;
  /** 角色×字段权限规则 */
  roleFieldRules: Record<string, Record<string, FieldViewMode>>;
}

/**
 * 完整权限配置
 */
export interface PermissionConfig {
  /** 配置版本号（语义化版本，如 1.0.0） */
  version: string;
  /** 角色定义列表 */
  roles: RoleDefinition[];
  /** 路由权限配置 */
  routePermissions: RoutePermission[];
  /** 字段权限配置 */
  fieldPermissions: FieldPermissionRule[];
}

/**
 * 权限配置版本（数据库实体）
 */
export interface PermissionConfigVersion {
  /** 版本ID (UUID) */
  id: string;
  /** 版本号 */
  version: string;
  /** 完整配置（JSONB） */
  config: PermissionConfig;
  /** 是否为当前激活版本 */
  isActive: boolean;
  /** 创建人ID */
  createdBy: string;
  /** 创建时间 */
  createdAt: Date;
  /** 激活时间 */
  activatedAt?: Date;
  /** 版本描述 */
  description?: string;
}

/**
 * 权限变更日志（数据库实体）
 */
export interface PermissionChangeLog {
  /** 日志ID (UUID) */
  id: string;
  /** 关联的配置版本ID */
  versionId: string;
  /** 变更类型 */
  changeType: 'create_role' | 'update_role' | 'delete_role'
    | 'update_route' | 'update_field' | 'activate_version';
  /** 目标资源 */
  targetResource: string;
  /** 变更前的值 */
  oldValue?: any;
  /** 变更后的值 */
  newValue?: any;
  /** 变更人ID */
  changedBy: string;
  /** 变更时间 */
  changedAt: Date;
  /** 变更原因 */
  reason?: string;
}

/**
 * 权限查询辅助类型
 */
export interface RolePermissionSummary {
  /** 角色代码 */
  roleCode: string;
  /** 角色名称 */
  roleName: string;
  /** 可访问的路由列表 */
  accessibleRoutes: string[];
  /** 拥有的业务权限码 */
  businessActions: string[];
  /** 各场景的字段权限 */
  fieldPermissions: Record<string, Record<string, FieldViewMode>>;
}
