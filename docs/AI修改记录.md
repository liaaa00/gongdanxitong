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

## 2026-06-10 · 劳动合同导出按电子签平台自动拆分
- 用户要求：劳动合同新签有速创/E签宝两套导出模板，点击导出时系统自动识别工单电子签平台并按对应模板导出；批量混选时不能用第一条工单模板套全部数据。
- 是否覆盖旧规则：否；补齐第 17 节“三套导出模板/电子签平台路由”的批量混合平台场景，保留发起人字段追加、`order_no`/`employee_id_card` 过滤和 `id_card_no` 表头口径。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节，写明劳动合同新签导出按 `extraData.esign_platform` 路由，混合批量按 `moduleCode + esign_platform` 拆分 sheet，非劳动合同模块不参与电子签平台路由。
- 实现/测试覆盖：`backend/src/modules/admin/export-templates/export-templates.service.ts` 单条导出和批量导出统一走劳动合同平台路由；批量导出从按 `moduleCode` 分组改为按 `moduleCode + signPlatform` 分组，并在操作日志记录 `exportGroups`。劳动合同缺少电子签平台或平台没有对应模板时明确报错，不再兜底到任意一套劳动合同共享模板。劳动合同速创/E签宝固定导出改为读取 `backend/src/assets/export-templates/` 下用户提供的标准 Excel 文件作为底板，在原工作簿中填充数据，保留原 sheet 结构、表头行、隐藏行、合并单元格、隐藏选项 sheet 和样式；后台导出模板配置仍通过 `seed-export-templates.ts` 写入两套共享模板元数据，管理员可看到并编辑“劳动合同签订批导出模板-速创”和“劳动合同签订批导出模板-e签宝”，本轮已将手写字段配置校准到标准 Excel：速创 37 列、E签宝 30 列，去除标准模板不存在的“发起人”列，并修正“身份证号/证件号”表头文案。清理 ExcelJS 无法稳定回写的数据验证规则，避免模板原有超大验证范围导致导出失败。新增 `backend/test/export-template-platform-routing.spec.ts` 覆盖速创/E签宝混选批量导出分别匹配共享模板、按标准模板 sheet 填数、E签宝绑定行隐藏，以及缺失平台时不误导出任意合同模板。
- 验证：`npx jest --config ./test/jest-unit.json --runInBand export-template-platform-routing.spec.ts` 通过；`npx jest --config ./test/jest-unit.json --runInBand export-template` 通过（4 个测试文件，15 条）；`npx tsc --noEmit -p tsconfig.json` 通过。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：已执行 `git status --short` 检查；工作区存在大量历史/他人无关改动、截图、上传 Excel 和临时文件，本次未清理也不纳入本次说明范围；本次相关文件为导出服务、导出平台路由测试和两份 docs。

## 2026-06-10 · 字段与模板配置中心及导入模板配置入口
- 用户要求：后台原“办理环节设置 / 表单字段库 / 字段可填设置”过于割裂，不能集中管理系统字段、子工单字段和导入模板；希望按新的“字段与模板配置中心”结构配置，并新增可查看/下载入职、离职导入模板的入口。
- 是否覆盖旧规则：否；本轮只调整后台配置菜单表达和补齐导入模板配置入口，不改变既有业务数据范围、工单状态、月份口径、导出平台路由或导入校验规则。
- 同步更新规则文档：未修改 `docs/业务规则回归清单.md`；本次没有新增业务口径，仅在 `docs/AI修改记录.md` 记录实现与验证。
- 实现/测试覆盖：`BasicLayout` 将后台配置拆为“字段与模板配置”（系统字段库、导入模板配置、子工单字段配置、字段权限配置、导出模板配置）和“流程与派发配置”（负责人派发设置、流程版本配置）；新增 `/admin/import-templates` 路由和管理员权限矩阵；新增 `frontend/src/pages/Admin/ImportTemplates/index.tsx`，按入职/离职查看当前模板字段、必填/条件必填、下拉选项、提示文案，并调用后端真实导入模板下载接口；`frontend/src/services/fields.ts` 兼容后端 `conditionalRequired` 字段；恢复 `/my-work/*` 角色权限常量矩阵，避免后台菜单改动误伤“我的工单”；顶部恢复可见“修改密码”按钮，同时保留用户名下拉改密项。
- 验证：`frontend` 下 `npx tsc -b --noEmit` 通过；`npm test -- --run src/layouts/BasicLayout.test.tsx src/config/routeVisibility.test.ts` 通过（2 个测试文件，33 条）。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：已执行 `git status --short` 检查；工作区存在大量历史/他人无关改动、截图、上传 Excel、临时脚本和 `frontend/tsconfig.tsbuildinfo`，本次未清理也不纳入本次说明范围；本次相关文件集中在 `BasicLayout`、`routes`、`routeVisibility`、导入模板页面、字段/工单服务和对应测试/记录。

