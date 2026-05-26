# P4 架构对照与最终审计计划（2026-05-20）

> **角色**：架构师  
> **任务 ID**：`b0e91127-7a0b-475f-bca6-9a0eaa9e39a3`  
> **目标**：本轮把 P2 三项（G-18/G-19/G-20）+ R4(G-21) 改完并彻底测试不留死角  
> **用户新增要求**：
> 1. 工单流程配置需要可视化编辑器
> 2. 字段管理权限只授权给管理员
> 3. 导出模板和仪表盘配置权限仅管理员可见
> 4. 编辑后必须重新提交

---

## 0. 执行摘要

### 0.1 本轮范围确认

根据用户最新口径和历史文档分析，本轮 P4 阶段需完成：

| 编号 | 任务简述 | 上一轮状态 | 本轮目标 | 优先级 |
|---|---|---|---|---|
| **G-18** | 字段管理权限控制 | P3 已实现后端 guard + 前端菜单隐藏 | 确认**仅管理员**可见可操作，非管理员完全拦截 | **P0** |
| **G-19** | 工单流程配置功能 | P3 已实现后端 CRUD + 前端 React Flow 编辑器 | 完整验收：CRUD/发布/新工单生效/可视化编辑器 | **P0** |
| **G-20** | 导出模板 + 门户配置权限 | P3 已实现管理员 guard | 确认非管理员菜单不可见、路由/API 均 403 | **P0** |
| **G-21** | 编辑后必须重新提交 | P3 已实现编辑触发通知 + UI 提示 | 强制重新提交流程：状态回退/审批链重置/通知后道 | **P0** |

**关键变化**：用户本轮明确 G-18 字段管理权限**只授权给管理员**（非上一轮讨论的"可授权非管理员"），因此 G-18 验收标准调整为"非管理员完全无权访问"。

### 0.2 与历史 26 问题 + 6 流程 + 5 BUG 的关系

- **G-18** 对应反馈 **P4.3**（字段管理权限可授权非管理员）→ 本轮改为"仅管理员"
- **G-19** 对应反馈 **P4.2**（新增工单流程配置功能）
- **G-20** 对应反馈 **Q08**（导出模板/门户配置权限）
- **G-21** 对应反馈 **R4**（情况 4：办理中编辑→重新提交→消息提醒后道）

上一轮 P0/P1 已完成 24/26 问题修复，本轮 G-18/G-19/G-20/G-21 是剩余 2 个 NOT_VERIFIED 项 + R4 强语义的最终落地。

---

## 1. G-18 字段管理权限架构对照

### 1.1 代码影响面

#### 后端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `backend/src/modules/admin/fields/fields.controller.ts` | 已实现 | 所有写接口 `@Roles('admin')` |
| `backend/src/modules/admin/field-permissions/field-permission.controller.ts` | 已实现 | 所有写接口 `@Roles('admin')` |
| `backend/src/guards/roles.guard.ts` | 已存在 | 角色守卫已生效 |
| `backend/test/admin-route-permissions.spec.ts` | 已实现 | 包含字段管理权限测试 |

**数据库表/迁移**：无新增，复用现有 `field_configs`、`field_permissions` 表。

**接口契约**：
- `GET /admin/fields` - 仅 admin 200，非 admin 403
- `POST /admin/fields` - 仅 admin 可创建
- `PUT /admin/fields/:id` - 仅 admin 可更新
- `GET /admin/field-permissions/matrix` - 仅 admin 200
- `POST /admin/field-permissions/batch` - 仅 admin 可批量授权

#### 前端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `frontend/src/layouts/BasicLayout.tsx` | 已实现 | 字段管理菜单仅 admin 可见 |
| `frontend/src/routes/index.tsx` | 已实现 | `/admin/fields`、`/admin/field-permissions` 路由 guard |
| `frontend/src/pages/Admin/Fields/index.tsx` | 已实现 | 字段配置页面 |
| `frontend/src/pages/Admin/FieldPermissions/index.tsx` | 已实现 | 字段权限矩阵页面 |

### 1.2 与 26 问题/6 流程/5 BUG 的交叉引用

