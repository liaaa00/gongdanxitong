# Phase 2 管理后台设计

> 版本：v1.0（Phase 2 定稿，交付 backend/frontend）
> 路径前缀：前端 `/admin/*`；后端 `/api/admin/*`
> 权限：除特别说明，均要求 `admin` 角色（`RolesGuard`）。所有写操作进入 `AuditInterceptor`。
> 设计原则：延续"表驱动 + 角色解耦 + 完整审计"。所有管理页不硬编码业务枚举，枚举来自 `field_configs` / `dispatch_rules` / `module_handlers` 等配置表自身。

---

## 0. 全局约定

### 0.1 布局
- 统一使用 `ProLayout` 左侧菜单，菜单项按「组织 / 业务配置 / 流程配置 / 审计」四组。
- 所有列表页沿用 `ProTable` 模板：顶部筛选表单（可折叠）→ 主表格 → 批量操作区。
- 所有编辑页统一 `ProForm` 模板：关键信息 → 扩展信息 → 备注；底部固定 `[保存 / 取消]`。
- 所有删除操作统一为软删除（切 `is_active=false`），仅 `admin` 可物理删除（当前版本不提供入口）。

### 0.2 通用响应
- 所有接口沿用 `docs/API规范.md` 的统一响应。
- 软删除语义：`DELETE` 接口 = 软删除（置 `is_active=false`）；`POST /:id/activate` = 恢复启用。
- 操作日志：所有写操作自动记录 `operation_logs`，字段 `entity_type` = 表名，`action_type` = `create / update / delete / activate / config_change`。

### 0.3 通用校验规则
- 名称类字段：长度 1~50，去首尾空白后非空。
- 编码类字段（`code`、`field_code`、`module_code`）：`^[a-z][a-z0-9_]{1,63}$`，不得与已有编码（含已停用）冲突。
- `department_id` 必须存在且 `is_active=true`。
- 涉及业务数据的删除（角色被引用、字段被引用等）先跑"引用检查"，有引用则拒绝或走"强制归档"（不写死，具体接口见各节）。

### 0.4 菜单结构（供前端落地）
```
/admin
 ├─ 组织
 │   ├─ /admin/users            用户管理
 │   ├─ /admin/roles            角色管理
 │   ├─ /admin/departments      部门管理（树形）
 │   └─ /admin/customers        客户管理
 ├─ 业务配置
 │   ├─ /admin/fields                   字段配置
 │   ├─ /admin/field-permissions        字段权限矩阵
 │   └─ /admin/export-templates         导出模板
 ├─ 流程配置
 │   ├─ /admin/dispatch-rules           派发规则
 │   ├─ /admin/module-handlers          模块处理人
 │   └─ /admin/field-supplement-rules   字段补充规则（随字段配置呈现二级 tab）
 └─ 审计
     └─ /admin/logs                     操作日志
```

---

## 1. 用户 / 角色 / 部门 / 客户管理

### 1.1 用户管理 `/admin/users`

#### 1.1.1 列表页线框
```
┌────────────────────────────────────────────────────────────────────────┐
│  [用户名]   [真实姓名]   [手机号]   [角色下拉]   [部门级联]   [状态]   │
│                                                       [查询] [重置]     │
├────────────────────────────────────────────────────────────────────────┤
│ ☐  用户名   姓名   手机   邮箱   角色(tags)    部门    状态   最后登录 │
│ ───────────────────────────────────────────────────────────────────────│
│ ☐  zhang    张三   138...  a@b   业务员/项目经理 业务部  启用  10-21   │
│ ...                                                                     │
├────────────────────────────────────────────────────────────────────────┤
│ [新建] [批量启用] [批量禁用] [重置密码(选中)]                           │
└────────────────────────────────────────────────────────────────────────┘
```
- 控件：`ProTable` + 顶部筛选 `ProForm.QueryFilter`。
- 角色列用 `<Tag color="...">` 多色展示，默认展示前 2 个，超出显示"+N"。
- 行操作：`编辑 / 重置密码 / 启用/禁用 / 查看日志`。
- 筛选：用户名（模糊）、姓名（模糊）、手机（模糊）、`roleCodes`（多选）、`departmentId`（级联）、`isActive`。

#### 1.1.2 新建 / 编辑线框
```
┌──── 基本信息 ──────────────────┐
│ 用户名*（编辑时只读）           │
│ 真实姓名*                      │
│ 手机号         邮箱            │
│ 密码（新建必填，编辑有"重置")  │
│ 头像（可选上传）                │
│ 状态：启用 / 禁用               │
└────────────────────────────────┘
┌──── 角色绑定（一人多角色）─────┐
│ ┌─────────────────────────────┐│
│ │ 角色*   |  部门*  | 主角色 │ │   ← 每行一条，多行
│ │ [业务员]| [业务部]| ( • )  │ │
│ │ [项目经理]|[业务部]| ( )   │ │
│ │ [+ 增加一行]                ││
│ └─────────────────────────────┘│
│ 说明：同一角色可在不同部门出现 │
└────────────────────────────────┘
[保存] [取消]
```
- "主角色"单选（只能勾一行），用于默认看板身份。
- 保存时前端做唯一性校验：`(role_id, department_id)` 组合不得重复。

