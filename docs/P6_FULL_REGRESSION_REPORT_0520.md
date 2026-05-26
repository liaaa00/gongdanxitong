# P6 四阶段全量回归测试报告（2026-05-20）

任务 ID：2873c6f5-e180-4a8f-b141-1670b49b40ca  
执行角色：测试工程师  
测试依据：`docs/P4_ARCHITECTURE_ALIGN_0520.md` 四阶段计划与 52 条用例清单  
测试环境：本地运行服务 `http://localhost:3000/api` + `http://localhost:5173`

## 1. 总结论

**结论：FAIL（存在 P0/P1 阻断与运行态回归）**

阶段 1 自动化基线整体通过：后端 241 条单测、前端 62 条 Vitest、前后端 build 均 PASS。  
但阶段 2~4 在当前运行服务与 UI 验收中发现多项阻断：字段配置 API 越权、工作流配置 API 404、仪表盘卡片 API 404、编辑重提二次提交 409、撤回入口 404，以及 UI 列表仍出现看板/网格/列配置入口。

### 1.1 52 条用例统计

| 状态 | 数量 | 说明 |
|---|---:|---|
| PASS | 24 | 自动化或 API/UI 抽样满足预期 |
| PARTIAL_PASS | 10 | 只完成非破坏性/只读验证，或依赖数据不足未跑闭环 |
| FAIL | 16 | 与验收标准不符 |
| BLOCKED | 1 | 环境缺少终态数据，无法执行 |
| NOT_EXECUTED | 1 | 本轮未覆盖的页面细项 |
| **总计** | **52** | 15 条 G 用例 + 26 问题 + 6 流程 + 5 BUG |

## 2. 四阶段执行结果

### 阶段 1：单元测试与构建回归

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端全量单测 | `cd backend && npm run test` | PASS：37/38 suites passed，1 skipped；241 passed，14 skipped |
| 前端全量 Vitest | `cd frontend && npm run test` | PASS：17 files / 62 tests passed |
| 后端构建 | `cd backend && npm run build` | PASS |
| 前端构建 | `cd frontend && npm run build` | PASS：tsc + vite build 成功 |
| 前端 Playwright E2E | `cd frontend && npm run e2e` | FAIL：6 tests 中 2 passed / 4 failed，失败原因是 e2e 脚本使用旧密码 `admin123`，当前 seed 密码为 `123456` |

> 阶段 1 结论：代码级自动化与构建通过；Playwright 旧脚本与当前测试账号密码不一致，需要更新脚本或测试环境账号。

### 阶段 2：API 集成测试

| 检查项 | API/动作 | 结果 | 证据 |
|---|---|---|---|
| G18 admin 字段配置 | `GET /admin/fields` | PASS | admin 200 |
| G18 非 admin 字段配置 | `GET /admin/fields` | **FAIL** | biz_member 200，返回字段配置数据 |
| G18 admin 字段权限矩阵 | `GET /admin/field-permissions/matrix` | PASS | admin 200 |
| G18 非 admin 字段权限矩阵 | `GET /admin/field-permissions/matrix` | **FAIL** | biz_member 200，返回 scenarios/matrix |
| G20 导出模板权限 | `/admin/export-templates`、`/export-templates` | PASS | admin 200，非 admin 403 |
| G20 系统设置权限 | `/admin/system-settings/operation-log-retention` | PASS | admin 200，非 admin 403 |
| G19 工作流 CRUD | `POST /admin/workflows` | **FAIL** | 当前运行服务返回 404 |
| G19 工作流发布 | `POST /admin/workflows/:id/publish` | **FAIL** | CRUD 入口不可用；无可发布对象 |
| 仪表盘卡片 | `GET /dashboard/cards` | **FAIL** | biz_member 404 |
| 通知计数/列表 | `/notifications/unread-count`、`/notifications` | PASS | 200，count/list 均可读 |
| 工单列表 | `GET /work-orders` | PASS | admin 200 |
| 子单列表 | `GET /dispatched-orders` | PASS | data_entry 200 |
| 团队子单 | `GET /dispatched-orders/team/contract` | PASS | shared_leader 200 |
| G21 编辑重提 | `PUT /work-orders/:id` + `POST /resubmit` | **FAIL** | PUT 200，随后 resubmit 409 |

### 阶段 3：UI 功能测试

