# 在职管理 + 省外派单 — 团队实施方案

> 本文档由 SpectrAI Plan 模式自动生成/维护。请以此文件作为后续执行或 Supervisor 编排的规划依据。

## 目标
待补充：请在 Plan 模式下发送任务目标，系统会自动更新此处。

## 规划正文
# 在职管理 + 省外派单 — 团队实施方案

## 一、背景与目标

### 为什么做这件事
- **业务需求**：浙江自签团队服务范围已覆盖在职管理（单项业务办理）和省外增减员，现有工单系统仅支持入职/续签/离职，需扩展新模块。
- **已达成共识**：方案定稿 `docs/在职管理与省外派单-方案定稿-20260726.md` 和配置表 `在职模块-工单系统配置表（派单+单项业务）.xlsx` 已业务确认，技术主张已与现有代码事实核验一致。
- **本期范围**：共用底座（派单引擎改造）+ 在职管理·单项业务办理 + 省外派单·增减员；续签/证明/工伤提醒、后台管理页延后。

### 预期成果
1. **底座可复用**：派单引擎支持多表映射（Sheet4单项业务、Sheet5省外派单），可扩展新模块无需重新实现匹配逻辑。
2. **在职模块可用**：完成三级分类树 + 往返状态机 + Sheet4省份映射 + 单项业务表单/列表/详情/派单/流转/消息通知。
3. **省外模块可启动**：完成业务切换器 + 增减员表单/导入/派单（暂缺字段清单，前端表单待业务提供菜鸟模板后再补齐）。
4. **回归安全**：现有入职/续签/离职不受影响，已有 assignee/fallback 字段保留但不破坏新逻辑。

### 已明确的约束
- **Sheet 编号已纠正**：单项业务映射是 Sheet4（定稿误写 Sheet3），省外派单映射是 Sheet5。
- **双人省份独立处理**：Sheet4 多人省份以配置表实扫为准（含"/"的行），Sheet5 双人省份基本只有福建；两表禁止混用。
- **省外字段清单前置阻塞**：业务侧未提供菜鸟模板/浙江自签现用模板，省外表单部分暂缓；先做切换器和数据隔离。
- **分支隔离已就位**：当前在 `feature/in-service-out-of-province`，master 冻结为明天部署候选，新代码不碰 master。

---

## 二、团队角色设计（4人+Leader）

基于任务复杂度（底座改造+两模块+高回归风险）和可用 Provider（claude-code/codex/opencode/deepseek），设计如下分工：

| 角色 | 职责 | RolePreset | providerId | 理由 |
|---|---|---|---|---|
| **Leader** | 总协调、任务分配、进度跟踪、最终质量把关 | 系统自动注入 | `claude-code` | 默认 Leader，全局视角 |
| **架构师** | 派单引擎改造方案、模块边界、接口契约、迁移风险 | `builtin-role-preset-architect` | `claude-code` | 复用 builtin，Claude Opus 适合架构权衡 |
| **后端工程师** | 实现底座改造、在职/省外后端逻辑、状态机、种子数据、权限 | `builtin-role-preset-backend-engineer` | `codex` | 复用 builtin，Codex 适合 NestJS 实现 |
| **前端工程师** | 切换器、在职/省外表单/列表/详情、枚举维护、路由解禁 | `builtin-role-preset-frontend-engineer` | `codex` | 复用 builtin，Codex 适合 React 实现 |
| **QA + 自动化测试** | 回归基线、在职/省外核心路径测试、与现有模块隔离验证 | `builtin-role-preset-automation-test-engineer` | `claude-code` | 复用 builtin，Claude 适合测试策略设计 |

**说明**：
- 不新增 UX/产品角色（方案已定，无需重新设计交互）。
- 不新增代码审查角色（团队规模4人，Leader兼审查）。
- **Reviewer Pool 配置**：4个 Worker，建议启用 `reviewerCount: "auto"`（系统自动按 ceil(4/3)=2 配置），让评审与开发解耦；不传 reviewerProvider/reviewerModel，评审自动跟随 Leader 的 Provider（`claude-code`）。

---

## 三、执行策略（3 阶段 + 回归）

### 阶段 1：底座改造（派单引擎）
**目标**：让派单引擎支持多表映射，不破坏现有入职/续签/离职逻辑。

