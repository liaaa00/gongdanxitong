# AI 修改记录

> 目的：记录每次 AI/开发人员根据用户要求修改后的结果，尤其是是否覆盖了既有业务规则。固定规则写在 `业务规则回归清单.md`，本文件写变更历史。

## 记录格式

每次修改后追加一条：

```md
## YYYY-MM-DD · 简短标题
- 用户要求：...
- 是否覆盖旧规则：否 / 是，覆盖了 ...
- 同步更新规则文档：无 / 已更新 `docs/业务规则回归清单.md` ...
- 代码提交：<commit>
- 验证：...
- 未提交无关文件：...
```

## 2026-06-08 · 建立业务规则回归机制
- 用户要求：担心长对话后 AI 忘记既有规则，希望把固定规则和回归测试固化到项目。
- 是否覆盖旧规则：否；新增规则保护机制。
- 同步更新规则文档：新增 `docs/AI修改前必读.md`、`docs/业务规则回归清单.md`、根目录 `回归测试.ps1`，并更新 `docs/README.md`。
- 代码提交：`d767adf3 chore: add business regression guardrails`
- 验证：`./回归测试.ps1 -SkipBuild` 通过；`./回归测试.ps1` 通过，包含 10 个前端关键测试文件 68 条测试、前端 build、后端 build。
- 未提交无关文件：`frontend/tsconfig.tsbuildinfo`、`.spectrai/`、`backend/uploads/excel/*.xlsx`。

## 2026-06-08 · 明确最新用户要求优先级
- 用户要求：固定规则以后也可能被用户修改，不能让旧规则压过用户最新输出。
- 是否覆盖旧规则：是；覆盖“规则清单绝对固定”的理解，新增“用户当前最新明确要求优先”。
- 同步更新规则文档：已更新 `docs/AI修改前必读.md` 和 `docs/业务规则回归清单.md`，新增冲突处理流程；新增本文件作为修改记录。
- 代码提交：待提交。
- 验证：待执行 `./回归测试.ps1 -SkipBuild`。
- 未提交无关文件：待提交前检查。

## 2026-06-08 · 我的已办月份和审批中待办可见
- 用户要求：我的已办按工单流转月份，不按完成时间；修改审批中应在我的待办查到；去掉“实际操作人未记录”误导文案。
- 是否覆盖旧规则：是；覆盖“我的已办按完成时间”的旧实现，改为按派发/创建月份。
- 同步更新规则文档：该规则已写入 `docs/业务规则回归清单.md`。
- 代码提交：`2ad4a266 fix: align done month and approval pending visibility`
- 验证：`npm test -- --run src/pages/MyDispatched/index.test.tsx src/pages/MyDispatched/Detail/index.test.tsx src/pages/TeamDispatched/index.test.tsx` 通过；前端 build 通过。
- 未提交无关文件：`frontend/tsconfig.tsbuildinfo`、`.spectrai/`、`backend/uploads/excel/*.xlsx`。

## 2026-06-08 · 表头筛选和业务组长范围修正
- 用户要求：我的工单/主工单筛选要生效；九状态名称要统一；业务组长在具体入职/离职模块只看本人发起，团队数据只在团队工单/仪表盘团队视角。
- 是否覆盖旧规则：是；覆盖业务组长普通模块按部门看团队数据的旧实现。
- 同步更新规则文档：该规则已写入 `docs/业务规则回归清单.md`。
- 代码提交：`4aa7c6ec fix: align work order filters and business leader scope`
- 验证：前端关键测试通过；前端 build 通过；后端 build 通过。
- 未提交无关文件：`frontend/tsconfig.tsbuildinfo`、`.spectrai/`、`backend/uploads/excel/*.xlsx`。

