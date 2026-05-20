# Stage A Backend 接口清单

## 通用报文头

- `Authorization: Bearer <accessToken>`：除 `/auth/login` 外均必填。
- `Content-Type: application/json`：JSON 请求必填。
- 成功响应统一返回业务对象或分页对象；错误响应沿用后端 `businessException`：`{ code: number, message: string, details?: object }`。

## BE-A2 客户业务员绑定

### GET `/api/admin/customer-assignees`

Query：`page?pageSize?keyword?customerId?customer_id?userId?user_id?isActive?is_active?`

Resp：

```json
{
  "items": [{
    "id": "uuid",
    "customerId": "uuid",
    "customer_id": "uuid",
    "userId": "uuid",
    "user_id": "uuid",
    "groupCode": "BUSINESS_GROUP_1",
    "group_code": "BUSINESS_GROUP_1",
    "isActive": true,
    "is_active": true,
    "assignedAt": "2026-05-14T00:00:00.000Z",
    "assigned_at": "2026-05-14T00:00:00.000Z"
  }],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### POST `/api/admin/customer-assignees`

Req：`{ "customerId": "uuid", "userId": "uuid", "groupCode": "BUSINESS_GROUP_1", "isActive": true }`

Resp：同单条绑定对象。

### GET `/api/admin/customer-assignees/:id`

Resp：单条绑定对象。

### PUT `/api/admin/customer-assignees/:id`

Req：`{ "userId"?: "uuid", "groupCode"?: "BUSINESS_GROUP_2", "isActive"?: true }`

Resp：单条绑定对象。

### DELETE `/api/admin/customer-assignees/:id`

Resp：`{ "success": true }`，语义为软删除 `isActive=false`。

错误码：

- HTTP 400：客户不存在或已停用 / 用户不存在或已停用 / 客户已绑定该业务员。
- HTTP 404：客户业务员绑定不存在。

## BE-A4 身份证×当月重复校验

### POST `/api/work-orders`

Req：沿用创建工单 DTO；当 `orderType=onboarding` 且同一 `employee_id_card/id_card_no` 在同月非 `withdrawn` 工单已存在时失败。

Error：HTTP 409

```json
{
  "code": 4120,
  "message": "DUPLICATE_ID_CARD_IN_MONTH",
  "details": {
    "code": "DUPLICATE_ID_CARD_IN_MONTH",
    "conflictOrderNo": "ON202605001",
    "existedOrderNo": "ON202605001"
  }
}
```

### POST `/api/import-jobs`

批量导入逐行捕获重复错误，其他行继续；失败行进入错误报表，行级字段包含：

```json
{ "row": 12, "code": "DUPLICATE_ID_CARD_IN_MONTH", "existedOrderNo": "ON202605001" }
```

## BE-A5 派发规则扩展

### `/api/admin/dispatch-rules`

创建/更新规则在原字段基础上新增：

Req 扩展：

```json
{
  "customerId": "uuid|null",
  "departmentId": "uuid|null",
  "subModule": "contact|contract|data_entry",
  "assigneeUserId": "uuid|null",
  "fallbackUserId": "uuid|null",
  "allowManualOverride": true
}
```

匹配优先级：`customerId` 精确 > `departmentId` 业务组 > 全局默认；命中后优先 `assigneeUserId`，不可用时使用 `fallbackUserId`，再回落到模块处理人池。

## BE-A6/BE-A7 变更通知

### GET `/api/notifications?bizType=order.field_changed&unread=true`

Resp：沿用通知列表结构，新增/使用以下 `bizType`：

- `order.field_changed`：普通字段修改。
- `order.completed_modified`：已办结工单修改。
- `order.supplement_filled`：入职联系等办理人补字段。

通知 `payload`：

```json
{
  "workOrderId": "uuid",
  "orderNo": "ON202605001",
  "actorUserId": "uuid",
  "diff": [{ "field": "employee_name", "before": "张三", "after": "李四" }],
  "channels": ["in_app"]
}
```

## 详情接口 404/403 错码表

### GET `/api/work-orders/:id`

- 404：工单不存在或 ID 无匹配记录。响应示例：`{ "code": 404, "data": null, "message": "工单不存在", "traceId": "req_xxx" }`。
- 403：当前用户不在管理员/发起人/有权业务负责人范围内。响应示例：`{ "code": 403, "data": null, "message": "无权访问该资源", "traceId": "req_xxx" }`。

### GET `/api/dispatched-orders/:id`

- 404：子工单不存在或 ID 无匹配记录。响应示例：`{ "code": 404, "data": null, "message": "子工单不存在", "traceId": "req_xxx" }`。
- 403：当前用户既非处理人，也无模块池/主管查看权限。响应示例：`{ "code": 403, "data": null, "message": "无权访问该子工单", "traceId": "req_xxx" }`。

### GET `/api/dispatched-orders/:id/supplement-logs`

- 404：子工单不存在或 ID 无匹配记录。
- 403：当前用户无权查看该子工单补充日志。

全局异常过滤器 `HttpExceptionFilter` 已确认：`HttpException` 保留原始 status，不会将上述 4xx 转为 500；非 HttpException 才归一为 500。

## BE-A8 已办结修改

### PATCH `/api/work-orders/:id`

Req：沿用更新工单 DTO，发起人可修改本人发起工单的业务员字段；`completed` 状态允许保存，不触发审批流。

Resp：工单详情；保存后：

- 写回 `work_orders.extra_data` 与升级列。
- 更新 `work_orders.last_modified_at/by`。
- 同步刷新三个 `dispatched_orders` 快照更新时间。
- 触发 `order.completed_modified` 或 `order.field_changed` 通知。

Error：

- HTTP 403 / code 4115：修改了办理人字段，`details.fields` 返回被拒字段。
- HTTP 409 / code 4120：身份证当月重复。

## BE-A9 首次登录强制改密

### POST `/api/auth/login`

Resp user 增加：

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "uuid",
    "username": "yangchun",
    "realName": "杨纯",
    "roles": ["contract_specialist"],
    "permissions": ["role:contract_specialist"],
    "mustChangePassword": true,
    "must_change_password": true
  }
}
```

