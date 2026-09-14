> 【归档横幅】本目录只作历史留痕，不是规则来源；当前规则与口径见根目录 AGENTS.md 与 docs/AI修改前必读.md，端口以 config/env.ps1 为唯一事实源。
# 前端权限体系分析报告

## 一、权限控制架构概览

前端权限体系采用**三层防御**结构：
1. **路由层权限守卫** - 阻止未授权路由访问
2. **菜单层动态过滤** - 仅显示有权限的菜单项
3. **组件层细粒度控制** - 按钮/字段级别的显示隐藏

---

## 二、核心实现文件

### 2.1 权限配置中心
- `frontend/src/config/routeVisibility.ts` (408行)
  - 定义 ROUTE_VISIBILITY 路由×角色矩阵
  - 定义 ROUTE_ACTION_PERMISSIONS 路由×权限动作映射
  - 提供 canAccessPath() 统一判定入口

### 2.2 角色规范化
- `frontend/src/constants/roles.ts` (69行)
  - 定义 9 个规范角色常量 (ROLE.ADMIN, ROLE.BUSINESS_OWNER 等)
  - 后端旧角色代码归一化 (biz_leader → business_group_leader)
  - 提供 canonicalRoleCodes() 统一转换接口

### 2.3 模块访问控制
- `frontend/src/utils/moduleAccess.ts` (170行)
  - 定义 PHASE1_ENABLED_MODULE_CODES 白名单
  - 实现 getAccessibleModuleCodes() 按角色+权限计算可访问模块
  - 实现 canAccessModuleCode() 判断单个模块访问权

### 2.4 权限工具函数
- `frontend/src/utils/permission.ts` (25行)
  - hasPermission() - 检查权限码
  - hasRole() - 检查角色码

### 2.5 字段权限
- `frontend/src/hooks/useFieldPermissions.ts` (73行)
  - 从后端 /field-permissions API 获取字段权限配置
  - 返回 {visible|hidden|readonly|masked} 权限等级
  - admin 角色跳过字段权限检查

---

## 三、权限数据流

### 3.1 登录阶段
```
用户输入凭证
  ↓
POST /auth/login (frontend/src/services/auth.ts:141)
  ↓
后端返回 { token, user: { roles: [], permissions: [] } }
  ↓
存储到 userStore (frontend/src/stores/userStore.ts)
  ↓
localStorage 持久化 token
```

### 3.2 权限加载
```
页面刷新/路由变化
  ↓
PrivateRoute 检查 isLoggedIn (frontend/src/routes/index.tsx:83)
  ↓
如果无 user → fetchUser() 调用 GET /auth/me
  ↓
更新 userStore.user { roles, permissions }
```

### 3.3 路由守卫流程
```
用户访问路由 /onboarding/contract
  ↓
RoleRoute 组件 (routes/index.tsx:107)
  ↓
调用 canAccessPath(pathname, user.roles, user.permissions)
  ↓
routeVisibility.ts:393 - 查找 ROUTE_VISIBILITY[route]
  ↓
检查 userHasAnyCanonicalRole(userRoles, requiredRoles)
  ↓
不匹配 → 重定向 /403
匹配 → 渲染组件
```

### 3.4 菜单过滤流程
```
BasicLayout 渲染 (layouts/BasicLayout.tsx:264)
  ↓
filterMenuByRoles(RAW_MENU, user.roles, user.permissions, businessScope)
  ↓
遍历每个菜单项调用 canAccessPath(it.path, userRoles, permissions)
  ↓
过滤掉不可访问的菜单项
  ↓
返回可见菜单树
```

---

## 四、组件级权限控制

### 4.1 Hook 使用模式
```typescript
// 页面组件中
import { useAuth } from '@/hooks/useAuth';

const { hasRole, hasPermission, user } = useAuth();

const canCreate = hasRole(ROLE.ADMIN) || hasRole(ROLE.BUSINESS_GROUP_LEADER);
const canExport = hasPermission(['work_order.export']);
```

### 4.2 按钮显示控制示例 (WorkOrders/index.tsx:172)
```typescript
const canCreateWorkOrder = actionsLoaded 
  ? allowedActions.includes('work_order.create')
  : (isAdmin || canBusinessUserCreateOrImport);

// 渲染时
{canCreateWorkOrder && <Button onClick={handleCreate}>新建</Button>}
```

### 4.3 字段权限控制 (DynamicForm/index.tsx)
```typescript
const { permissions } = useFieldPermissions(scenario);

// 根据 permissions[fieldCode] 决定字段是否显示/只读/脱敏
if (permission === 'hidden') return null;
if (permission === 'readonly') fieldProps.disabled = true;
```

---

## 五、权限判断逻辑分层

### 5.1 角色优先级 (routeVisibility.ts:393)
1. **角色基础准入** - ROUTE_VISIBILITY 定义的角色列表
2. **动态权限增强** - 当用户拥有 ROUTE_ACTION_PERMISSIONS 中的权限码时可访问
3. **管理员全通** - admin 角色通过 permissions: ['*'] 绕过所有检查

### 5.2 权限码格式
- `route.*` - 路由访问权限 (route.dashboard)
- `module.*` - 模块操作权限 (module.contract.manage)
- `work_order.*` - 工单操作权限 (work_order.create)
- `system.admin` - 系统管理权限
- `*` / `all` - 超级通配符 (仅 admin)

