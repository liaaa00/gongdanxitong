# APP_FLOW.md — 用户流程文档

> 版本：0.1.0 · 用大白话（Plain Chinese）记录所有已实现的页面与跳转流程
> 不含已废弃的「同步组织架构」流程

---

## 1. 总体导航结构

```
登录页 → 仪表盘（首页）
         ├─ 入职管理（主工单列表 → 详情 / 新建 / 导入）
         ├─ 我的子工单（按模块分 Tab）
         ├─ 团队子工单（主管/组长视图）
         ├─ 续签管理（主工单列表 → 详情 / 新建）
         ├─ 离职管理（主工单列表 → 详情 / 新建）
         ├─ 待遇管理（主工单列表 → 详情 / 新建）
         ├─ 历史工单
         ├─ 通知中心
         └─ 系统管理（admin 可见）
              ├─ 用户管理
              ├─ 角色管理
              ├─ 部门管理
              ├─ 客户管理
              ├─ 业务员客户绑定
              ├─ 模块化配置
              ├─ 字段配置
              ├─ 字段权限
              ├─ 派发配置
              ├─ 工单流程配置
              ├─ 导出模板配置
              ├─ 操作日志
              ├─ AI 智能设置
              └─ 系统设置
```

---

## 2. 路由清单（全部现存页面）

### 2.1 无需登录

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | 登录页 | 用户名+密码登录，调用 `/api/auth/login` |
| `/change-password` | 强制改密页 | 首次登录/mustChangePassword 标记为 true 时被拦截至此 |
| `/403` | 无权限页 | 访问无权路由时显示 |
| `/404` | 未找到页 | 路由未匹配时显示 |

### 2.2 仪表盘

| 路径 | 页面 | 说明 |
|------|------|------|
| `/dashboard` | 仪表盘首页 | 卡片数据（我的 / 团队）、趋势图、工单类型矩阵 |

### 2.3 入职管理（主工单）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/work-orders` | 主工单列表 | ProTable 带搜索/筛选/批量操作 |
| `/work-orders/create` | 新建主工单 | 动态表单（按 orderType 加载不同字段） |
| `/work-orders/import` | 批量导入 | Excel 上传 + AI 字段映射 + 预览确认 |
| `/work-orders/:id` | 主工单详情 | 基本信息 + 字段编辑 + 提交/撤回/废弃操作 + 子工单预览 |
| `/onboarding/onboarding_contact` | 入职联系子工单（按模块筛） | 子工单列表 |
| `/onboarding/contract` | 合同签订子工单（按模块筛） | 子工单列表 |
| `/onboarding/data_entry` | 数据录入子工单 | 子工单列表（旧 URL 兼容） |
| `/onboarding/social_insurance` | 社保公积金子工单 | 子工单列表（旧 URL 兼容） |

### 2.4 我的子工单（4 个视图）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/my-work/initiated` | 我发起的 | 我是创建人的主工单 |
| `/my-work/pending` | 待我处理 | 指派给我的子工单 |
| `/my-work/backend-returned` | 退回给我的 | 后道退回待我修改 |
| `/my-work/done` | 我已处理完 | 已完成的子工单 |

### 2.5 团队子工单

| 路径 | 页面 | 说明 |
|------|------|------|
| `/my-work/team` | 团队子工单 | 主管视图：可查看、认领、分配 |
| `/my-work/history` | 历史工单 | 归档/已完成的全部工单 |

### 2.6 子工单详情

| 路径 | 页面 | 说明 |
|------|------|------|
| `/my-dispatched/:id` | 子工单详情 | 字段编辑 + 补充 + 完成/退回/转派操作 |
| `/dispatched-orders` | 旧子工单列表路径 | 重定向到 `/my-work/pending` |

### 2.7 续签管理

| 路径 | 页面 | 说明 |
|------|------|------|
| `/renewal` | 续签主工单列表 | 仅 `order_type=renewal` |
| `/renewal/new` | 新建续签工单 | |
| `/renewal/:id` | 续签工单详情 | |

### 2.8 离职管理

