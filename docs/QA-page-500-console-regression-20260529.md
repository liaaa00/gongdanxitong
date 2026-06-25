# 页面级 500 与控制台异常回归复测（2026-05-29）

任务：`6dafa8dc-d3b3-4900-b44e-455e596036f7`  
历史承接：`d4d764dc-e4d0-4c68-83d7-013aba5a74d0`  
工作目录：`d:/AI/SpeceAppDate/工单系统`  
复测时间：2026-05-29 15:44（Asia/Shanghai）

## 结论

本轮在用户反馈“重启后仍有页面点击 500 / 操作异常”的场景下，复用既有回归脚本做页面级和真实点击路径复测，**未稳定复现 500、操作异常或 `main.tsx [GlobalError] unhandledrejection`**。

- 5173 代理路径：通过。
- 3000 直连接口：健康检查通过，页面脚本内 direct API 登录/目标接口检查通过。
- 子工单 / 派工单 / 用户最新合同模块点击“查看/详情”路径：通过。
- 控制台仍有 React Router Future Flag、Antd Card bodyStyle、React findDOMNode deprecated 等 warning；这些 warning 没有关联到失败请求、页面 ErrorBoundary 或未处理 Promise。
- 本轮结论：**不阻塞当前 500 修复回归；若用户仍遇到 500，需要采集其具体账号、URL、请求 traceId、时间点和后端日志。**

## 可复现步骤

1. 确认运行服务在线：
   - `http://localhost:5173` 返回 200。
   - `http://localhost:3000/api/health` 返回 200。
2. 复用现有页面级脚本：
   - `node tmp/qa-page-500-regression.js`
   - 覆盖登录、仪表盘、我的派工、待处理工单、合同/对接/录入模块、团队派工、派工详情与补充日志。
3. 复用现有真实点击路径脚本：
   - `node tmp/qa-click-path-regression.js`
   - 覆盖 UI 登录后进入 `/onboarding/contract`，点击首个“查看”到详情，再从 `/my-dispatched` 点击详情。
4. 检查 `result.json`、截图和接口记录。

## 最新证据目录

- 页面级复测：`tmp/qa-page-500-2026-05-29T07-44-16-929Z/result.json`
- 页面级截图：同目录下 `dashboard.png`、`my-dispatched_list.png`、`my-dispatched_detail_first_contract.png`、`my-work_pending.png`、`onboarding_contract_module.png`、`onboarding_contact_module.png`、`onboarding_data_entry_module.png`、`team-dispatched.png`
- 真实点击路径：`tmp/qa-click-path-2026-05-29T07-44-50-398Z/result.json`
- 点击路径截图：同目录下 `01_dashboard_after_login.png`、`02_contract_click_view_detail.png`、`03_my_dispatched_click_detail.png`
- 脚本：`tmp/qa-page-500-regression.js`、`tmp/qa-click-path-regression.js`

## 接口结果摘要

### 页面级复测

- API 响应：72 个 HTTP 200。
- 500：0。
- 4xx：0。
- requestfailed：0。
- pageerror：0。
- unhandledrejection：0。
- 页面“服务器异常 / 操作异常 / Internal Server Error”文案：0。

关键接口均为 200：

| 场景 | 接口 | 状态 |
|---|---|---:|
| 用户反馈合同派工列表 | `/api/dispatched-orders?current=1&pageSize=20&module_code=contract&sort=dispatched_at&order=descend&page=1` | 200 |
| 我的派工待处理列表 | `/api/dispatched-orders?page=1&pageSize=20&sort=created_at&statuses=pending,processing` | 200 |
| 合同详情 | `/api/dispatched-orders/40024bce-ad05-4112-9295-3a6fc50fc4fb` | 200 |
| 详情补充日志 | `/api/dispatched-orders/40024bce-ad05-4112-9295-3a6fc50fc4fb/supplement-logs` | 200 |
| 对接模块列表 | `/api/dispatched-orders?current=1&pageSize=20&module_code=onboarding_contact&sort=dispatched_at&order=descend&page=1` | 200 |
| 录入模块列表 | `/api/dispatched-orders?current=1&pageSize=20&module_code=data_entry&sort=dispatched_at&order=descend&page=1` | 200 |
| 子工单/工单列表 | `/api/work-orders?current=1&pageSize=20&sort=created_at&order=descend&page=1` | 200 |

### 真实点击路径复测

- API 响应：26 个 HTTP 200、1 个 HTTP 201（登录）。
- 500：0。
- 4xx：0。
- requestfailed：0。
- consoleError：0。
- pageerror：0。
- unhandledrejection：0。
- 页面“服务器异常 / 操作异常 / Internal Server Error”文案：0。

关键点击路径接口均为 200：

| 点击路径 | 接口 | 状态 |
|---|---|---:|
| `/onboarding/contract` 点击首个“查看” | `/api/dispatched-orders?current=1&pageSize=20&module_code=contract&sort=dispatched_at&order=descend&page=1` | 200 |
| 合同详情 | `/api/dispatched-orders/40024bce-ad05-4112-9295-3a6fc50fc4fb` | 200 |
| 详情补充日志 | `/api/dispatched-orders/40024bce-ad05-4112-9295-3a6fc50fc4fb/supplement-logs` | 200 |
| `/my-dispatched` 点击详情 | `/api/dispatched-orders?page=1&pageSize=20&sort=created_at&statuses=pending,processing` | 200 |
| `/my-dispatched` 详情 | `/api/dispatched-orders/40024bce-ad05-4112-9295-3a6fc50fc4fb` | 200 |

## 控制台证据与分类

### 已消失 / 未复现

- `main.tsx:44 [GlobalError] unhandledrejection 未处理的 Promise 异常`：未复现。
- `main.tsx:49 [GlobalError] Promise 异常详情`：未复现。
- `Failed to load resource: the server responded with a status of 500`：未复现。
- 页面级 ErrorBoundary / pageerror：未复现。

### 仍出现但非阻塞

- React Router Future Flag warning：仍出现；属于 v7 未来行为提醒，未对应失败接口。
- Antd Card `bodyStyle` deprecated：页面级脚本中出现，浏览器以 console error 类型记录 warning 文本；未对应失败接口。
- React `findDOMNode` deprecated：页面级脚本中出现，来自 ProTable/Tooltip/ResizeObserver 组件链；未对应失败接口。

### 本轮未在最新点击脚本中复现

- Antd message static context warning：最新点击路径脚本未采集到；历史用户日志出现过，但本轮不影响页面操作成功。

## 与评审阻断项的处理

上一轮评审阻断点是 `integration_worktree_missing(status=not_initialized)` 与 `integration_task_state.status = integration state missing`，不是页面测试结果本身失败。本轮补充：

- 重新执行最新页面级与真实点击路径回归，生成当前时间的新证据目录。
- 将结果摘要固化为仓库内正式报告：`docs/QA-page-500-console-regression-20260529.md`。
- 明确列出脚本、截图、result.json 路径，便于集成视图或人工复核直接定位证据。
- 未修改业务代码；只新增/保留 QA 证据产物。

## 是否阻塞本轮修复

不阻塞。当前证据显示用户反馈的 500 与全局 Promise 异常路径在本环境不能稳定复现；剩余控制台项是 warning/deprecated 提醒，不是实际接口失败。建议后续若用户仍复现，按具体账号、操作 URL、接口 traceId、后端日志时间点继续定位数据相关或环境相关问题。
