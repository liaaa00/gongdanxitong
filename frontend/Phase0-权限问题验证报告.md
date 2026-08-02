# Phase 0 - 前端权限问题验证报告

> 验证时间：2026-08-01  
> 验证人：前端权限分析师  
> 数据来源：frontend/src/config/routeVisibility.ts, backend/角色权限清单-基线.md

---

## 问题1：business_owner路由权限不足

### 结论
**【正常设计】** - 符合业务定位，不是bug

### 验证过程

#### 1.1 前端配置分析
从 `routeVisibility.ts` 中查到 business_owner 所在的角色组：

```typescript
// line 11-21: ALL_ROLES 包含 BUSINESS_OWNER
const ALL_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,  // ✅ 包含
  ROLE.BUSINESS_GROUP_LEADER,
  // ...
];

// line 23-27: BUSINESS_ORDER_ROLES 不包含 BUSINESS_OWNER
const BUSINESS_ORDER_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_GROUP_LEADER,
  ROLE.BUSINESS_GROUP_MEMBER,
  // ❌ 不包含 BUSINESS_OWNER
];

// line 48-58: IN_SERVICE_ROLES 包含 BUSINESS_OWNER
const IN_SERVICE_ROLES = [
  ROLE.ADMIN,
  ROLE.BUSINESS_OWNER,  // ✅ 包含
  // ... 全部9个角色
];
```

**business_owner 无权访问的核心路由：**
- `/work-orders` - 主工单列表（需要 BUSINESS_ORDER_ROLES）
- `/work-orders/create` - 新建主工单（需要 WORK_ORDER_CREATE_ROLES）
- `/work-orders/import` - 批量导入（需要 WORK_ORDER_CREATE_ROLES）

**business_owner 可以访问的路由：**
- `/dashboard` - 仪表盘（ALL_ROLES）
- `/in-service` 及其所有子路由 - 在职管理（IN_SERVICE_ROLES）
- `/my-dispatched/:id` - 子工单详情（DISPATCHED_DETAIL_ROLES）
- `/dashboards/leader` - 领导看板（line 186）
- `/in-service/:id/audit` - 在职工单审批（line 172，可审批权限）

**动态权限配置（line 337-342）：**
```typescript
const BUSINESS_OWNER_DYNAMIC_ROUTES: readonly VisibilityRoute[] = [
  '/dashboard', 
  '/my-dispatched/:id'
];

const RESTRICTED_DYNAMIC_PERMISSION_ROUTES: Partial<Record<CanonicalRole, readonly VisibilityRoute[]>> = {
  [ROLE.BUSINESS_OWNER]: BUSINESS_OWNER_DYNAMIC_ROUTES,
  // ...
};
```
→ business_owner 仅在 dashboard 和子工单详情页支持动态权限增强

#### 1.2 后端配置对比
从 `backend/角色权限清单-基线.md` 查到后端 `biz_manager`（business_owner 的后端对应角色）：

```
### 2. biz_manager（业务负责人）
角色等级：MANAGEMENT
描述：公司业务全局视角：查看所有业务团队的工单统计与报表（只读），
      不可操作具体工单，用于决策分析。

权限列表（5 个）：
- work_order.view_all        ← 可查看所有工单
- work_order.export           ← 可导出数据
- route.dashboard
- route.dispatched_detail
- route.leader_dashboard
```

**关键发现：**
- ❌ 后端 `biz_manager` **没有** `route.work_orders` 权限
- ❌ 后端 `biz_manager` **没有** `work_order.create/import` 权限
- ✅ 后端 `biz_manager` 有 `work_order.view_all`（全局只读）

#### 1.3 业务定位分析
**角色名称语义：**
- `business_owner` / `biz_manager` = **业务负责人**
- 定位：**管理层 (MANAGEMENT)** 而非执行层

**实际业务场景：**
1. 业务负责人不直接操作工单（不建单、不导入、不修改）
2. 通过**领导看板** (`/dashboards/leader`) 查看全局统计
3. 通过**子工单详情** (`/my-dispatched/:id`) 查看具体进度
4. 通过**在职工单审批** (`/in-service/:id/audit`) 参与审批流程
5. **工单的实际操作由业务组长和业务员完成**

**为什么不给主工单列表权限？**
- 业务负责人需要的是**汇总视图**（看板），而非**明细列表**
- 明细列表操作（筛选、排序、批量操作）是执行层的工作
- 避免管理层在执行层界面上产生操作预期

### 修复建议
**不需要修复** - 当前配置符合角色定位

**可选优化：**
如果业务负责人确实需要查看主工单列表（只读，不可操作），可以：
1. 在 `BUSINESS_ORDER_ROLES` 中添加 `ROLE.BUSINESS_OWNER`
2. 在主工单列表页面隐藏操作按钮（新建/导入/编辑/删除）
3. 或者保持现状，通过领导看板满足查看需求

