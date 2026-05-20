# 项目交接文档（原样结构化整理 | 截至2026-05-19 最终代码/架构/待办）
本文档为新会话上下文交接专用，记录截至2026-05-19 的项目最终代码状态、核心架构决策、避坑要点与下一步任务。新会话开始任何开发前应先通读全文。

## 1. 系统技术栈与当前核心架构
### 1.1 技术栈
| 层级 | 技术选型 |
|------|----------|
| 后端 | NestJS + TypeORM + PostgreSQL（库名 ticket_system） |
| 前端 | React + Vite + TypeScript + Ant Design Pro（含 ProComponents） |
| LLM 集成 | OpenAI 兼容协议；默认 DeepSeek deepseek-v4-flash，baseUrl https://api.deepseek.com；本地 fuzzy match（FIELD_ALIASES + Jaccard+Levenshtein） |
| 鉴权 | JWT，admin / biz_member / handler 角色 |

### 1.2 工单领域核心架构
入职"一拆四"——「2 个固定 + 2 个条件」：
- data_entry（数据录入）：必生成
- social_insurance（社保公积金）：必生成
- onboarding_contact（入职联系）：仅当 extraData.need_onboarding_contact ∈ YES_TOKENS 才生成
- contract（劳动合同）：仅当 extraData.need_company_contract ∈ YES_TOKENS 才生成

YES_TOKENS 安全网（onboarding-dispatch.helper.ts:33 + dispatch-engine.service.ts:227 isTruthyYes）：
['是', '需要', '需', '生成', 'yes', 'y', 'true', '1', 'YES', 'Y']
用户即使乱填 "yes"/"1"/"需要" 都能识别为是，是配套"枚举放宽"决策的兜底设计。

派发链路（resolveModuleHandler）：
1. 优先查 exception_module_handlers（moduleCode + customerCode）→ 命中直接返回
2. 查 module_handlers 主负责人（is_active=true, is_backup=false, weight DESC）
3. 查 module_handlers 备选（is_backup=true, weight DESC）
4. 仍无 → handler_id = null（人工兜底）

## 2. 重大重构与代码尸体清理（避坑指南）
### 2.1 已物理删除 / 废弃
| 项目 | 状态 | 替代 |
|------|------|------|
| 旧 import/ 目录代码 | 🗑️ 物理删除 | backend/src/modules/imports/ 新版 |
| roleAlias.ts | ⛔ 废弃，不再使用 | frontend/src/constants/roles.ts 角色常量 |
| 前端 USER_NAMES 假表（24 项） | 🗑️ 物理删除 | 真实 users 接口动态拉取 |
| 五个隐藏路由（dispatch-rules、module-handlers 独立页） | 🗑️ 物理删除 | /admin/dispatch-config 合并页 |
| normalizeEnumAlias 调用 | ⛔ 废弃 | 不归一化，Excel 原文入库 |
| applySafeDefaults 实现 | ⛔ 空函数 | 软必填留空 + warning，不再自动填默认值 |
| SOFT_REQUIRED_SAFE_DEFAULTS | ⛔ 空对象 | 同上 |
| cleanup-*.sql 旧脚本 | 保留备用 | 推荐用 npm run db:clean-orders |
| frontend DispatchRules、ModuleHandlers 独立菜单 | 🗑️ 物理删除 | 合并入 DispatchConfig |
| frontend mock 客户/字段假表 | 🗑️ 物理删除 | 真实接口 + 真实 seed |

### 2.2 启用项
| 项目 | 路径/说明 |
|------|-----------|
| 角色常量统一 | frontend/src/constants/roles.ts（含 WORK_ORDER_CREATOR_ROLES、HANDLER_ROLES 等） |
| 新版导入路由 | /api/work-orders/import/preview → /confirm → /import/:jobId 任务轮询 |
| 派发配置合并接口 | GET /api/admin/dispatch-config（聚合 module_handlers + dispatch_rules + 自动 join 用户/客户名） |
| 一键清理命令 | npm run db:clean-orders -- --confirm（事务包装 + production 拒绝） |
| 例外派发表 | exception_module_handlers（已建表 + Admin CRUD /admin/exception-module-handlers） |
| AI 字段匹配优化 | 先 localMatch(0.85) 高门槛，全命中则零 LLM 调用；未命中才传 unmatched headers 给 LLM；保留 AI_FORCE_LLM=true 诊断开关 |

### 2.3 避坑要点
1. NestJS 路由顺序：静态路由（如 batch-delete）必须装在动态路由（如 :id）之前，否则会被 :id 吞掉返 404。已经在 dispatched-order.controller.ts:49 和 work-order.controller.ts:37 做过此修复。
2. 后端 list 返回字段：work-order.service 返回 {items, total, page, pageSize}；前端 service 必须用 normalizePageResult 兼容 items / list / data，否则页面空白。
3. 重启后端才生效：AUTO_SEED=true 重启会复活已删除的 seed 数据；想"彻底删"必须同步改 seed 文件。
4. DTO whitelist：所有 admin DTO 都启用了 forbidNonWhitelisted: true，新增字段必须同步加 DTO 否则被拒。