| 关联项 | 影响 | 回归测试要求 |
|---|---|---|
| **P4.3** 字段管理权限可授权非管理员 | 本轮改为"仅管理员"，验收标准变更 | 必须验证非 admin 菜单不可见、URL 直达 403、API 调用 403 |
| **Q20** 字段管理权限 | 直接对应 | P4-G18-01~04 全部 PASS |

**无需回归的项**：G-18 是独立的权限控制功能，不影响其他 25 个问题、6 类流程、5 个 BUG 的业务逻辑。

### 1.3 风险与回归矩阵

| 风险项 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 非 admin 绕过前端菜单直达 URL | 低 | 中 | 前端路由 guard + 后端 API guard 双重拦截 |
| admin 误删核心字段导致业务中断 | 中 | 高 | 审计日志 + 软删除机制 + 核心字段保护标记 |
| 字段权限矩阵修改后未生效 | 低 | 中 | 修改后清除权限缓存，前端刷新后重新获取 |

---

## 2. G-19 工单流程配置架构对照

### 2.1 代码影响面

#### 后端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `backend/src/modules/workflows/workflow.entity.ts` | 已实现 | WorkflowDefinition 实体 |
| `backend/src/modules/workflows/workflow.service.ts` | 已实现 | CRUD + 发布逻辑 |
| `backend/src/modules/workflows/workflow.controller.ts` | 已实现 | REST API 端点 |
| `backend/src/database/migrations/20260520003000-CreateWorkflowDefinitions.ts` | 已实现 | 数据库迁移 |
| `backend/test/workflow.service.spec.ts` | 已实现 | 单元测试 |
| `backend/test/admin-route-permissions.spec.ts` | 已实现 | 权限测试 |

**数据库表/迁移**：
- `workflow_definitions`：流程定义表（id, order_type, name, version, status, definition_json, published_at, created_by, created_at, updated_at）
- status 枚举：`draft`（草稿）、`published`（已发布）、`archived`（已归档）

**接口契约**：
- `GET /admin/workflows` - 列表查询，支持 orderType/status 筛选
- `POST /admin/workflows` - 创建草稿
- `GET /admin/workflows/:id` - 详情
- `PUT /admin/workflows/:id` - 更新（仅 draft 可更新）
- `POST /admin/workflows/:id/publish` - 发布（draft → published）
- `DELETE /admin/workflows/:id` - 删除（仅未发布的测试草稿）

**definition_json 结构**：
```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "label": "开始",
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "data_entry",
      "type": "dispatch",
      "label": "数据录入",
      "moduleCode": "data_entry",
      "assigneeRole": "data_entry_specialist",
      "slaHours": 24,
      "position": { "x": 300, "y": 100 }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "start",
      "target": "data_entry",
      "label": "提交"
    }
  ]
}
```

#### 前端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `frontend/src/pages/Admin/Workflows/index.tsx` | 已实现 | 流程列表页 |
| `frontend/src/pages/Admin/Workflows/Editor.tsx` | 已实现 | React Flow 可视化编辑器 |
| `frontend/src/services/workflows.ts` | 已实现 | API 调用封装 |
| `frontend/src/layouts/BasicLayout.tsx` | 已实现 | 工单流程配置菜单（仅 admin） |

### 2.2 与 26 问题/6 流程/5 BUG 的交叉引用

| 关联项 | 影响 | 回归测试要求 |
|---|---|---|
| **P4.2** 新增工单流程配置功能 | 直接对应 | P4-G19-01~04 全部 PASS |
| **Q19** 工单流程配置 | 直接对应 | 验收 CRUD/发布/新工单生效/可视化编辑器 |
| **R1~R6** 6 类工单流程 | 间接影响 | 发布新流程后，新建工单必须按配置生成子单/待办 |

**必须回归的项**：
- **R1**（常规办理）：新建工单后验证子单是否按流程配置生成
- **R3**（退回后修改重提）：重提后是否仍走原流程版本
- **R4**（编辑后重提）：编辑后重提是否触发流程重新调度

### 2.3 风险与回归矩阵

| 风险项 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 流程配置错误导致工单无法派发 | 中 | 高 | 发布前校验：节点连通性、必填字段、角色存在性 |
| 旧工单与新流程版本冲突 | 中 | 中 | 工单创建时记录 workflow_version，运行时按版本执行 |
| 可视化编辑器保存后节点位置丢失 | 低 | 低 | position 存入 definition_json，前端加载时恢复 |
| 非法连线（孤立节点/循环）未拦截 | 中 | 高 | 前端编辑器实时校验 + 后端发布时二次校验 |