#### 1.1.3 API 详细入出参

| 接口 | 方法 | 请求 | 响应 |
|------|------|------|------|
| `/api/admin/users` | GET | `QueryUsersDto` | 分页 `list: UserItemDto[]` |
| `/api/admin/users/:id` | GET | — | `UserDetailDto`（含 `roles[]`） |
| `/api/admin/users` | POST | `CreateUserDto` | `UserDetailDto` |
| `/api/admin/users/:id` | PUT | `UpdateUserDto` | `UserDetailDto` |
| `/api/admin/users/:id` | DELETE | — | 软删除：`is_active=false` |
| `/api/admin/users/:id/activate` | POST | — | 恢复：`is_active=true` |
| `/api/admin/users/:id/reset-password` | POST | `{ newPassword: string }` | `{ ok: true }` |
| `/api/admin/users/:id/roles` | PUT | `UpdateUserRolesDto` | `UserDetailDto` |

**`QueryUsersDto`**
```ts
{
  page?: number;
  pageSize?: number;
  keyword?: string;        // 命中 username/realName/phone/email 模糊
  roleCodes?: string[];
  departmentId?: number;
  isActive?: boolean;
  sort?: string;           // 例 "createdAt:desc"
}
```

**`UserItemDto`**
```ts
{
  id: number;
  username: string;
  realName: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  isActive: boolean;
  roles: Array<{
    roleId: number;
    roleCode: string;
    roleName: string;
    departmentId: number;
    departmentName: string;
    isPrimary: boolean;
  }>;
  lastLoginAt?: string;
  createdAt: string;
}
```

**`CreateUserDto`**
```ts
{
  username: string;        // 唯一，^[a-zA-Z][a-zA-Z0-9_]{2,31}$
  realName: string;        // 长度 1~20
  phone?: string;          // 中国大陆 ^1[3-9]\d{9}$，可空
  email?: string;          // RFC 5322 简化版，可空但唯一
  password: string;        // 8~32 位，至少一字母一数字
  avatarUrl?: string;
  isActive?: boolean;      // 默认 true
  roles: Array<{
    roleId: number;
    departmentId: number;
    isPrimary: boolean;    // 必须恰好一条为 true
  }>;
}
```

**`UpdateUserDto`**：与 `CreateUserDto` 相同，但 `username` 不允许；`password` 不允许（改密走独立接口）。

**校验规则（后端双重校验）**：
- `roles[]` 必须至少 1 条。
- `roles[]` 恰好 1 条 `isPrimary=true`。
- `(roleId, departmentId)` 组合不允许重复。
- 编辑时若修改了 `isActive=false`，并该用户在 `dispatched_orders.handler_id` 有未完成单 → 返回 `4202` 并列出冲突子工单编号。
- 重置密码调用方必须 `admin`；并触发"强制改密"标记（用户下次登录要求改密）。

**权限**：`@Roles('admin')`。

---

### 1.2 角色管理 `/admin/roles`

#### 1.2.1 列表页线框
- `ProTable` 展示：`code` / `name` / `level` / `描述` / `用户数` / `状态` / `操作`。
- 顶部筛选：`level`（下拉）、`isActive`。
- 行操作：`编辑 / 配置字段权限(跳转至矩阵页并预选该角色) / 启用/禁用`。

#### 1.2.2 新建 / 编辑
```
[ 角色编码* ]   角色名称*
[ 层级* 下拉：执行/主管/管理/全局 ]
[ 描述 textarea ]
[ 状态：启用/禁用 ]
```

#### 1.2.3 API

| 接口 | 方法 |
|------|------|
| `/api/admin/roles` | GET（分页）|
| `/api/admin/roles/:id` | GET |
| `/api/admin/roles` | POST |
| `/api/admin/roles/:id` | PUT |
| `/api/admin/roles/:id` | DELETE（软） |
| `/api/admin/roles/:id/activate` | POST |

**`CreateRoleDto`**
```ts
{
  code: string;    // ^[a-z][a-z0-9_]{1,63}$
  name: string;    // 1~30
  level: 'execute' | 'supervisor' | 'manager' | 'global';
  description?: string;
  isActive?: boolean;
}
```