| 路径 | 页面 | 说明 |
|------|------|------|
| `/resignation` | 离职工单列表 | 仅 `order_type=resignation` |
| `/resignation/new` | 新建离职工单 | |
| `/resignation/:id` | 离职工单详情 | |
| `/resignation/cert` | 离职证明子工单 | 模块筛选 |

### 2.9 待遇管理

| 路径 | 页面 | 说明 |
|------|------|------|
| `/benefit` | 待遇工单列表 | 仅 `order_type=benefit` |
| `/benefit/new` | 新建待遇工单 | |
| `/benefit/:id` | 待遇工单详情 | |

### 2.10 通知中心

| 路径 | 页面 | 说明 |
|------|------|------|
| `/notifications` | 通知列表 | 分类 Tab（全部 / 未读 / 退回 / 催办 / 撤回 / 废弃 / 系统） |

### 2.11 待认领工单池

| 路径 | 页面 | 说明 |
|------|------|------|
| `/work-order-pool` | 公共工单池 | `pool` 策略子工单的公共待领池（重定向到 `/my-work/team`） |

### 2.12 导出模板（用户侧）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/export-templates` | 我的导出模板 | 用户个人导出模板管理 |

### 2.13 系统管理（仅 admin / 授权角色）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/admin/users` | 用户管理 | CRUD + 角色绑定 |
| `/admin/roles` | 角色管理 | CRUD + 权限/字段权限矩阵 |
| `/admin/departments` | 部门管理 | 树形 CRUD |
| `/admin/customers` | 客户管理 | CRUD + 分支管理 |
| `/admin/customer-assignees` | 业务员客户绑定 | 业务员↔客户关系 |
| `/admin/module-config` | 模块化配置 | 子模块定义/启用/停用 |
| `/admin/fields` | 字段配置 | 动态字段定义（所有字段类型） |
| `/admin/field-permissions` | 字段权限 | 角色×字段×场景 权限矩阵 |
| `/admin/dispatch-config` | 派发配置 | 派发规则 CRUD |
| `/admin/workflows` | 工单流程配置 | 工作流列表（ReactFlow 可视化） |
| `/admin/workflows/:id` | 工单流程编辑 | ReactFlow 拖拽编辑器 |
| `/admin/export-templates` | 导出模板配置 | 管理员统一模板管理 |
| `/admin/logs` | 操作日志 | 审计日志只读列表 |
| `/admin/ai-settings` | AI 智能设置 | OpenAI/兼容接口配置 |
| `/admin/system-settings` | 系统设置 | K/V 系统参数 |
| `/admin/login-debug` | 登录诊断 | 开发调试用 |

---

## 3. 用户典型操作流程

### 3.1 业务员创建入职主工单

```
1. 登录 → 仪表盘
2. 左侧菜单 "入职管理" → "主工单列表" (/work-orders)
3. 右上角 "新建工单" → 跳转 /work-orders/create
4. 填写动态表单（员工姓名、身份证、客户、分支、扩展字段）
5. 点击 "保存草稿" → 回到列表
6. 在列表中找到草稿，点击 "提交" → 工单状态变为 pending
7. 系统根据派发规则自动生成子工单（数据录入、社保、入职联系、合同）
```

### 3.2 后道处理人处理子工单

```
1. 登录 → 仪表盘（看到 "待处理" 卡片数字）
2. 左侧菜单 "我的子工单" → "待我处理" (/my-work/pending)
3. 或: 顶部铃铛通知 "你有一条新的子工单" → 点击跳转
4. 点击某条子工单 → 进入详情 /my-dispatched/:id
5. 点击 "接单" → 状态变为 processing
6. 查看/补充字段 → 点击 "完成" → 状态变为 completed
7. 如果有问题 → 点击 "退回" → 填写退回原因 → 状态变为 returned
```

### 3.3 主管查看团队工作量

```
1. 登录 → 仪表盘
2. "团队"Tab → 查看团队成员各自的处理量
3. 左侧菜单 "团队子工单" (/my-work/team)
4. 按模块/状态筛选
5. 可将待处理子工单转派给其他人
```

### 3.4 工单撤回/废弃流程

