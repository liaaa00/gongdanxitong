# P5 权限控制与编辑重提交流程验收报告（2026-05-20）

任务 ID：89169d5c-9510-4d43-9326-1a419aca7d6d  
执行角色：测试工程师  
验收依据：`docs/P5_PERMISSION_RESUBMIT_ACCEPTANCE_0520.md`、`docs/scripts/p5_permission_resubmit.http`  
测试环境：本地运行服务 `http://localhost:3000/api` + `http://localhost:5173`

## 1. 总结论

**结论：FAIL（存在 P0 阻断项）**

- 菜单/前端路由层：抽样 PASS。admin 可进入配置页；业务员直达配置 URL 跳转 `/403`。
- API 层：部分 FAIL。导出模板配置、系统设置接口对非 admin 返回 403；但字段管理 `/admin/fields` 与字段权限矩阵 `/admin/field-permissions/matrix` 对全部非 admin 返回 200 并泄露配置数据。
- 工单编辑强制重提：FAIL。processing 工单按前端当前两步链路 `PUT /work-orders/:id` 后再 `POST /work-orders/:id/resubmit`，第二步返回 409；时间线只记录 `update`，未出现 `salesperson_modify_resubmit`。

## 2. 执行的自动化/脚本

| 类型 | 命令/动作 | 结果 |
|---|---|---|
| 后端定向单测 | `npm run test -- --runTestsByPath test/admin-route-permissions.spec.ts test/return-resubmit.spec.ts test/work-order.service.spec.ts` | PASS：3 suites / 47 tests |
| 前端路由 guard 单测 | `npm run test -- src/config/routeVisibility.test.ts` | PASS：1 file / 2 tests |
| REST API 矩阵 | 基于 `p5_permission_resubmit.http` 只读接口，10 类账号登录后调用 | FAIL：字段管理/字段权限非 admin 200 |
| UI 抽样 | Playwright headless 登录 admin、业务员并直达配置 URL | PASS：业务员 6 个配置 URL 均 `/403` |
| 编辑重提 API | yuweiwei 对 processing 工单执行 PUT + POST /resubmit | FAIL：POST /resubmit 409，审计无重提动作 |

## 3. 账号与角色覆盖

| 序号 | 验收角色 | 使用账号 | 实际角色 | 说明 |
|---:|---|---|---|---|
| 1 | 系统管理员 | admin | admin | PASS 基准 |
| 2 | 业务负责人 | aolei | biz_manager | 非 admin |
| 3 | 业务组长 | shenwenjun | biz_leader | 非 admin |
| 4 | 业务员 | yaoyiping | biz_member | 非 admin |
| 5 | 数据录入负责人 | annazhen | data_entry_leader | 非 admin |
| 6 | 共享负责人 | jianglu | shared_leader + contract_specialist + onboarding_specialist | 非 admin |
| 7 | 劳动合同专员 | yangchun | contract_specialist | 非 admin |
| 8 | 入离职联系专员 | maoyani | onboarding_specialist | 非 admin |
| 9 | 社保公积金专员 | social01 | data_entry_leader | 环境无独立 active `social_insurance_specialist` seed，用兼容账号替代 |
| 10 | 普通非管理员 | yanqiuyue | biz_member | 环境无“无业务角色”账号，用非 admin 账号替代 |

## 4. API 权限矩阵结果

### 4.1 配置 API 汇总

| 模块/API | admin | 9 类非 admin/替代账号 | 结论 |
|---|---:|---:|---|
| `GET /admin/fields?page=1&pageSize=20` | 200 | **200** | **FAIL：非 admin 可读取字段配置** |
| `GET /admin/field-permissions/matrix` | 200 | **200** | **FAIL：非 admin 可读取字段权限矩阵** |
| `GET /admin/export-templates` | 200 | 403 | PASS |
| `GET /export-templates` | 200 | 403 | PASS |
| `GET /admin/system-settings/operation-log-retention` | 200 | 403 | PASS |

### 4.2 关键失败证据

业务员 `yaoyiping` 调用：

```http
GET /api/admin/fields?page=1&pageSize=2
Authorization: Bearer <biz_member token>
```

实际：HTTP 200，返回 `fieldCode=customer_name`、`fieldName=客户名称` 等字段配置数据。

业务员 `yaoyiping` 调用：

```http
GET /api/admin/field-permissions/matrix
Authorization: Bearer <biz_member token>
```

实际：HTTP 200，返回 `scenarios` 与 `matrix` 权限矩阵数据。

> 初步归因：源码控制器已有 `@Roles('admin')`，后端定向单测也通过；但当前运行实例对这两个 GET 接口未拦截，疑似运行服务使用旧构建/旧进程，或字段相关路由存在运行态绕过路径。以验收运行环境为准判 FAIL。

## 5. 菜单/路由层结果