**删除前引用检查**：
- 若存在 `user_roles.role_id = ?` → 返回 `4301`，提示先解绑。
- 若存在 `field_permissions.role_id = ?` → 提示"角色停用会使其所有字段权限失效，是否继续？"（二次确认），后端直接允许停用，但 `field_permissions` 保留（用于审计回放）。

---

### 1.3 部门管理 `/admin/departments`

#### 1.3.1 界面线框
- 左右分栏：左侧 `<Tree>` 展示部门树，右侧详情表单。
- 左侧节点右键菜单：`新增子部门 / 编辑 / 停用 / 删除`。
- 支持拖拽调整层级（触发 `PUT /:id` 带 `parentId`）。

#### 1.3.2 新建 / 编辑
```
部门编码*     部门名称*
上级部门（TreeSelect，可空 = 顶级）
排序号 number
状态：启用 / 禁用
```

#### 1.3.3 API

| 接口 | 方法 |
|------|------|
| `/api/admin/departments/tree` | GET（无分页，整棵树） |
| `/api/admin/departments/:id` | GET |
| `/api/admin/departments` | POST |
| `/api/admin/departments/:id` | PUT |
| `/api/admin/departments/:id` | DELETE（软） |
| `/api/admin/departments/:id/move` | POST `{ parentId: number \| null, sortOrder?: number }` |

**响应 `DepartmentTreeNode`**
```ts
{
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  children: DepartmentTreeNode[];
}
```

**约束**：
- 不能把部门挂到自己的后代下（防环）。
- 停用时：若该部门下仍有启用用户 → 返回 `4301`。
- 编码全局唯一。

---

### 1.4 客户管理 `/admin/customers`

#### 1.4.1 列表
- `ProTable`：`customer_code / customer_name / 联系人(extra.contactName) / 状态 / 创建时间 / 操作`。
- 筛选：`keyword`（code/name 模糊）、`isActive`。
- 批量导入（xlsx）按钮 → 进入 `/admin/customers/import`。

#### 1.4.2 新建 / 编辑
```
客户编码*    客户名称*
联系人       联系电话
地址 textarea
备注 textarea
状态
```
- `联系人/电话/地址/备注` 都落 `extra` JSONB，前端定义字段常量：`contactName / contactPhone / address / remark`。

#### 1.4.3 API

| 接口 | 方法 |
|------|------|
| `/api/admin/customers` | GET（分页） |
| `/api/admin/customers/:id` | GET |
| `/api/admin/customers` | POST |
| `/api/admin/customers/:id` | PUT |
| `/api/admin/customers/:id` | DELETE（软） |
| `/api/admin/customers/import` | POST（multipart） |

**`CreateCustomerDto`**
```ts
{
  customerCode: string;     // ^[A-Za-z0-9_-]{1,32}$
  customerName: string;
  extra?: {
    contactName?: string;
    contactPhone?: string;
    address?: string;
    remark?: string;
  };
  isActive?: boolean;
}
```

---

## 2. 字段配置 CRUD `/admin/fields`

### 2.1 列表页线框
```
┌─── 顶部 tab：[ 通用字段 | onboarding | renewal | resignation | + 其他 ] ───┐
├──────────────────────────────────────────────────────────────────────────┤
│ 筛选：[类型下拉] [是否必填] [关键字] [状态]                [查询]  [重置] │
├──────────────────────────────────────────────────────────────────────────┤
│ 排序(拖拽)  |  编码        |  名称    | 类型     | 必填 | 属于 | 状态 | │
│ ☰           |employee_name |姓名      | text     | 是   | 通用 | 启用 | │
│ ☰           |need_onboarding_contact|入职材料集约|dropdown|是|onboarding|启用 │
│ ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
[新建字段]  [批量启用] [批量禁用]  [导出字段 JSON]  [导入字段 JSON]
```
- 拖拽排序：触发 `PUT /api/admin/fields/reorder`，传变更项的 `{id, displayOrder}`。
- 二级 tab「字段补充规则」：查看哪些字段允许哪些模块补充、同步到哪些模块（关联 `field_supplement_rules`）。

