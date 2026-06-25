# API 规范

> 版本：v1.0（Phase 1 定稿）
> 适用范围：后端所有对外 HTTP 接口（统一前缀 `/api`）。
> 契约地位：本文件由架构师维护，后端按此实现，前端按此调用。变更需广播 `[架构变更]`。

---

## 1. 通用约定

### 1.1 基础
- 协议：HTTP/1.1，内容类型默认 `application/json; charset=utf-8`。文件上传用 `multipart/form-data`。
- 字符集：UTF-8。
- 时区：请求/响应中的时间一律 **ISO 8601 带时区**（如 `2026-05-11T14:00:00+08:00`），不使用时间戳秒/毫秒。
- 前缀：所有业务接口位于 `/api` 下。`/healthz` 由 nginx 直接响应，`/api/health` 由后端响应。
- 认证：除 `@Public` 路由外，全部要求 `Authorization: Bearer <jwt>`。
- CORS：Phase 1 不开启跨域（前后端同域经 nginx 反代）。如需开放由架构师确认。

### 1.2 命名
- URL：小写 + 连字符（kebab-case），例 `/api/work-orders`。
- 查询参数：小驼峰（camelCase），例 `?pageSize=20`。
- JSON 字段：**小驼峰**（camelCase）。数据库为 snake_case，后端统一在 DTO 层转换。
- 字段编码（field_code）保持 snake_case，因为它属于业务配置值而不是接口字段名。

### 1.3 统一响应体
任何成功响应都由 `ResponseInterceptor` 包装为：

```json
{
  "code": 0,
  "data": { },
  "message": "ok",
  "traceId": "req_01HZ..."
}
```

- `code = 0` 表示业务成功；非 0 表示业务失败（即便 HTTP 状态码是 200 的场景下也要求调用方以此为准）。
- `data` 类型由具体接口定义；空响应为 `null`。
- `message` 人类可读（中文），用于前端默认错误提示兜底。
- `traceId` 由 `TraceIdMiddleware` 生成 / 透传，贯穿日志。

### 1.4 统一分页
分页列表请求参数：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | int ≥ 1 | 1 | 页码 |
| `pageSize` | int 1~100 | 20 | 每页大小 |
| `sort` | string | 业务默认 | `字段名:asc/desc`，多字段用逗号 |
| `keyword` | string | 空 | 业务约定的模糊搜索关键字 |

分页响应体（在 `data` 节点内）：

```json
{
  "list": [],
  "page": 1,
  "pageSize": 20,
  "total": 123,
  "totalPages": 7
}
```

### 1.5 错误响应
错误也走统一结构：

```json
{
  "code": 4001,
  "data": null,
  "message": "身份证号格式不正确",
  "details": { "field": "id_card_no" },
  "traceId": "req_01HZ..."
}
```

- HTTP 状态码按语义返回（400 / 401 / 403 / 404 / 409 / 422 / 500）。
- 业务码 `code` 为主判据；`details` 可选，携带结构化错误上下文。

---

## 2. 错误码规范

错误码为 4 位整数：`X Y Z Z`
- `X`：错误大类（`1`=系统，`2`=认证，`3`=参数，`4`=业务规则，`5`=权限，`6`=资源状态，`9`=未知）
- `Y`：领域（`0`=通用，`1`=工单，`2`=派发，`3`=字段/权限，`4`=导入，`5`=AI，`6`=文件，`7`=用户/角色）
- `ZZ`：序列号

### 2.1 常用错误码清单