### POST `/api/auth/change-password`

Req：`{ "oldPassword": "123456", "newPassword": "new-password" }`

Resp：`{ "success": true }`；成功后置 `must_change_password=false`，写入 `password_updated_at=now()`。

错误：HTTP 400 `旧密码不正确`；HTTP 401 `用户不存在/用户名或密码错误`。

## BE-A10 AB 角池与认领

### GET `/api/dispatched-orders?pool=contract&onlyUnclaimed=true`

Query：

- `pool`：模块池，等价于 `moduleCode`。
- `onlyUnclaimed=true`：仅看 `handler_id IS NULL` 的未认领任务。

Resp：沿用子工单分页列表。

### POST `/api/dispatched-orders/:id/claim`

Req：空对象 `{}`。

Resp：子工单详情；内部使用原子 SQL 语义：`UPDATE dispatched_orders SET handler_id=:currentUser WHERE id=:id AND handler_id IS NULL RETURNING id`。

Error：

- HTTP 403 / code 5000：无权接取该模块公共池工单。
- HTTP 409 / code 4220：已被他人认领或状态变化。

## 迁移/数据项

- `branches`：商社表，按现有客户一对一种子默认商社。
- `customer_assignees`：客户-业务员动态绑定。
- `work_orders.branch_id/customer_code/branch_code/customer_name/last_modified_at/last_modified_by`。
- `dispatch_rules.customer_id/department_id/sub_module/assignee_user_id/fallback_user_id/allow_manual_override`。
- `users.group_code/must_change_password/password_updated_at`，默认密码种子为 `123456`。
- `v_dispatch_pool`：AB 角池视图。

## P0 补丁（2026-05-14）：启动迁移、详情错码与管理后台路径

### 迁移 / 启动

- 必跑命令：`cd backend && npm run migration:run`。
- Stage A 迁移 `1715900000000-StageABackend.ts` 会补齐：
  - `users.group_code`
  - `users.must_change_password`
  - `users.password_updated_at`
  - `branches` / `customer_assignees`
  - `dispatch_rules` Stage A 扩展列
  - `v_dispatch_pool`
- `SeedOnBootstrapService` 启动前会先查询 `information_schema.columns`，仅在缺列时兜底补 `users.group_code/must_change_password/password_updated_at`，避免已迁移生产库因非表 owner 执行 `ALTER TABLE ... IF NOT EXISTS` 失败。
- 迁移中的 `uq_work_orders_idcard_month` 在无历史重复数据时创建数据库唯一索引；如旧库已有同月同身份证历史重复，会跳过索引并保留应用层 `DUPLICATE_ID_CARD_IN_MONTH` 校验，确保演示库可一键迁移启动。