## 2026-06-10 · 导出模板字段来源改为系统字段库
- 用户要求：导出模板配置弹窗里的“选择导出字段”字段太少，需说明字段来源并按建议改为从系统字段库获取；同时保留导出模板可编辑、可新增空值字段/默认值字段，满足子工单导出模板中存在入职导入模板之外字段的场景。
- 是否覆盖旧规则：否；本轮只调整导出模板配置页的字段选择来源和前端字段加载方式，不改变劳动合同速创/E签宝平台路由、导出模板保存结构、工单权限、菜单矩阵、状态流或月份口径。
- 同步更新规则文档：未修改 `docs/业务规则回归清单.md`；本次没有新增业务口径，仅在 `docs/AI修改记录.md` 记录实现与验证。
- 实现/测试覆盖：`frontend/src/pages/Admin/ExportTemplates/index.tsx` 去除写死的 `FIELD_OPTIONS`/`ALL_FIELDS`，改为调用系统字段库 `getFields()`，按当前适用模块动态分组展示字段；`frontend/src/pages/Admin/ExportTemplates/fieldList.ts` 提供 `buildExportFieldOptions`、模块适用过滤、字段去重、中文名覆盖和导出虚拟字段 `created_by_name/发起人`；保留右侧已选字段编辑、顺序调整、空值列和默认值列能力；`frontend/src/services/fields.ts` 改为分页拉取全部字段，避免系统字段超过 100 条时仍缺字段；`fieldList.test.ts` 新增动态字段来源、发起人虚拟字段、模块过滤、停用字段过滤和“证件号码”名称覆盖测试。
- 验证：`frontend` 下 `npx tsc -b --noEmit` 通过；`npm test -- --run src/pages/Admin/ExportTemplates/fieldList.test.ts` 通过（1 个测试文件，6 条）；`npm test -- --run src/layouts/BasicLayout.test.tsx src/config/routeVisibility.test.ts src/pages/Admin/ExportTemplates/fieldList.test.ts` 通过（3 个测试文件，39 条）。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：已执行 `git status --short` 检查；工作区存在大量历史/他人无关改动、截图、上传 Excel、临时脚本和 `frontend/tsconfig.tsbuildinfo`，本次未清理也不纳入本次说明范围；本次相关文件为导出模板页面、字段工具、字段服务、导出模板字段测试和本记录。