| code | HTTP | 含义 | 常见触发 |
|------|------|------|----------|
| 0 | 200 | 成功 | — |
| 1000 | 500 | 系统未知错误 | 兜底 |
| 1001 | 503 | 服务暂不可用 | DB 不可达 / 依赖故障 |
| 1002 | 504 | 超时 | 上游调用超时 |
| 2000 | 401 | 未登录或令牌失效 | 无 token / 过期 |
| 2001 | 401 | 令牌被撤销 | 用户改密后旧 token |
| 2002 | 400 | 用户名或密码错误 | 登录失败 |
| 2003 | 403 | 账号已禁用 | `is_active=false` |
| 2004 | 400 | 原密码不正确 | 改密 |
| 3000 | 400 | 参数错误 | DTO 校验失败 |
| 3001 | 400 | 必填字段缺失 | 与 3000 不同点：由 FieldConfigService 返回 |
| 3002 | 400 | 字段格式不合法 | regex 不过 |
| 3003 | 400 | 枚举值非法 | 下拉超出范围 |
| 4100 | 404 | 工单不存在 | |
| 4101 | 409 | 工单状态不允许该操作 | 例：`completed` 不能再提交 |
| 4102 | 409 | 工单已被撤回 | |
| 4103 | 400 | 重复提交 | 同身份证同客户短期重复 |
| 4200 | 404 | 子工单不存在 | |
| 4201 | 409 | 子工单状态不允许该操作 | |
| 4202 | 400 | 无可派发规则命中 | Service 日志 warn |
| 4203 | 409 | 子工单未被接单 | 完成前需接单 |
| 4300 | 404 | 字段配置不存在 | |
| 4301 | 409 | 字段被引用无法删除 | |
| 4400 | 400 | Excel 解析失败 | 文件损坏 / 非 xlsx |
| 4401 | 400 | 列映射不完整 | 必填字段未映射 |
| 4402 | 422 | 导入部分失败 | 返回错误报表链接 |
| 4500 | 502 | AI 服务不可达 | OpenAI 接口异常 |
| 4501 | 429 | AI 限流 | |
| 4600 | 413 | 文件过大 | 超过 `MAX_UPLOAD_SIZE_MB` |
| 4601 | 415 | 文件类型不被允许 | |
| 4700 | 409 | 用户名已存在 | |
| 4701 | 409 | 角色编码已存在 | |
| 5000 | 403 | 无权访问该资源 | 场景 / 数据权限 |
| 5001 | 403 | 字段无可见/可写权限 | 写字段被拒 |
| 6000 | 410 | 资源已过期 | 签名链接过期 |
| 6001 | 404 | 文件不存在 | |
| 9000 | 500 | 未定义错误 | 未捕获异常 |

---

## 3. 鉴权与头

- **登录**：`POST /api/auth/login` 成功后 `data.accessToken` 为 JWT。
- **请求头**：`Authorization: Bearer <accessToken>`。
- **刷新**：接口 `/api/auth/refresh` 接受 `refreshToken`（置于 body）。Phase 1 如仅实现单 token，`refresh` 用 `access token` 续签。
- **登出**：`POST /api/auth/logout` 将 `jti` 加入黑名单（Redis 后期；Phase 1 可用内存 + DB 表）。
- **权限模型**：
  - 普通路由：`@Roles(...)`。
  - 资源访问：`ScenarioGuard` 根据用户与资源关系判定。
  - 字段级：`FieldPermissionInterceptor` 统一兜底。

---

## 4. 接口清单（按模块）

> 以下列出 Phase 1~2 需要的全部接口。**Phase 1 重点实现 `auth` / `admin/*` / `health`**；工单、派发、导入等将在 Phase 3-6 落地。接口名不得随意改动，若要新增 / 调整，请发架构变更。

### 4.1 健康 & 元信息
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/health` | 健康检查（含 DB 连通性） | Public |
| GET | `/api/version` | 返回后端版本号 & 构建时间 | Public |

### 4.2 认证
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | Public |
| POST | `/api/auth/logout` | 登出 | Authed |
| POST | `/api/auth/refresh` | 刷新 token | Public |
| GET | `/api/auth/me` | 当前用户 + 角色 + 部门 + 权限摘要 | Authed |
| POST | `/api/auth/change-password` | 修改密码 | Authed |

**示例：POST /api/auth/login**
```http
POST /api/auth/login
Content-Type: application/json