### 2.2 新建 / 编辑表单线框
```
── 基本信息 ──────────────
字段编码*   （^[a-z][a-z0-9_]{1,63}$，编辑时只读）
字段名称*
归属*：○ 通用字段  ○ 指定业务类型 [orderType 下拉：onboarding/renewal/.../+添加]
字段类型*：text / number / date / dropdown / multi_select / boolean / textarea / file
顺序号（默认新建落到末尾）
状态：启用 / 禁用

── 必填与校验 ────────────
默认必填：是 / 否
条件必填（JSON AST 编辑器，复用派发规则条件组件）
正则表达式（可选）   自定义提示语（当正则不过时）

── 下拉选项（仅 dropdown / multi_select 显示）─
┌─────────────────────────────┐
│ 显示文案      值              │
│ [是        ][是        ][×] │
│ [否        ][否        ][×] │
│ [+ 添加选项]                  │
└─────────────────────────────┘
说明：值用于存储，显示文案给用户看

── 其它 ──────────────────
占位符 placeholder
帮助文案 help_text
```
- 下拉选项支持"级联"扩展字段（Phase 3+）：本期只允许扁平 `[{label,value}]`，但 JSONB 列预留级联结构。
- 字段类型变更规则：
  - 允许 `text ↔ textarea`、`number ↔ text`（谨慎）。
  - **禁止**已有业务数据时将 `dropdown → number` 等不兼容转换；后端检查 `work_orders.extra_data` 内是否有该 `field_code` 值，有则拒绝。

### 2.3 API

| 接口 | 方法 |
|------|------|
| `/api/admin/fields` | GET（分页或全量，由 `pageSize` 控制；`all=true` 时不分页） |
| `/api/admin/fields/:id` | GET |
| `/api/admin/fields` | POST |
| `/api/admin/fields/:id` | PUT |
| `/api/admin/fields/:id` | DELETE（软） |
| `/api/admin/fields/:id/activate` | POST |
| `/api/admin/fields/reorder` | PUT `{ items: Array<{id, displayOrder}> }` |
| `/api/admin/fields/:id/references` | GET 引用信息（字段权限/补充规则/导出模板/派发规则条件 引用数） |
| `/api/admin/fields/export` | GET 返回 JSON 数组（用于备份 / 跨环境迁移） |
| `/api/admin/fields/import` | POST JSON 数组（支持 upsert by `fieldCode`） |

**`CreateFieldConfigDto`**
```ts
{
  fieldCode: string;
  fieldName: string;
  fieldType: 'text'|'number'|'date'|'dropdown'|'multi_select'|'boolean'|'textarea'|'file';
  orderType?: string | null;        // null = 通用
  isRequired?: boolean;             // 基础必填
  defaultRequired?: boolean;
  conditionalRequired?: AstNode;    // JSON AST（见 DispatchEngine 规范复用）
  validationRegex?: string;
  validationMsg?: string;
  dropdownOptions?: Array<{ label: string; value: string }>;
  placeholder?: string;
  helpText?: string;
  displayOrder?: number;
  isActive?: boolean;
}
```

**删除前检查**（`GET /:id/references`）：
```ts
{
  fieldCode: string;
  referenced: {
    fieldPermissions: number;
    fieldSupplementRules: number;
    exportTemplates: number;
    dispatchRules: number;      // 派发规则条件中引用该 field
    workOrdersExtraData: number;// 已有工单的 extra_data 中含该 key 的数量
  };
}
```
- 若 `workOrdersExtraData > 0` → 禁止物理删除，只允许软删除；UI 提示"该字段已有数据，仅能停用"。
- 若 `fieldPermissions > 0` 或 `dispatchRules > 0` → 软删除时二次确认"将自动失效 N 条权限 / M 条规则"。

### 2.4 字段补充规则子页（`/admin/fields` 下二级 tab）
- 列表：`field_code | 允许补充的模块 | 同步到哪些模块 | 状态 | 操作`
- 编辑：
  - 字段（下拉自 `field_configs` 启用项）
  - 允许补充的模块（多选，来自 `module_handlers.module_code` 去重列表）
  - 同步到哪些模块（多选）
- API：`/api/admin/field-supplement-rules` 标准 CRUD。

---

## 3. 字段权限矩阵 `/admin/field-permissions`

### 3.1 页面结构线框
```
┌─ 场景：[ 主工单(main) ▼ ]  [ 字段过滤：类型/关键字 ] [ 保存更改 ] [撤销] ┐
├────────────────────────────────────────────────────────────────────────┤
│ 字段\角色      | 管理员 | 项目经理 | 业务员 | 合同组 | 入职联系 | … │
│ ───────────────|────────|──────────|────────|────────|──────────|─── │
│ 客户名称       | visible| visible  |visible | hidden | hidden   | … │
│ 姓名           | visible| visible  |visible | visible| visible  | … │
│ 身份证号       | visible| visible  |visible | visible| masked   | … │
│ 基本工资       | visible| visible  |visible | hidden | hidden   | … │
│ …                                                                     │
├────────────────────────────────────────────────────────────────────────┤
│ [批量复制: 从 <角色A> → <角色B/多选>]   [导出矩阵 JSON]  [导入矩阵 JSON]│
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 交互细节
- **场景切换**：单选下拉 `main | dispatched:contract | dispatched:onboarding_contact | dispatched:data_entry | dispatched:social_security | …`。切换时整表重新拉取。
- **单元格**：下拉 `visible / hidden / readonly / masked`；变动即标记为"脏"（本地态），未保存前高亮。
- **保存**：调 `POST /batch`，请求体只包含脏单元。
- **批量复制**：选中源角色 → 目标角色（多选）→ 预览弹窗展示差异 → 确认后落库。
- **字段过滤**：支持按类型、关键字、必填过滤行，减少渲染压力。
- **行锁定**：表头固定；首列字段名固定。
- **保存前预检**：如某角色"仅 masked"的字段将从 API 无法直接编辑，UI 提示确认。

### 3.3 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/field-permissions` | GET `?scenario=main` | 返回该场景下 `list: FieldPermissionItem[]`（不分页） |
| `/api/admin/field-permissions/matrix` | GET `?scenario=main&orderType=onboarding` | 返回矩阵结构 |
| `/api/admin/field-permissions/batch` | POST | 批量 upsert & delete |
| `/api/admin/field-permissions/copy` | POST | 批量复制 |

