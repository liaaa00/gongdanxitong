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

## 2026-06-10 · 入职导入模板与条件必填回归测试（integration 返工）
- 用户要求：业务员入职导入下载模板不再出现 `contract_feedback`、`onboarding_feedback`、`data_entry_feedback`、`contract_template`；`need_onboarding_contact` 仍必填；仅当 `need_onboarding_contact=是` 时要求 `feedback_deadline`、`is_common_template`，且 `template_name` 仅在 `need_onboarding_contact=是` 且 `is_common_template=是` 时必填。
- 是否覆盖旧规则：是。覆盖第 17 节中 `contract_template` 入职导入条件必填、以及 `is_common_template=是` 单独触发 `template_name` 必填的旧口径；新口径限定在业务员入职导入模板/导入校验，不全局停用后道反馈、详情、导出等字段。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节，写明入职导入模板四字段排除、新条件必填口径与非全局停用边界。
- 实现/测试覆盖：新增 `backend/src/modules/imports/import-template.service.ts` 并注册到 `ImportsModule`，`ImportsController` 提供模板下载入口，生成当前字段配置模板并仅对入职导入排除四字段；`backend/src/database/seeds/seed-fields.ts` 同步三字段条件必填 seed；`backend/src/modules/imports/field-validation.service.ts` 在入职导入校验中排除四字段并推断 `need_onboarding_contact` 相关条件必填；`frontend/src/services/workOrders.ts` 本地 mock 下载模板同步排除四字段；新增 `backend/test/import-template.service.spec.ts` 覆盖模板排除/保留/非入职不误伤；更新 `backend/test/import.service.spec.ts` 覆盖条件必填矩阵和 `contract_template` 入职忽略、非入职别名仍可用。
- 验证：`npx jest --config ./test/jest-unit.json --runInBand import-template.service.spec.ts import.service.spec.ts` 通过（2 个测试文件，23 条）；`.\回归测试.ps1 -BackendOnly` 通过（后端 build 成功）。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：`git status --short` 已检查；本次 integration 变更集中在导入模板/导入校验/seed/mock/文档和对应测试，未提交 `.spectrai`、上传 Excel、`frontend/tsconfig.tsbuildinfo`、dist 或临时文件。为运行 integration 后端测试临时创建的 `backend/node_modules` 目录联接未出现在 git status 中，不纳入提交。