### 管理后台路径对齐

| 功能 | 方法与路径 | 说明 |
| --- | --- | --- |
| 商社列表 | `GET /api/admin/branches` | 支持 `page/current/pageSize/keyword/customerId/customer_id/isActive/is_active` |
| 商社新增 | `POST /api/admin/branches` | body 支持 camel/snake：`customerId/customer_id`、`branchCode/branch_code`、`branchName/branch_name`、`isActive/is_active` |
| 商社详情 | `GET /api/admin/branches/:id` | 不存在返回 404 `商社不存在` |
| 商社更新 | `PUT /api/admin/branches/:id` | 支持局部更新，商社代码重复返回 400 |
| 商社删除 | `DELETE /api/admin/branches/:id` | 软删除：`isActive=false` |
| 客户业务员绑定 | `/api/admin/customer-assignees` | 已确认挂在 admin 前缀 |
| 派发规则 | `/api/admin/dispatch-rules` | 已确认挂在 admin 前缀 |
| 认领公共池 | `POST /api/dispatched-orders/:id/claim` | 已确认存在 |
| 修改密码 | `POST /api/auth/change-password` | 已确认存在 |

### 详情接口 404/403 错码表

| 接口 | 不存在/非法 ID | 无权限 | 备注 |
| --- | --- | --- | --- |
| `GET /api/work-orders/:id` | 404 `工单不存在` | 403 `无权访问该资源/无权访问该工单` | `HttpExceptionFilter` 保留原始 4xx，不转 500 |
| `GET /api/dispatched-orders/:id` | 404 `子工单不存在` | 403 `无权访问该子工单` | service 先 `loadDispatchedOrder` 再权限判断 |
| `GET /api/dispatched-orders/:id/supplement-logs` | 404 `子工单不存在` | 403 `无权访问该子工单` | controller 中该路由位于 `GET :id` 之前，避免被详情路由吞掉 |

验证记录：`npm run migration:run` 成功；`npm run build` 成功；`npm test` 21 suites / 108 tests 通过；`npx jest --config ./test/jest-unit.json --runInBand test/detail-404-403.spec.ts` 5/5 通过；`PORT=3101 npm run start:prod` 可启动到监听阶段，默认 `3000` 仅因本机已有进程占用报 `EADDRINUSE`。

## P0 热修（2026-05-14）：非法 ID 类型统一返回 404

### 覆盖接口

| 接口 | 非法 ID 示例 | 期望状态 | 响应 message |
| --- | --- | --- | --- |
| `GET /api/work-orders/:id` | `/api/work-orders/not-exist-qa` | 404 | `工单不存在` |
| `GET /api/dispatched-orders/:id` | `/api/dispatched-orders/not-exist-qa` | 404 | `子工单不存在` |
| `GET /api/dispatched-orders/:id/supplement-logs` | `/api/dispatched-orders/not-exist-qa/supplement-logs` | 404 | `子工单不存在` |

### 实现说明

- controller 层对详情类 `:id` 入参先执行 UUID 格式校验，不符合 UUID 的字符串（例如 `not-exist-qa`）直接抛 `NotFoundException`，不再进入 TypeORM 查询。
- service 层保留兜底：如果数据库仍抛出 `QueryFailedError` 且 pg code 为 `22P02`（invalid input syntax for type uuid），统一转成 `NotFoundException`。
- `HttpExceptionFilter` 增加 TypeORM 保险处理：`22P02 -> 404`，`23xxx -> 400`；已有 `HttpException` 仍保留原始 4xx，不会转成 `code=1000` 的 500。
- `GET /api/dispatched-orders/:id/supplement-logs` 仍位于 `GET /api/dispatched-orders/:id` 之前，避免被通用详情路由吞掉。

### 验证记录

- `npm run build`：通过。
- `npx jest --config ./test/jest-unit.json --runInBand test/detail-404-403.spec.ts`：8/8 通过，覆盖 TypeORM invalid uuid 兜底转 404。
- `npx jest --config ./test/jest-e2e.json --runInBand test/detail-invalid-id.e2e-spec.ts`：3/3 通过，三个 QA 失败路径 HTTP 返回 404。
- `npm test`：21 suites / 111 tests 全通过。