---

## 3. G-20 导出模板 + 门户配置权限架构对照

### 3.1 代码影响面

#### 后端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `backend/src/modules/admin/export-templates/export-template.controller.ts` | 已实现 | 所有接口 `@Roles('admin')` |
| `backend/src/modules/admin/system-settings/system-settings.controller.ts` | 已实现 | 门户/系统配置接口 `@Roles('admin')` |
| `backend/test/admin-route-permissions.spec.ts` | 已实现 | 权限测试覆盖 |

**数据库表/迁移**：无新增，复用现有 `export_templates`、`system_settings` 表。

**接口契约**：
- `GET /admin/export-templates` - 仅 admin 200
- `POST /admin/export-templates` - 仅 admin 可创建
- `PUT /admin/export-templates/:id` - 仅 admin 可更新
- `GET /admin/system-settings/*` - 仅 admin 200
- `PUT /admin/system-settings/*` - 仅 admin 可修改

#### 前端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `frontend/src/layouts/BasicLayout.tsx` | 已实现 | 导出模板/系统设置菜单仅 admin 可见 |
| `frontend/src/routes/index.tsx` | 已实现 | `/admin/export-templates`、`/admin/system-settings` 路由 guard |
| `frontend/src/pages/Admin/ExportTemplates/index.tsx` | 已实现 | 导出模板配置页 |
| `frontend/src/pages/Admin/SystemSettings/index.tsx` | 已实现 | 系统设置/门户配置页 |

### 3.2 与 26 问题/6 流程/5 BUG 的交叉引用

| 关联项 | 影响 | 回归测试要求 |
|---|---|---|
| **Q08** 导出模板/门户配置仅 admin | 直接对应 | P4-G20-01~04 全部 PASS |
| **P4.4** 导出模板字段选择改为列表勾选 | 已在上一轮完成 | 本轮仅验证权限，不改 UI |

**无需回归的项**：G-20 是独立的权限控制功能，不影响其他业务逻辑。

### 3.3 风险与回归矩阵

| 风险项 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 非 admin 绕过前端直达配置页 | 低 | 中 | 前端路由 guard + 后端 API guard 双重拦截 |
| 导出模板配置错误导致导出失败 | 低 | 中 | 配置保存时校验字段存在性 + 导出时容错处理 |
| 门户配置修改后未生效 | 低 | 低 | 配置修改后清除缓存，前端刷新后重新获取 |

---

## 4. G-21 编辑后必须重新提交架构对照

### 4.1 代码影响面

