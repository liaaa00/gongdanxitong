# AI 修改前必读

> 目的：给后续 AI 会话或开发人员一个固定入口，避免长对话压缩后遗忘已确认规则。

## 0.5 禁止把归档与历史报告当作口径来源

`docs/archive/**`（含 `2026-Q3/`、`permission/`）以及任何根目录历史状态/交付报告，**只作历史留痕，一律不得作为端口、权限、统计口径、业务流程等任何"当前事实"的来源**。当前口径只认：

1. 端口/主机/路径：`config/env.ps1` 唯一事实源（漂移检查 `scripts/检查环境口径.ps1`）。
2. 业务规则：`docs/业务规则回归清单.md`。
3. 操作规范与入口：根 `AGENTS.md` → `docs/AI修改前必读.md` → `docs/project-rules/*`。
4. 现状：以代码 + 通过的回归测试为准；文档与代码冲突时先指出冲突再定稿。

如确需引用历史报告作证据，须在引用处标注"（归档，非口径）"。

## 1. 新会话第一步

每次开始修改代码前，必须先阅读：

1. `docs/业务规则回归清单.md`
2. `frontend/src/config/routeVisibility.ts`
3. 本次修改涉及页面或后端接口的现有测试

不要只依赖聊天上下文。

## 2. 规则优先级与冲突处理

规则优先级从高到低：

1. 用户当前最新明确要求。
2. `docs/业务规则回归清单.md` 中已确认且本次未被用户要求改变的规则。
3. Git commit、测试和历史文档。
4. AI 的对话记忆或推断。

当用户最新要求与业务规则回归清单冲突时，必须按以下流程处理：

1. 明确指出冲突点，例如：“当前规则清单写的是按派发/创建月份，但你这次要求按完成时间”。
2. 询问或确认用户是否要覆盖旧规则；如果用户已明确表达“就按这次改”，则视为确认。
3. 同步修改代码、测试、`docs/业务规则回归清单.md`。
4. 追加记录到 `docs/AI修改记录.md`，写明覆盖了哪条旧规则、commit 号和验证结果。
5. 跑固定回归测试，避免影响未被本次要求改变的旧规则。

注意：规则清单用于保护“用户本次没有要求改变”的旧规则，不得压过用户最新明确要求。

## 3. 修改前必须判断影响面

按修改类型检查影响范围：

### 状态相关
必须检查：
- 我的工单
- 团队工单
- 历史工单
- 入职/离职子工单页
- 子工单详情页
- 仪表盘
- 后端枚举、DTO、过滤逻辑

### 月份筛选/统计相关
必须检查：
- 我的已办
- 我的待办
- 历史工单
- 入职/离职主工单
- 入职/离职子工单
- 仪表盘

重点规则：工单流转统计按派发/创建月份，不默认按完成时间。

### 权限/菜单相关
必须检查：
- `frontend/src/config/routeVisibility.ts`
- `frontend/src/layouts/BasicLayout.tsx`
- 后端 `applyUserScope` 或对应 service 查询范围
- 角色菜单测试

### 上线账号/改密相关
必须检查：
- 登录后主布局顶部必须有可见“修改密码”入口，不通过新增业务菜单或改 `routeVisibility`/菜单矩阵实现。
- 登录响应、`/auth/me` 刷新恢复、mock refresh 必须同步 `mustChangePassword`/`must_change_password` 到前端状态；改密成功、退出登录时必须清除该标记。
- 首次登录默认密码账号需要进入改密链路；前端 `changePassword` 请求字段必须与后端 DTO 保持 `oldPassword` / `newPassword`。

### 全系统导航状态/列表状态相关
必须检查：
- 菜单点击是否优先回到该菜单上次停留的合法路径，且详情页可作为最近路径。
- 最近路径排除项是否覆盖登录、改密、403、404、新建、导入等临时动作页。
- 最近路径是否经过 `canAccessPath` / `routeVisibility` 兜底校验；无权限、无匹配路由或非法路径必须回退菜单默认 path。
- `/work-orders?orderType=onboarding` 与 `/work-orders?orderType=resignation` 的菜单高亮、展开、跳转和最近路径不能互相串。
- 列表状态是否尽量保留筛选、月份、页码、pageSize、视图模式、表头筛选等状态，且不跨列表污染。
- 子工单详情“返回列表”必须优先回到进入详情时的来源页；来源缺失、非法或当前角色不可访问时才回默认列表兜底。

### 表格筛选相关
必须检查：
- 列 `dataIndex/key`
- 前端 normalizeQuery / buildHeaderFilterParams
- 后端 DTO 是否允许该参数
- 后端 service 是否真正使用该参数过滤
- mock 服务是否同步支持

## 4. 修改原则