## 2026-06-08 · 业务组长仪表盘默认本人范围
- 用户要求：业务组长在具体模块只看本人，团队数据只在团队工单和仪表盘团队视角查看；核查未实现项并补齐。
- 是否覆盖旧规则：否；补齐 `业务规则回归清单` 已确认的“仪表盘允许本人/团队切换，默认本人兜底”。
- 同步更新规则文档：无，既有规则已覆盖本次要求。
- 代码提交：`bb89cf1c fix: default leader dashboard to personal scope`
- 验证：`npm test -- --runInBand dashboard.spec.ts` 通过；`./回归测试.ps1 -SkipBuild` 通过；后端 `npm run build` 通过。
- 未提交无关文件：`frontend/tsconfig.tsbuildinfo`、`.spectrai/`、`backend/uploads/excel/*.xlsx`。

## 2026-06-08 · 全系统导航状态记忆返工落地
- 用户要求：实现全系统菜单最近路径记忆，菜单点击优先跳上次合法停留路径（可含详情页），临时动作页不记录，lastPath 无权限或非法时回退默认 path，保护 `/work-orders?orderType=onboarding/resignation` 高亮、展开、跳转不回归；评审指出指定 integration worktree 缺少代码交付，需要返工落地到可评审视图。
- 是否覆盖旧规则：否；新增全系统导航状态记忆规则，保留既有角色菜单、权限、月份统计、九状态等业务口径。
- 同步更新规则文档：已更新 `docs/AI修改前必读.md` 与 `docs/业务规则回归清单.md`，补充导航状态/列表状态检查项、权限兜底、临时页排除、入职/离职 query 区分和测试要求。
- 代码提交：待提交；已在 integration worktree 的 `frontend/src/layouts/BasicLayout.tsx` 落地 `menu_recent_paths_v1`、`menu_active_leaf_key_v1`、路径 sanitize、临时页排除、菜单归属判断、`canAccessPath` 兜底与菜单点击 `lastPath || item.path`；已补充 `BasicLayout.test.tsx` 和 `routeVisibility.test.ts` 覆盖最近详情跳转、临时页不覆盖、无权限回退、orderType 额外 query 高亮与 query 权限矩阵。
- 验证：`npm test -- --run src/layouts/BasicLayout.test.tsx src/config/routeVisibility.test.ts src/components/MultiViewTable/index.test.tsx` 在 integration worktree 通过（3 个测试文件，32 条测试）；`./回归测试.ps1 -FrontendOnly` 在 integration worktree 通过（前端关键业务测试 10 个文件 69 条测试 + 前端 build）。
- 未提交无关文件：`git status --short` 已检查；本任务相关 diff 为三份 docs、`BasicLayout.tsx`、`BasicLayout.test.tsx`、`routeVisibility.test.ts`。当前 integration worktree 还存在列表同事范围的 `frontend/src/components/MultiViewTable/index.tsx`、`frontend/src/components/MultiViewTable/index.test.tsx` diff，以及 build 生成的 `frontend/tsconfig.tsbuildinfo`，不属于本任务且不应由本任务提交/清理。

## 2026-06-08 · 列表状态保留与前端测试覆盖
- 用户要求：检查现有 listPageState.ts、MultiViewTable、工单列表/我的工单相关列表页状态来源与恢复逻辑，补齐前端测试，至少覆盖 MultiViewTable 状态保存/恢复，配合 BasicLayout/routeVisibility 测试需求；优先写稳定单元测试。
- 是否覆盖旧规则：否；本轮只新增测试和少量测试辅助工具（listPageState.test.ts），不修改既有业务规则。
- 同步更新规则文档：
  - `docs/AI修改前必读.md`：在第 7 节"固定前端关键测试"新增 `src/utils/listPageState.test.ts`。
  - `docs/业务规则回归清单.md`：第 13 节"全系统导航状态记忆与列表状态保留"已覆盖本轮测试要求，无需额外修改。
  - `docs/AI修改记录.md`：追加本记录。