| 页面/功能 | 账号 | 结果 | 证据 |
|---|---|---|---|
| admin 仪表盘 | admin | PARTIAL_PASS | 页面可打开，显示姓名/卡片/节点表；但页面出现多条“请求的资源不存在”提示 |
| 非 admin 仪表盘 | yaoyiping | PARTIAL_PASS | 页面可打开，显示姓名/卡片；但后台有 404/权限提示 |
| 字段配置页 | admin | PASS | `/admin/fields` 正常渲染字段表 |
| 字段权限页 | admin | PASS | `/admin/field-permissions` 正常渲染矩阵页面 |
| 导出模板配置 | admin | PASS | `/admin/export-templates` 正常渲染列表 |
| 门户/系统设置 | admin | PASS | `/admin/system-settings` 正常渲染保留天数配置 |
| 工单流程配置 | admin | **FAIL** | `/admin/workflows` 页面可打开但提示“加载流程配置失败”，列表无数据，后端 API 404 |
| 配置页直达拦截 | yaoyiping | PASS | `/admin/fields`、`/admin/export-templates`、`/export-templates`、`/admin/workflows` 均跳转 `/403` |
| 消息通知页 | admin / yaoyiping | PASS | 页面可打开，列表为空但无崩溃 |
| 主工单列表 | admin / yaoyiping | **FAIL** | 页面仍显示“表格 / 看板 / 网格 / 常用筛选视图 / 列配置”，与 P3.4“删除看板/网格/列配置”预期冲突 |
| 我的工单四视图 | yaoyiping | PASS | `/my-work/initiated`、`/my-work/pending` 可打开，菜单按角色显示 |

### 阶段 4：端到端流程 R1-R6

| 编号 | 流程 | 结果 | 证据/说明 |
|---|---|---|---|
| R1 | 常规办理（发起→后道→完成） | PARTIAL_PASS | 存在 processing 工单 `ON20260519012` 与 pending 子单，可读；未执行完成动作以避免破坏共享数据 |
| R2 | 后道退回→业务员作废 | PARTIAL_PASS | 存在 returned 工单 `ON20260519003`；未执行作废审批闭环 |
| R3 | 后道退回→业务员修改→重新提交 | PARTIAL_PASS | 存在 returned 工单；未执行破坏性重提 |
| R4 | 办理中编辑→重新提交→消息提醒后道 | **FAIL** | processing 工单 PUT 编辑成功后 POST `/resubmit` 返回 409，timeline 无 `salesperson_modify_resubmit` |
| R5 | 申请撤回/作废→后道审批 | **FAIL** | `POST /work-orders/:id/withdraw` 当前运行服务返回 404 |
| R6 | 终态不可操作 | BLOCKED | 当前环境无 completed/withdrawn 终态工单可验证 |

## 3. 52 条用例明细

### 3.1 G-18/G-19/G-20/G-21 共 15 条

| 用例 | 验收点 | 状态 | 备注 |
|---|---|---|---|
| P4-G18-01 | admin 可访问字段配置/字段权限菜单与页面 | PASS | UI 与 admin API 200 |
| P4-G18-02 | 非 admin 配置菜单不可见 | PASS | UI 菜单过滤通过 |
| P4-G18-03 | 非 admin URL 直达字段配置/字段权限为 403 | PASS | 前端路由跳转 `/403` |
| P4-G18-04 | 非 admin 字段配置/权限 API 返回 401/403 | **FAIL** | `/admin/fields`、`/admin/field-permissions/matrix` 返回 200 |
| P4-G20-01 | admin 可访问导出模板/门户配置 | PASS | UI/API 200 |
| P4-G20-02 | 非 admin 导出模板/门户配置菜单不可见 | PASS | UI 菜单过滤通过 |
| P4-G20-03 | 非 admin URL 直达导出模板/门户配置为 403 | PASS | 前端路由跳转 `/403` |
| P4-G20-04 | 非 admin 导出模板/门户配置 API 返回 401/403 | PASS | API 403 |
| P4-G19-01 | 流程定义 CRUD | **FAIL** | `/admin/workflows` 运行态 404 |
| P4-G19-02 | 流程发布与非法配置拦截 | **FAIL** | 无法创建/发布；入口 404 |
| P4-G19-03 | 新建工单按发布流程生成子单/待办 | **FAIL** | 工作流配置接口不可用，无法验证生效 |
| P4-G19-04 | 前端 React Flow 编辑器保存/刷新不丢失 | **FAIL** | 页面提示“加载流程配置失败” |
| P4-G21-01 | editing processing 后状态强制重提 | **FAIL** | PUT 200 后 resubmit 409 |
| P4-G21-02 | 审批链/待办重置与通知后道 | **FAIL** | 重提失败，无法产生重置/通知闭环 |
| P4-G21-03 | UI 提示与确认后完整成功 | **FAIL** | 前端当前两步链路会触发“保存或重新提交失败” |