**矩阵响应**
```ts
{
  scenario: 'main' | `dispatched:${string}`;
  fields: Array<{ fieldCode: string; fieldName: string; fieldType: string }>;
  roles: Array<{ roleId: number; roleCode: string; roleName: string }>;
  matrix: Record<number /*roleId*/, Record<string /*fieldCode*/, FieldPermissionValue>>;
  // 不存在记录时，前端以 'hidden' 为默认显示（后端白名单策略）
}
```

**`FieldPermissionValue = 'visible' | 'hidden' | 'readonly' | 'masked'`**

**`/batch` 请求**
```ts
{
  scenario: 'main' | `dispatched:${string}`;
  items: Array<{
    roleId: number;
    fieldCode: string;
    permission: FieldPermissionValue | null;  // null = 删除该条
  }>;
}
```

**`/copy` 请求**
```ts
{
  scenario: 'main' | `dispatched:${string}`;
  sourceRoleId: number;
  targetRoleIds: number[];
  overwrite: boolean;    // 是否覆盖目标角色已有配置
}
```
**响应**：返回 `{ affected: number; conflicts: Array<{ roleId, fieldCode, old, new }> }`，便于 UI 显示差异。

### 3.4 权限合并规则（后端实现约束，再次重申）
- 一人多角色：按"最宽松"合并（visible > readonly > masked > hidden）。
- 未记录的 `(role, scenario, field)` 视为 `hidden`（白名单）。
- **管理员**（`admin`）在任何场景下隐式 `visible`，不写进矩阵。
- 脱敏规则见 `docs/架构设计.md` §3.3.2。

---

## 4. 派发规则管理 `/admin/dispatch-rules`

### 4.1 列表页线框
```
┌── 筛选 ──────────────────────────────────────────────────────────────┐
│ [订单类型▼] [目标模块▼] [策略▼] [启用?] [关键字(rule_name)] 查询 重置 │
├──────────────────────────────────────────────────────────────────────┤
│ 优先级↑↓ | 规则名        | 订单类型   | 目标模块     | 策略     | 状态│
│ 1        |入职-数据录入   |onboarding |data_entry    |pool      |启用 │
│ 2        |入职-社保       |onboarding |social_security|round_robin|启用│
│ 3        |入职-入职联系   |onboarding |onboarding_contact|load_balance|启用│
│ 4        |入职-合同       |onboarding |contract      |fixed     |启用 │
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘
[新建规则]   [规则调试工具]   [导出/导入 JSON]
```
- 优先级拖拽：上下箭头或整列拖拽；数值越小越优先。
- 双击行 = 进入编辑；单击 `调试` = 打开右侧抽屉对单条规则做模拟。

### 4.2 编辑页线框（核心）
```
┌── 基础 ─────────────────────────────┐
│ 规则名称*                            │
│ 订单类型* [onboarding/renewal/...]   │
│ 目标模块* [contract/onboarding_contact/data_entry/social_security/...] │
│ 优先级*  number                      │
│ 状态：启用 / 禁用                    │
└──────────────────────────────────────┘

┌── 触发条件（JSON AST 编辑器） ─────┐
│  [AND] ───────────┐                │
│     ├─ 条件 [need_company_contract] [=] [是]          [×]│
│     ├─ [OR] ────────────────────────────────────────┐   │
│     │     ├─ 条件 [employee_type] [=] [全日制]     [×] │
│     │     └─ 条件 [employee_type] [=] [非全日制]   [×] │
│     │     [+添加条件]  [+添加分组]                      │
│     └─ [+添加条件]  [+添加分组]                        │
│  [切换到 JSON 源码视图]  [语法校验]                    │
└──────────────────────────────────────┘

┌── 派发策略 ─────────────────────────┐
│ 策略*：○ fixed  ○ round_robin  ○ load_balance  ○ pool │
│ （预览：此模块当前可用处理人 N 人，链接→/admin/module-handlers?module=contract） │
└──────────────────────────────────────┘
[保存] [保存并调试] [取消]
```