### 5.3 权限计算组合逻辑
```typescript
// canAccessPath 完整判定链 (routeVisibility.ts:393)
function canAccessPath(pathname, userRoles, permissions) {
  1. 解析 pathname → 规范路由 (resolveVisibilityRoute)
  2. 获取该路由要求的角色列表 (ROUTE_VISIBILITY[route])
  3. 如果用户角色匹配任一要求角色 → 通过
  4. 否则检查用户权限码是否匹配 ROUTE_ACTION_PERMISSIONS[route]
  5. 都不匹配 → 拒绝
}
```

---

## 六、前后端权限同步机制

### 6.1 数据来源
- **角色信息** - /auth/login 和 /auth/me 返回 user.roles[]
- **权限码列表** - /auth/login 返回 user.permissions[]
- **动态权限配置** - /role-actions API (roleActionPermissions.ts)
- **字段权限矩阵** - /field-permissions API (useFieldPermissions.ts)

### 6.2 同步时机
- 登录成功 → 立即写入 userStore
- 页面刷新 → PrivateRoute 触发 fetchUser()
- visibilitychange 事件 → 重新校验 token
- storage 事件 → 跨标签页同步登录态

### 6.3 缓存策略
- **userStore** - Zustand 内存缓存，跨组件共享
- **localStorage** - token 持久化，刷新后恢复登录态
- **字段权限缓存** - useFieldPermissions 使用 Map 缓存 (按 roleIds+scenario)

---

## 七、当前实现存在的问题

### 7.1 权限判断分散
- **路由层** 用 canAccessPath (routeVisibility.ts)
- **菜单层** 也用 canAccessPath (BasicLayout.tsx:277)
- **组件层** 混用 hasRole / hasPermission / allowedActions
- **模块层** 单独用 canAccessModuleCode (moduleAccess.ts)
→ 缺乏统一权限判断入口，维护时容易遗漏

### 7.2 角色硬编码泛滥
在 87 个文件中搜索到 permission|role|auth 关键词，大量页面组件直接硬编码角色判断：
```typescript
// WorkOrders/New/index.tsx:57
hasRole('admin') || hasRole('business_group_leader')

// OnboardingModule/index.tsx:96
hasRole('labor_contract_member') || hasRole('shared_team_owner')
```
→ 业务规则分散在组件中，角色调整需要全局搜索修改

### 7.3 双重权限系统混乱
- **旧系统** - 基于角色的静态权限 (ROUTE_VISIBILITY)
- **新系统** - 基于权限码的动态权限 (ROUTE_ACTION_PERMISSIONS + /role-actions API)
- 两套系统并存但判断逻辑不一致：
  - 路由守卫优先角色匹配
  - 按钮显示优先 allowedActions
→ 权限配置修改可能不生效或部分生效

### 7.4 字段权限仅适用管理员配置
useFieldPermissions 在非 admin 角色下：
- 需要 roleIds (user.roles[].id)
- 但登录态有时只返回 role.code 而无 id
- 此时直接返回空权限 → DynamicForm 默认全可见
→ 字段权限配置对部分角色无效

### 7.5 模块访问权限口径独立
moduleAccess.ts 定义的模块白名单 (PHASE1_ENABLED_MODULE_CODES) 与路由权限 (routeVisibility.ts) 不同步：
- 路由允许访问 /onboarding/benefit_apply
- 但 isPhase1VisibleModule('benefit_apply') → false
→ 可能出现路由能进但模块过滤后数据为空

### 7.6 权限缓存失效风险
- userStore 不监听 localStorage token 变化
- 其他标签页登出后当前页 userStore.user 仍然存在
- 需要手动刷新或等待下次 API 401 才能触发登出
→ 安全隐患

---

## 八、关键代码位置索引

| 功能 | 文件路径 | 关键函数/常量 | 行号 |
|------|---------|--------------|------|
| 路由权限配置 | config/routeVisibility.ts | ROUTE_VISIBILITY | 110-216 |
| 路由权限判断 | config/routeVisibility.ts | canAccessPath() | 393-403 |
| 角色常量定义 | constants/roles.ts | ROLE | 13-23 |
| 角色归一化 | constants/roles.ts | canonicalRoleCode() | 51-54 |
| 模块访问判断 | utils/moduleAccess.ts | canAccessModuleCode() | 161-167 |
| 权限工具函数 | utils/permission.ts | hasPermission/hasRole | 5-24 |
| 用户状态管理 | stores/userStore.ts | useUserStore | 34-88 |
| 登录接口 | services/auth.ts | login() | 141-193 |
| 权限 Hook | hooks/useAuth.ts | useAuth() | 4-25 |
| 字段权限 Hook | hooks/useFieldPermissions.ts | useFieldPermissions() | 8-72 |
| 路由守卫 | routes/index.tsx | PrivateRoute/RoleRoute | 83-113 |
| 菜单过滤 | layouts/BasicLayout.tsx | filterMenuByRoles() | 264-282 |

---

## 九、总结

前端权限体系完整但分散，核心问题是**双重权限系统并存**且判断逻辑不统一。建议：
1. 统一权限判断入口，废弃组件内硬编码角色
2. 明确新旧权限系统迁移路径，逐步淘汰 ROUTE_VISIBILITY 静态配置
3. 修复字段权限在非 admin 角色下的失效问题
4. 同步模块白名单与路由权限配置
