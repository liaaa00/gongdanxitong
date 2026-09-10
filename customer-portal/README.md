# Customer Portal（客户门户）

本目录是独立于内部工单系统的 B 端客户门户。客户使用后台配置的邮箱和密码登录，按账号授权填写增员、减员和薪资确认资料，查询自己的办理进度和结果；内部规则、审核、派单与办结仍由工单系统负责。

> 状态更新于 2026-09-11：D 盘主项目第二阶段功能已通过本机综合验收。增员、减员真实数据库全流程、自动通知专项和浏览器验收通过，网关迟到回执与日志恢复问题已修复；完整回归 687 项及前后端构建通过。正式配置、客户试点和生产上线验收仍待落实。

## 当前实现范围

### 已实现的功能

- 客户工作台及入职、离职、薪资三个入口。
- 入职四步表单：基本信息、合同相关信息、社保公积金、银行卡与确认；合同工资在合同信息填写，其他工资项目支持文字说明。
- 试用期选填，合同日期不会自动启用试用期；主动填写试用期时校验配套日期、月数和工资。
- 手机号、日期、银行卡号、开户地等基础格式校验。
- 真实邮箱密码登录、账号启停、重置密码、首次强制改密和最近登录时间；权限固定为“增减员”和“薪资”两项，增减员同时覆盖入职与离职。
- 客户 UUID 与账号权限由后端签名会话校验，停用、改密和权限变更使旧会话失效；客户名称、编码不作为身份匹配依据。
- 门户通过网关 SSE 和内网连接器访问受控后端接口；增员、减员资料进入真实待审核草稿并返回真实受理记录与工单号。
- 内部审核认领、补资料、按既有规则派单、子工单办结、门户结果回传已串联；缺少配置不会绕过审核自动派单。
- 薪资按“本系统受理、内部办理、结果回传”执行，支持当月发当月或上月的所属期配置；外部薪资系统稍后接入。
- `requestId` 幂等缓存、重复点击保护、提交中状态和失败重试。
- 三类附件统一走共享邮箱，先持久化材料与投递任务；缺少邮箱配置或投递失败时保留真实失败状态，不将“已受理”显示为“邮件已送达”。
- 入职、离职批量导入必须使用系统标准 Excel 模板；预览阶段校验模板，非标准模板直接拦截。
- 客户规则支持 UUID 批量 Excel、逐行成功/失败明细、历史可信规则带入、缴纳地与商社差异规则及待提交草稿补齐；人工配置优先。
- 入职、离职、薪资办结结果邮件支持收件人配置、结果附件、持久化队列、发送状态和失败重试。
- 自动账号开通通知、每月薪资收集通知、固定账单日前 3/2/1 个工作日提醒已实现；前 3/2 天发给有效薪资账号，前 1 天通知客户对应业务员；该期已提交后停止催办。
- 管理员可维护节假日与调休工作日、通知模板和签名，查看通知队列并重试失败通知；账号通知不包含密码或令牌。
- 门户全过程监控管理员页面与 API 已实现，可查看网关、连接器、后台受理和结果回传状态。
- 门户视觉主色已统一为天蓝色系，避免附件、导入工具与原有表单出现色调割裂。


### 已验证与仍待验收

- 增员、减员已通过真实本机 PostgreSQL 的“受理 → 审核认领 → 补资料 → 既有派单 → 子单办结 → 门户真实结果”全流程；办结邮件只验证入队，没有外发。
- 自动通知在真实本机 PostgreSQL 验证 9 项通过，包括本机 SMTP 接收器模拟 `451` 失败及一次重试成功；普通客户调度测试使用事务回滚，没有向真实联系人发信。
- 监控 API 已与真实网关、后台及门户响应核对，两条已完成受理的监控状态为 `returned`，表示结果已回传，不代表业务工单被退回。
- 真实浏览器已验证审核认领、补资料、保存、派单、账号登录、门户结果、通知设置、模板预览、日历保存/恢复、提醒计算、通知队列及监控成功/失败状态。网关按轮次关联回执，ACK 后重启可恢复在途请求；门户 50 项测试通过。
- 根目录完整回归通过：前端 261 项、后端 376 项、门户 50 项；前后端生产构建通过。本机验收不能替代正式邮箱、客户试点和生产部署验收。
- 正式 SMTP、门户网址、年度节假日、正式客户收件人、客户试点和生产部署尚未完成；邮箱按用户要求留待后续配置，默认保持 `MAIL_ENABLED=false`。
- 外部薪资或数创对接尚未完成；现有薪资受理和内部办结能力不依赖这些外部系统。