#### 后端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `backend/src/modules/work-orders/work-order.service.ts` | 已实现 | update 方法触发 resubmit 逻辑 |
| `backend/src/modules/work-orders/work-order.controller.ts` | 已实现 | PUT /work-orders/:id 接口 |
| `backend/src/modules/notifications/notification.service.ts` | 已实现 | 编辑后通知模板 |
| `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | 已实现 | 子单重置/重新派发逻辑 |

**数据库表/迁移**：无新增表，复用现有 `work_orders`、`dispatched_orders`、`notifications` 表。

**接口契约**：
- `PUT /work-orders/:id` - 业务员编辑工单
  - 编辑后自动触发 resubmit 流程
  - status 回退到 `pending`
  - 原审批链/待办重置
  - 通知后道：`order.field_changed` 或 `order.resubmitted`

**业务逻辑**：
1. 业务员在 `processing` 状态编辑工单关键字段
2. 保存时自动调用 `resubmit()` 方法
3. 主工单 status → `pending`
4. 子工单按规则重置：
   - 未开始的子单：保持 `pending`
   - 进行中的子单：回退到 `pending` 或标记为 `outdated`
   - 已完成的子单：保持 `completed`（或根据产品决策是否重置）
5. 重新触发 dispatch 调度
6. 通知所有相关后道办理人员

#### 前端文件清单

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| `frontend/src/pages/WorkOrders/Detail/index.tsx` | 已实现 | 编辑保存时 UI 提示 + 确认弹窗 |
| `frontend/src/services/workOrders.ts` | 已实现 | updateWorkOrder API 调用 |

**UI 交互**：
1. 编辑按钮文案：`processing` 状态显示"编辑（将重新提交）"
2. 保存前弹窗确认：
   ```
   编辑后将自动重新提交工单，原审批进度将重置。
   后道办理人员将收到通知。
   确认保存？
   ```
3. 保存成功后提示："工单已保存并重新提交，等待重新派发"

### 4.2 与 26 问题/6 流程/5 BUG 的交叉引用

| 关联项 | 影响 | 回归测试要求 |
|---|---|---|
| **R4** 情况 4：办理中编辑→重新提交→消息提醒后道 | 直接对应 | P4-G21-01~03 全部 PASS |
| **F04** 工单流程测试用例 | 直接对应 | 验证编辑后状态/审批链/通知 |
| **R1** 常规办理 | 间接影响 | 编辑重提后能否正常继续办理 |
| **R3** 退回后修改重提 | 间接影响 | 区分"退回后重提"与"处理中编辑重提" |

**必须回归的项**：
- **R1**：编辑重提后，后道能否正常接收并办理
- **R3**：`returned` 状态的重提与 `processing` 状态的编辑重提是否逻辑一致
- **R4**：完整验证编辑→重提→通知→重新派发→办理的闭环
- **B2-a**：编辑重提后仪表盘是否更新
- **B3**：编辑重提通知是否计入消息数量且列表可查

### 4.3 风险与回归矩阵

| 风险项 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 编辑后子单重置逻辑错误，已完成子单被误重置 | 中 | 高 | 明确重置规则：仅重置未完成子单，已完成子单保持 |
| 编辑后未通知后道，后道继续按旧数据办理 | 中 | 高 | 强制发送 `order.field_changed` 通知，前端高亮变更字段 |
| 频繁编辑导致后道待办反复重置，用户体验差 | 中 | 中 | UI 明确提示"编辑将重置审批"，引导用户谨慎编辑 |
| 编辑后 status 回退但前端仍显示旧状态 | 低 | 中 | 保存成功后强制刷新详情页，重新获取最新状态 |

---

## 5. 最终审计执行计划

### 5.1 验收顺序（关键路径）

按依赖关系和风险优先级，建议执行顺序：

#### 阶段一：权限控制验收（1-2 天）

**目标**：确保非管理员无法越权访问配置功能

1. **G-18 字段管理权限**（P4-G18-01~04）
   - admin 可访问字段配置/字段权限
   - 非 admin 菜单不可见、URL 直达 403、API 调用 403
   - 验收标准：4 条用例全部 PASS

2. **G-20 导出模板 + 门户配置权限**（P4-G20-01~04）
   - admin 可访问导出模板/系统设置
   - 非 admin 菜单不可见、URL 直达 403、API 调用 403
   - 验收标准：4 条用例全部 PASS

**阶段一产出**：权限验收报告，确认无越权漏洞

#### 阶段二：工单流程配置验收（2-3 天）

**目标**：确保流程配置功能完整可用

3. **G-19 工单流程配置后端**（P4-G19-01~02）
   - 流程定义 CRUD：创建草稿、列表查询、详情、更新、删除
   - 版本发布：draft → published，非法配置拦截
   - 验收标准：CRUD 全部符合状态码与响应，非 admin 403

4. **G-19 工单流程配置前端编辑器**（P4-G19-04）
   - 可视化编辑器：拖拽节点、连线、修改属性
   - 保存后刷新不丢失
   - 非法连线/孤立节点有提示
   - 验收标准：截图 + GET 证明前端画布与后端 definition_json 一致

5. **G-19 新建工单实际走配置**（P4-G19-03）
   - 发布流程后，业务员新建工单
   - 验证子单/待办按配置生成
   - 节点顺序、模块、办理角色、SLA 符合配置
   - 验收标准：新工单按已发布流程生成，配置错误时阻止提交

**阶段二产出**：流程配置验收报告，确认 CRUD/发布/生效/编辑器全部可用

#### 阶段三：编辑重提流程验收（2-3 天）

**目标**：确保编辑后强制重新提交，审批链重置，通知后道

6. **G-21 编辑后状态强制重提**（P4-G21-01）
   - 业务员在 `processing` 状态编辑关键字段
   - 保存后 status → `pending`
   - 时间线有 `salesperson_modify_resubmit` 记录
   - 验收标准：状态、审计日志、通知三者均体现重新提交

7. **G-21 审批链/待办重置**（P4-G21-02）
   - 编辑前记录子单 id/status/handler
   - 编辑重提后，子单按规则重置或重新派发
   - 后道收到 `dispatch_resubmit` 或 `order.field_changed` 通知
   - 验收标准：待办不是旧字段快照，处理人收到通知

8. **G-21 UI 提示与确认**（P4-G21-03）
   - 编辑按钮文案："编辑（将重新提交）"
   - 保存前弹窗确认："编辑后将自动重新提交工单，原审批进度将重置"
   - 取消不修改数据
   - 验收标准：截图证明提示完整，取消后 GET 详情无变化

**阶段三产出**：编辑重提验收报告，确认状态/审批链/通知/UI 全部符合预期

#### 阶段四：全量回归测试（3-5 天）

**目标**：确保 G-18/G-19/G-20/G-21 不影响已修复的 24 个问题和 6 类流程

9. **26 个反馈问题全量回归**（P4-Q01~Q26）
   - 重点：Q19（工单流程配置）、Q20（字段管理权限）、Q08（导出模板/门户配置权限）
   - 其他 23 个问题快速回归，确认无退化
   - 验收标准：26 个问题全部 PASS，无 FAIL

10. **6 类工单流程回归**（P4-R1~R6）
    - 重点：R4（编辑后重提）
    - R1/R3/R5 验证编辑重提不影响常规流程
    - 验收标准：6 类流程全部 PASS

11. **5 个 BUG 回归**（P4-B1~B5）
    - 验证历史 BUG 未复现
    - 验收标准：5 个 BUG 全部 PASS

**阶段四产出**：全量回归测试报告，确认无退化、无遗漏

### 5.2 必检清单：26 个问题 + 6 类流程 + 5 个 BUG

#### 26 个反馈问题清单

| 编号 | 问题描述 | 上一轮状态 | 本轮验收要求 | PASS 标准 |
|---|---|---|---|---|
| P1.1 | 仪表盘左下角姓名直显 | PASS | 快速回归 | 截图中可直接看到当前登录人姓名 |
| P1.2 | 仪表盘 4 卡片按角色取数 + 我的消息排除正常派单 | PASS | 快速回归 | 页面数字与接口一致，卡片标题正确 |
| P1.3 | 取消周期选择器 + 业务负责人按模块趋势图 | PASS | 快速回归 | 无周期切换控件，默认当月 |
| P1.4 | 仪表盘总表按子工单/办理事项口径 | PASS | 快速回归 | module 维度行包含 data_entry/social_insurance/contact/contract 等 |
| P2.1 | 非管理员菜单按角色重排 | PASS | 快速回归 | 截图逐角色满足权限矩阵 |
| P2.2 | "我的工单"四子菜单 | PASS | 快速回归 | 数据集合区分，pending/done 不混用 |
| P2.3 | "主工单列表"与"新建入职"合并 | PASS | 快速回归 | 列表页统一新建入口 |
| P3.1 | 批导入字段映射机制 | PASS | 快速回归 | 标准免映射；AI/规则映射可确认 |
| P3.2 | 删除 social_urge 字段 | PASS | 快速回归 | 运行态 UI 与导入导出均不可见 |
| P3.3 | 搜索栏 5 字段 | PASS | 快速回归 | 单条件/组合/重置准确 |
| P3.4 | 删除列配置/看板/网格 | PASS | 快速回归 | 默认表格，无看板/网格/列配置等冗余入口 |
| P3.5 | 列表操作按钮权限 | PASS | 快速回归 | 按钮与后端权限一致，非本人不可越权 |
| P3.6 | 详情页操作按钮 + 删除工单动态/进度/流转链 | PASS | 快速回归 | 截图证明详情页不再展示旧冗余区块 |
| P3.7 | 详情页搜索筛选栏调整 | PASS | 快速回归 | 6 字段齐全且准确 |
| P4.1 | 入职单条录入表单分组栅格排版 | PASS | 快速回归 | 表单字段不混排，提交不受布局影响 |
| **P4.2** | **新增工单流程配置功能** | **NOT_VERIFIED** | **重点验收** | **P4-G19-01~04 全 PASS** |
| **P4.3** | **字段管理权限仅 admin** | **NOT_VERIFIED** | **重点验收** | **P4-G18-01~04 全 PASS** |
| P4.4 | 导出模板字段选择改为列表勾选 | PASS | 快速回归 | 重新打开字段选择不丢失 |
| B1 | 必填字段未维护仍可导入 | PASS | 快速回归 | 缺必填仍导入成功即 FAIL |
| B2-a | 业务员导入后仪表盘未更新 | PASS | 快速回归 | 卡片更新 |
| B2-b | 子工单显示"未派发" | PASS | 快速回归 | 子工单不是未派发 |
| B2-c | "共享团队视角"误显示 | PASS | 快速回归 | 业务员不显示共享团队视角 |
| B3 | 消息显示数量但点击无记录 | PASS | 快速回归 | 数量、列表 total、未读归零一致 |
| B4 | MyDispatched 个人待办无批量办理按钮 | PASS | 快速回归 | 按钮可见；remark 必填；≤50 成功 |
| B5 | 共享负责人模块筛选失效 | PASS | 快速回归 | 授权模块可查；无权模块不泄露 |
| **Q08** | **导出模板/门户配置仅 admin** | **新增** | **重点验收** | **P4-G20-01~04 全 PASS** |

#### 6 类工单流程清单

| 编号 | 流程描述 | 上一轮状态 | 本轮验收要求 | PASS 标准 |
|---|---|---|---|---|
| R1 | 常规办理（发起→后道→完成） | PASS | 验证编辑重提后能否正常办理 | 主流程闭环，无卡死待办 |
| R2 | 后道退回→业务员作废 | PASS | 快速回归 | 主单 void；待办取消；双方有通知 |
| R3 | 后道退回→业务员修改→重新提交 | PASS | 验证与 R4 的区别 | 修改内容同步；流程回到正确后道节点 |
| **R4** | **办理中编辑→重新提交→消息提醒后道** | **PARTIAL_PASS** | **重点验收** | **P4-G21-01~03 全 PASS** |
| R5 | 申请撤回/作废→后道审批 | PASS | 快速回归 | 状态与审批结果一致 |
| R6 | 终态不可操作 | PASS | 快速回归 | 任一终态可变更即 FAIL |

#### 5 个 BUG 清单

| 编号 | BUG 描述 | 上一轮状态 | 本轮验收要求 | PASS 标准 |
|---|---|---|---|---|
| B1 | 必填缺失仍导入 | PASS | 快速回归 | 失败明细含行号、字段、原因 |
| B2 | 导入后仪表盘/派发/共享视角 | PASS | 快速回归 | 任一问题复现即 FAIL |
| B3 | 消息有数量无列表 | PASS | 快速回归 | count/list 同源一致 |
| B4 | 后道批量办理缺失 | PASS | 快速回归 | 完成后状态和列表同步 |
| B5 | 共享负责人模块筛选无结果 | PASS | 快速回归 | 中文筛选失效即 FAIL |

---

## 6. 接口契约一致性检查

### 6.1 后端与前端接口对齐

| 功能 | 后端接口 | 前端调用 | 状态 | 备注 |
|---|---|---|---|---|
| 字段管理列表 | `GET /admin/fields` | `frontend/src/services/fields.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 字段权限矩阵 | `GET /admin/field-permissions/matrix` | `frontend/src/services/fieldPermissions.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 流程定义 CRUD | `GET/POST/PUT/DELETE /admin/workflows` | `frontend/src/services/workflows.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 流程发布 | `POST /admin/workflows/:id/publish` | `frontend/src/services/workflows.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 导出模板 CRUD | `GET/POST/PUT /admin/export-templates` | `frontend/src/services/exportTemplates.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 系统设置 | `GET/PUT /admin/system-settings/*` | `frontend/src/services/systemSettings.ts` | ✅ 已对齐 | 仅 admin 可访问 |
| 工单编辑 | `PUT /work-orders/:id` | `frontend/src/services/workOrders.ts` | ✅ 已对齐 | 编辑后自动重提 |