### 4.3 JSON AST 条件编辑器（UI 组件约定）

组件名：`<ConditionBuilder />`（字段配置的"条件必填"也复用它）。

- **数据契约**：输入/输出即 `docs/DispatchEngine-JSON-AST规范.md` 定义的 `AstNode`。
- **节点类型**：
  - 组合节点：`AND / OR / NOT`，卡片化展示，左侧垂直线标识层级。
  - 叶子节点：`{ field, op, value }`，三列控件：
    - 字段下拉：来自 `field_configs`（按 `orderType` 过滤；`null` 通用字段常驻）
    - 操作符下拉：根据字段类型动态限制（text 可选 `=, !=, in, not in, contains, regex, exists`；number 还可选 `>, <, >=, <=`；dropdown 可选 `=, !=, in, not in, exists`）
    - 值控件：按字段类型渲染
      - dropdown：多选（当 `in / not in`）或单选
      - number：`InputNumber`
      - date：`DatePicker`
      - text/regex：`Input`
- **操作**：
  - 每个节点右上角 `[复制 / 删除 / 上移 / 下移 / 转换为 OR/AND]`。
  - 叶子节点最多嵌套 10 层（防呆）。
  - 提供「JSON 源码」抽屉，粘贴/查看原始 AST，保存前自动校验 `DispatchAstSchema`。
- **实时校验**：切换控件即调用前端 `validate(ast)`，错误用红色边框 + Tooltip 提示具体节点。

### 4.4 规则调试工具 `/admin/dispatch-rules/debug`

#### 界面
```
┌── 输入 ─────────────────────────────────────┐
│ 订单类型 [onboarding▼]                      │
│ 模拟业务字段（键值表单，字段来自 field_configs）│
│ ┌────────────────┬─────────────────────────┐│
│ │ need_onboarding_contact  [是/否]         ││
│ │ need_company_contract    [是/否]         ││
│ │ employee_type           [全日制/非全日制/...]│
│ │ base_salary             [number]         ││
│ │ ...                                      ││
│ └────────────────┴─────────────────────────┘│
│ [运行调试]   [随机填充]   [从已有工单导入字段]│
└──────────────────────────────────────────────┘

┌── 输出 ──────────────────────────────────────┐
│ 命中规则：                                   │
│ [✓] 入职-数据录入 (priority=1, 策略=pool)     │
│ [✓] 入职-社保    (priority=2, 策略=round_robin, 预派给 张三)│
│ [✗] 入职-合同    (priority=4) — 原因：need_company_contract=否│
│ 合计生成子工单：3 条（module 去重后）         │
│                                               │
│ [查看详细执行跟踪]                           │
└──────────────────────────────────────────────┘
```
- `查看详细执行跟踪` 展开后显示每条规则的 AST 求值树（每节点 true/false 着色）。

#### API
`POST /api/admin/dispatch-rules/simulate`

请求：
```ts
{
  orderType: string;
  extraData: Record<string, unknown>;
  ruleIds?: number[];      // 可选，仅测指定规则；为空 = 全部启用规则
}
```
响应：
```ts
{
  hits: Array<{
    ruleId: number;
    ruleName: string;
    priority: number;
    targetModule: string;
    dispatchStrategy: string;
    handlerId: number | null;           // pool 时为 null
    handlerName?: string;
    trace: AstEvalTrace;                // 每节点求值结果，见 JSON-AST 规范
    deduped: boolean;                   // 是否被"模块去重"淘汰
  }>;
  dedupedWinners: Array<{ module: string; ruleId: number }>;
  totalChildren: number;
}
```
`AstEvalTrace` 见 `docs/DispatchEngine-JSON-AST规范.md` §6。

### 4.5 API

| 接口 | 方法 |
|------|------|
| `/api/admin/dispatch-rules` | GET 分页 |
| `/api/admin/dispatch-rules/:id` | GET |
| `/api/admin/dispatch-rules` | POST |
| `/api/admin/dispatch-rules/:id` | PUT |
| `/api/admin/dispatch-rules/:id` | DELETE（软） |
| `/api/admin/dispatch-rules/:id/activate` | POST |
| `/api/admin/dispatch-rules/reorder` | PUT `{ items: Array<{id, priority}> }` |
| `/api/admin/dispatch-rules/simulate` | POST 调试 |