## 2026-06-10 · 导入模板改为真正字段配置表
- 用户要求：导入模板页面不能只是查看和下载，应改为真正的导入模板字段配置表，可配置字段、顺序、表头和必填覆盖，并用于导入。
- 是否覆盖旧规则：否；保留入职导入排除 `contract_feedback`、`onboarding_feedback`、`data_entry_feedback`、`contract_template` 以及离职减员表默认字段口径，只把字段来源改为配置表优先。
- 同步更新规则文档：已更新 `docs/业务规则回归清单.md` 第 17 节，明确 `import_template_fields` 配置表优先，下载、预览候选字段、确认校验必须同源读取。
- 实现/测试覆盖：新增 `ImportTemplateField` 实体和 `CreateImportTemplateFields` 迁移；新增 `ImportTemplateConfigService`，导入模板下载、导入预览候选字段、导入确认校验都优先读取配置表；新增管理员接口 `GET/PUT /work-orders/import/template-config` 和 `GET /work-orders/import/template-config/available-fields`；前端新增 `services/importTemplates.ts`，后台“导入模板配置”改为可保存配置表，支持添加/移除字段、排序、Excel 表头别名、必填覆盖、下载当前模板。
- 追加调整：按用户要求将 `email / 电子邮件` 字段扩展到离职业务域，新增迁移更新既有库 `field_configs.business_context`，并同步前端 mock 的 `business_context` 过滤，确保离职导入模板配置页可搜索并添加邮箱字段。
- 验证：`backend` 下 `npx jest --config ./test/jest-unit.json --runInBand import-template-config.service.spec.ts import-template.service.spec.ts import.service.spec.ts` 通过（3 个测试文件，30 条）；`backend` 下 `npx tsc --noEmit -p tsconfig.json` 通过；追加后 `backend` 下 `npx jest --config ./test/jest-unit.json --runInBand import-template-config.service.spec.ts` 通过；`frontend` 下 `npm test -- --run src/pages/Admin/ImportTemplates/index.test.tsx` 通过（1 个测试文件，3 条）；`frontend` 下 `npx tsc -b --noEmit` 通过；`frontend` 下 `npm test -- --run src/layouts/BasicLayout.test.tsx src/config/routeVisibility.test.ts src/pages/Admin/ImportTemplates/index.test.tsx` 通过（3 个测试文件，36 条）。
- 代码提交：未提交，待 Leader 汇总。
- 未提交无关文件：待提交前检查；工作区已有大量历史/他人无关改动、截图、上传 Excel 和临时文件，本次不清理不纳入提交范围。

## 2026-06-11 · 新建根目录 CLAUDE.md 作为规则强制入口
- 用户要求：每次只让 AI 改一个错误，AI 有时会顺手动到之前已完成的成果；已建 `docs/AI修改前必读.md`、`docs/业务规则回归清单.md`、`docs/AI修改记录.md` 三份文档但效果不佳，要求分析原因并给出更好方法。
- 根因诊断：上述三份文档（以及 `docs/project-rules/CLAUDE.md`）都在 `docs/` 下，Claude Code 新会话只会自动加载“项目根目录”的 `CLAUDE.md`，因此这些规则永远不会被自动读取；而“必须先读这些文档”的指令本身也写在没被读的文件里，形成死循环。每个新会话的 AI 失忆进场、只靠聊天上下文，自然会碰到旧成果。
- 是否覆盖旧规则：否；未改动任何既有文档内容与业务口径，仅新增一个自动加载入口指向既有文档。
- 同步更新规则文档：新增项目根目录 `CLAUDE.md`（约 50 行极简入口），内容为：动手前按顺序读 `docs/AI修改前必读.md`、`docs/业务规则回归清单.md`、`docs/project-rules/CLAUDE.md` 和相关测试；固化“最小改动铁律”（只改用户本次明确指定内容）；固化“改前先回报落点和影响面”；改后留痕+跑 `回归测试.ps1`；以及四级优先级。未修改 `docs/业务规则回归清单.md`，无新增业务口径。
- 实现/测试覆盖：仅新增文档文件，无代码与测试改动。
- 验证：无需构建/测试；机制是否生效以后续新会话能否一进场即遵守“先读 docs 规则、只改指定内容”为准。保持根 `CLAUDE.md` 短小是其被严格执行的关键。
- 代码提交：未提交，待用户决定。
- 未提交无关文件：本次仅涉及新增根目录 `CLAUDE.md` 与本记录追加，未触碰其他文件。