**关键文件**（只读探索，实际改动由团队执行）：
- `backend/src/modules/dispatch-engine/services/dispatch-engine.service.ts` — `resolveModuleTeamHandler()` 添加 `IN_SERVICE`/`OUT_OF_PROVINCE` 分支
- `backend/src/modules/dispatch-engine/services/handler-picker.service.ts` — `pick()` 支持从 Sheet4/Sheet5 读取映射
- `backend/src/modules/dispatch-engine/constants/enums.ts` — 补充新模块的 `ModuleType` 和 `TeamRole`
- `backend/src/database/seeds/province-handler.seed.ts` — 新增 Sheet4/Sheet5 种子数据

**风险点**：
- assignee/fallback 是死字段（两引擎都不读），不删除但避免新逻辑误用。
- 状态机硬编码在 `dispatched-order.service.ts`(2900+行)，新模块状态机要加在同文件，保持现有风格避免破坏。

**验收**：
- 单测：新模块派单规则覆盖 Sheet4/Sheet5 正常派单、双人省份默认接单人。
- 集成测试：创建在职/省外工单能正确派单到对应专员。
- 回归：入职/续签/离职派单不受影响。

---

### 阶段 2：在职管理（单项业务办理）
**目标**：完成三级分类 + 往返状态机 + 表单/列表/详情/流转。

**关键文件**（只读探索，实际改动由团队执行）：
- `backend/src/common/constants/enums.ts` — 补充 `OrderType.IN_SERVICE`、三级分类枚举
- `backend/src/modules/work-orders/` — 新增在职工单 Entity/DTO/Service/Controller
- `backend/src/modules/dispatched-orders/` — 新增在职状态机（Sheet3）：`draft→dispatched→processing→pending_info→completed/archived`
- `backend/src/database/seeds/` — Sheet2业务类型树、Sheet4省份映射
- `frontend/src/pages/` — 解禁在职模块路由（当前在 `PHASE1_HIDDEN_ROUTES`）
- `frontend/src/components/work-orders/InServiceOrderForm.tsx` — 单项业务表单（Sheet1字段）
- `frontend/src/store/appStore.ts` — 移除 `businessScope` 字段（方案定稿明确不用）

**风险点**：
- 三级分类树结构需前后端一致，避免枚举不同步。
- 往返状态机 `pending_info` 可多次触发，与入职/离职不同，测试需覆盖。
- 是否字段下拉统一「是/否」（除 need_esign 用「1.是/2.否」）。

**验收**：
- 单测：三级分类枚举、状态机流转（含往返）、Sheet4 派单规则。
- E2E：创建单项业务工单→派单→补充资料→完成，覆盖正常+往返路径。
- 回归：入职/续签/离职不受影响。

---

### 阶段 3：省外派单（增减员）
**目标**：完成切换器 + 增减员导入/派单（表单待业务提供字段清单后补）。

**关键文件**（只读探索，实际改动由团队执行）：
- `backend/src/common/constants/enums.ts` — 补充 `OrderType.OUT_OF_PROVINCE_INCREASE`/`OUT_OF_PROVINCE_DECREASE`
- `backend/src/modules/work-orders/` — 新增省外增减员 Entity/DTO/Service/Controller，复用入职/离职状态机
- `backend/src/database/seeds/` — Sheet5 省份映射（省外非北仑）
- `frontend/src/components/business-scope-switcher/` — 北仑/省外切换器，关联 localStorage
- `frontend/src/pages/` — 解禁省外模块路由
- `frontend/src/components/work-orders/OutOfProvinceForm.tsx` — **暂缓**（等业务提供菜鸟模板字段清单）

**风险点**：
- Sheet5 双人省份基本只有福建1个，派单规则与 Sheet4 独立，禁止混用。
- 省外增减员字段清单未到手，前端表单部分前置阻塞；可先做导入、派单、列表，表单留 TODO。
- 切换器状态存 localStorage，刷新不丢失；但工单数据必须带 `businessScope` 字段隔离。

**验收**：
- 单测：Sheet5 派单规则、双人省份默认接单人、省外工单与北仑工单数据隔离。
- E2E（暂缓表单部分）：切换器生效 → 导入省外增减员 → 派单到对应专员。
- 回归：北仑工单不受影响。

---

### 阶段 4：全局回归
**目标**：确保新模块不破坏现有入职/续签/离职功能。

**验收清单**：
1. 入职/续签/离职工单创建、派单、流转、完成正常。
2. 已有角色菜单权限、后道人员分工不受影响。
3. 消息通知、数据看板、批量导入办理不受影响。
4. 跑根目录 `回归测试.ps1`（可加 `-SkipBuild`）全通过。

---

## 四、关键技术决策