历史说明中的“只有演示登录”“状态回传尚未实现”“自动提醒与日历尚未实现”等描述已过时，不能作为当前功能事实。

更完整的完成度和排期见：

- `docs/current-status-and-plan.md`
- `docs/onboarding-field-mapping.md`
- `docs/completion-result-email.md`
- `docs/business-rules-final.md`

## 办理规则配置

内部工单“客户门户配置 → 办理规则与通知”支持下载带客户 UUID、编码、名称和现有规则的批量 Excel，逐行显示导入成功/失败，以及从历史入职、离职工单补齐可信规则。导入只按 UUID 匹配；空白保留已有值；历史带入不覆盖人工配置、不推测账单日或邮箱。提醒固定为 3/2/1 工作日，办结邮件固定覆盖三类业务。

本机验收数据库为 `127.0.0.1:5433/ticket_system`。主项目和门户均从 `D:/AI/SpeceAppDate/工单系统` 运行；旧 C 盘工作树只保留为来源，不作为最新版运行目录。

## 环境要求

- Node.js 20 或更高版本。
- 可访问现有内部工单 API 的连接器运行环境。
- 一个长度至少 32 个字符的 `PORTAL_LINK_SECRET`。

门户项目无第三方 npm 依赖，不需要执行 `npm install`；内部工单后端保留自身依赖。

监控启用时，后端、Node 网关和连接器必须使用同一个强随机 `CONNECTOR_TOKEN`（至少 16 位，不能使用默认测试值）。网关与连接器需同步更新，以支持逐轮 `attemptId` 回执校验。网关默认在 `customer-portal/.codex-monitor` 保存追踪元数据，可用 `PORTAL_MONITOR_STATE_DIR` 指定可持久化目录；不能把该目录当浏览器缓存清理。正式邮件仍通过现有后端邮件环境配置启用，未配置时保持 `MAIL_ENABLED=false`。

## 本地启动

请分别打开三个 PowerShell 终端，在 `customer-portal` 目录执行。

### 1. 启动网关

```powershell
$env:CONNECTOR_TOKEN = 'replace-with-a-strong-shared-token'
$env:PORTAL_ALLOWED_ORIGIN = 'http://127.0.0.1:5183'
$env:PORTAL_HOST = '127.0.0.1'
$env:PORTAL_PORT = '18082'
npm run start:gateway
```

默认监听 `0.0.0.0:18080`。可通过 `PORTAL_HOST`、`PORTAL_PORT` 修改。

### 2. 启动内网连接器

```powershell
$env:GATEWAY_URL = 'http://127.0.0.1:18082'
$env:CONNECTOR_TOKEN = 'replace-with-a-strong-shared-token'
$env:PORTAL_LINK_SECRET = 'replace-with-at-least-32-characters'
$env:LOCAL_BACKEND_URL = 'http://127.0.0.1:3010'
npm run start:connector
```

账号门户使用 `/api/portal-auth/*` 与 `/api/customer-portal/*`，无须设置 `PORTAL_BACKEND_TOKEN`；客户身份与权限由后端签名会话校验。

### 门户受控接口