- 代码提交：待提交。
- 验证：
  - `listPageState.test.ts`：30 条纯函数测试全部通过（sessionStorage mock、状态存取、过滤器、月份、clear、隔离性、无 window 降级）。
  - `MultiViewTable/index.test.tsx`：17 条测试全部通过（新增 8 条列表状态持久化测试：listStateKey 存取 sessionStorage、initialListState 优先级、onListStateChange、controlledFilters、隔离性）。
  - `BasicLayout.test.tsx`：20 条测试全部通过（新增 8 条：/403、/404、/login、/change-password、/work-orders/new、/work-orders/import 不记录为菜单最近路径；onboarding/resignation orderType 切换不回归）。
  - `./回归测试.ps1 -FrontendOnly`：10 个前端关键业务测试全部通过 + 前端 build 通过。
  - 合计 4 个测试文件 78 条测试全部通过。
- 未提交无关文件：`frontend/tsconfig.tsbuildinfo` 不在提交范围；无 `.spectrai/`、Excel、dist 等无关文件。
- 修改文件清单：
  - 新增 `frontend/src/utils/listPageState.test.ts`
  - 修改 `frontend/src/components/MultiViewTable/index.test.tsx`
  - 修改 `frontend/src/layouts/BasicLayout.test.tsx`

## 2026-06-09 · QA 回归：改密入口/首登同步与子工单返回来源
- 用户要求：基于最新 integration 状态复核登录后“修改密码”入口可见；`mustChangePassword` 在登录、刷新恢复、首登改密、改密后清理和退出登录后的状态同步；子工单详情“返回列表”优先回到进入详情时的来源页；同步三份 docs，且 docs 不包含子工单补充权限等范围外规则。
- 是否覆盖旧规则：否；本轮只补齐账号安全入口、首登改密同步和详情返回来源优先策略，不修改权限/菜单矩阵、`routeVisibility`、数据范围、状态流、月份口径或其他子工单权限。
- 同步更新规则文档：已更新 `docs/AI修改前必读.md`、`docs/业务规则回归清单.md` 和本记录；`回归测试.ps1 -FrontendOnly` 的前端关键测试集合纳入 Login、ChangePassword、authLoginRegression、auth.changePassword 和 dispatchedDetailNavigation。
- 代码提交：不提交代码，待 Leader 汇总。
- 验证：`npm test -- --run src/layouts/BasicLayout.test.tsx src/pages/ChangePassword/index.test.tsx src/pages/Login/index.test.tsx src/services/authLoginRegression.test.ts src/pages/MyDispatched/index.test.tsx src/pages/MyDispatched/Detail/index.test.tsx src/pages/TeamDispatched/index.test.tsx src/pages/HistoryWorkOrders/index.test.tsx src/pages/OnboardingModule/index.test.tsx src/utils/dispatchedDetailNavigation.test.ts` 通过（10 文件 73 条）；`./回归测试.ps1 -FrontendOnly` 通过（16 文件 113 条 + 前端 build）。
- 未提交无关文件：已检查 `git status --short`；`frontend/tsconfig.tsbuildinfo` 已恢复，`frontend/dist/` 被忽略，未纳入 `.spectrai/`、Excel 或截图/RDP 临时文件；为运行 integration 前端测试临时创建的 `frontend/node_modules` 目录联接被 git 忽略，不纳入提交。
- 修改文件清单：顶部改密入口、`mustChangePassword` 归一化与 userStore 同步、改密后标记清理、详情来源返回工具与各入口 state 传递、相关稳定前端测试、三份 docs 与 `回归测试.ps1`。