## 3. 最新加入的业务逻辑：例外派发拦截
### 3.1 核心表 exception_module_handlers
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| moduleCode | enum | 模块枚举（data_entry / social_insurance / onboarding_contact / contract） |
| customerCode | varchar | 客户代码（业务键，非 UUID） |
| handlerId | uuid | 例外处理人 user_id |
| createdAt / updatedAt | timestamptz | 审计 |

唯一约束：(moduleCode, customerCode)

### 3.2 派发优先级
resolveModuleHandler(moduleCode, manager, customerCode) 在 backend/src/modules/work-orders/onboarding-dispatch.helper.ts:49-61 已改造：
顶部先查：
SELECT handler_id FROM exception_module_handlers
WHERE module_code = ? AND customer_code = ?
命中 → 直接 return 该 handler_id（VIP 通道）
未命中 → 走原 module_handlers 主负责人 → 备选 → null

### 3.3 customerCode 来源兼容（按优先级）
1. workOrder.customerCode
2. extraData.customer_code
3. extraData.customerCode
4. extraData.client_code
5. extraData.clientCode

### 3.4 Admin 维护界面
- 路由：/admin/dispatch-config 第三 Tab「客户例外派发」
- 接口：/api/admin/exception-module-handlers (GET/POST/PATCH/DELETE)
- 支持多客户批量录入：前端 tags 多选 + 后端逐条 UPSERT

## 4. 当前已知的数据库与校验状态
### 4.1 身份证当月查重（DUPLICATE_ID_CARD_IN_MONTH）
规则：同一身份证号（employee_id_card）在同一自然月内（按 created_at 的 year/month）只允许 1 张有效入职单（status ≠ withdrawn）。

实现 4 层兜底：
| 层级 | 文件位置 | 行为 |
|------|----------|------|
| 应用层 | createDraft 前查 work-order.service.ts:90-96 | 命中 → HTTP 409 / businessCode 4120 |
| 应用层 | createDraft save 后回收 work-order.service.ts:121-124 | DB 唯一索引 23505 → 翻译同样 4120 |
| 应用层 | update 时查 work-order.service.ts:172-191 | 修改身份证号触发 |
| 应用层 | submit 时查 work-order.service.ts:240-248 | 二次保险 |
| DB 兜底 | 1715900000000-StageABackend.ts:78-88 | uq_work_orders_idcard_month 部分唯一索引，WHERE order_type='onboarding' AND status NOT IN ('withdrawn') |

导入路径错误码翻译：import-job.service.ts:495-503 把 4120 翻译为 failRow.code = 'DUPLICATE_ID_CARD_IN_MONTH'，前端展示「同月身份证重复」+「冲突工单：ON202605xxxx」。

### 4.2 字段校验现状（已"宽进严出"放开）
- 硬必填 STRICT_REQUIRED_FIELD_CODES（4 个）：employee_name、id_card_no、customer_name、customer_code —— 缺值仍 error 拦截
- 软必填（57 个）：缺值改为 warning code='left_blank'，normalizedValue=null，行仍可落库
- 去掉的归一化：
  - household_type "城镇户口" → "非农业"（不再做）
  - social_urge 空值 → "否"（不再做）
  - contract_template 空值 → "待补充"（不再做）
- submit 阶段：work-order-validation.service.ts 已去掉 dropdownOptions hard fail，保留 regex 校验

### 4.3 客户自动创建
work-order-import.service.ts 在导入写入阶段，若 customerId 不存在但 extraData 含 customer_code + customer_name，自动 INSERT INTO customers ... ON CONFLICT(customer_code) DO UPDATE RETURNING id，避免"客户信息缺失"拦截。

## 5. 当前残留的紧急待办事项（Next Steps）
状态说明：任务 A 和任务 B 在本窗口实际上已交付，但建议新会话快速验证一次是否到位。任务 C 是真正未启动的工作。

### 任务A：一键清空测试工单命令 — ✅ 已交付（待验证）
- 状态：已交付
- 命令：cd backend && npm run db:clean-orders -- --confirm
- 行为：事务清空 import_jobs / notifications / operation_logs / field_supplement_logs / dispatched_order_return_records / work_order_field_dirty_marks / order_attachments / order_stages / dispatched_orders / work_orders；保留底数据（customers / departments / users / field_configs / module_handlers / dispatch_rules / exception_module_handlers 等）。
- 护栏：
  1. 未带 --confirm 直接退出并打印用法
  2. NODE_ENV=production 直接拒绝
- 实测：上次清理删除 2262 行
- 代码：backend/scripts/clean-orders.ts + backend/package.json scripts

新会话验证步骤：
cd backend
npm run db:clean-orders             # 应报错退出
npm run db:clean-orders -- --confirm # 应事务清理

