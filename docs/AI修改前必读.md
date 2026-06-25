# AI 修改前必读

> 目的：给后续 AI 会话或开发人员一个固定入口，避免长对话压缩后遗忘已确认规则。

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