## 2026-06-09 · 修复窗口最小化/恢复后页面状态被清空（keep-alive 失效）
- 用户要求：批量导入等页面在浏览器最小化后再恢复时，页面状态（应被 keep-alive 缓存）瞬间清空；要求查清根因并修复，并说明此前 keep-alive 改动到底改了什么。
- 根因：`routes/index.tsx` 的 `PrivateRoute` 守卫为 `if (!user || loading) return <Loading />`。窗口重新可见时 `BasicLayout` 的 `visibilitychange` 监听触发 `refreshCurrentUser()` → `fetchUser()`，把 userStore 的全局 `loading` 置为 `true`；守卫随即用全屏 `<Loading/>` 替换并**卸载整个 `<BasicLayout/>`**，连带销毁 `KeepAliveOutlet` 内的 `cacheRef`，缓存全部丢失；`/auth/me` 返回后 `BasicLayout` 重新挂载，导入向导回到 step 0。该缺陷不是 keep-alive 改动引入的，keep-alive 只能在路由切换时保活，扛不住整树卸载。
- 修复：仅把守卫改为 `if (!user) return <Loading />`。语义为「只有尚无用户的首次阻塞加载才显示全屏 Loading」；已有用户时的后台重校验（visibilitychange / storage / 切菜单触发的 `/auth/me`）不再卸载布局，KeepAliveOutlet 缓存得以保留。`loading` 仍用于该组件的 effect 防重复请求，未删除。
- 是否覆盖旧规则：否；属于对「第 14 节 列表/导航状态保留」的缺陷修复，不改权限/菜单矩阵、月份口径、九状态、数据范围或改密链路。
- 同步更新规则文档：已在 `docs/业务规则回归清单.md` 第 14 节补一条「后台 /auth/me 重校验不得卸载主布局/销毁 keep-alive」；本记录同步追加。
- 代码提交：未提交，待 Leader 汇总。
- 验证：`./回归测试.ps1 -FrontendOnly` 通过（前端关键业务测试 10 文件 73 条 + 前端 build 成功）；脚本末尾 `git status` 因当前 PowerShell 环境未挂载 `git` 报 CommandNotFound，与本次改动无关，已另用 bash `git status --short` 复核。窗口最小化/恢复的运行时 UI 行为未做无头自动化复现（需登录+上传文件，成本高），已在回复中给出人工复现验证步骤。
- 未提交无关文件：工作区存在大量 `*.png`、`tmp_*.py`、`backend/uploads/excel/*.xlsx`、`frontend/tsconfig.tsbuildinfo` 等临时/构建文件，均不属本次改动、不予提交。
- 修改文件清单：`frontend/src/routes/index.tsx`（一行守卫）、`docs/业务规则回归清单.md`、`docs/AI修改记录.md`。

## 2026-06-09 · Excel 模板字段对齐 + 电子签平台导出路由改造（5 份会议表格逐列对齐）
- 用户要求：以 5 份会议 Excel 表格的标注行为唯一权威口径，对齐入职导入表（63 字段）、离职减员表（10 字段），新增电子签平台（速创/E签宝）两套导出模板的「平台路由」，并把 e签宝模板表头 R1/R2/R3（含绑定串）原样逐字复刻。强调严格最小改动、改前回报落点与影响面。
- 实施分 5 阶段：
  - Phase1 入职字段：新增 13 个 onboarding 字段（position_type/id_card_type/education/marital_status/probation_other_salary/need_esign/esign_platform/company_address/project_name/work_arrangement/feedback_deadline/is_common_template/template_name）；按表格覆盖下拉选项集（外包类型=全风险/风险后置；户籍性质=本地城镇/本地农村/外地城市/外地农村；工时制仅标准工时制；人员类型删实习生等）；条件必填（need_company_contract=是 → 8 字段必填、is_common_template=是 → template_name、need_company_payroll=是 → payroll_location）。前后端两套机制（seed `conditionalRequired` AST + 前端 `CONDITIONAL_REQUIRED_BY_TYPE`）同步。
  - Phase2 离职减员：按减员表 10 字段口径重构 `resignationFields`（social_pay_region/social_stop_month/resignation_reason/resignation_date/need_resignation_share + 共享 feedback_deadline/is_common_template/template_name）；`dispatch-engine.service.ts` 新增离职三拆（resignation_contact/data_entry_resign/resignation_social_insurance）；`enums.ts` 增 `RESIGNATION_SOCIAL_INSURANCE`，配 DB enum 扩展 migration `20260609001000`。
  - Phase3 导出引擎扩展：`field_list` 列模型支持 `{ fieldCode | const | sameAs, header: string|string[] }`；新增 `resolveRichColumns/renderRichValue/writeWorksheet`（多行表头按 header 数组逐行写、数组分支不 trim 保留尾随空格）；`export_templates` 加 `sign_platform varchar(16)`（entity + migration `20260609002000`）；`resolveDefaultTemplate` 在 `contract` 模块按 `parentOrder.extraData['esign_platform']` 路由匹配 `signPlatform` 模板；后台导出模板表单加 `signPlatform` Select、`FIELD_OPTIONS` 补全新字段。保留旧 `resolveColumns` 以兼容既有单测。
  - Phase4 三套导出模板种子：新增 `seed-export-templates.ts` 并在 `seed-on-bootstrap.service.ts` 注册；① 入职联系（onboarding_contact，7 列单行表头）② 劳动合同-速创（contract/速创，37 列，表头=字段名行+填写说明行）③ 劳动合同-e签宝（contract/E签宝，30 列，4 行表头 R1/R2/R3/R4 原样逐字复刻含绑定串，数据第 5 行起）。三套 `is_shared=true`、`created_by=admin`，按 `templateName+moduleCode(+signPlatform)` 幂等。表头/列序/绑定串均从会议 Excel 原件读出复刻。
  - Phase5 回归与文档：本记录 + 业务规则回归清单第 17 节。