- admin 登录后可进入：`/admin/fields`、`/admin/field-permissions`、`/my-field-permissions`、`/admin/export-templates`、`/export-templates`、`/admin/system-settings`。
- 业务员 `yaoyiping` 登录后直达上述 6 个 URL，均跳转 `/403`，页面文案为“无权限 / 抱歉，您没有权限访问此页面”。
- 前端 `routeVisibility.test.ts` 覆盖 admin 可访问、业务员不可访问上述配置路由，结果 PASS。

## 6. 工单编辑强制重提交结果

### 6.1 测试数据

- 账号：`yuweiwei`，角色 `biz_leader`
- 工单：`b249a6a0-bca6-46d7-98c7-cfafd3b79a9c`，单号 `ON20260519012`
- 初始状态：`processing`
- 子单：3 个，均未完成（pending）

### 6.2 执行步骤与结果

1. `PUT /api/work-orders/b249a6a0-bca6-46d7-98c7-cfafd3b79a9c`
   - 请求体：`{"extraData":{"special_remark":"P5验收重提-20260520145243"}}`
   - 实际：HTTP 200，字段已更新。
2. 随后执行 `POST /api/work-orders/b249a6a0-bca6-46d7-98c7-cfafd3b79a9c/resubmit`
   - 实际：HTTP 409。
3. 查询 `GET /api/work-orders/:id/timeline`
   - 实际：最新记录 `actionType=update`，未出现 `salesperson_modify_resubmit` 或等价“业务员修改后重提”。

### 6.3 判定

**P5-D-03 FAIL / P0**。验收文档明确要求：若前端采用 `PUT` 后再 `POST /resubmit` 两步链路，两步必须整体成功；若第二步 409，应判 FAIL。当前前端 `WorkOrders/Detail/index.tsx` 正是先 `updateWorkOrder` 再 `resubmitWorkOrder`，用户会看到“保存或重新提交失败”，且后端时间线未生成重提动作。

## 7. 未完全执行项与原因

| 项目 | 状态 | 原因 |
|---|---|---|
| 10 角色全部截图 | 部分执行 | 已用 API + UI 抽样覆盖；未逐角色截图保存到文件 |
| returned 工单编辑重提 | 未破坏性执行 | 已存在 P0 阻断；为避免继续变更共享测试数据，未修改 returned 工单 |
| 终态不可编辑 | 未执行 | 当前 yuweiwei 名下无 completed/withdrawn 终态工单；`void` 不是后端合法 status 枚举 |
| `GET /dashboard/cards` 误伤检查 | 未通过该端点验证 | 当前环境该端点返回 404，疑似实际仪表盘接口不是该路径；不纳入本阶段 P0 判定 |

## 8. 失败项清单

### P5-A-05 / P0：非 admin 可读字段管理 API

- 角色/账号：aolei、shenwenjun、yaoyiping、annazhen、jianglu、yangchun、maoyani、social01、yanqiuyue
- API：`GET /admin/fields?page=1&pageSize=20`
- 预期：401/403，不返回配置数据
- 实际：200，返回字段配置列表
- 建议责任人：backend

### P5-A-05 / P0：非 admin 可读字段权限矩阵 API

- 角色/账号：同上
- API：`GET /admin/field-permissions/matrix`
- 预期：401/403，不返回权限矩阵
- 实际：200，返回 scenarios/matrix
- 建议责任人：backend

### P5-D-03 / P0：编辑后两步重提协议失败

- 角色/账号：yuweiwei / biz_leader
- 工单：`ON20260519012`
- API：`PUT /work-orders/:id` 200 后，`POST /work-orders/:id/resubmit` 409
- 预期：保存并重新提交整体成功，时间线出现 `salesperson_modify_resubmit`
- 实际：字段已保存但 resubmit 失败，时间线为 `update`
- 建议责任人：frontend + backend 协议对齐

## 9. 修复建议

1. 后端确认当前运行实例是否已使用最新构建；确保 `/admin/fields`、`/admin/field-permissions/matrix` 在真实服务中由 `JwtAuthGuard + RolesGuard` 拦截，非 admin 返回 403。
2. 字段配置如果也被业务表单复用，应拆分只读业务字段接口与 admin 配置接口：业务接口可授权读取运行态字段，`/admin/*` 必须 admin-only。
3. 编辑重提只保留一种协议：
   - 方案 A：`PUT /work-orders/:id` 原子完成“保存并重提”，前端不要再调用 `/resubmit`，成功提示改为“已保存并重新提交”；
   - 方案 B：`PUT` 只保存草稿且保持可 resubmit 状态，`POST /resubmit` 完成重提；后端不得在 PUT 后导致 POST 409。
4. 补充 E2E：用真实账号覆盖 P5-A/P5-B/P5-C 的 10 角色 API 矩阵，以及 P5-D 的两步/单步协议。