浏览器只访问以下网关路径，不直接暴露内部 /api/*：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | /portal/onboarding | 创建入职草稿，返回真实 workOrderId / 工单号 |
| POST | /portal/attachments/shared-email | 入职、离职、薪资附件统一提交到共享邮箱 |
| POST | /portal/resignation/import/preview | 校验离职标准 Excel 并返回预览 |
| POST | /portal/resignation/import/confirm | 确认离职标准 Excel 导入任务 |

门户附件通过共享邮箱受理与投递链路处理，不向客户开放内部工单附件 API；后续材料核验仍由内部人员负责。自动 OCR 匹配和归档不在本次已验证能力中。

### 3. 启动门户页面

```powershell
$env:PORTAL_GATEWAY_URL = 'http://127.0.0.1:18082'
$env:PORTAL_WEB_PORT = '5183'
npm run start:web
```

D 盘主项目本地验收实例访问 `http://127.0.0.1:5183/`，对应最新版内部后端 `http://127.0.0.1:3010`、最新版内部前端 `http://127.0.0.1:5182` 和客户门户网关 `http://127.0.0.1:18082`。默认端口仍为 5173，可通过 `PORTAL_WEB_HOST`、`PORTAL_WEB_PORT` 修改。

## 创建测试客户签名链接

客户 ID 必须是 UUID，过期时间使用未来的 Unix 秒时间戳：

```powershell
$env:PORTAL_LINK_SECRET = 'replace-with-at-least-32-characters'
$env:PORTAL_CUSTOMER_ID = '11111111-1111-4111-8111-111111111111'
$env:PORTAL_CUSTOMER_NAME = '演示客户有限公司'
$env:PORTAL_CUSTOMER_CODE = 'DEMO001'
$env:PORTAL_LINK_EXPIRES_AT = [DateTimeOffset]::UtcNow.AddDays(7).ToUnixTimeSeconds().ToString()
$token = npm run --silent create:portal-link
```

用编码后的令牌打开门户：

```powershell
$url = 'http://127.0.0.1:5183/?token=' + [Uri]::EscapeDataString($token.Trim())
Start-Process $url
```

登录页调用真实门户账号接口。先在内部“客户门户配置 → 门户账号”创建账号，再使用邮箱和密码登录；账号停用或密码错误时拒绝登录。

## 主要环境变量

| 变量 | 使用方 | 说明 |
|---|---|---|
| `PORTAL_GATEWAY_URL` | Web | 浏览器提交使用的网关地址 |
| `PORTAL_WEB_HOST` / `PORTAL_WEB_PORT` | Web | 页面服务监听地址；当前本地最新版使用 `127.0.0.1:5183`，默认端口仍为 5173 |
| `PORTAL_HOST` / `PORTAL_PORT` | Gateway | 网关监听地址；当前本地最新版使用 `127.0.0.1:18082`，默认 `0.0.0.0:18080` |
| `PORTAL_ALLOWED_ORIGIN` | Gateway | CORS 允许来源，正式环境禁止使用 `*` |
| `CONNECTOR_TOKEN` | Gateway / Connector | 网关与连接器共享密钥，两端必须一致 |
| `GATEWAY_URL` | Connector | 连接器访问的网关地址 |
| `PORTAL_LINK_SECRET` | Connector / Link script | 签名及验证客户链接，至少 32 字符 |
| `LOCAL_BACKEND_URL` | Connector | 内部工单服务根地址；当前本地最新版使用 `http://127.0.0.1:3010`，不要指向旧工单服务的 3000 端口 |
| `PORTAL_BACKEND_TOKEN` | Connector | 调用内部工单 API 的 Bearer Token |
| `PORTAL_CUSTOMER_ID` | Link script | 客户 UUID |
| `PORTAL_CUSTOMER_NAME` | Link script | 客户名称 |
| `PORTAL_CUSTOMER_CODE` | Link script | 客户唯一代码 |
| `PORTAL_LINK_EXPIRES_AT` | Link script | 链接过期 Unix 秒时间戳 |

## 验证

运行全部自动化测试：

```powershell
npm test
```

测试覆盖网关、SSE 连接器、签名链接、字段白名单与校验、真实工单 API Mock 端到端链路，以及页面脚本基本结构。

浏览器及上线前还应检查：

1. 无令牌或过期令牌提交时能明确提示链接无效。
2. 四步表单前后切换和必填校验正常。
3. 不填写试用期时可正常办理；主动填写后，相关日期、月数和工资校验正确。
4. 开户地包含空格或中英文括号、银行卡包含非数字时被阻止。
5. 提交按钮显示加载状态，失败后可复用同一 `requestId` 重试。
6. 成功后显示内部 API 返回的真实工单号。
7. 390px 手机宽度下无横向溢出。

## 生产上线前的最低加固项

- 完成本轮浏览器验收、网关迟到回执与日志恢复验证、根目录回归。
- 配置正式 SMTP、门户网址、年度工作日日历、共享邮箱与客户收件人，再用试点客户验证通知及办结邮件。
- 在部署环境复核已有邮箱密码登录、客户会话、两项业务权限、客户 UUID 隔离、规则注入和真实状态回传；短信或邮件验证码不是当前已确认登录方案的前置条件。
- HTTPS、严格 CORS 白名单、密钥轮换和服务身份认证。
- 敏感字段加密策略、日志脱敏、审计和备份恢复。
- 完成客户试点、部署环境容量与故障恢复验收；全过程监控已有实现，告警渠道和运营 SLA 仍需按正式使用场景验收。