{ "username": "lizhanbo", "password": "123456" }
```
```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "expiresIn": 604800,
    "user": {
      "id": 1,
      "username": "admin",
      "realName": "系统管理员",
      "roles": [{ "code": "admin", "name": "系统管理员", "departmentId": null }]
    }
  },
  "message": "ok"
}
```

### 4.3 工单（主）
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/work-orders` | 列表（按角色自动过滤） | Authed |
| POST | `/api/work-orders` | 手动创建单条（draft） | salesperson / manager |
| GET | `/api/work-orders/:id` | 详情（含子工单快照） | Authed（数据权限过滤） |
| PUT | `/api/work-orders/:id` | 修改（draft 直改；非 draft 走 withdraw modify） | 依状态 |
| POST | `/api/work-orders/:id/submit` | 正式提交并触发派发 | 创建者 / 主管 |
| POST | `/api/work-orders/:id/withdraw` | 发起撤回/修改申请 | 创建者 |
| POST | `/api/work-orders/import/preview` | 上传 Excel，返回映射建议 | salesperson / manager |
| POST | `/api/work-orders/import/confirm` | 确认映射并启动异步导入 | 同上 |
| GET | `/api/work-orders/import/:jobId` | 查询导入任务状态 | 发起人 / admin |
| GET | `/api/work-orders/import/:jobId/error-report` | 下载错误报表 | 同上 |

### 4.4 子工单
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/dispatched-orders` | 我的待办（默认 `handler=me OR in pool of my modules`） | 后道角色 |
| GET | `/api/dispatched-orders/team/:module` | 团队视图（主管） | 主管 / admin |
| GET | `/api/dispatched-orders/:id` | 详情（字段权限已应用） | 数据权限 |
| POST | `/api/dispatched-orders/:id/accept` | 接单（pool → 自己） | 模块角色 |
| POST | `/api/dispatched-orders/:id/complete` | 完成（需反馈字段） | handler |
| POST | `/api/dispatched-orders/:id/return` | 退回主工单（带 reason） | handler |
| POST | `/api/dispatched-orders/:id/supplement` | 补充字段 | handler（需字段规则允许） |
| POST | `/api/dispatched-orders/:id/reassign` | 重新分派 | 主管 / admin |
| POST | `/api/dispatched-orders/:id/export` | 按导出模板生成 xlsx | handler / 主管 |

### 4.5 撤回 & 审批
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/withdraw-requests` | 我的申请列表 | 发起人 |
| GET | `/api/withdraw-requests/pending` | 待我审批列表 | 被指派的 handler |
| POST | `/api/withdraw-requests/:id/approve` | 审批（同意/拒绝） | 审批人 |
| GET | `/api/withdraw-requests/:id` | 申请详情（含每个子工单的审批状态） | 相关方 |

### 4.6 看板
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/dashboard/salesperson` | 业务员看板 | salesperson |
| GET | `/api/dashboard/team/:module` | 团队看板 | 对应执行/主管 |
| GET | `/api/dashboard/manager` | 管理层看板 | manager / admin |

### 4.7 字段与权限配置（Admin）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET/POST | `/api/admin/fields` | 字段配置 CRUD |
| PUT/DELETE | `/api/admin/fields/:id` | 更新/软删除 |
| GET/POST | `/api/admin/field-permissions` | 字段权限批量 CRUD（支持矩阵模式） |
| PUT/DELETE | `/api/admin/field-permissions/:id` | 单条更新/删除 |
| POST | `/api/admin/field-permissions/batch` | 按"角色×场景"批量写入 |

### 4.8 派发配置（Admin）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET/POST | `/api/admin/dispatch-rules` | 派发规则 CRUD |
| PUT/DELETE | `/api/admin/dispatch-rules/:id` | 更新/删除 |
| POST | `/api/admin/dispatch-rules/:id/test` | 规则条件试算（输入 extraData，返回是否命中） |
| GET/POST | `/api/admin/module-handlers` | 模块处理人配置 |
| PUT/DELETE | `/api/admin/module-handlers/:id` | 更新/删除 |
| GET/POST | `/api/admin/field-supplement-rules` | 字段补充规则 |

### 4.9 基础数据（Admin）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET/POST | `/api/admin/users` | 用户 CRUD |
| PUT/DELETE | `/api/admin/users/:id` | 更新/禁用 |
| POST | `/api/admin/users/:id/reset-password` | 重置密码 |
| GET/POST | `/api/admin/roles` | 角色 CRUD |
| PUT/DELETE | `/api/admin/roles/:id` | 更新/禁用 |
| GET | `/api/admin/departments/tree` | 部门树 |
| POST/PUT/DELETE | `/api/admin/departments` | 部门 CRUD |
| GET/POST | `/api/admin/customers` | 客户 CRUD |
| GET/POST | `/api/admin/export-templates` | 导出模板 CRUD |
| GET | `/api/admin/logs` | 操作日志查询（按条件筛） |

### 4.10 AI 辅助
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| POST | `/api/ai/field-mapping` | 表头 → field_code 映射建议 | salesperson / manager / admin |

请求体：
```json
{
  "orderType": "onboarding",
  "headers": ["姓名", "身份证号", "基本工资", "..."]
}
```
响应：
```json
{
  "code": 0,
  "data": {
    "suggestion": {
      "姓名": "employee_name",
      "身份证号": "id_card_no",
      "基本工资": "base_salary"
    },
    "confidence": { "姓名": 0.99, "身份证号": 0.97 },
    "unmatched": ["一些奇怪的列"]
  }
}
```

### 4.11 文件
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| POST | `/api/upload/excel` | 上传 Excel（返回 fileId） | Authed |
| POST | `/api/upload/attachment` | 上传附件（身份证照片等） | Authed |
| GET | `/api/files/:id` | 文件下载（后端校验后 X-Accel-Redirect） | 资源权限 |

### 4.12 通知
| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/api/notifications` | 我的通知列表（分页） | Authed |
| POST | `/api/notifications/:id/read` | 标记已读 | 接收人 |
| POST | `/api/notifications/read-all` | 全部已读 | Authed |
| GET | `/api/notifications/unread-count` | 未读计数（前端 polling 或 SSE） | Authed |

