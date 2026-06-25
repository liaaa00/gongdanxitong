# 阻塞与冲突治理记录（任务 46f9bda6）

更新时间：2026-06-24
角色：阻塞与冲突治理专员

## 0. 治理原则与停止条件

- 同一测试/构建/迁移问题失败达到 2 次：停止继续同方向重试，改为定位归属、拆分最小复现、请求对应 owner 或 Leader 决策。
- merge/integration 冲突在同一文件重复出现：停止并行改同文件，指定单一 owner 串行整合，其他成员提交补丁说明而非直接改文件。
- 编译失败无明确修复方向：最多做 1 次基于错误栈的定向修复；再次失败需上报并冻结无关改动。
- 成员互相等待超过一次交互轮：由 Leader 明确先后顺序或拆分接口契约，避免空等。
- 同一文件被多个成员反复修改：优先抽离配置/常量或按需求批次串行合并，不允许顺手重构。

## 1. 当前证据

- 根目录及 backend/frontend 目录当前未检测到 Git 元数据，无法用 git status/diff 自动识别冲突；后续需依赖文件清单、任务报告和构建/测试日志进行治理。
- 后端为 NestJS/TypeORM；前端为 React/Vite/Ant Design。
- 所有团队子任务均已 in_progress；暂无已报告的重复失败或等待阻塞。

## 2. 初始高冲突文件识别