- 是否覆盖旧规则：是（用户已确认）。下拉选项集覆盖会使历史旧值导入校验报错；离职字段整体重构清理旧引用；`displayOrder` 按列序重排。两处 migration 在 AUTO_SEED 启动生效。
- 代码提交：未提交，待 Leader 汇总。
- 验证：后端 `npx tsc --noEmit -p tsconfig.json` 通过；前端 `npx tsc -b --noEmit` 通过；`npx jest --config ./test/jest-unit.json --runInBand export-template` 3 套件 7 条全过（含 default-shared 路由、columns 契约、previewApply）；`./回归测试.ps1 -FrontendOnly` 通过。
- 待人工验证（成本高、未无头自动化）：导入含「电子签平台=速创 / E签宝」两行 → 派发 → 劳动合同子工单导出，确认①速创出 37 列 ②E签宝出 30 列 4 行表头（绑定串原样）③入职联系出 7 列。
- Phase6（已决策并实施，Option A）：`resolveDefaultTemplate` 命中共享模板时，对「逐字复刻模板」跳过 `ensureImportIdentityColumns` 的身份列前置，确保速创/e签宝/入职联系导出严格保持 37/30/7 列。判别逻辑 `isVerbatimTemplate`：`signPlatform` 非空，或 fieldList 任一项 `header` 为数组（多行/单行原样表头）——后者覆盖 `signPlatform=null` 的入职联系模板。fallback 动态模板（按 visibleFields 现拼）仍保留身份列前置，re-import 行为不变。旧 `ensureImportIdentityColumns` 函数本身未改，既有单测不受影响。
- 修改/新增文件清单：
  - 新增 `backend/src/database/seeds/seed-export-templates.ts`
  - 新增 `backend/src/database/migrations/20260609001000-AddResignationSocialInsuranceEnum.ts`
  - 新增 `backend/src/database/migrations/20260609002000-ExportTemplateSignPlatform.ts`
  - 修改 `backend/src/database/seeds/seed-on-bootstrap.service.ts`、`seed-fields.ts`
  - 修改 `backend/src/entities/export-template.entity.ts`
  - 修改 `backend/src/modules/admin/export-templates/export-templates.service.ts`、`export-templates.controller.ts`
  - 修改 `backend/src/modules/dispatched-orders/dispatch-engine.service.ts`、`enums.ts`（离职三拆 + 枚举）
  - 修改前端 `services/exportTemplates.ts`、`services/fields.ts`、`pages/Admin/ExportTemplates/index.tsx`、`pages/WorkOrders/New/index.tsx` 等 5 处别名字典同步点
  - 清理临时脚本 `backend/tmp_dump_templates.js`