| 决策点 | 方案 | 理由 |
|---|---|---|
| **派单引擎改造范围** | 最小侵入：只在 `resolveModuleTeamHandler()` 加分支，`pick()` 支持多表读取，不重构整个引擎 | 减少回归风险，避免动 2900 行状态机 |
| **状态机存放** | 加在 `dispatched-order.service.ts` 硬编码部分，不迁移到 WorkflowDefinition | 保持现有风格，WorkflowDefinition 不驱动流转（已核实） |
| **双人省份处理** | 排前=默认接单人，排后=转派备选；两表独立扫描 | 与现有逻辑一致，Sheet4/Sheet5 禁止混用 |
| **省外字段清单** | 前置阻塞：未到手前表单暂缓，先做切换器+导入+派单 | 不能用北仑模板顶（字段更少+特有「缴纳机构」） |
| **businessScope 字段** | 不引入到 appStore，只在工单数据上加 | 方案定稿明确不用，切换器只控制前端路由 |
| **在职模块解禁** | 从 `PHASE1_HIDDEN_ROUTES` 移除，修改 `IN_SERVICE_ROLES=[]` 为实际角色 | 当前骨架禁用，需解禁才能访问 |

---

## 五、验证计划

### 开发阶段自测
每个阶段完成后，负责角色自测：
1. **架构师**：画出模块边界图、接口契约文档，确认迁移风险点。
2. **后端工程师**：跑单测 + 集成测试，覆盖派单规则、状态机流转、权限。
3. **前端工程师**：本地 dev 跑通表单/列表/详情，覆盖切换器/路由/枚举。
4. **QA**：补充 E2E 测试，覆盖在职往返路径、省外切换器、双人省份派单。

### 集成验证
团队完成后，由 Leader 或 mission 主体执行：
1. 本地环境跑完整流程：创建在职工单 → 派单 → 补充资料 → 完成。
2. 本地环境跑完整流程：切换省外 → 导入增减员 → 派单 → 完成。
3. 回归：入职/续签/离职创建→派单→完成正常，已有角色权限不变。
4. 跑 `回归测试.ps1`（根目录）全通过。

### 部署前确认
- 种子数据 Sheet4/Sheet5 已同步到数据库。
- 在职/省外路由已解禁。
- 前端枚举与后端一致（三级分类、状态机节点）。
- 省外表单部分标记为 TODO，不影响导入/派单功能。

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 派单引擎改造破坏现有逻辑 | 入职/续签/离职派单失效 | 最小侵入，只加分支不改存量；单测+回归全覆盖 |
| 状态机硬编码在 2900 行文件 | 维护性差，易冲突 | 保持现有风格，不重构；新模块加在末尾，注释清晰 |
| 双人省份派单归属不明确 | 多人省份默认接单人错误 | 两表独立处理，排前=默认；配置表实扫为准 |
| 省外字段清单缺失 | 前端表单无法实现 | 前置阻塞，暂缓表单；先做切换器+导入+派单 |
| 三级分类枚举前后端不同步 | 表单提交失败 | 从 Sheet2 生成统一枚举，前后端共用 |
| 往返状态机测试不全 | pending_info 多次触发未覆盖 | QA 补充往返路径 E2E，覆盖正常+往返 |

---

## 七、交付清单

完成后需交付：
1. **代码**：后端模块（派单引擎+在职+省外）+ 前端模块（切换器+表单+列表+详情）+ 种子数据。
2. **测试**：单测（派单规则+状态机）+ 集成测试（在职/省外创建→派单→完成）+ E2E（往返路径+切换器）。
3. **文档**：更新 `docs/AI修改记录.md`、`docs/业务规则回归清单.md`（若覆盖旧规则）。
4. **回归报告**：`回归测试.ps1` 执行结果（全通过）。
5. **待办清单**：省外表单部分标记 TODO，注明需业务提供菜鸟模板字段清单。

---

## 八、不做的事（明确边界）

1. **不做后台管理页**：续签/证明/工伤提醒、后台管理页延后。
2. **不重构派单引擎**：只做最小侵入改造，不迁移到 WorkflowDefinition。
3. **不删除 assignee/fallback**：保留死字段，避免破坏数据结构。
4. **不引入 businessScope 到 appStore**：方案定稿明确不用。
5. **不用入职/离职模板顶省外字段**：等业务提供菜鸟模板。

---

**规划完成**。团队 4人+Leader，分工明确，复用 builtin RolePreset，3阶段推进+回归验证，风险可控。

