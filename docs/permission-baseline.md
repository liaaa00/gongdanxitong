# 权限与派发配置基线

## 目的

该基线用于证明一次代码优化没有静默改变现有用户权限、字段权限、负责人或派发配置。

检查工具只使用 PostgreSQL `SELECT`，并在 `READ ONLY` 事务中运行。它不会修改数据库，也不会自动修复或覆盖任何配置。

## 受保护范围

- 用户启停状态与 `group_code`
- 角色和部门
- 用户多角色及主角色关系
- 字段权限
- 角色动作权限的数据库覆盖配置
- 模块共同负责人和模块主管
- 客户指定负责人
- 派发规则
- 模块派发策略与 SLA
- 模块字段配置
- 客户负责人关系

基线不保存密码、密码哈希、令牌、手机号、邮箱、登录时间、创建时间和轮询游标。

## 日常检查

在 `backend` 目录执行：

```powershell
node scripts/permission-baseline.js check
```

完全一致时返回退出码 `0`。存在差异时返回退出码 `1`，并列出发生变化的用户、角色、模块或规则分组。

只查看当前摘要：

```powershell
node scripts/permission-baseline.js summary
```

输出当前完整快照 JSON，但不写文件：

```powershell
node scripts/permission-baseline.js print
```

## 固定流程

每次不涉及权限的优化必须执行：

1. 修改前运行 `check`，确认数据库与基线一致。
2. 只修改已确认范围内的代码。
3. 运行相关单元测试、构建和权限回归测试。
4. 修改后再次运行 `check`。
5. 修改前后必须都返回一致，才允许提交或部署。

## 允许更新基线的条件

只有管理员明确批准了角色、字段权限、负责人或派发配置变更后，才能更新基线。

更新前必须：

1. 备份相关数据库表。
2. 保存变更原因和批准人。
3. 运行 `print` 并审查变化区段。
4. 使用受控文件工具替换 `backend/baselines/permission-baseline.json`。
5. 单独审查基线文件的 Git 差异。
6. 重新运行 `check` 确认一致。

禁止为了让测试通过而直接接受未知差异，也禁止脚本自动修改数据库或自动刷新基线。

## 代码权限回归

数据库基线不能替代代码权限测试。涉及前端路由、后端守卫或角色动作时，还必须运行：

```powershell
# backend
.\node_modules\.bin\jest.cmd --config .\test\jest-unit.json --runInBand --runTestsByPath test/role-action-permission-baseline.spec.ts test/admin-route-permissions.spec.ts test/admin-field-permission-matrix.spec.ts

# frontend
.\node_modules\.bin\vitest.cmd run src/config/routeVisibility.test.ts
```

数据库基线保护实际配置，代码权限测试保护路由、守卫和默认权限逻辑，两者必须同时通过。