---

## 5. 典型请求/响应范例

### 5.1 创建工单（手动单条）
```http
POST /api/work-orders
Authorization: Bearer ...
Content-Type: application/json

{
  "orderType": "onboarding",
  "customerId": 12,
  "extraData": {
    "employee_name": "张三",
    "id_card_no": "330200199901011234",
    "need_company_contract": "是",
    "need_onboarding_contact": "是",
    "base_salary": 6000
  }
}
```

### 5.2 提交工单（触发派发）
```http
POST /api/work-orders/1001/submit
```
成功响应（节选）：
```json
{
  "code": 0,
  "data": {
    "id": 1001,
    "orderNo": "ON20260511001",
    "status": "processing",
    "dispatchedOrders": [
      { "id": 2001, "moduleCode": "data_entry",         "status": "pending" },
      { "id": 2002, "moduleCode": "social_security",    "status": "pending" },
      { "id": 2003, "moduleCode": "onboarding_contact", "status": "pending" },
      { "id": 2004, "moduleCode": "contract",           "status": "pending" }
    ]
  },
  "message": "ok"
}
```

### 5.3 子工单详情（字段权限已应用）
```json
{
  "code": 0,
  "data": {
    "id": 2003,
    "moduleCode": "onboarding_contact",
    "status": "processing",
    "parentOrder": {
      "id": 1001,
      "orderNo": "ON20260511001",
      "employeeName": "张三"
    },
    "fields": [
      {
        "fieldCode": "employee_name",
        "fieldName": "姓名",
        "fieldType": "text",
        "value": "张三",
        "permission": "readonly"
      },
      {
        "fieldCode": "id_card_no",
        "fieldName": "身份证号",
        "fieldType": "text",
        "value": "330200********1234",
        "permission": "masked"
      },
      {
        "fieldCode": "bank_account",
        "fieldName": "银行借记卡账号",
        "fieldType": "text",
        "value": null,
        "permission": "visible",
        "supplementable": true
      }
    ],
    "feedbackData": { "onboarding_feedback": "办理中" }
  },
  "message": "ok"
}
```

### 5.4 错误响应示例
```json
{
  "code": 5001,
  "data": null,
  "message": "您没有修改字段「基本工资」的权限",
  "details": { "fieldCode": "base_salary", "scenario": "dispatched:onboarding_contact" },
  "traceId": "req_01HZK..."
}
```

---

## 6. 版本演进约束

- 本期不做 URL 版本化（`/api/v1`）。如后期引入，**老接口保留一个 Phase 周期**再下线，且通过 `Sunset` 头告知。
- 响应体中允许新增字段（前端必须容忍未知字段）；**不得**删除或重命名已有字段，否则视为破坏性变更。
- 错误码一旦公开，只允许新增，不允许删除或改变语义。