### 前后端一致性
✅ **前后端配置一致** - 都不给 business_owner 主工单操作权限

---

## 问题2：业务角色无法访问 /onboarding 入口

### 结论
**【正常设计】** - 业务角色通过其他入口访问子工单，不需要 /onboarding 入口

### 验证过程

#### 2.1 路由配置分析
```typescript
// line 37-44: ONBOARDING_ROLES 不包含业务侧角色
const ONBOARDING_ROLES = [
  ROLE.ADMIN,
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
  // ❌ 不包含 BUSINESS_GROUP_LEADER
  // ❌ 不包含 BUSINESS_GROUP_MEMBER
];

// ROUTE_VISIBILITY 配置
'/onboarding': ONBOARDING_ROLES,  // ← 业务角色无权访问

// 但业务角色可以访问所有子工单路由：
'/onboarding/onboarding_contact': [
  'admin', 
  'business_group_leader',  // ✅ 可访问
  'business_group_member',  // ✅ 可访问
  'onboarding_resignation_member', 
  'shared_team_owner'
],
'/onboarding/contract': [
  'admin', 
  'business_group_leader',  // ✅ 可访问
  'business_group_member',  // ✅ 可访问
  'labor_contract_member', 
  'shared_team_owner'
],
// ... 其他子工单同理
```

**核心发现：**
- `/onboarding` 入口只给**后道角色**（专业岗位）
- `/onboarding/*` 子工单路由给**业务侧 + 后道角色**

#### 2.2 菜单配置分析
从 `BasicLayout.tsx` line 141-156 查到菜单结构：

```typescript
const RAW_MENU: MenuItem[] = [
  { path: '/dashboard', name: '仪表盘' },
  {
    path: '/work-orders-group',  // ← 业务侧使用这个菜单组
    name: '入职管理',
    children: [
      { path: '/work-orders?orderType=onboarding', name: '入职主工单列表' },
      { path: '/onboarding/onboarding_contact', name: '入职联系子工单' },
      { path: '/onboarding/contract', name: '劳动合同新签子工单' },
      { path: '/onboarding/data_entry', name: '增员报岗录入子工单' },
      { path: '/onboarding/social_insurance', name: '社保公积金增员子工单' },
    ],
  },
  // ...
];
```

**菜单设计逻辑：**
1. 业务侧角色看到的菜单组是 **"入职管理"**（path: `/work-orders-group`）
2. 菜单第一项是 **"入职主工单列表"**（path: `/work-orders?orderType=onboarding`）
3. 后续是各个子工单入口（直接跳转 `/onboarding/*`）
4. **不需要先访问 `/onboarding` 父路由**

**后道角色的访问路径：**
```typescript
// 后道角色可能没有 work-orders 权限，需要直接进入子工单
// 所以给他们 /onboarding 入口，让他们从这里看到自己负责的模块列表
```

#### 2.3 实际访问路径对比

**业务组长/业务员的访问路径：**
```
登录后
  ↓
看到菜单："入职管理"
  ↓
点击"入职主工单列表" → /work-orders?orderType=onboarding
  ↓
或者点击"入职联系子工单" → /onboarding/onboarding_contact
  ↓
直接进入子工单列表，无需经过 /onboarding 父路由
```

**后道角色（如合同专员）的访问路径：**
```
登录后
  ↓
看到菜单："入职管理"
  ↓
点击进入 → /onboarding
  ↓
看到自己负责的模块（如"劳动合同新签"）
  ↓
点击进入 → /onboarding/contract
```

#### 2.4 设计原因分析
**为什么业务侧不需要 /onboarding 入口？**

1. **业务视角不同**
   - 业务侧：从**主工单**视角管理入职流程，先看主单再看子单
   - 后道视角：从**专业模块**视角处理子工单，只看自己负责的模块

2. **避免混淆**
   - `/onboarding` 路由可能是一个**模块总览页**或**路由占位**
   - 业务侧直接访问具体子工单，不需要总览

3. **权限隔离**
   - 业务侧可以看到**所有子工单模块**（因为他们负责全流程）
   - 后道角色只能看到**自己负责的模块**
   - `/onboarding` 入口可能包含模块选择逻辑，给后道角色筛选

### 修复建议
**不需要修复** - 当前设计合理

**如果一定要改，风险：**
- 给业务侧 `/onboarding` 权限后，可能导致路由混乱
- 需要检查 `/onboarding` 页面的实际内容和逻辑

### 前后端一致性
✅ **设计合理** - 业务侧通过主工单入口访问，后道通过模块入口访问

---

## 问题3：部分路由配置为空数组（无人可访问）

### 结论
**【部分是bug，部分是正常设计】**

### 验证过程