- 小步修改，一次只解决一类问题。
- 能改公共常量就不要多处硬编码。
- 改一个已确认规则，必须补测试。
- 不要用“临时兼容”覆盖业务规则。
- 不要为了让测试通过删除关键断言。
- 不要提交构建缓存、上传文件、临时目录。

## 5. 文件编辑规则

在 SpectrAI/Windows 环境中：

- 文本文件编辑优先使用 SpectrAI 文件工具，避免中文乱码。
- 不要用 shell 的 `echo >`、`cat >`、`sed -i` 写中文文件。
- PowerShell 读取可以用 `Get-Content -Encoding UTF8`。
- 搜索内容和文件列表使用 `rg`。

## 6. 固定回归命令

完整回归：

```powershell
.\回归测试.ps1
```

只跑前端：

```powershell
.\回归测试.ps1 -FrontendOnly
```

只跑后端：

```powershell
.\回归测试.ps1 -BackendOnly
```

快速模式（跳过 build，只跑关键测试）：

```powershell
.\回归测试.ps1 -SkipBuild
```

## 7. 固定前端关键测试

以下测试属于业务规则回归保护，不能随意删除：

- `src/layouts/BasicLayout.test.tsx`
- `src/config/routeVisibility.test.ts`
- `src/components/MultiViewTable/index.test.tsx`
- `src/utils/listPageState.test.ts`
- `src/pages/MyDispatched/index.test.tsx`
- `src/pages/MyDispatched/Detail/index.test.tsx`
- `src/pages/TeamDispatched/index.test.tsx`
- `src/pages/HistoryWorkOrders/index.test.tsx`
- `src/pages/WorkOrders/index.test.tsx`
- `src/pages/OnboardingModule/index.test.tsx`
- `src/pages/OnboardingModule/filterParams.test.ts`
- `src/pages/Dashboard/index.test.tsx`
- `src/pages/Login/index.test.tsx`
- `src/pages/ChangePassword/index.test.tsx`
- `src/services/authLoginRegression.test.ts`
- `src/services/auth.changePassword.test.ts`
- `src/utils/dispatchedDetailNavigation.test.ts`
- `src/utils/dispatchedStatusFilter.test.ts`

## 8. 提交前检查

提交前必须执行：

```powershell
git status --short
```

确认不要提交：

- `.spectrai/`
- `backend/uploads/excel/*.xlsx`
- `frontend/tsconfig.tsbuildinfo`
- `frontend/dist/`（如未被忽略）
- 其他临时文件

### 8.1 禁止破坏性 git 命令（2026-09-15 事故后规则）

- **严禁 `git reset --hard` 与 `git clean`**（含 `-fd`/`-xdf` 等任意变体）。这两条命令会无差别清除工作区**未提交的修改与未跟踪文件**，且往往波及"不纳入提交也不删除"的工具配置文件，git 对象库无残留、不可恢复。
- 回滚演练/临时验证：只用 `git revert`（必要时 `--no-commit`）并配合 `git revert --abort` 收尾；或**新建临时 worktree**（`git worktree add <path> <commit>`）在其中操作，结束后 `git worktree remove <path> --force`。
- 若确需丢弃自己的未提交内容，**先 `git stash` 或复制到仓库外目录**，不得直接 hard reset。
- 事故先例：`docs/AI修改记录.md` 2026-09-15 T02 节事故记录与 `docs/archive/2026-Q3-分组清单.md` 事故节（`git reset --hard HEAD` 误清 6 个工具 SKILL.md 未提交修改）。

### 8.2 仓库对象库损坏事故教训（2026-09-15 凌晨事故后规则）

2026-09-15 02:28，一个**并发进程**（非当前会话）将 `.git/objects` 批量删除至回收站，并把 `main` ref 改写到无关旧 commit，导致对象库损坏、历史链断裂（`79a6326`、`ce4a743` 两笔 commit 对象永久丢失）。经抢救（回收站复位 pack + `update-ref` 修复 ref + `hash-object -w` 内容寻址自愈），T02 树内容零丢失，但以下教训必须固化为规则：