### 6.2 数据库迁移检查清单

| 迁移文件 | 表/字段 | 状态 | 备注 |
|---|---|---|---|
| `20260520003000-CreateWorkflowDefinitions.ts` | `workflow_definitions` | ✅ 已创建 | 包含 id, order_type, name, version, status, definition_json, published_at, created_by, created_at, updated_at |

**迁移执行前检查**：
1. 备份生产数据库
2. 在测试环境先执行迁移
3. 验证表结构和索引
4. 确认无数据丢失

---

## 7. 同步指导 Backend / Frontend

### 7.1 给后端工程师的指导

**G-18 字段管理权限**：
- ✅ 已实现：所有写接口 `@Roles('admin')`
- ⚠️ 注意：确认 `roles.guard.ts` 正确拦截非 admin 请求
- 📋 测试：运行 `backend/test/admin-route-permissions.spec.ts`

**G-19 工单流程配置**：
- ✅ 已实现：CRUD + 发布逻辑
- ⚠️ 注意：发布前校验 definition_json 的节点连通性
- 📋 测试：运行 `backend/test/workflow.service.spec.ts`
- 🔍 验证：新建工单后检查是否按已发布流程生成子单

**G-20 导出模板 + 门户配置权限**：
- ✅ 已实现：所有接口 `@Roles('admin')`
- ⚠️ 注意：确认无遗漏的配置接口
- 📋 测试：运行 `backend/test/admin-route-permissions.spec.ts`