### 任务 B：枚举字段改字符串、Excel 原文入库 — ✅ 已交付（待验证）
- 状态：已交付
- 后端：field-validation.service.ts 已去 normalizeEnumAlias、applySafeDefaults、SOFT_REQUIRED_SAFE_DEFAULTS；work-order-validation.service.ts 已去 dropdownOptions hard fail
- 前端：DynamicForm/index.tsx:204-212 dropdown 改 ProFormSelect mode='tags' maxCount=1 tokenSeparators，允许用户在原 dropdown UI 上手动输入任意字符串
- 效果：Excel 填 "城镇户口"、"yes"、"自定义值" 全部原样入库到 work_orders.extra_data JSONB
- 未做的：DB 层 field_configs.dropdown_options 字段值未清空（不影响实际兼容，因为校验已不查它）

新会话验证步骤：
1. 导入一行 household_type='城镇户口'
2. SELECT extra_data->>'household_type' FROM work_orders 应返回 '城镇户口' 原文（不是 '非农业'）
3. 在工单详情页该字段下拉框中手动输入"我自创的值"应能保存

### 任务 C：「千人千面」数据看板 Dashboard — 🚧 真正待办
- 状态：未启动
- 当前 Dashboard：frontend/src/services/dashboard.ts 仅做了字段归一化映射（兼容业务员 / 团队 / 管理三类返回），后端接口 current / counts / modules / ratios / trend 已存在
- 缺失内容：
  1. 角色个性化布局：不同角色（admin / 业务员 / 模块负责人 / 部门主管）看到不同卡片
  2. 千人千面数据源：当前数据按全局聚合，需要按 user_id 维度过滤（"我的待办"、"我的本月完成"、"我的客户"、"我负责的模块"）
  3. 图表丰富度：当前只有计数 + 趋势，需要补充：模块分布饼图、客户 TOP10、SLA 超期数、子单状态分布
  4. 配置入口：admin 可配置不同角色的卡片可见性（复用 field_permissions 模式？）
- 建议起点：
  1. 架构师先调研 WorkOrderDashboardService 现状（已有 / 缺什么）
  2. 设计角色 → 卡片矩阵（admin 看全局，handler 看个人，department leader 看部门）
  3. 前端用 GridCard 容器化，每个卡片独立 API
- 预估工作量：3-5 人日（后端 1-2 + 前端 2-3 + QA 0.5）

## 6. 关键文件路径速查
### 后端
- 导入校验：backend/src/modules/imports/field-validation.service.ts
- 导入任务：backend/src/modules/imports/import-job.service.ts
- 导入写库：backend/src/modules/imports/work-order-import.service.ts
- AI 字段映射：backend/src/modules/ai/ai-mapping.service.ts
- 工单服务：backend/src/modules/work-orders/work-order.service.ts
- 工单校验：backend/src/modules/work-orders/work-order-validation.service.ts
- 入职拆单：backend/src/modules/work-orders/onboarding-dispatch.helper.ts
- 子工单服务：backend/src/modules/dispatched-orders/dispatched-order.service.ts
- 派发配置接口：backend/src/modules/admin/dispatch-rules/dispatch-config.controller.ts
- 例外派发：backend/src/modules/admin/exception-module-handlers/
- 清理脚本：backend/scripts/clean-orders.ts

### 前端
- 主工单列表：frontend/src/pages/WorkOrders/index.tsx
- 工单详情：frontend/src/pages/WorkOrders/Detail/index.tsx
- 导入页：frontend/src/pages/WorkOrders/Import/index.tsx + frontend/src/components/ExcelUploader/index.tsx
- 我的待办：frontend/src/pages/MyDispatched/ + OnboardingModule/
- 部门子工单：frontend/src/pages/TeamDispatched/index.tsx
- 派发配置：frontend/src/pages/Admin/DispatchConfig/index.tsx
- 动态表单：frontend/src/components/DynamicForm/index.tsx
- 工单 service：frontend/src/services/workOrders.ts
- 子工单 service：frontend/src/services/dispatchedOrders.ts
- 角色常量：frontend/src/constants/roles.ts

### 文档与脚本
- 架构文档目录：docs/（含本窗口所有架构师交付报告，可作为决策依据）
- QA 验收报告：tests/QA-*.md
- 清理脚本：backend/scripts/clean-orders.ts 与 legacy cleanup-*.sql

## 7. 新会话开始的建议工作流
1. 先 cd backend && npm run db:clean-orders -- --confirm 清理一次测试数据，确保从干净状态开始
2. 验证任务 A、B 已交付状态（按上文第 5 节验证步骤）
3. 如确认 A、B 都 OK，直接启动任务 C（Dashboard 千人千面）
4. 新会话首要禁忌：
- 不要重新加 normalizeEnumAlias / safe_default（用户明确不要）
- 不要在 import 路径加任何"自作聪明"的归一化逻辑
- 不要修改 DUPLICATE_ID_CARD_IN_MONTH 业务规则（用户明确要保留）
- 不要破坏 batch-delete 路由顺序（必须装在 :id 之前）
- 不要在 service 直接 return raw response，必须经过 normalizePageResult

文档版本：2026-05-19 v1.0
适用范围：新会话上下文交接
生效条件：以上所有"已交付"项请新会话首次启动时按验证步骤复核一次