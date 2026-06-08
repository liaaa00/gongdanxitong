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