**`CreateDispatchRuleDto`**
```ts
{
  ruleName: string;
  orderType: string;
  targetModule: string;
  triggerConditions: AstNode | null;    // null 或 {} = 恒真
  dispatchStrategy: 'fixed' | 'round_robin' | 'load_balance' | 'pool';
  priority: number;                      // 默认 100
  isActive?: boolean;
}
```

---

## 5. 模块处理人配置 `/admin/module-handlers`

### 5.1 页面结构
```
┌── 左侧：模块列表 ──────┐  ┌── 右侧：模块详情 ────────────────────────┐
│ • contract            │  │ 模块：合同组 (contract)                    │
│ • onboarding_contact  │  │ 说明：由派发规则 target_module=contract 使用│
│ • data_entry          │  │──────────────────────────────────────────│
│ • social_security     │  │ 处理人列表（为该模块配置）                  │
│ [+ 新增模块]           │  │ ┌─────────────────────────────────────┐  │
└────────────────────────┘  │ │ 用户         权重  是否备用  状态    │  │
                            │ │ 张三(主管)   5     否        启用    │  │
                            │ │ 李四          3     否        启用    │  │
                            │ │ 王五          1     是        启用    │  │
                            │ │ [+ 添加处理人]                        │  │
                            │ └─────────────────────────────────────┘  │
                            │ 当前关联派发规则：                        │
                            │ • 入职-合同 (priority=4, 策略=fixed)       │
                            └──────────────────────────────────────────┘
```
- 模块本身不单独建表，`module_code` 来自 `dispatch_rules.target_module` + `module_handlers.module_code` 的并集去重。
- 「新增模块」实际只是往 `module_handlers` 插第一条记录时输入新的 `module_code`。
- 添加处理人：弹窗选择用户（支持角色/部门筛选），设置 `weight / isBackup`。

### 5.2 API

| 接口 | 方法 |
|------|------|
| `/api/admin/module-handlers/modules` | GET 返回模块列表（含每模块人数） |
| `/api/admin/module-handlers?module=contract` | GET 该模块所有 handlers |
| `/api/admin/module-handlers` | POST 新增处理人（含新 `module_code`） |
| `/api/admin/module-handlers/:id` | PUT |
| `/api/admin/module-handlers/:id` | DELETE（软） |

**`CreateModuleHandlerDto`**
```ts
{
  moduleCode: string;        // ^[a-z][a-z0-9_]{1,63}$
  handlerId: number;
  weight?: number;           // 默认 1；round_robin/load_balance 影响分派
  isBackup?: boolean;        // true 时 fixed 策略下只做备份
  isActive?: boolean;
}
```

**删除前校验**：该模块是否还有启用的 `dispatch_rules`？若有且移除后无剩余处理人 → 警示"移除后该模块将无人处理，策略可能失败"。

---

## 6. 导出模板管理 `/admin/export-templates`

### 6.1 列表页
- `ProTable`：`template_name / module_code / 字段数 / 创建人 / 是否共享 / 状态 / 操作`。
- 行操作：`编辑 / 复制 / 预览 / 启停 / 删除`。
- 筛选：`module_code / created_by / isShared`。

### 6.2 新建 / 编辑页（核心交互）
```
┌── 基础 ─────────────────────────────┐
│ 模板名称*                            │
│ 所属模块*：[contract/onboarding_contact/...] │
│ 是否共享：是（同模块人员可用） / 否（仅自己）│
│ 状态                                 │
└──────────────────────────────────────┘

┌── 字段选择（拖拽） ──────────────────────────────────┐
│  可用字段（左）           已选字段（右，可拖拽排序） │
│  ┌────────────────┐       ┌─────────────────────┐    │
│  │ [搜索]          │       │ 顺序 | 别名 | 字段  │    │
│  │ ☐ 客户名称      │       │ 1    | 客户  | customer_name │
│  │ ☐ 姓名          │       │ 2    | 姓名  | employee_name │
│  │ ☐ 身份证号      │  →→   │ 3    | 身份证| id_card_no    │
│  │ ☐ 合同主体      │       │ …                                │
│  │ ☐ ...           │       │ [别名编辑框]  [× 移除]           │
│  └────────────────┘       └─────────────────────┘    │
└─────────────────────────────────────────────────────┘
[预览 Excel]  [保存]
```
- 字段可选范围：
  - 先按所选 `module_code` 从 `field_permissions` 取 `permission != hidden` 的字段集合。
  - 再交集 `field_configs` 启用字段。
  - 避免让模板引用敏感字段（后端再次过滤）。
- 预览：`POST /preview` 生成一份 5 行示例数据的 xlsx，前端直接下载。

### 6.3 API