### 3.2 26 个反馈问题

| 编号 | 问题描述 | 状态 | 备注 |
|---|---|---|---|
| P1.1 | 仪表盘左下角姓名直显 | PASS | admin/业务员页面均显示当前姓名 |
| P1.2 | 仪表盘 4 卡片按角色取数 + 我的消息排除正常派单 | **FAIL** | `/dashboard/cards` 404，页面有资源不存在提示 |
| P1.3 | 取消周期选择器 + 业务负责人按模块趋势图 | PASS | 抽样页面未见周期选择器 |
| P1.4 | 仪表盘总表按子工单/办理事项口径 | PARTIAL_PASS | 节点总表区域存在；当前无数据无法核对口径 |
| P2.1 | 非管理员菜单按角色重排 | PASS | 业务员不显示管理后台配置菜单 |
| P2.2 | “我的工单”四子菜单 | PASS | 业务员显示“我发起的/我的待办”等授权入口 |
| P2.3 | “主工单列表”与“新建入职”合并 | PASS | 主工单列表页保留统一新建入口 |
| P3.1 | 批导入字段映射机制 | PASS | 后端 import/excel-parser 单测通过 |
| P3.2 | 删除 social_urge 字段 | PASS | module-fields-baseline 等相关单测通过 |
| P3.3 | 搜索栏 5 字段 | PARTIAL_PASS | 列表搜索栏可见；未逐字段组合断言 |
| P3.4 | 删除列配置/看板/网格 | **FAIL** | UI 仍显示“表格 / 看板 / 网格 / 常用筛选视图 / 列配置” |
| P3.5 | 列表操作按钮权限 | PARTIAL_PASS | API 权限测试通过部分；未逐按钮截图 |
| P3.6 | 详情页操作按钮 + 删除旧冗余区块 | PARTIAL_PASS | 未完整截图详情页；相关服务测试通过 |
| P3.7 | 详情页搜索筛选栏调整 | NOT_EXECUTED | 本轮未覆盖详情筛选栏 6 字段逐项验证 |
| P4.1 | 入职单条录入表单分组栅格排版 | PARTIAL_PASS | 前端 build/test 通过；Playwright 创建工单脚本因旧密码失败 |
| P4.2 | 新增工单流程配置功能 | **FAIL** | 对应 G19 全部失败 |
| P4.3 | 字段管理权限仅 admin | **FAIL** | 对应 G18 API 越权 |
| P4.4 | 导出模板字段选择改为列表勾选 | PASS | 导出模板页可打开，后端 export-template 单测通过 |
| B1 | 必填字段未维护仍可导入 | PASS | import.service / validation 单测通过 |
| B2-a | 业务员导入后仪表盘未更新 | **FAIL** | 仪表盘卡片 API 404，无法保证更新 |
| B2-b | 子工单显示“未派发” | PASS | 抽样子单有 handlerName/status，未见“未派发”问题 |
| B2-c | “共享团队视角”误显示 | PASS | 业务员页面未出现共享团队视角文案 |
| B3 | 消息显示数量但点击无记录 | PASS | unread-count 与通知列表均可读且为 0 |
| B4 | MyDispatched 个人待办无批量办理按钮 | PARTIAL_PASS | 子单列表/待办页可读；未执行批量完成破坏性动作 |
| B5 | 共享负责人模块筛选失效 | PASS | shared_leader 调 `/dispatched-orders/team/contract` 返回 200 |
| Q08 | 导出模板/门户配置仅 admin | PASS | G20 API/UI 均通过 |

### 3.3 6 类工单流程

| 编号 | 流程描述 | 状态 | 备注 |
|---|---|---|---|
| R1 | 常规办理（发起→后道→完成） | PARTIAL_PASS | 有 processing + pending 子单；未执行完成闭环 |
| R2 | 后道退回→业务员作废 | PARTIAL_PASS | 有 returned 工单；未执行作废闭环 |
| R3 | 后道退回→业务员修改→重新提交 | PARTIAL_PASS | 有 returned 工单；未执行重提闭环 |
| R4 | 办理中编辑→重新提交→消息提醒后道 | **FAIL** | G21 失败 |
| R5 | 申请撤回/作废→后道审批 | **FAIL** | withdraw 入口 404 |
| R6 | 终态不可操作 | BLOCKED | 缺少终态工单数据 |