1. **多 AI / 多进程并发操作同一仓库是根因**。任何会话在动 git 写操作（commit/checkout/stash/fetch）前，先 `git status` + `git worktree list` 确认没有其他自动化进程（如 `.spectrai-worktrees/**` linked worktree、其他 AI 窗口）正在共享同一对象库；发现并发迹象（ref 突然变动、对象消失、index.lock 争用）立即**冻结本会话一切 git 写操作**并上报，不得继续写。
2. **每日至少 `git push origin main` 一次**。本地对象库不是可靠备份——pack 可以被整体删除。每天开始工作前先 push，重要节点（每个任务组收尾）后立即 push，保持 GitHub 异地副本与本地差距 ≤ 1 天。
3. **发现 `.pack` / 松散对象消失，第一时间查回收站**。Windows 下进程删除文件默认进回收站，用 `Microsoft.PowerShell.Utility`/资源管理器在回收站中按原路径 `$R*` 条目复制回 `.git/objects/pack/`、`objects/xx/` 即可恢复，**不要**先重建仓库或重新 clone 覆盖现场。抢救前后各做 `git status` 快照与 `.git` 冷备份。
4. **锚点 tag 不删除**。历史断链的 tag（如 `governance/baseline-20260914`）保留作事故见证，另打新锚点 tag 续链；断链点用 lightweight tag（如 `governance/broken-chain-94649ed`）标注。
5. **未提交的跨天工作要落冷备份**。超过一个会话的交付（如 T03 九文件），除工作区外复制一份到仓库外目录（对象库损坏会连带丢失"只存在于工作区+未跟踪"的内容）。

## 9. 回复用户时要说明

每次修改完成后，回复里至少说明：

1. 改了什么
2. 为什么这样改
3. 跑了哪些测试/构建
4. commit 号
5. 是否有未提交的无关文件

## 10. 用户给新需求时的推荐提示

用户以后只需要说：

> 按项目回归清单处理。

AI 必须主动读取 `docs/AI修改前必读.md` 和 `docs/业务规则回归清单.md`。

## 11. 端口与环境口径（2026-09-14 治理阶段0）

本机局域网裸跑的端口/主机/路径唯一事实源是 `config/env.ps1`：

- PostgreSQL：`127.0.0.1:5433` / `ticket_system`（便携版实测端口，**不是** 5432）
- 后端 NestJS：`0.0.0.0:3000`，健康检查 `http://127.0.0.1:3000/api/health`
- 前端 Vite dev：`0.0.0.0:5173`，且 `strictPort: true`（占用即报错，不再静默漂移到 5178）

规则：

1. 任何脚本、配置、文档**不得再自行硬编码** 3000 / 5173 / 5433；根目录 `日常启动.ps1`、`快速启动.ps1`、`局域网启动.ps1`、`升级启动.ps1`、`停止系统.ps1` 必须先 `. config\env.ps1` 再引用变量。
2. 端口口径改动只允许改 `config/env.ps1` 一处，然后运行 `scripts\检查环境口径.ps1`（退出码必须为 0；加 `-Live` 可同时实测监听）。
3. Docker / Nginx 生产形态（容器内 `postgres:5432`、对外 `HTTP_PORT=8080`）是另一套命名空间，口径在根 `.env` 与 `docker-compose*.yml`，不要与本机裸跑口径混写。
4. 密码只存在于 `backend/.env`（已 gitignore）。新脚本需要数据库密码时用 `Get-TicketDbPassword` 读取，**绝不把真实密码写进任何入库文件**。

### 11.1 5173 被占用时如何定位占用进程

Vite 启不来（`strictPort` 报错退出）说明 5173 已有监听者。定位步骤：

```powershell
# 1) 看是哪个 PID 占了 5173
Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess

# 2) 把 PID 翻译成进程名 / 可执行路径 / 完整命令行
$pid5173 = (Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object -First 1).OwningProcess
Get-Process -Id $pid5173 | Select-Object Id,ProcessName,Path
(Get-CimInstance Win32_Process -Filter "ProcessId=$pid5173").CommandLine

# 3) 确认是自己的旧前端（命令行含 vite 或本项目路径）后，才精确停止该 PID
Stop-Process -Id $pid5173 -Force
```

- 启动脚本已内置同样逻辑：失败时会打印 `Port 5173 is held by <name> PID=<pid>` 与 executable/command line，并明确提示可用 `停止系统.ps1` 释放。
- 禁止用"批量杀所有 node"的方式腾端口（会误伤其他项目）；`停止系统.ps1` 只按 `config/env.ps1` 里的 3000/5173 精确处理。
- 若占用者是其他工具（如另一套 Vite/IDE 预览），改端口只能改 `config/env.ps1` 一处，并同步 `scripts\检查环境口径.ps1` 复验。

### 11.2 日常入口

| 场景 | 命令 |
|---|---|
| 只跑当前源码（不迁移、不种子） | `.\快速启动.ps1`（等价 `.\日常启动.ps1`，可加 `-Restart` 先停再起） |
| 作为服务器对外提供局域网访问 | `.\局域网启动.ps1`（构建 + 种子 + 起前后端） |
| 升级（备份 + 构建 + 迁移 + 种子） | `.\升级启动.ps1 [-StartAfterUpgrade]` |
| 停止应用（保留数据库） | `.\停止系统.ps1 [-StopPostgres]` |

