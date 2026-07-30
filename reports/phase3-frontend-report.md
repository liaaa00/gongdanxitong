# 阶段3前端交付报告

## 完成范围

- 北仑/省外切换器使用 `localStorage` 键 `business_scope_v1` 持久化，切换仅控制前端菜单和落地路由。
- 省外列表、导入、表单占位路由已从隐藏范围解禁，并沿用集中式角色/权限矩阵。
- 省外增减员列表与批量导入复用现有表格、Excel 导入组件模式。
- `OutOfProvinceForm` 仅保留业务字段清单待提供的 TODO，未使用入职/离职模板顶替。

## 数据隔离

- 未向 `appStore` 或其他 store 引入 `businessScope`。
- 省外 API 请求显式携带 `businessScope=out_of_province`。
- 列表响应必须逐行提供 `businessScope`；缺失时拒绝展示，北仑数据不会进入省外列表。

## 待联调

已按 `reports/phase3-architect-contract.md` 对齐两个精确 `OrderType`、`business_scope_v1`、专用 `/out-of-province-orders` 列表与 `/import/preview|confirm` 路径。后端省外 Controller 尚未合入 integration；分页 DTO、导入轮询与错误报告扩展仍需在后端就绪后联调。单项表单继续等待业务侧提供菜鸟模板/浙江自签字段清单。

## 验证

- Vitest：4 个文件，51 个测试通过。
- Production build：`tsc -b && vite build` 通过。
- ESLint：0 error，10 个项目既有 warning。
- Playwright：本机 Edge + 当前 worktree Vite 服务，关键交互 1/1 通过。
- 固定回归：根目录脚本通过；前端关键业务 10 个文件、110 个测试与前端 build 通过，按锁文件补齐本 worktree 后端依赖后 backend-only build 通过。