| 风险级别 | 文件/区域 | 可能参与角色 | 对应需求 | 冲突原因 | 建议 owner/策略 |
|---|---|---|---|---|---|
| 高 | `backend/src/database/seeds/seed-fields.ts` | import_template_backend、contract_export_frontend、approval_sync_workflow、social_feedback_batch | 1/2/3/4/5/7 | 字段定义、必填、下拉、条件必填、详情展示字段都可能改这里 | 第一批由 import_template_backend 先统一字段口径；其他角色只提交所需字段清单，避免并行编辑 |
| 高 | `backend/src/database/seeds/seed-export-templates.ts` | import_template_backend、contract_export_frontend | 2/3/5 | 身份证派生字段、试用期字段、合同导出字段、签订方式默认值都在同一模板 seed | contract_export_frontend 作为导出 owner；import 侧只确认字段 code，不直接改导出模板 |
| 高 | `backend/src/modules/imports/import-template.service.ts` | import_template_backend、QA | 1/4 | Excel 模板生成、表头/说明/下拉/隐藏 options 可能集中修改 | import_template_backend 单一 owner；QA 只补测试或验收数据 |
| 高 | `backend/src/modules/imports/field-validation.service.ts` | import_template_backend、approval_sync_workflow | 2/4/6 | 导入字段映射、条件必填、派生字段校验可能重叠 | 第一批先完成导入校验；第二批审批同步不得复用导入校验逻辑做状态机改造 |
| 高 | `backend/src/modules/imports/work-order-import.service.ts` | import_template_backend、approval_sync_workflow | 2/3/4/6 | 导入后数据落库、派生字段、同步子单可能集中 | 第一批先落主流程导入派生；第二批审批同步在其后集成 |
| 高 | `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | approval_sync_workflow、social_feedback_batch | 6/7/8/9 | 审批、状态流、批量接单、批量完成/反馈都在大型服务内 | 按需求串行：先 9 的 batchAccept 小改，再 7/8 反馈，再 6 审批同步；若冲突重复由 approval_sync_workflow 最终整合 |
| 中高 | `backend/src/entities/dispatched-order.entity.ts` | approval_sync_workflow、social_feedback_batch | 6/7/8 | 结构化审批记录、办理反馈字段可能都要加列 | 先定迁移字段契约；避免两个角色各自新增 JSON/列造成迁移冲突 |
| 中高 | `backend/src/entities/work-order.entity.ts` | import_template_backend、approval_sync_workflow | 2/3/6 | 主单字段派生与修改同步可能触碰 data/extraData | 明确派生字段存放位置，审批同步只记录 delta |
| 中高 | `backend/src/database/migrations/*` | 多角色 | 5/6/7 | 新迁移命名与执行顺序易冲突 | 使用时间戳递增且按批次排序；不要修改旧迁移，新增迁移；迁移失败 2 次即冻结 |
| 中 | `frontend/src/pages/MyDispatched/index.tsx` | approval_sync_workflow、social_feedback_batch、QA | 6/9 | 审批按钮/批量接单提示都在同页 | 第四批小改先行；审批 UI 后接入，避免同区块并行 |
| 中 | `frontend/src/pages/MyDispatched/Detail/index.tsx` | contract_export_frontend、approval_sync_workflow、social_feedback_batch | 5/6/7 | 合同详情、审批展示、社保反馈字段详情都可能扩展 | 先补详情字段显示，再加审批/反馈交互；如冲突由页面 owner 串行整合 |
| 中 | `frontend/src/services/dispatchedOrders.ts` | approval_sync_workflow、social_feedback_batch | 6/7/8/9 | API 类型/批量接单/反馈接口会重叠 | 先确定后端响应 DTO，再前端集中更新类型 |
| 中 | `frontend/src/services/workOrders.ts` | import_template_backend、contract_export_frontend | 2/3/5 | 字段字典、详情映射可能重叠 | 由 contract_export_frontend 处理详情展示；import 不改前端 mock/字典除非必要 |

## 3. 建议集成顺序

1. 架构与需求统筹先输出验收矩阵、字段 code、迁移边界、接口契约。
2. 第一批后端导入字段口径：模板/字段 seed/条件必填/身份证派生/试用期派生，先通过后端单测。
3. 第一批合同详情与导出：基于已确认字段 code 更新导出模板和详情显示，处理既有模板数据迁移/同步策略。
4. 第四批批量接单混选：范围较小，可在审批大改前合入，避免在 `dispatched-order.service.ts` 后期冲突扩大。
5. 第三批社保公积金反馈：在批量接单后、审批同步前完成反馈字段/状态判断，避免与审批状态流互相覆盖。
6. 第二批审批同步机制：最后集成，因其覆盖状态流与结构化记录，需基于前面稳定字段与状态。
7. QA 回归按第一批→第四批→第三批→第二批逐层验证；失败项按 owner 回退或拆小。

## 4. 当前阻塞处理记录

| 问题 | 尝试次数 | 当前证据 | 建议动作 | 停止条件 |
|---|---:|---|---|---|
| 无法用 Git 自动检查工作区冲突 | 1 | 根目录、backend、frontend 均返回 not a git repository | 改用文件清单、任务报告和测试日志监控；要求成员提交“改动文件 -> 需求 -> 必要性” | 若后续需要合并但无 Git 元数据，必须由 Leader 指定集成目录/交付格式 |
| PowerShell `Select-String -Recurse` 不兼容 | 1 | 命令报 “A parameter cannot be found that matches parameter name 'Recurse'” | 已换成先枚举文件再 Select-String 的兼容方式 | 不再继续使用该参数重试 |
| 团队任务潜在同文件并行修改 | 0 | 多角色任务都 in_progress，热点集中在 seed-fields、seed-export-templates、dispatched-order.service | 立即广播高冲突文件 owner 与集成顺序，避免重复冲突 | 若任一热点文件出现第二次冲突，冻结该文件并指定单一整合 owner |

## 5. 对各角色的约束提醒草案

- import_template_backend：优先 owns `seed-fields.ts`、imports 模块；如需导出模板字段，先给 contract_export_frontend 字段 code 与口径。
- contract_export_frontend：优先 owns `seed-export-templates.ts`、合同详情展示；不要顺手修改导入模板必填逻辑。
- approval_sync_workflow：暂缓大改 `dispatched-order.service.ts` 中批量接单/社保反馈区域，等第四/三批接口稳定后整合审批同步。
- social_feedback_batch：只改社保反馈和批量接单必要路径；若触碰审批状态判断，先与 approval_sync_workflow 对齐。
- QA：失败日志需按“命令、失败测试名、首次/第二次、疑似 owner、最小复现”记录，避免重复跑全量。