**G-21 编辑后必须重新提交**：
- ✅ 已实现：update 方法触发 resubmit
- ⚠️ 注意：确认子单重置逻辑正确（未完成子单重置，已完成子单保持）
- 📋 测试：手动测试编辑→保存→验证 status/子单/通知
- 🔍 验证：时间线是否有 `salesperson_modify_resubmit` 记录

### 7.2 给前端工程师的指导

**G-18 字段管理权限**：
- ✅ 已实现：菜单仅 admin 可见，路由 guard
- ⚠️ 注意：确认所有字段管理相关页面都有路由 guard
- 📋 测试：非 admin 账号登录，验证菜单不可见、URL 直达被拦截

**G-19 工单流程配置**：
- ✅ 已实现：React Flow 可视化编辑器
- ⚠️ 注意：保存时确保 position 存入 definition_json
- 📋 测试：拖拽节点→保存→刷新→验证节点位置不丢失
- 🔍 验证：非法连线（孤立节点/循环）是否有实时提示

**G-20 导出模板 + 门户配置权限**：
- ✅ 已实现：菜单仅 admin 可见，路由 guard
- ⚠️ 注意：确认所有配置页面都有路由 guard
- 📋 测试：非 admin 账号登录，验证菜单不可见、URL 直达被拦截