## 2026-06-11 · 修复按固定模板导出导致后端假死（治标）
- 用户要求：点击"劳动合同签订批导出模板-速创.xlsx"固定模板导出后后端假死（无响应），先只诊断不擅自重启或改代码，确认后批准"先做治标"，修好再重启假死后端。
- 根因诊断：速创模板主表"劳动合同批导入模板2026-05-26"含一个数据校验范围拉到 XFD（第16384）列、覆盖约 1,616,368 个单元格的超大 data validation。ExcelJS `writeBuffer` 写出时算出列索引 16385，稳定抛 `16385 is out of bounds`，且该异步错误未被捕获，拖死 event loop，导致后端 TCP 端口仍监听但所有 HTTP 请求超时（PID 8836 假死、堆积约 186 个卡住连接、内存钉约 861MB）。原 `clearWorksheetDataValidations` 逐格 getCell+delete 遍历约 120 万次（约 1.2 秒、阻塞 event loop），且 `copyDataRowShape` 把源格 dataValidation 逐格复制回数据行，清了又被引回。
- 是否覆盖旧规则：否；回归清单第 255 条"因 ExcelJS 兼容限制无法写出的数据验证规则可清理，但不得改变可见模板结构和字段列序"正好允许本方案，未改变模板结构/字段列序/平台路由。
- 同步更新规则文档：未修改 `docs/业务规则回归清单.md`，无新增业务口径，仅在本记录追加。
- 实现/测试覆盖：仅改 `backend/src/modules/admin/export-templates/export-templates.service.ts` 三处：(1) `clearWorksheetDataValidations` 从逐格遍历改为一次性 `dataValidations.model = {}`（止血点）；(2) `copyDataRowShape` 删掉把源格 `dataValidation` 逐格复制到数据行那行（清了又被引回的元凶）；(3) 新增 `writeWorkbookBuffer` 辅助方法把两处 `workbook.xlsx.writeBuffer()` 包进 try/catch，失败抛 `InternalServerErrorException`，杜绝未捕获异步错误拖死进程。`appendWorkbookSheets` 仍复制 dataValidation 但其读取的源表已被前置清空，sourceCell.dataValidation 返回 undefined，按最小改动保持不动。
- 验证：`npx tsc --noEmit` 零错误；查 ExcelJS 源码确认 `DataValidations.model` 是无缓存实例属性、worksheet 序列化直接读该属性，赋空对象即清空全部校验；真实速创模板端到端复刻：主表 1,616,368 项校验一次性清空为 0，`writeBuffer` 42ms 成功写出约 15KB，不再抛 `16385 out of bounds`。临时验证脚本已删除。
- 代码提交：未提交，待用户决定。
- 未提交无关文件：本次仅改动 `export-templates.service.ts` 与本记录追加；工作区另有上轮遗留的 `.gitignore`、`frontend/tsconfig.tsbuildinfo`、新增 `CLAUDE.md` 等，不属于本次范围。
- 遗留事项：治本（清理或修复速创模板源文件本身那约 161 万项越界校验）是否做、何时做尚未拍板，约定治标稳定后单独决定；治本改的是只读二进制资产，需先确认校验非业务需要，且挡不住管理员重新上传脏模板复发。