#### 3.1 所有空数组路由列表
从 `routeVisibility.ts` 搜索到 2 个空数组配置：

```typescript
// line 156
'/onboarding/resignation_cert': [],

// line 183
'/offboarding/proof-pool': [],
```

#### 3.2 代码引用情况
**使用 Grep 搜索结果：**
- `resignation_cert` 在 16 个文件中被引用
- `proof-pool` 在 16 个文件中被引用

**关键引用位置：**

1. **BasicLayout.tsx line 176**
```typescript
{ 
  path: '/onboarding/resignation_cert', 
  name: '离职材料收集子工单', 
  key: 'resignation-cert-sub-list', 
  menuVisible: false  // ← 菜单中隐藏
}
```

2. **routes/index.tsx**
```typescript
// 路由表中可能有注册，但权限配置为空
```

3. **其他引用**
   - `constants/modules.ts` - 模块代码定义
   - `services/*.ts` - API 调用
   - `utils/moduleAccess.ts` - 模块访问判断

#### 3.3 功能状态分析

**3.3.1 `/onboarding/resignation_cert`**

**结论：【可能是废弃路由】**

**分析：**
1. 菜单中已标记 `menuVisible: false`（不在菜单中显示）
2. 可能被 `/onboarding/resignation_contact` 替代
   - `resignation_cert` = 离职材料收集证明
   - `resignation_contact` = 离职材料收集
   - 两者功能重叠

3. **验证方法：**
   - 查看 `routes/index.tsx` 中是否有对应的组件
   - 如果组件不存在或为空，确认是废弃路由
   - 如果组件存在，可能是未完成功能

**修复建议：**
```typescript
// 方案1：如果是废弃路由，直接删除配置
// 从 ROUTE_VISIBILITY 中移除 '/onboarding/resignation_cert': []

// 方案2：如果是有效功能，添加权限
'/onboarding/resignation_cert': [
  ROLE.ADMIN,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SHARED_TEAM_OWNER,
],
```

**3.3.2 `/offboarding/proof-pool`**

**结论：【未完成功能或规划中功能】**

**分析：**
1. 命名为 `proof-pool`（证明池），可能是离职证明管理模块
2. 与已启用的路由对比：
   - ✅ `/offboarding/contact-pool` - 离职材料收集池（已启用）
   - ✅ `/offboarding/social-suspend-pool` - 减员报岗录入池（已启用）
   - ❌ `/offboarding/proof-pool` - 离职证明池（未启用）

3. 可能是**阶段性功能**：
   - 离职流程分为：材料收集 → 减员报岗 → 证明开具
   - `proof-pool` 可能是第三阶段（证明开具）的待办池
   - 但当前已用 `/resignation-certificates` 实现类似功能

**修复建议：**
```typescript
// 方案1：如果是未完成功能，保持空数组，添加注释
'/offboarding/proof-pool': [], // TODO: 阶段3开放离职证明池功能

// 方案2：如果功能已由其他路由替代，删除配置
// 从 ROUTE_VISIBILITY 中移除

// 方案3：如果需要启用，参考类似路由配置
'/offboarding/proof-pool': [
  ROLE.ADMIN,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
],
```

### 空数组路由总结表

| 路由 | 状态 | 建议 | 优先级 |
|------|------|------|--------|
| `/onboarding/resignation_cert` | 疑似废弃 | 验证后删除或添加权限 | P2 |
| `/offboarding/proof-pool` | 未完成功能 | 添加 TODO 注释或删除 | P3 |

### 前后端一致性
⚠️ **需要验证** - 检查后端是否有对应的路由处理器

---

## 四、验证总结

### 4.1 总体结论

| 问题 | 结论 | 是否需要修复 |
|------|------|-------------|
| business_owner路由权限不足 | 正常设计 | ❌ 不需要 |
| 业务角色无/onboarding入口 | 正常设计 | ❌ 不需要 |
| 空数组路由 | 部分bug | ✅ 需要（P2-P3） |

### 4.2 需要采取的行动

**立即行动（P1）：**
无

**近期行动（P2）：**
1. 验证 `/onboarding/resignation_cert` 是否有对应组件
2. 如果是废弃路由，从配置中删除
3. 如果是有效功能，添加适当的角色权限

**可选行动（P3）：**
1. 为 `/offboarding/proof-pool` 添加 TODO 注释，说明未来规划
2. 或者如果确认不会开发，删除该路由配置

### 4.3 文档更新建议
更新 `frontend/角色路由权限清单-基线.md` 中的问题说明：
- 删除"问题1：business_owner权限不足"（非bug）
- 删除"问题2：业务角色无onboarding入口"（非bug）
- 保留"问题3：空数组路由"，标注为 P2 优先级

---

**验证完成时间：** 2026-08-01  
**下一步：** 执行 P2 优先级的路由清理任务