**G-21 编辑后必须重新提交**：
- ✅ 已实现：编辑保存时 UI 提示 + 确认弹窗
- ⚠️ 注意：确认弹窗文案清晰，用户理解"编辑将重置审批"
- 📋 测试：编辑→保存→验证弹窗显示→确认→验证详情页刷新
- 🔍 验证：取消保存后，GET 详情验证数据未变化

### 7.3 接口契约不一致或方案文档缺失的问题

**经过检查，未发现接口契约不一致或方案文档缺失的问题。**

所有 G-18/G-19/G-20/G-21 的后端接口与前端调用已对齐，数据库迁移已就绪。

---

## 8. 风险总览与缓解措施

### 8.1 高风险项（P0，必须在验收前解决）

| 风险项 | 影响范围 | 缓解措施 | 责任人 |
|---|---|---|---|
| 流程配置错误导致工单无法派发 | G-19 | 发布前校验：节点连通性、必填字段、角色存在性 | 后端工程师 |
| 编辑后子单重置逻辑错误，已完成子单被误重置 | G-21 | 明确重置规则：仅重置未完成子单，已完成子单保持 | 后端工程师 |
| 编辑后未通知后道，后道继续按旧数据办理 | G-21 | 强制发送 `order.field_changed` 通知，前端高亮变更字段 | 后端 + 前端 |

### 8.2 中风险项（P1，验收时重点关注）