## 2026-06-11 · 修复劳动合同子工单批量导出无法按电子签平台拆分多文件
- 用户要求：劳动合同模块子工单批量导出时，应按电子签平台拆成两个不同模板文件（速创模板 vs E签宝模板），但实际所有数据被并到同一文件，拆分逻辑失效；定位并修复（最终选定方案 A：改后端补字段，前端零改）。
- 根因诊断（接口/数据库/代码三方比对）：前端 `handleBatchExport` 按 `row.extra_data?.esign_platform` 分组发请求，但子工单列表接口的 `toListItem`（`dispatched-order.service.ts`）从不返回 `extra_data` / `esign_platform`，导致所有数据归为「未指定平台」单一组，只发一次 batch-export 请求，按平台拆多文件逻辑从未生效。
- 是否覆盖旧规则：否；纯缺陷修复，使行为回归到设计预期，未改动任何既有业务口径与字段语义。
- 同步更新规则文档：未修改 `docs/业务规则回归清单.md`，无新增业务口径，仅在本记录追加。
- 实现/测试覆盖：仅改两处——(1) `dispatched-order.service.ts` 的 `toListItem` 末尾补 `extraData` / `extra_data`，取自 `order.parentOrder.extraData`，与详情接口（`toDetailItem`）、导出后端口径完全一致；(2) `dispatched-order.types.ts` 的 `DispatchedOrderListItem` 接口加 `extraData?` / `extra_data?` 可选声明。前端零改动。
- 验证：`npx tsc --noEmit` 零错误；后端 build 后重启（PID 21928 监听 3000）加载新代码；列表接口实测正确返回 `extra_data`，平台分布 E签宝 5 + 速创 5；端到端导出二次下载确认两文件模板完全不同（速创组约 16.9KB / 13 sheet，E签宝组约 9.4KB / 1 sheet）；`回归测试.ps1 -SkipBuild` 前端 10 套件 76 用例全过。
- 代码提交：未提交，待用户决定。
- 未提交无关文件：本次仅改 `dispatched-order.service.ts`、`dispatched-order.types.ts` 与本记录追加；工作区另有上轮遗留的 `.gitignore`、`http-exception.filter.ts`、`export-templates.service.ts`、`OnboardingModule/*`、`frontend/tsconfig.tsbuildinfo`、新增 `CLAUDE.md` 等，均不属于本次范围。已清理本次及前序诊断遗留的临时产物 `backend/_repro_export.js`、`field_configs_custom.csv`、`import_template_fields.csv`、`local_import_template_field_codes.txt`。

## 2026-06-11 · 单条新增入职工单表单排除后道反馈字段，与导入模板字段口径对齐
- 用户要求：入职模块「单条新增」表单里仍出现「入职联系反馈」「劳动合同签订反馈」「增员报岗录入反馈」等后道字段，与已修好的批量导入模板字段不一致；要求让单条新增与导入模板字段口径保持一致。
- 根因诊断：`frontend/src/pages/WorkOrders/New/index.tsx` 直接把 `getFields`/`getFallbackFields` 的字段全集交给 `DynamicForm`，`DynamicForm` 只按 `order_type`/`collection_group` 过滤，不排除后道办理岗反馈字段。而入职导入模板早已在 `services/workOrders.ts` 用 `ONBOARDING_IMPORT_TEMPLATE_EXCLUDED_FIELD_CODES` 排除 `contract_feedback`/`onboarding_feedback`/`data_entry_feedback`，两边口径不一致。这三个反馈字段的 help_text 均写明「由子工单办理岗在子单完成时填写」，本不属于业务员发起表单。
- 是否覆盖旧规则：否；与回归清单第 17 条「业务员入职导入不输出后道反馈/处理字段」口径一致，把同一排除规则补到发起表单场景，未改动任何既有业务口径、字段语义或子工单详情（办理岗仍可填反馈）。
- 同步更新规则文档：未修改 `docs/业务规则回归清单.md`，无新增业务口径，仅在本记录追加。
- 实现/测试覆盖：仅改 `WorkOrders/New/index.tsx`——新增并导出常量 `AGENT_INITIATED_EXCLUDED_FIELD_CODES`（三个反馈字段）与纯函数 `excludeBackofficeFeedbackFields`，在 `setAllFields` 前对 admin/非 admin 两条取字段路径统一过滤；`contract_template` 等发起阶段字段不在排除集合中，保持保留。新增测试 `WorkOrders/New/excludeFeedbackFields.test.ts`（4 用例）：断言排除集合与导入模板一致、从入职全集剔除三反馈字段、不误伤发起阶段字段（contract_template/payroll_location/special_remark/need_onboarding_contact）、对离职字段无副作用。
- 验证：`npx tsc --noEmit` 零错误；新增测试 4 用例全过；`回归测试.ps1 -FrontendOnly` 回归。
- 代码提交：本次随最终结果一并提交。
- 未提交无关文件：本次仅改 `WorkOrders/New/index.tsx` 与新增测试、本记录追加。