### 3.4 5 个 BUG 回归

| 编号 | BUG 描述 | 状态 | 备注 |
|---|---|---|---|
| B1 | 必填缺失仍导入 | PASS | 导入相关单测通过 |
| B2 | 导入后仪表盘/派发/共享视角 | **FAIL** | 仪表盘卡片 API 404；派发/共享视角抽样未复现 |
| B3 | 消息有数量无列表 | PASS | count/list 同源读取正常 |
| B4 | 后道批量办理缺失 | PARTIAL_PASS | 页面/API可读；未执行批量办理破坏性动作 |
| B5 | 共享负责人模块筛选无结果 | PASS | contract team 接口返回 200 |

## 4. 问题清单

### P0-REG-01：字段配置/字段权限 API 非 admin 越权

- 影响用例：P4-G18-04、P4.3
- API：`GET /admin/fields`、`GET /admin/field-permissions/matrix`
- 预期：非 admin 返回 401/403，不返回配置数据
- 实际：非 admin 返回 200，并返回字段配置/权限矩阵
- 初步归因：源码和单测有 `@Roles('admin')`，但当前运行实例未正确拦截；可能为旧进程/旧构建或运行态路由绕过
- 建议责任人：backend

### P0-REG-02：工单流程配置运行态 API 404

- 影响用例：P4-G19-01~04、P4.2
- API：`POST/GET /admin/workflows`
- 预期：admin 可 CRUD/发布，非 admin 403
- 实际：当前运行服务返回 404，前端页面提示“加载流程配置失败”
- 初步归因：源码已包含 `WorkflowModule`，但运行实例未加载最新模块或未重启
- 建议责任人：backend + deploy/runtime

### P0-REG-03：编辑重提两步链路失败

- 影响用例：P4-G21-01~03、R4
- 工单：`ON20260519012`
- 实际：`PUT /work-orders/:id` 200 后，`POST /work-orders/:id/resubmit` 返回 409；timeline 无 `salesperson_modify_resubmit`
- 建议：前后端统一协议；若 PUT 已原子重提，前端不得二次调用 resubmit；若前端两步，则后端 PUT 后必须允许 resubmit 成功
- 建议责任人：frontend + backend

### P1-REG-04：仪表盘卡片接口 404

- 影响用例：P1.2、B2-a、阶段2 dashboard 集成
- API：`GET /dashboard/cards`
- 实际：404；UI 页面出现多条“请求的资源不存在”提示
- 建议责任人：backend + frontend 接口契约

### P1-REG-05：主工单列表仍显示看板/网格/列配置入口

- 影响用例：P3.4
- 预期：默认表格，无看板/网格/列配置等冗余入口
- 实际：页面仍显示“表格 / 看板 / 网格 / 常用筛选视图 / 列配置”
- 建议责任人：frontend

### P1-REG-06：撤回入口运行态 404

- 影响用例：R5
- API：`POST /work-orders/:id/withdraw`
- 实际：当前运行服务返回 404
- 建议责任人：backend + deploy/runtime

### P2-REG-07：Playwright E2E 测试脚本使用旧密码

- 影响：阶段4 项目内 E2E 套件 4/6 失败
- 实际：脚本使用 `admin/admin123`，当前 seed 默认密码为 `123456`
- 建议：统一测试账号密码或通过环境变量配置 E2E 凭据
- 建议责任人：frontend/qa

## 5. 测试数据说明

本轮为运行态回归，曾对 processing 工单 `ON20260519012` 执行多次 `PUT /work-orders/:id` 修改 `special_remark` 字段以复现 G21/R4。未执行子单完成、作废、退回重提等破坏性闭环动作。

## 6. 下一步建议

1. 先修复/重启运行态后端，确保源码中已实现的 `WorkflowModule`、`RolesGuard`、withdraw 路由真正生效。
2. 修复字段配置 API 越权后，重新执行 P5/P6 权限矩阵。
3. 前后端统一编辑重提协议后，重跑 R4 与 G21。
4. 修复仪表盘接口契约和列表冗余入口后，重跑 P1.2、P3.4、B2-a。
5. 更新 Playwright E2E 凭据后重新运行项目内 E2E。