```
1. 在工单详情页 → 点击 "撤回" → 填写撤回原因
2. 工单状态变为 withdraw_pending
3. 审批人（admin/主管）收到通知
4. 审批人进入详情 → "同意撤回" / "拒绝撤回"
5. 同意 → 所有子工单一同撤回
6. 废弃同理 (void_pending → void)
```

### 3.5 异常/退回后重新提交

```
1. 子工单被退回 → 主工单状态变为 returned
2. 业务员收到通知
3. 进入 /my-work/backend-returned 查看退回的工单
4. 或进入工单详情 → 修改字段
5. 点击 "重新提交" (resubmit)
6. 工单重新进入处理流程
```

### 3.6 批量导入工单

```
1. /work-orders/import
2. 上传 Excel 文件
3. 系统调用 AI 字段映射（如果配置了 OpenAI）
4. 用户确认/调整映射关系
5. 预览数据 → 确认导入
6. 系统逐行校验，返回成功/失败统计
```

---

## 4. 页面间导航关系图

```
              ┌─────────────────────────────┐
              │           登录页             │
              │         /login              │
              └──────────┬──────────────────┘
                         │ (JWT 登录成功)
                         ▼
              ┌─────────────────────────────┐
              │         仪表盘首页           │
              │       /dashboard            │
              └──────────┬──────────────────┘
                         │
         ┌───────┬───────┼───────┬───────┬───────┐
         ▼       ▼       ▼       ▼       ▼       ▼
    入职管理  我的子工单 团队子工单 续签管理 离职管理 待遇管理
    /work-   /my-work  /my-work  /renewal /resig-  /benefit
    orders   /pending  /team              nation
     │          │         │        │        │        │
     ├─ 新建    │         │        ├─ 新建  ├─ 新建  ├─ 新建
     ├─ 导入    │         │        │        │        │
     └─ 详情    └─ 详情   └─ 详情  └─ 详情  └─ 详情  └─ 详情
          │         │
          └────┬────┘
               │ (主工单详情可查看其下子工单)
               ▼
         子工单详情
         /my-dispatched/:id
```

---

## 5. 路由可见性（权限控制摘要）

- 所有路由受 `ROUTE_VISIBILITY` 表控制（定义在 `frontend/src/config/routeVisibility.ts`）。
- 表中未列出的路径 → 默认拒绝访问 → 显示 403 页面。
- `LEGACY_ROUTE_ALIASES` 提供旧 URL 到新 URL 的兼容映射（不放宽权限）。
- 路由保护层级：
  1. `PrivateRoute`：检查登录状态 + 首登强改密拦截
  2. `RoleRoute`：检查 `canAccessPath()` 是否有权
  3. 每个页面包裹 `RouteGuard`（独立 ErrorBoundary）

---

## 6. 侧边栏菜单结构（ProLayout）

```
📊 仪表盘 (/dashboard)
📋 工单管理
  ├─ 入职管理 (/onboarding) ──── 展开子模块（按角色）
  │   ├─ 主工单 (/work-orders)
  │   ├─ 入职联系 (/onboarding/onboarding_contact)
  │   ├─ 合同签订 (/onboarding/contract)
  ├─ 续签管理 (/renewal)
  ├─ 离职管理 (/resignation)
  └─ 待遇管理 (/benefit)
📌 我的工作
  ├─ 我发起的 (/my-work/initiated)
  ├─ 待我处理 (/my-work/pending)
  ├─ 退回待改 (/my-work/backend-returned)
  ├─ 已完成 (/my-work/done)
  └─ 团队工单 (/my-work/team)
📦 工单池 (/work-order-pool)
📜 历史工单 (/my-work/history)
🔔 通知中心 (/notifications)
⚙️ 系统管理（仅 admin/授权角色）
  ├─ 用户管理
  ├─ 角色管理
  ├─ 部门管理
  ├─ 客户管理
  ├─ 业务员客户绑定
  ├─ 模块化配置
  ├─ 字段配置
  ├─ 字段权限
  ├─ 派发配置
  ├─ 工单流程配置
  ├─ 导出模板配置
  ├─ 操作日志
  ├─ AI 智能设置
  └─ 系统设置
```