| 风险项 | 影响范围 | 缓解措施 | 责任人 |
|---|---|---|---|
| 非 admin 绕过前端菜单直达 URL | G-18/G-20 | 前端路由 guard + 后端 API guard 双重拦截 | 前端 + 后端 |
| 旧工单与新流程版本冲突 | G-19 | 工单创建时记录 workflow_version，运行时按版本执行 | 后端工程师 |
| 频繁编辑导致后道待办反复重置，用户体验差 | G-21 | UI 明确提示"编辑将重置审批"，引导用户谨慎编辑 | 前端工程师 |

### 8.3 低风险项（P2，可接受）

| 风险项 | 影响范围 | 缓解措施 | 责任人 |
|---|---|---|---|
| 可视化编辑器保存后节点位置丢失 | G-19 | position 存入 definition_json，前端加载时恢复 | 前端工程师 |
| 导出模板配置错误导致导出失败 | G-20 | 配置保存时校验字段存在性 + 导出时容错处理 | 后端工程师 |
| 编辑后 status 回退但前端仍显示旧状态 | G-21 | 保存成功后强制刷新详情页，重新获取最新状态 | 前端工程师 |

---

## 9. 下一步建议

### 9.1 立即执行（本周内）

1. **后端工程师**：
   - 运行 `backend/test/admin-route-permissions.spec.ts` 和 `backend/test/workflow.service.spec.ts`
   - 手动测试 G-21 编辑重提流程：编辑→保存→验证 status/子单/通知
   - 确认数据库迁移 `20260520003000-CreateWorkflowDefinitions.ts` 可在测试环境执行

2. **前端工程师**：
   - 非 admin 账号登录，验证 G-18/G-20 菜单不可见、URL 直达被拦截
   - 测试 G-19 可视化编辑器：拖拽节点→保存→刷新→验证节点位置不丢失
   - 测试 G-21 编辑保存：验证弹窗显示→确认→验证详情页刷新

3. **测试工程师**：
   - 准备测试账号：admin、业务员、非 admin、后道主管、后道办理人员
   - 准备测试数据：R4 专用 processing 工单（至少 1 个子单未完成）
   - 准备流程配置测试 JSON：start、data_entry、contract、end 节点及 edges

### 9.2 验收执行（下周）

按 §5.1 验收顺序执行：
1. 阶段一：权限控制验收（G-18/G-20）
2. 阶段二：工单流程配置验收（G-19）
3. 阶段三：编辑重提流程验收（G-21）
4. 阶段四：全量回归测试（26 问题 + 6 流程 + 5 BUG）

### 9.3 验收完成后

1. 生成最终验收报告：`docs/FINAL_VERIFICATION_REPORT_P4_0520.md`
2. 汇总 PASS/FAIL 统计
3. 任何 FAIL 项必须回填：账号、用例 ID、请求、响应、截图、关联任务编号
4. 通知 Leader：所有测试完成，可进入生产部署准备

---

## 10. 总结

### 10.1 本轮架构对照结论

- **G-18 字段管理权限**：后端 guard + 前端菜单/路由 guard 已实现，仅 admin 可访问
- **G-19 工单流程配置**：后端 CRUD + 前端 React Flow 编辑器已实现，需验收完整流程
- **G-20 导出模板 + 门户配置权限**：后端 guard + 前端菜单/路由 guard 已实现，仅 admin 可访问
- **G-21 编辑后必须重新提交**：后端 resubmit 逻辑 + 前端 UI 提示已实现，需验收状态/审批链/通知

### 10.2 关键发现

1. **用户口径变化**：G-18 从"可授权非管理员"改为"仅管理员"，验收标准已调整
2. **接口契约一致**：所有后端接口与前端调用已对齐，无不一致或缺失
3. **数据库迁移就绪**：`workflow_definitions` 表迁移已创建，可在测试环境执行
4. **风险可控**：3 个高风险项已明确缓解措施，验收时重点关注

### 10.3 验收成功标准

- G-18/G-19/G-20/G-21 共 15 条用例（4+4+4+3）全部 PASS
- 26 个反馈问题全部 PASS（重点 P4.2/P4.3/Q08）
- 6 类工单流程全部 PASS（重点 R4）
- 5 个 BUG 全部 PASS
- **总计 52 条用例，FAIL 项 = 0，阻断项 = 0**

---

**文档版本**：v1.0  
**编制日期**：2026-05-20  
**编制人**：架构师  
**审核**：待 Leader / QA / Backend / Frontend 确认  
**下次更新**：验收执行完成后