| 接口 | 方法 |
|------|------|
| `/api/admin/export-templates` | GET 分页 |
| `/api/admin/export-templates/:id` | GET |
| `/api/admin/export-templates` | POST |
| `/api/admin/export-templates/:id` | PUT |
| `/api/admin/export-templates/:id` | DELETE（软） |
| `/api/admin/export-templates/:id/clone` | POST |
| `/api/admin/export-templates/:id/preview` | POST → 返回 `{ downloadUrl }` |
| `/api/admin/export-templates/:id/available-fields` | GET 返回该模块下可选字段 |

**`CreateExportTemplateDto`**
```ts
{
  templateName: string;
  moduleCode: string;
  fieldList: Array<{
    fieldCode: string;
    alias?: string;      // 导出列名，缺省用 field_name
    order: number;
  }>;
  isShared?: boolean;
  isActive?: boolean;
}
```

---

## 7. 操作日志查询 `/admin/logs`

### 7.1 列表
```
┌── 筛选 ───────────────────────────────────────────────────────────────┐
│ [实体类型 ▼] [操作类型 ▼] [操作用户] [时间范围] [关键字(entity_id)]    │
├──────────────────────────────────────────────────────────────────────┤
│ 时间 | 用户 | 实体类型 | 实体ID | 操作 | 变更摘要 (before/after 差异) │
│ ...                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```
- 点击行展开侧边抽屉，展示 `beforeData` / `afterData` 的 JSON diff（建议 `react-diff-viewer`）。
- 导出筛选结果 CSV（限制 1 万行）。

### 7.2 API

| 接口 | 方法 |
|------|------|
| `/api/admin/logs` | GET 分页 |
| `/api/admin/logs/:id` | GET 详情 |
| `/api/admin/logs/export` | GET CSV（带筛选条件） |

**`QueryLogsDto`**
```ts
{
  page?: number;
  pageSize?: number;
  entityType?: string;
  entityId?: number;
  userId?: number;
  actionType?: string;
  startAt?: string;   // ISO
  endAt?: string;
  keyword?: string;
  sort?: string;      // 默认 createdAt:desc
}
```

**`LogItemDto`**
```ts
{
  id: number;
  createdAt: string;
  userId: number | null;
  userName?: string;
  entityType: string;
  entityId: number | null;
  actionType: string;
  ipAddress?: string;
  userAgent?: string;
  beforeData?: unknown;
  afterData?: unknown;
  summary: string;   // 后端摘要，如 "字段「基本工资」默认必填: false → true"
}
```

---

## 8. 跨页交互与权限

### 8.1 Admin Guard
- 所有 `/api/admin/*` 接口挂 `@Roles('admin')`。
- 前端路由 `/admin/*` 通过 `<RouteGuard roles={['admin']} />` 守卫；非 admin 直接 `/403`。

### 8.2 审计
- 关键写接口挂 `@Audit(entityType, actionType)`：
  - 用户 / 角色 / 部门 / 客户：`create / update / delete / activate / reset-password / bind-role`。
  - 字段 / 字段权限 / 派发规则 / 模块处理人 / 导出模板：`create / update / delete / activate / reorder / batch`。
- `operation_logs.before_data` 截图字段粒度差异；超过 32KB 的字段值截断并标注 `truncated=true`。

### 8.3 操作二次确认
- 涉及批量变更（字段权限 /batch、派发规则 reorder、模板批量导入）：UI 必须弹窗列出"影响项数"并要求勾选"我已理解"。
- 不可撤销的物理删除：本期不开放。

---

## 9. 菜单数据接口（前端布局用）

`GET /api/admin/menu` 返回当前用户可见菜单项（根据角色裁剪）：
```ts
[
  {
    key: 'org',
    title: '组织',
    children: [
      { key: 'users', title: '用户管理', path: '/admin/users' },
      ...
    ],
  },
  ...
]
```
> 本期可硬编码前端菜单（因管理后台角色固定 admin），但预留此接口以便未来按更细角色裁剪。

---

## 10. 跨端协同约定

- **前端**：所有 `ProTable` 列、`ProForm` 字段命名与本文件 DTO 对齐（小驼峰）；`<ConditionBuilder />` 在字段配置与派发规则复用。
- **后端**：所有批量接口（`batch / reorder`）必须事务化；返回 `{ affected, conflicts? }` 便于前端回显。
- **测试**：每节末列出的 API 都需 e2e 覆盖主流程（创建→更新→引用冲突→删除）。字段权限矩阵用"3 角色 × 5 字段" 抽样集合覆盖"最宽松合并"、"未声明视为 hidden"、"admin 隐式 visible" 三条路径。

---

## 11. 变更纪律
- 本文件由架构师维护；任何新增/修改字段、接口或页面需先发 `[架构变更]` 广播，通过后更新此文件。
- 配套文档：`docs/DispatchEngine-JSON-AST规范.md` 是本文件 §4 的数据契约基础，修改派发条件编辑器时必须同步。
