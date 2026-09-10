# Customer Portal（客户门户）

本目录是独立于内部工单系统的轻量 B 端客户门户一期实现。客户通过后台配置的邮箱和密码登录（兼容签名链接），填写入职、离职和薪资确认资料；门户只暴露客户可填写字段，内部规则与审核仍由后台/工单系统负责。

> 当前仍属于 Demo / 联调阶段，不代表已经满足生产上线要求。

## 当前实现范围

### 已接通

- 客户工作台及入职、离职、薪资三个入口。
- 入职四步表单：基本信息、合同与岗位、薪资与社保、银行卡与确认。
- 合同结束日、试用期起止日、社保起缴月等联动与派生。
- 手机号、日期、银行卡号、开户地等基础格式校验。
- HMAC 签名客户链接，客户 ID、名称、代码由链接绑定，不允许页面伪造。
- 页面调用 `POST /portal/onboarding`，通过网关 SSE 转发到内网连接器。
- 连接器按客户字段白名单创建内部入职工单草稿，并向页面返回真实工单号。
- `requestId` 幂等缓存、重复点击保护、提交中状态和失败重试。
- 入职、离职、薪资附件统一调用 POST /portal/attachments/shared-email，不要求或伪造 workOrderId；真实投递适配器必须配置，缺失时明确报错且不返回发送成功。
- 入职、离职批量导入必须使用系统标准 Excel 模板；预览阶段校验模板，非标准模板直接拦截。
- 门户视觉主色已统一为天蓝色系，避免附件、导入工具与原有表单出现色调割裂。


### 仍为演示或待建设

- 邮箱密码登录、账号启停、重置密码、首次强制改密和最近登录时间已接通真实后端；两项授权为增减员、薪资，权限变化使原会话失效。
- 入职/离职受控接口创建待内部核验的真实草稿；薪资受理直接保存本系统受理记录，由内部人员办结并回传结果，不依赖外部薪资系统适配器。
- 客户规则配置归属内部工单系统，由业务员或管理员维护；客户门户已移除配置入口。内部规则数据模型、持久化和自动注入已完成本地实现，尚待服务器环境联调。
- 办理进度读取当前客户 UUID 与账号授权范围内的真实受理记录及工单状态。
- 入职、离职、薪资三类业务均要求工单办结后发送结果邮件；邮件模板、收件人和发送记录由后台配置。
- 附件共享邮箱和 Excel 导入真实能力仍依赖网关、内网连接器及后台服务；未配置后端时只能查看页面，不能完成真实提交。
- Excel 导入当前 autoSubmit: false，导入后进入业务员审核，不会绕过人工审核自动报岗。

- 当前账号登录及业务链路使用后端门户认证接口和签名会话，不需要长期保存内部员工 JWT；旧内部接口辅助函数仍要求单独的服务令牌。
- 薪资 3/2/1 工作日节奏已固定在规则、页面与接口校验中；自动提醒调度和节假日日历尚未实现，不能将配置完成称为提醒已发送。

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

附件不再绑定内部工单附件 API；门户将材料发送至共享邮箱，由共享部门后续核验、OCR 匹配和归档。

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

Demo 前还应人工检查：

1. 无令牌或过期令牌提交时能明确提示链接无效。
2. 四步表单前后切换和必填校验正常。
3. 合同开始日能带出试用期开始日和社保起缴月。
4. 开户地包含空格或中英文括号、银行卡包含非数字时被阻止。
5. 提交按钮显示加载状态，失败后可复用同一 `requestId` 重试。
6. 成功后显示内部 API 返回的真实工单号。
7. 390px 手机宽度下无横向溢出。

## 生产上线前的最低加固项

- 正式验证码登录、客户会话和权限隔离。
- 服务器环境的客户规则持久化、内部字段可信注入和真实状态回传联调。
- HTTPS、严格 CORS 白名单、密钥轮换和服务身份认证。
- 敏感字段加密策略、日志脱敏、审计和备份恢复。
- 真实状态回传、异常告警、SLA 监控与办结邮件凭证。