## 2026-06-10 · 列表月份默认全部 + 仪表盘记忆 + 菜单不进详情
- 用户要求：①工单列表（入职/离职主工单、我的工单各子页、团队工单、历史工单、入职/离职子工单页）月份默认为空、显示全部月份、按时间倒序；②仪表盘仍默认当前月，但记住用户切换的月份；③点菜单回到对应列表页、不再进入/记录详情/编辑页。
- 是否覆盖旧规则：是。覆盖「列表默认当前月」改为默认全部月份；覆盖「详情页可作为菜单最近路径、点菜单回详情」改为详情/编辑页不写入最近路径、点菜单回列表。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md`（第 2 节月份口径、我发起的/我的退回、子工单页、第 9 节菜单最近路径，删除旧「详情页可以作为最近路径」规则）。
- 实现要点：
  - `utils/listPageState.ts` 新增 `getCachedMonthOrNull`（无缓存返回 null=全部月份；`getCachedMonth` 仍返回当前月供仪表盘用）。
  - 5 个列表页 state 初值改用 `getCachedMonthOrNull`，DatePicker 加 `allowClear`、`placeholder="全部月份"`，清空写 `month: ''`；主工单 `getMonthRange` 无值返回 undefined（不传 createdAfter/createdBefore），子工单无月份不传 orderMonth。
  - `Dashboard/index.tsx` 用 listPageState key `'dashboard'`：初值 `getCachedMonth('dashboard')`（默认当前月），onChange 写缓存，保留 `allowClear={false}`、清空回当前月。
  - `BasicLayout.tsx` 在 `isRecordableRecentPath` 增加 `isDetailOrEditPath` 排除（`/work-orders/:id`、`/my-dispatched/:id`、`/resignation/:id(/cert)`），同时拦截记录与复用两条路径，点菜单回列表默认 path。
- 代码提交：未提交，待 Leader 汇总。
- 验证：`npx vitest run` 覆盖 listPageState/WorkOrders/MyDispatched/TeamDispatched/HistoryWorkOrders/OnboardingModule/Dashboard 共 71 条全过；BasicLayout 新规则相关 9 条全过（详情不记录、点菜单回列表、临时动作页排除）。
- 已知无关失败：BasicLayout 另有 3 条因团队未提交的「用户名→Dropdown 修改密码」改造而失败（与本次月份/菜单改动无关，复现于回退本次源码后仍失败）。
- 未提交无关文件：工作区存在大量团队未提交改动（backend seeds/imports、ExportTemplates、routeVisibility、根目录 *.png 截图、tmp_*.py/js 脚本等），均非本次改动。

## 2026-06-10 · 导出模板去系统身份列并增加发起人
- 用户要求：批量回填匹配不依赖「工单编号/员工证件号」，可用「证件号码」匹配；不管怎么配置导出都不要「工单编号」和「员工证件号」两个字段；所有导出都新增「发起人」字段；导出中的身份证号码字段名改为「证件号码」。
- 是否覆盖旧规则：是。覆盖 2026-06-09 Phase6 中「fallback 动态模板仍前置身份列以支持 re-import」的旧规则；新规则为所有导出路径都剔除 `order_no`/`employee_id_card`，并追加 `created_by_name`。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节：三套模板列数改为入职联系 8 列、速创 38 列、e签宝 31 列，并明确批量回填可用 `id_card_no`/「证件号码」匹配。
- 实现要点：
  - `export-templates.service.ts` 新增统一导出列准备逻辑：过滤 `order_no`、`employee_id_card`；末尾追加 `created_by_name`；手选模板、共享模板、fallback 动态模板、预览、实际写 Excel 均走同一规则。
  - 导出查询加载 `parentOrder.creator`，`renderExportValue` 支持 `created_by_name`/`creator_name`。
  - 三套导出模板种子把「身份证号/身份证号码」改为「证件号码」，并在末尾新增「发起人」。
  - 批量回填仍保留旧表头别名兼容，但 UI/错误提示改为「证件号码」；后端匹配同时兼容主表 `employee_id_card` 与 `extra_data.id_card_no`/旧别名字段，确保导出表只保留「证件号码(id_card_no)」也能回填。
- 代码提交：未提交，待 Leader 汇总。
- 验证：`npx jest --config ./test/jest-unit.json --runInBand export-template` 通过（3 套件 12 条）；`npx jest --config ./test/jest-unit.json --runInBand export-template import-template` 通过（4 套件 17 条）；`npx tsc --noEmit -p tsconfig.json` 通过；前端 `npx tsc -b --noEmit` 通过；回填匹配用例 `test/dispatched-order.service.spec.ts -t "matches exported template rows"` 通过。整跑 `dispatched-order.service.spec.ts` 仍有既有权限范围断言失败（期望部门范围、实际当前代码走本人创建范围），与本次导出/回填匹配改动无关，未在本次修改。
- 未提交无关文件：工作区已有大量团队未提交改动、截图/临时脚本、上传 Excel、`frontend/tsconfig.tsbuildinfo` 等，不属于本次导出规则改动，未清理未提交。

## 2026-06-10 · 入职导入模板与条件必填回归测试
- 用户要求：业务员入职导入下载模板不再出现 `contract_feedback`、`onboarding_feedback`、`data_entry_feedback`、`contract_template`；`need_onboarding_contact` 仍必填；仅当 `need_onboarding_contact=是` 时要求 `feedback_deadline`、`is_common_template`，且 `template_name` 仅在 `need_onboarding_contact=是` 且 `is_common_template=是` 时必填。
- 是否覆盖旧规则：是。覆盖 `docs/业务规则回归清单.md` 第 17 节中 `contract_template` 入职导入条件必填、以及 `is_common_template=是` 单独触发 `template_name` 必填的旧口径；新口径限定在业务员入职导入模板/导入校验，不全局停用后道反馈、详情、导出等字段。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节条件必填条目，写明 `need_onboarding_contact` 相关三字段新口径与 `contract_template` 非全局停用边界。
- 测试覆盖：`backend/test/import-template.service.spec.ts` 新增入职模板排除四字段、保留相邻业务输入字段、非入职模板不全局移除字段的回归；`backend/test/import.service.spec.ts` 新增 `need_onboarding_contact` 必填与三字段条件必填矩阵，并调整旧 `contract_template` 入职导入断言为排除/忽略，同时保留非入职场景别名匹配回归。
- 验证：`npx jest --config ./test/jest-unit.json --runInBand import-template.service.spec.ts import.service.spec.ts` 通过（2 个测试文件，23 条）；`.\回归测试.ps1 -BackendOnly` 通过（后端 build 成功）。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：`git status --short` 已检查；工作区存在大量团队既有未提交改动和临时文件（如前后端实现改动、`frontend/tsconfig.tsbuildinfo`、根目录截图/临时脚本、`backend/uploads/excel/*.xlsx` 等），本任务不提交、不清理。

## 2026-06-10 · 导出模板页面支持空值字段/默认值字段
- 用户要求：在导出模板配置页面直接编辑模板自带列，可新增空值字段或默认值字段；子工单导出模板中有些字段不来自入职导入模板，也需要导出时自带，可能为空值或固定默认值。
- 是否覆盖旧规则：否。延续第 17 节列模型 `{ fieldCode | const | sameAs, header }`，只是把其中 `const` 空值/默认值能力开放到管理后台页面；`sameAs`、公式、多行表头仍作为后端种子模板能力保留，不在本次普通页面开放。
- 实现要点：
  - `frontend/src/pages/Admin/ExportTemplates/index.tsx`：右侧已选字段区新增「添加空值列」「添加默认值列」，每列展示业务字段/空值字段/默认值字段类型；默认值字段可编辑固定值；所有列仍可改别名、排序、删除。
  - `frontend/src/pages/Admin/ExportTemplates/fieldList.ts`：新增字段列表纯函数，兼容旧普通字段、后端 `fieldCode`/`field_code`、`const: ''` 空值列、`const: '默认值'` 默认值列；保存时输出后端已支持的 JSON 结构。
  - `frontend/src/services/exportTemplates.ts`：放宽 `field_list` 类型，支持 const/sameAs/formula/header 等富列模型。
  - `backend/test/export-template.spec.ts`：补后端回归，确认页面保存的空值列和默认值列可在预览/实际 Excel 导出中生效，并且仍自动追加发起人。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节，明确管理后台页面支持业务字段列、空值字段列、默认值字段列。
- 验证：前端 `npx vitest run src/pages/Admin/ExportTemplates/fieldList.test.ts` 通过（1 文件 4 条）；前端 `npx tsc -b --noEmit` 通过；后端 `npx jest --config ./test/jest-unit.json --runInBand export-template` 通过（3 套件 13 条）；后端 `npx tsc --noEmit -p tsconfig.json` 通过。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：工作区仍有大量团队既有未提交改动、截图/临时脚本、上传 Excel、`frontend/tsconfig.tsbuildinfo` 等，本任务未清理。

## 2026-06-10 · 修复导出/下载模板后端进程崩溃（ERR_HTTP_HEADERS_SENT）
- 用户问题：点击「下载当前字段模板」后前端弹出「服务器异常 (500)」，后台进程直接崩溃退出，要求稳定。
- 根因定位：`backend/src/modules/imports/imports.controller.ts` 的 `downloadTemplate` 用 `@Res({ passthrough: true })` 手动 `res.send(buffer)` 发送文件后，全局 `ResponseInterceptor` 仍会把控制器返回值包成 `{code,data}` 再次写响应，触发 `ERR_HTTP_HEADERS_SENT`；该异常进入全局 `HttpExceptionFilter`，过滤器在同一已结束响应上再次 `res.json()` 二次抛出未捕获异常，使 Node 进程退出（端口 3000 直接 DEAD）。已用 `backend-run.err.log` 栈（`ERR_HTTP_HEADERS_SENT` → `HttpExceptionFilter.catch` → `Node.js v20.20.2` 进程退出）与本地复现（onboarding 200 后下一请求 HTTP 000 连接被拒）确认。
- 是否覆盖旧规则：否。仅修复进程崩溃缺陷，未改动任何业务规则/导出列口径/字段。
- 修复内容：`downloadTemplate` 改为裸 `@Res()`（去掉 `passthrough`，进入 library 模式，Nest 不再把拦截器输出写回响应），并去掉 `return res.send(...)`；同文件两个 error-report 端点（`errorReport`、`errorReportAlias`，HEAD 既有，同属 `passthrough + res.download` 同类致命模式）一并改为裸 `@Res()`。在崩溃处加注释说明禁止 passthrough 的原因。
- 影响面：仅 `imports.controller.ts` 三个文件下载端点；导出 Excel 内容/列与业务逻辑不变。
- 验证：`npm run build` 通过；重启后端连续下载 onboarding/resignation 各两次均 HTTP 200 且为合法 xlsx（PK 头），`/api/health` 始终 200，日志 0 次 `HEADERS_SENT`，进程不再崩溃。`npx jest --config ./test/jest-unit.json --runInBand -t "template"`：`import-template.service`、`import.service`、`export-template`、`export-templates-columns` 等本模块套件全部 PASS；另有 5 个套件（benefit-state-machine、control-flow-regression、detail-404-403、social-insurance-state-flow、p1-split4-dirty-return）因团队未提交的 `DispatchedOrderService`/`WorkOrderValidationService` 构造参数签名变更报 TS2554/TS2345 编译失败，与本次单文件修改无关。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：`git status --short` 已检查；工作区存在大量团队既有未提交改动、截图/临时脚本、上传 Excel、`frontend/tsconfig.tsbuildinfo` 等，本任务不提交、不清理。