## 步骤 / Checklist
- [ ] **业务需求**：浙江自签团队服务范围已覆盖在职管理（单项业务办理）和省外增减员，现有工单系统仅支持入职/续签/离职，需扩展新模块。
- [ ] **已达成共识**：方案定稿 `docs/在职管理与省外派单-方案定稿-20260726.md` 和配置表 `在职模块-工单系统配置表（派单+单项业务）.xlsx` 已业务确认，技术主张已与现有代码事实核验一致。
- [ ] **本期范围**：共用底座（派单引擎改造）+ 在职管理·单项业务办理 + 省外派单·增减员；续签/证明/工伤提醒、后台管理页延后。
- [ ] **底座可复用**：派单引擎支持多表映射（Sheet4单项业务、Sheet5省外派单），可扩展新模块无需重新实现匹配逻辑。
- [ ] **在职模块可用**：完成三级分类树 + 往返状态机 + Sheet4省份映射 + 单项业务表单/列表/详情/派单/流转/消息通知。
- [ ] **省外模块可启动**：完成业务切换器 + 增减员表单/导入/派单（暂缺字段清单，前端表单待业务提供菜鸟模板后再补齐）。
- [ ] **回归安全**：现有入职/续签/离职不受影响，已有 assignee/fallback 字段保留但不破坏新逻辑。
- [ ] **Sheet 编号已纠正**：单项业务映射是 Sheet4（定稿误写 Sheet3），省外派单映射是 Sheet5。
- [ ] **双人省份独立处理**：Sheet4 多人省份以配置表实扫为准（含"/"的行），Sheet5 双人省份基本只有福建；两表禁止混用。
- [ ] **省外字段清单前置阻塞**：业务侧未提供菜鸟模板/浙江自签现用模板，省外表单部分暂缓；先做切换器和数据隔离。
- [ ] **分支隔离已就位**：当前在 `feature/in-service-out-of-province`，master 冻结为明天部署候选，新代码不碰 master。
- [ ] 不新增 UX/产品角色（方案已定，无需重新设计交互）。
- [ ] 不新增代码审查角色（团队规模4人，Leader兼审查）。
- [ ] **Reviewer Pool 配置**：4个 Worker，建议启用 `reviewerCount: "auto"`（系统自动按 ceil(4/3)=2 配置），让评审与开发解耦；不传 reviewerProvider/reviewerModel，评审自动跟随 Leader 的 Provider（`claude-code`）。
- [ ] `backend/src/modules/dispatch-engine/services/dispatch-engine.service.ts` — `resolveModuleTeamHandler()` 添加 `IN_SERVICE`/`OUT_OF_PROVINCE` 分支
- [ ] `backend/src/modules/dispatch-engine/services/handler-picker.service.ts` — `pick()` 支持从 Sheet4/Sheet5 读取映射
- [ ] `backend/src/modules/dispatch-engine/constants/enums.ts` — 补充新模块的 `ModuleType` 和 `TeamRole`
- [ ] `backend/src/database/seeds/province-handler.seed.ts` — 新增 Sheet4/Sheet5 种子数据
- [ ] assignee/fallback 是死字段（两引擎都不读），不删除但避免新逻辑误用。
- [ ] 状态机硬编码在 `dispatched-order.service.ts`(2900+行)，新模块状态机要加在同文件，保持现有风格避免破坏。
- [ ] 单测：新模块派单规则覆盖 Sheet4/Sheet5 正常派单、双人省份默认接单人。
- [ ] 集成测试：创建在职/省外工单能正确派单到对应专员。
- [ ] 回归：入职/续签/离职派单不受影响。
- [ ] `backend/src/common/constants/enums.ts` — 补充 `OrderType.IN_SERVICE`、三级分类枚举

## 风险 / 依赖
- **Sheet 编号已纠正**：单项业务映射是 Sheet4（定稿误写 Sheet3），省外派单映射是 Sheet5。
- **双人省份独立处理**：Sheet4 多人省份以配置表实扫为准（含"/"的行），Sheet5 双人省份基本只有福建；两表禁止混用。
- **省外字段清单前置阻塞**：业务侧未提供菜鸟模板/浙江自签现用模板，省外表单部分暂缓；先做切换器和数据隔离。
- **分支隔离已就位**：当前在 `feature/in-service-out-of-province`，master 冻结为明天部署候选，新代码不碰 master。

---

## 执行备注
- 绑定会话：session-1785072042390
- 来源类型：ExitPlanMode
- 最近更新：2026-07-26T15:21:38.899Z
- Plan 模式关闭后，本文件仍保留在工作区中，可供继续查看和消费。
