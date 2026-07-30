# AI 修改记录

## 2026-07-07 · 导入预览「仍有 N 个表格表头未自动匹配」误报修复（模板结构列 + 占位符列剔除）

- 背景：用户按系统生成的模板导入离职工单，预览页始终提示「仍有 2 个表格表头未自动匹配」，标记的两列是「字段名」和「附件」。重启测试无效，因为这是运行时解析行为、非测试问题。
- 根因：
  1. 「字段名」是模板 A 列的标签列表头（`import-template.service.ts` `headerRow.getCell(1).value='字段名'`，A 列下方是「是否必填/填写要求/填写示例」标签，数据字段从 B 列起）；「附件」是离职模板的附件提示列（附件按物理行号关联，设计上不参与映射/写库）。二者都是模板自带结构列，却被解析器当成数据表头，AI 映射层无别名，归入 `unmatched` → 前端弹黄条。
  2. 连带发现 `isPlaceholderHeader` 正则 `/^[?锛焅s]+$/` 是乱码损坏的，本应匹配 `__col_N__` 空列占位符——导致浙江模板那类空列也会误触发同类黄条。
- 改了什么：
  1. `backend/src/modules/imports/excel-parser.service.ts`：新增 `TEMPLATE_STRUCTURAL_HEADERS = {'字段名','附件'}`；`buildHeaders` 命中结构列的表头替换为 `__col_N__` 占位符（下游默认「不导入」）。
  2. `backend/src/modules/imports/import-job.service.ts`：修复 `isPlaceholderHeader` 正则为 `/^__col_\d+__$/`；`toPreviewResult` 用它过滤映射表与 `unmatched`/`unmatchedHeaders`，占位符列（空列 + 结构列）不进映射表也不计入未匹配。
- 为什么这样改：结构列不是数据字段，最合适的剔除点在解析层降级为占位符 + 预览层统一过滤占位符，一处修复覆盖「字段名」「附件」及历史空列误报；附件仍按物理行号关联，写库/校验口径不变。
- 是否覆盖旧规则：否。仅修正表头误报与损坏正则，不改字段映射口径、必填规则、附件关联逻辑。
- 验证：后端 `tsc --noEmit` 零错误；`excel-parser.service.spec.ts` 新增「结构列降级为占位符」用例（6 测试全过）；`import-job.service.spec.ts` + `ai-mapping.service.spec.ts`（8 测试全过），无回归。

## 2026-07-07 · 导出 Excel 附件超链接点击 401 修复（带签名的临时下载令牌）

- 背景：单条工单/子工单导出后，附件列已能生成蓝色超链接，但点击下载后端返回 `{"code":401,"message":"Token 无效或已过期"}`，无法打开附件。
- 根因：全局 `JwtAuthGuard` 拦截所有请求，`JwtStrategy` 只从 `Authorization: Bearer` 头取 token；而 Excel 里的超链接是浏览器直接发 GET，带不了 Authorization 头，因此对受保护的 `/api/files/:id` 必然 401。附件为离职材料（含身份证复印件等敏感 PII），下载端点不能裸公开。
- 改了什么：
  1. `backend/src/modules/upload/upload.service.ts`：新增带 HMAC 签名的临时下载令牌能力。`signSecret()` 复用 `app.jwtSecret`；`computeSignature(fileId, exp)` 用 `createHmac('sha256')` 对 `fileId.exp` 签名；`buildSignedDownloadUrl(base, fileId, ttl=7天)` 生成 `/api/files/download?fileId=&exp=&sig=` 形式的下载 URL；`verifyDownloadToken(fileId, exp, sig)` 校验过期与签名（`timingSafeEqual` 防时序攻击，长度不等直接拒绝）。
  2. `backend/src/modules/upload/file.controller.ts`：新增 `@Public()` 的 `GET /api/files/download` 端点，先 `verifyDownloadToken` 校验令牌，通过才流式返回文件；令牌无效/过期抛 `UnauthorizedException('下载链接无效或已过期')`。声明顺序在 `:id` 之前以优先匹配。原受保护端点 `GET /api/files/:id`（UI 内部下载用）**完全不动**。
  3. `backend/src/modules/admin/export-templates/export-templates.service.ts`：`loadAttachmentSummaries` 生成附件 URL 改为调用 `uploadService.buildSignedDownloadUrl(base, fileId)`；`attachmentFileBaseUrl()` 只返回 base，签名 URL 由 UploadService 拼接。
- 为什么这样改：Excel 超链接无法携带鉴权头，用短期 HMAC 签名令牌既能让链接可点击下载，又不把含 PII 的附件端点裸公开；令牌绑定 fileId+过期时间，默认 7 天有效覆盖常规下载窗口。现有 UI 下载链路与受保护端点零改动，无回归面。
- 验证：`npm run build` 通过；新增 `test/upload.service.signed-download.spec.ts`（签名闭环/篡改拒绝/过期拒绝/长度不等拒绝）+ 扩展 `test/file.controller.spec.ts`（公开端点校验通过与失败），共 9 测试全通过；导出相关 `export-template*` 4 套件 16 测试全通过，无回归。

## 2026-07-07 · 登录诊断从静态 mock 改为动态真实诊断

- 背景：用户反馈登录诊断页面是「静态的、完全没用」，要改成动态有用的。
- 根因：旧页面所有诊断函数（`getAllUserPasswordStatus`/`verifyAllSeedUserCredentials` 等）只读浏览器 localStorage 里的 mock 数据，把明文密码和硬编码的 `DEFAULT_SEED_PASSWORDS`（全 123456）做字符串对比，与真实后端 `/auth/login`（bcrypt 校验）完全脱节——mock 永远显示「可登录」，但真实账号可能 401，诊断不出真实问题。
- 改了什么：
  1. `frontend/src/services/users.ts`：
     - `UserItem` 与 `normalizeUserItem` 增加 `last_login_at` 字段（来源后端 `list` 已返回的 `last_login_at`）。
     - 新增动态诊断纯函数 `diagnoseUserLoginReadiness()`：拉取真实 `/admin/users` 全量用户，依据后端登录规则逐个判定登录就绪状态。判据来自后端 `auth.service.ts` 真实逻辑：`login` 查询条件 `{ username, isActive: true }`（禁用直接拒绝）、登录成功才写 `lastLoginAt`（为空=从未成功登录）、无角色可登录但无菜单权限。状态：`ok/disabled/no_role/never_logged_in`，每条带修复建议。
     - 新增 `probeRealLogin(username, password)`：用 `silentError` 实调 `/auth/login` 做真实登录验证，区分 401/网络/其他错误，不写入任何会话状态。Mock 模式下直接返回不可用。
  2. `frontend/src/pages/Admin/LoginDebug/index.tsx`：整页重写。上半部为「用户登录就绪诊断」表格（总数/可登录/异常统计 + 可按诊断状态筛选 + 后端不可达告警），下半部为「真实登录验证」表单。移除全部基于 localStorage 明文密码的静态展示与「清缓存/重置种子密码」按钮。
- 保留未删：`users.ts` 中旧的静态诊断函数（`getAllUserPasswordStatus`/`resetAllSeedPasswords`/`clearAllAuthCache`/`verifyAllSeedUserCredentials` 等）已无任何引用，但其牵连 mock 密码体系（`DEFAULT_SEED_PASSWORDS`/`loadPasswords`），删除改动面过大且非本次需求，保留更安全。
- 为什么这样改：让诊断真正反映后端认证事实，能定位「倩雯账号登不上」这类真实问题（禁用/无角色/密码从未成功登录），而不是永远显示绿灯。
- 验证：前端 `tsc` 类型检查通过；跑登录相关关键回归 `Login/index`、`authLoginRegression`、`auth.changePassword` 共 3 套件 13 测试全通过。
- 是否覆盖旧规则：否。未改动登录、改密、菜单权限等既有业务口径；仅重写诊断页与新增诊断函数。

## 2026-07-06 · 离职工单批量导入附件支持 + 社保等三字段办结前必填 + 导出附件超链接修复

- 背景：用户测试发现三个问题：①单条工单导出时附件列无法点击下载；②批量导入时Excel内嵌的附件丢失；③社保/医保/公积金字段未与办结状态关联强制校验。
- 根因分析：
  1. **导出超链接问题**：`export-templates.service.ts` 中通过 `addRow()` 批量写入单元格时，`{ text, hyperlink }` 对象格式未被 exceljs 正确识别为超链接，需要在单元格级别显式设置 `cell.value = { text, hyperlink }`。
  2. **批量导入附件丢失**：代码已有完整的附件提取功能（`extractXlsxEmbeddedAttachments` 和 `import-job.service.ts:220-273`），实际已实现按物理行号关联附件并自动上传到工单，功能正常无需修改。
  3. **社保等字段未必填**：`work-order-validation.service.ts` 的 `STRICT_REQUIRED_FIELD_CODES` 未包含这三个字段，办结时不会强制校验。
- 改了什么：
  1. `backend/src/modules/work-orders/work-order-validation.service.ts`：
     - `STRICT_REQUIRED_FIELD_CODES` 新增 `'social_insurance_result'`（社保是否办结）、`'medical_insurance_result'`（医保是否办结）、`'housing_fund_result'`（公积金是否办结）
     - `STRICT_REQUIRED_FIELD_NAMES` 新增对应中文名称映射
     - 办结前未填写这三个字段将抛出 4110 错误，提示"必填字段缺失：社保是否办结、医保是否办结、公积金是否办结"
  2. `backend/src/modules/admin/export-templates/export-templates.service.ts`：
     - `writeWorksheet()` 方法中，在 `addRow()` 后遍历 `cellValues`，检测附件超链接对象（`{ text, hyperlink }`）
     - 对附件单元格显式设置：`cell.value = { text, hyperlink }` + `cell.font = { color: 'blue', underline: true }`
     - 确保 exceljs 正确生成可点击的超链接
  3. **批量导入附件功能确认**：代码已完整实现（`import-job.service.ts:220-273` + `extractXlsxEmbeddedAttachments`），无需修改。用户反馈的"附件丢失"问题需进一步测试验证，可能是 Excel 文件格式或嵌入方式不符合预期。
- 为什么这样改：
  - 社保等字段为离职办结的必要前置条件，必须强制校验防止遗漏。
  - exceljs 要求在单元格对象级别设置超链接属性，批量赋值 `addRow(row)` 时对象格式会被当作普通值处理。
  - 批量导入附件功能代码已完备，支持从 Excel 的 `xl/embeddings` 和 `xl/media` 目录提取文件，按 `drawing` / `vml` 锚点行号匹配数据行并自动上传。
- 验证：
  1. 重启后端，创建离职工单不填社保/医保/公积金三字段，尝试办结应报错"必填字段缺失"。
  2. 导出单条离职工单，附件列应显示蓝色下划线超链接，点击可下载。
  3. 批量导入时在 Excel 行内嵌入附件（插入→对象→文件），导入后详情页和导出表都能看到附件。
- 是否覆盖旧规则：是，社保等三字段从可选改为办结前必填；附件导出超链接和批量导入功能不改变业务逻辑，仅修复显示和数据完整性。

## 2026-07-06 · 导出附件列改为超链接（兼容多种字段命名）

- 背景：用户反馈导出Excel中的附件列只显示文件名纯文本（如`1776221541.pptx`），点击提示"无法打开指定的文件"，无法下载附件。
- 根因：代码已实现附件超链接逻辑（`export-templates.service.ts:467-476`），但硬编码检查字段代码必须完全匹配`attachments_summary`，而实际导出模板配置的字段代码可能是`附件`或其他名称，导致超链接生成条件未触发，只输出普通文本。
- 改了什么：
  1. `backend/src/modules/admin/export-templates/export-templates.service.ts`：
     - `renderRichValue()` 方法中的附件字段判断改为正则匹配`/attachment|附件/i.test(column.valueCode)`
     - 兼容多种字段命名：`attachments_summary`、`attachments`、`附件`等
     - 保持原有超链接格式：`{ text: "文件名", hyperlink: "/api/files/文件ID" }`
     - 多附件时显示"XX.pdf 等3个"，首个附件可点击下载
- 为什么这样改：原硬编码字段名限制导致实际模板配置的附件列无法生成超链接，改为模糊匹配后自动适配各种命名习惯。
- 验证：重启后端后重新导出，附件列应显示为蓝色超链接，点击可直接下载文件。
- 是否覆盖旧规则：否，仅增强字段匹配逻辑，不改变业务行为。

## 2026-07-06 · 完全删除「申请用印」功能

- 背景：用户明确要求完全删除「申请用印」功能，该功能在之前的改动中被保留了。
- 改了什么：
  1. **前端 MaterialsUpload 组件**（`frontend/src/components/MaterialsUpload/index.tsx`）：
     - 删除 `stampModalOpen`、`stampTarget`、`stampNo` 三个 state
     - 删除 `handleStamp` 函数
     - 删除 `FileProtectOutlined` 图标导入和 `stampOrderAttachment` 函数导入
     - 删除 STATUS_LABELS 中的 `stamped: { label: '已用印', color: 'purple' }`
     - 删除「申请用印」按钮（`status === 'approved'` 分支改为直接显示「确认收齐」）
     - 删除 `status === 'stamped'` 分支（用印单号 Tag + 确认收齐按钮）
     - 删除用印申请 Modal（包含用印单号输入框）
     - 删除 `Modal`、`Input` 从 antd 的导入
  2. **前端 services**（`frontend/src/services/attachments.ts`）：
     - 删除 `AttachmentStatus` 类型中的 `'stamped'`
     - 删除 `OrderAttachmentItem` 接口中的 `stamp_no`、`stamped_at` 字段
     - 删除 `stampOrderAttachment` 函数（包括 mock 和真实接口调用）
     - 删除 `normalizeAttachment` 中对 `stamp_no`、`stamped_at` 的处理
  3. **前端 StagesTimeline 组件**（`frontend/src/components/StagesTimeline/index.tsx`）：
     - 删除 `FileProtectOutlined` 图标导入
     - 删除 STAGE_ICONS 中的 `stamp_requested`、`stamp_confirmed`
     - 删除 STAGE_COLORS 中的 `stamp_requested`、`stamp_confirmed`
     - 删除 DEFAULT_STAGES mock 数据中的两条用印相关记录（`stamp_requested` 和 `stamp_confirmed`）
  4. **后端 service**（`backend/src/modules/attachments/attachments.service.ts`）：
     - 删除 `StampOrderAttachmentDto` 导入
     - 删除 `stamp()` 方法
     - 删除 `upload()` 和 `createFromBuffer()` 中对 `stampNo`、`stampedAt` 的赋值（设为 null）
     - 删除 `toResponse()` 中对 `stamp_no`、`stamped_at` 的映射
  5. **后端 controller**（`backend/src/modules/attachments/attachments.controller.ts`）：
     - 删除 `StampOrderAttachmentDto` 导入
     - 删除 `@Post(':id/stamp')` 路由及 `stamp()` 方法
  6. **后端 DTO**（`backend/src/modules/attachments/dto.ts`）：
     - 删除整个 `StampOrderAttachmentDto` 类定义
- 为什么这样改：用户明确要求完全删除「申请用印」功能，该功能不再需要。
- 实体字段保留：`backend/src/entities/order-attachment.entity.ts` 中的 `stampNo`、`stampedAt` 字段保留（数据库已存在这些列，删除实体字段需要 migration，但功能层面已完全不再使用）。
- 是否覆盖旧规则：否。仅删除用印相关功能，不影响附件上传/审核/退回/收齐/删除等其他业务流程。
- 验证：待运行回归测试。

## 2026-07-06 · 修复附件列表只显示「附件」+ 点击预览报错

- 背景：用户反馈离职材料附件卡片只显示「附件」（非真实文件名）、大小 0KB、日期为空，点「预览」报错打不开。经只读排查为两个叠加根因，需一并修复。
- 根因：
  1. 列表接口未做字段名转换：`backend/src/modules/attachments/attachments.service.ts` 的 `list()` 直接 `repository.find()` 返回驼峰实体（`fileName`/`originalName`/`fileId`），而前端 `normalizeAttachment`（`frontend/src/services/attachments.ts`）读下划线字段（`file_name`/`original_name`/`file_id`/`download_url`）。取不到 → 文件名 fallback 到默认值「附件」、`download_url` 空、`file_size` 0。同文件 `toResponse()` 本就做了转换并拼 `download_url`，upload/review/stamp 都走它，唯独 `list()` 漏掉。
  2. 预览新标签不带鉴权：`MaterialsUpload/index.tsx` 用 `window.open(download_url)` 开新标签，而 `/api/files/:id` 受全局 `JwtAuthGuard` 保护、`jwt.strategy.ts` 只从 Authorization header 取 token，新标签请求不带 localStorage token → 401。
- 改了什么：
  1. `backend/src/modules/attachments/attachments.service.ts`：`list()` 返回改为 `rows.map((r) => this.toResponse(r))`，返回类型 `Promise<Record<string, unknown>[]>`，where/order 逻辑不动。
  2. `frontend/src/services/attachments.ts`：新增 `downloadOrderAttachment(item)`，仿现成 `dispatchedOrders.ts` 的 `downloadBinaryFile` 鉴权模式（`fetch` 带 `Authorization: Bearer <localStorage token>` → blob → `<a download>` 触发下载 → `revokeObjectURL`），文件名取 `original_name || file_name`；mock 模式生成占位 blob 下载。
  3. `frontend/src/components/MaterialsUpload/index.tsx`：预览按钮改为「下载」（图标 `EyeOutlined`→`DownloadOutlined`），onClick 改调 `downloadOrderAttachment`，失败 `message.error`，`disabled={!item.download_url}` 保留。用户已确认行为选「直接下载文件」。
- 复用而非新写：`downloadBinaryFile` 的鉴权下载模式、`toResponse()` 的驼峰→下划线转换。
- 是否覆盖旧规则：否。仅修复展示/下载链路，不改附件审核/用印/收齐流程语义，不改字段定义、必填口径或上传黑名单。
- 验证：后端 `npm test -- attachments.service.list` 通过（新增 `backend/test/attachments.service.list.spec.ts`，断言 list 返回含下划线字段+download_url、不泄漏驼峰）；前端 `vitest run attachments.download` 2 测试通过（新增 `frontend/src/services/attachments.download.test.ts`，断言下载走带 Authorization 的 fetch+createObjectURL 而非裸 `window.open`）。

## 2026-07-06 · 附件展示接入主工单详情页 + 三个离职子工单详情页

- 背景：用户反馈上传的附件在主工单详情页和三个离职子工单详情页都看不到。经排查根因不是 id 对不上，而是这些详情页从未挂载附件展示 UI（既不渲染 `MaterialsUpload`，也不调 `GET /attachments`）。附件其实已正确落库（离职单条新建 + 离职批量导入都会写，均挂在主工单 id 上）。
- 改了什么：
  1. `frontend/src/pages/WorkOrders/Detail/index.tsx`：引入 `MaterialsUpload`，在工单字段信息区块后新增离职材料附件区块，仅当 `isResignationOrder`（离职/offboarding/leave）且有 `id` 时渲染，传 `workOrderId={id}`、`bizPurpose="resignation_material"`。
  2. `frontend/src/pages/MyDispatched/Detail/index.tsx`：引入 `MaterialsUpload`，在「工单信息」Card 后新增附件区块。当 `order.module_code` 属于离职材料收集/减员报岗录入/社保公积金减员（显式列举 `resignation_contact`/`resignation_cert`/`data_entry_resign`/`social_insurance_resign`/`resignation_social_insurance`，兼容前端旧码）且有 `parent_order_id` 时渲染，`workOrderId` 传子工单的 `parent_order_id`（即主工单 id）。
- 用户已确认决策：①子工单附件范围=共享主工单附件（不做子工单级隔离，不扩展 `dispatched_order_id` 过滤）；②附件操作权限=允许操作（直接复用 `MaterialsUpload` 带全套上传/删除/审核/用印/预览按钮的版本）；③主工单详情页仅离职类型显示。
- 复用而非新写：现成 `MaterialsUpload` 组件（自带列表加载/上传/审核/用印/删除/预览全套 UI），`GET /attachments` 按 `work_order_id + biz_purpose` 查询；子工单借返回体 `parent_order_id` 关联主工单附件。
- 是否覆盖旧规则：否。仅新增详情页展示入口，不改附件存储模型、校验口径、字段定义；批量导入附件链路无改动（离职 Excel 内嵌附件按物理行号关联已实现，仅经确认生效）。
- 验证：前端 `tsc --noEmit` 零错误；跑根目录回归测试。

## 2026-07-06 · 去掉附件上传的「材料类型」下拉框

- 改了什么：离职材料收集/申报材料附件区，去掉上传前的「材料类型」下拉框（原有身份证复印件、离职申请书、离职交接单、离职证明、劳动合同、社保缴费记录、其他材料 7 项），并按用户确认把附件列表、暂存列表、用印弹窗里的材料类型标签一并去掉。界面上上传区只剩「选择文件」按钮，各处不再出现材料类型。
- 为什么这样改：用户认为材料类型下拉框没必要。
- 涉及文件：仅 `frontend/src/components/MaterialsUpload/index.tsx`。删除 `MATERIAL_TYPES` 常量、`materialType` state、`<Select>`、`StagedFile.materialType` 字段、`getMaterialType` 函数，以及三处类型 `<Tag>`；上传/暂存不再传 `material_type`（service 层 `attachments.ts` 默认填「其他材料」，后端与历史数据不受影响）。上传/审核/退回/用印/收齐/删除全部业务流程、forwardRef 暂存上传能力、bizPurpose 分支均保持不变。
- 是否覆盖旧规则：否。附件材料类型不在业务规则回归清单管辖范围；未改动任何状态/月份/权限/字段口径。
- 验证：前端 tsc --noEmit 通过；WorkOrders 4 套件 18 测试、Benefit 1 套件 5 测试全部通过。

## 2026-07-06 · 离职工单单条新建支持「提交前选附件、提交后自动上传」

- 改了什么：新建离职工单页面，附件区从"提交成功后才出现"改为"表单里常驻"，可在提交前先选好附件（本地暂存），点「提交并拆分工单」后系统建单拿到 ID 再自动把暂存附件全部上传。解决了原来提交成功弹窗点「关闭」直接跳转、来不及用上传卡片的问题。
- 为什么这样改：用户希望填表时一并选好附件，提交一步到位，不用提交后回头找上传入口。附件后端必须挂在已存在工单上，故真实上传发生在建单成功那一刻，对用户无感。
- 涉及文件：
  1. `frontend/src/components/MaterialsUpload/index.tsx`：改为 forwardRef，新增暂存模式——workOrderId 为空时「确认上传」只本地缓存（stagedFiles，显示「待上传」标签，可移除），通过 useImperativeHandle 暴露 `uploadStaged(workOrderId)`/`hasStaged()`；workOrderId 存在时行为完全不变（详情页 Benefit/Detail 等不受影响）
  2. `frontend/src/pages/WorkOrders/New/index.tsx`：附件卡片不再以 createdWorkOrderId 为渲染条件，离职类型常驻显示；加 materialsRef；handleSubmit 建单成功后 `await materialsRef.current?.uploadStaged(result.id)` 再弹成功框，上传失败仅提示可去详情页重试
- 是否覆盖旧规则：否。附件上传不在业务规则回归清单管辖范围；未改动任何状态/月份/权限/字段口径
- 验证：前端 tsc --noEmit 通过；WorkOrders 全套 6 套件 51 测试通过。MyDispatched「批量接单」1 例失败经 git stash 基线（84c6255）验证为既有 flaky，与本次改动无交集

## 2026-07-06 · 离职工单后道导出补充附件列（resignation_contact / data_entry_resign）

- 改了什么：在 `backend/src/database/seeds/seed-export-templates.ts` 新增两套批导出模板 seed：
  - `离职材料收集批导出模板`（moduleCode: resignation_contact，11 列）：姓名/身份证号/客户名称/客户代码/社保缴纳地区/停保月份/离职日期/需要反馈截止日期/是否为通用模板/模板名称/附件
  - `减员报岗录入批导出模板`（moduleCode: data_entry_resign，8 列）：姓名/身份证号/客户名称/客户代码/社保缴纳地区/停保月份/离职日期/附件
  最后一列均为 `attachments_summary`，导出时渲染为 Excel 可点击超链接，指向 `/api/files/{id}`。
- 为什么这样改：导出引擎已内置 `attachments_summary` 列类型（export-templates.service.ts:466-473），社保公积金减员模板已有附件列，但离职材料收集和减员报岗录入模块缺少导出模板，走兜底动态列不含附件，用户导出看不到附件。
- 涉及文件：仅 `backend/src/database/seeds/seed-export-templates.ts`（新增约 40 行）。导出引擎、附件查询逻辑、业务规则均未改动。
- 是否覆盖旧规则：否。附件导出为新增能力，未改动任何字段口径/状态/权限规则。
- 验证：后端 tsc --noEmit 通过；npm run seed 执行无报错，两套模板已写入数据库（幂等键保证不重复插入）；社保公积金减员原有模板不受影响。

## 2026-07-03 · 离职工单附件上传功能

**改了什么：**
1. 新增 `backend/src/modules/imports/xlsx-attachment-extractor.ts`：用 JSZip 解析 .xlsx ZIP 结构，从 `xl/drawings/drawing*.xml`（新版）和 `vmlDrawing*.vml`（老版 OLE）读取行号映射，提取 `xl/embeddings/` 和 `xl/media/` 的嵌入文件，返回 `Map<rowIndex, EmbeddedFile[]>`，失败时静默返回空 Map。
2. `backend/src/modules/attachments/attachments.service.ts`：新增 `createFromBuffer` 方法，直接接受 Buffer 创建附件记录，`bizPurpose='resignation_material'`，供批量导入调用。
3. `backend/src/modules/imports/import-job.service.ts`：注入 `AttachmentsService`；`processJob` 中仅 RESIGNATION 类型时提取嵌入附件；写入每行工单成功后按行号关联附件，失败只 log warning 不影响主体。
4. `backend/src/modules/imports/imports.module.ts`：新增 `AttachmentsModule` 导入。
5. `frontend/src/pages/WorkOrders/New/index.tsx`：import `MaterialsUpload`；新增 `createdWorkOrderId` state；提交成功（仅 resignation）后 set id；JSX 底部条件渲染 `<MaterialsUpload workOrderId={...} bizPurpose="resignation_material" />`。
6. `backend/src/modules/admin/export-templates/export-templates.service.ts`：注入 `OrderAttachment` repository；新增 `loadAttachmentSummaries` 方法批量预取；`renderRichValue` 增加 `attachments_summary` 虚拟字段处理；`writeWorksheet` 接受可选 `attachmentSummaries` 参数并传递；两处导出入口按需预取。
7. `backend/src/modules/admin/export-templates/export-templates.module.ts`：`TypeOrmModule.forFeature` 注册 `OrderAttachment`。
8. `backend/src/database/seeds/seed-export-templates.ts`：`resignationSocialColumns` 末尾追加 `['attachments_summary', '附件']`。

**为什么：**
用户要求离职工单支持附件上传（单条新建 / 批量导入嵌入 / 导出带附件列）。ExcelJS 不支持读取嵌入 OLE 对象，改用 JSZip 直接解析 .xlsx ZIP 结构突破限制。

**如何验证：** `tsc --noEmit` 零错误；后端 55 套件 419 测试全过（1 skipped 为既有问题）。

## 2026-07-01 · 社保公积金反馈字段对业务员只读可见 + 新增社保导出模板

**改了什么：**
1. `backend/src/database/seeds/seed-field-permissions.ts`
   - `upsertPermission` 改为真正的 upsert：已存在记录时若 permission 不同会更新，确保 seed 可重跑修正历史数据。
   - `SOCIAL_INSURANCE_ROLE_CODES` 新增 `...BUSINESS_MEMBER_ROLE_CODES`（`business_group_member`、`biz_member`），使业务员也进入社保/减员社保场景的权限计算。
   - `dispatchedPermission` 将 `BUSINESS_MANAGER_ROLE_CODES.includes(roleCode)` 改为 `BUSINESS_ROLE_CODES.includes(roleCode)`，业务员成员与业务员主管同样返回 READONLY，避免业务员拿到可编辑权限。
   - 上述改动同时覆盖 `dispatched:social_insurance` 和 `dispatched:resignation_social_insurance` 两个场景。
2. `backend/src/database/seeds/seed-export-templates.ts`
   - 新增「社保公积金增员批导出模板」（moduleCode=`social_insurance`）：13列，含员工基础信息、社保参数、三项办结结果及备注。
   - 新增「社保公积金减员批导出模板」（moduleCode=`resignation_social_insurance`）：11列，含员工信息、减员参数、三项办结结果及备注。

**为什么：**
- 业务员发起工单后希望在社保子工单详情页看到四个反馈字段（社保/医保/公积金是否办结 + 备注），但之前业务员成员（business_group_member）不在 SOCIAL_INSURANCE_ROLE_CODES，导致这些字段 HIDDEN。
- 系统没有社保模块的导出模板 seed，傅倩雯的社保子工单无法通过「批导出」下载跟踪结果。

**如何验证：** `tsc --noEmit` 编译零错误；55 套件 419 测试全过（1 skipped 为既有问题）。

## 2026-07-01 · 入职导入模板排除社保四字段（缺口补丁）

**改了什么：**
1. `backend/src/modules/imports/import-template-config.service.ts` — `ONBOARDING_IMPORT_EXCLUDED_FIELDS` 新增 `social_insurance_result`、`social_insurance_remark`、`medical_insurance_result`、`housing_fund_result` 四个字段，入职导入 Excel 模板列不再显示这四列。
2. `backend/src/modules/imports/field-validation.service.ts` — 同一 Set 同步新增，保证模板不显示与导入校验排除一致，不会出现"模板没这列但校验还认它"的不一致。

**为什么：** 这四字段是傅倩雯（社保岗）在子单完成阶段填写的办结结果，业务员发起入职时填不到，不应出现在业务员的批量导入模板中。离职侧已通过白名单正确排除，入职侧为存量缺口。

**如何验证：** `tsc --noEmit` 通过；import 相关6套件42测试全过（PASS）。

## 2026-07-01 · 社保公积金字段口径二次清理（seed/DTO/弹窗文案）

**改了什么：**
1. `backend/src/database/seeds/seed-fields.ts` — 从 `onboardingCollectionGroups` 及字段定义中移除 `medical_insurance_remark`（医保办理备注）和 `housing_fund_remark`（公积金办理备注），确保种子执行后系统字段库只保留 `social_insurance_remark`（社保公积金办理备注）一个备注字段。
2. `backend/src/database/seeds/seed-field-permissions.ts` — `HANDLING_FEEDBACK_FIELDS` 同步移除上述两个备注字段，避免权限配置创建多余备注字段。
3. `backend/src/modules/dispatched-orders/dto/feedback.dto.ts` — 移除 `medical_insurance_remark` 和 `housing_fund_remark` 两个 DTO 字段（数据库列不变，保守方案）。
4. `frontend/src/components/DispatchedBatchImportModal.tsx` — 批导入弹窗文案「办理结果」统一改为「是否办结」（第 119、279 行）。

**为什么：** 上轮改动后 seed/DTO/弹窗文案存在旧口径残留，本次补齐清理。

**如何验证：** 前后端 `npx tsc --noEmit` 均无报错通过。未覆盖业务规则回归清单中已有条目。

> 目的：记录每次 AI/开发人员根据用户要求修改后的结果，尤其是是否覆盖了既有业务规则。固定规则写在 `业务规则回归清单.md`，本文件写变更历史。

## 2026-07-01 · 批导入弹窗"按表内办理结果反馈"文案补丁

**改了什么：** `frontend/src/components/DispatchedBatchImportModal.tsx` 第 246 行，`isSocialFeedbackModule` 分支的 `selectedActionLabel` 由 `'按表内办理结果反馈'` 改为 `'按表内是否办结反馈'`，与社保公积金新口径一致。

**为什么：** 上轮二次清理时漏掉此处，为社保反馈专属分支，必须统一口径。

**如何验证：** grep 已确认弹窗内无剩余"社保/医保/公积金办理结果"旧表述；seeds / DTO 在本次 grep 中均无 `medical_insurance_remark` / `housing_fund_remark`，确认上轮修复有效。

---

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

## 2026-07-01 · 回归验证并修复批量导入弹窗 JSX 中文弯引号解析错误

- 用户要求：再跑一遍回归，确认当前工作区状态。
- 发现问题：`frontend/src/components/DispatchedBatchImportModal.tsx:282` 的 `Alert` 组件 `description` 属性误用中文弯引号 `”…”` 作为 JSX 定界符，导致 oxc 解析失败（`Invalid Character ”`），`OnboardingModule/filterParams.test.ts` 等套件加载报 PARSE_ERROR。
- 改了什么：将该属性定界符改为标准直引号 `"…"`，内部提示文案中的中文引号「是」「否」保留不变。
- 是否覆盖旧规则：否。仅修复语法，文案与行为不变。
- 同步更新规则文档：无。
- 验证：
  - 前端关键测试重跑：8 passed / 1 failed，唯一失败为既有 flaky `MyDispatched > offers batch accept for selected pending rows in pending mode`（单独重跑仍 1 failed|11 passed，与本次无关）。
  - 后端全套：55 套件 / 403 测试通过，1 skipped，无回归。
- 未提交无关文件：工作区存在若干 `.tmp_*` 临时脚本与 `.spectrai-skills/` 等未跟踪文件，非本次改动，未处理。


- 用户要求：管理后台虽然可以配置详情页字段，但子工单详情页没有实际使用该配置，仍使用硬编码的 FIELD_GROUPS。要求打通配置与详情页的连接。
- 根因：详情页模板后端已实现但缺少公开接口；前端详情页未调用配置接口，仍使用硬编码分组。
- 改了什么：
  1. 后端新增公开接口 `GET /admin/detail-view-templates/active/:moduleCode`，返回指定模块启用的详情页字段配置（不限 admin 角色）
  2. 前端 service 新增 `getActiveDetailViewTemplate(moduleCode)` 接口封装
  3. 子工单详情页 `MyDispatched/Detail/index.tsx` 的 `loadDetail` 中加载模板配置：
     - 有配置：按模板 fieldList 顺序和范围过滤显示字段
     - 无配置：回退到现有硬编码 FIELD_GROUPS（默认全量字段）
  4. 测试：mock `getActiveDetailViewTemplate` 返回 null（默认无配置场景）
- 是否覆盖旧规则：否。新增功能不影响现有默认行为（无配置时仍用全量字段）。
- 同步更新规则文档：无需更新回归清单（新增可选功能，不改变现有默认逻辑）。
- 代码提交：`6cb66b53`
- 验证：
  - 前后端 build 通过
  - 回归测试 `./回归测试.ps1 -SkipBuild` 前端 10 套件 76 用例全过
  - 逻辑：有模板配置 → 按配置字段列表展示；无配置 → 默认全量字段
- 未提交无关文件：已清理 `backend/backend/`、`frontend/frontend/` 重复目录。

## 2026-06-12 · 恢复「劳动合同模板」字段进入职导入模板（前后端口径对齐）
- 用户要求：单条新增页面已不再重复「劳动合同模板（标准模板/特殊模板）」，但入职批量导入模板又少了这个字段，质疑不稳定。确认后选择「恢复该字段进导入模板」。
- 根因：导入模板/导入校验由后端两处排除集合控制——`import-template-config.service.ts`、`field-validation.service.ts` 的 `ONBOARDING_IMPORT_EXCLUDED_FIELDS` 仍含 `contract_template`（系 6/11 旧需求固化）。而前端 mock `workOrders.ts` 已先行移除该排除（注释「必须保留」），导致本地预览有该字段、真实后端下载没有，表现为「时有时无」。单条新增页 `New/index.tsx` 的排除集合本就不含它，故单条新增正常。
- 是否覆盖旧规则：是。覆盖业务规则清单第 17 节中「业务员入职导入模板排除 contract_template」的旧口径。新口径：contract_template 重新进入入职导入模板与单条新增页面；但导入下载/校验阶段不作必填（导入阶段清空其条件必填），单条新增页仍按 need_company_contract=是 条件必填。后道反馈三字段（contract_feedback/onboarding_feedback/data_entry_feedback）仍排除。
- 改了什么：1) 两处后端排除集合移除 `contract_template`；2) `import-template-config.service.ts#applyTemplateRules` 与 `field-validation.service.ts#applyInferredImportRules` 新增 contract_template 分支，入职导入时 isRequired/defaultRequired=false、conditionalRequired=null（进模板但不必填）；3) 同步测试 `import.service.spec.ts`（2 用例改为保留值且不必填）、`import-template-config.service.spec.ts`（fallback 列表含 contract_template、available 保留、replace 拒绝改用 contract_feedback 验证）。
- 代码提交：<待提交>
- 验证：后端 `import.service`/`import-template-config`/`import-template.service`/`work-order-validation`/`module-fields-baseline`/`import-job.service` 共 38 用例全过；待跑 `./回归测试.ps1`。
- 未提交无关文件：沿用此前 git 堆积（http-exception.filter/export-templates/OnboardingModule 等），不在本次范围。
- 用户要求：导入模板里确实有「劳动合同模板(标准模板/特殊模板)」字段，质疑上次检测/匹配出错；确认后选择方案 B——收敛到种子字段 `contract_template`。
- 背景纠错：上一会话(commit `8556c579`)误把后台手建字段 `f_field_343814` 当脏数据停用。实地查库发现 `f_field_343814` 才是导入模板第54行实际引用、且挂着 10 条 processing 在途工单(值=标准模板)的活字段；`contract_template` 是 seed 种子字段(带「企服发起劳动合同=是」条件必填规则)但无数据、未被导入模板引用。误停用导致导入模板第54行字段无法渲染(配置在、字段被 is_active 过滤)。
- 处理(事务内，已 COMMIT)：1) 10 条工单 `extra_data` 键 `f_field_343814`→`contract_template`(jsonb 改名，旧键删除)；2) 激活 `contract_template`(本就 true)；3) 导入模板第54行 field_code 改指向 `contract_template`(唯一约束 order_type+field_code 无冲突)；4) 停用 `f_field_343814`。迁移前已备份 10 条工单值到工作树外 `../工单系统_迁移备份_contract_template_20260611.json`。
- 是否覆盖旧规则：否。最终系统中「劳动合同模板」收敛为唯一一条带条件必填规则的种子字段，符合既有业务口径，未改字段语义。
- 同步更新规则文档：无需更新回归清单(规则口径未变)。
- 代码提交：纯数据库数据迁移，无代码变更；临时脚本(_q.js/_q2.js/_migrate.js)已删除。
- 验证：SQL 复核——10 条工单已含 `contract_template`、旧键 0 残留；导入模板第54行指向 `contract_template`(is_active=true，模拟 resolveFields join 可渲染)；`f_field_343814` 已停用。`./回归测试.ps1 -SkipBuild` 前端 10 套件 76 用例全过。
- 未提交无关文件：迁移备份 json 已移出 git 工作树。

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

## 2026-06-11 · 单条新增页面出现两个「劳动合同模板」字段——定位为数据库脏字段并停用
- 用户反馈：批量导入模板字段已正常，但入职「单条新增工单」页面里出现了两个「劳动合同模板（标准模板/特殊模板）」。质疑是字段匹配/检测出错。
- 拒绝凭推断，实地查库定位：`field_configs` 表 onboarding 业务下名字含「劳动合同模板」的记录有两条——(1) 正规字段 `field_code=contract_template`，collection_group=业务判断项，display_order=54；(2) 脏字段 `field_code=f_field_343814`（自动生成乱码 code），field_name 仅多一个空格「标准模板 / 特殊模板」，collection_group=null，display_order=999，is_active=true。前端 `getFields` 把后端返回的全部 active 字段交给表单渲染，于是同名渲染两次。导入模板没问题是因为它走 `import_template_fields` 配置表，只配了正规那条。后端种子 `seed-fields.ts` 只有一条 contract_template，故脏字段是运行期（后台字段管理手动新增）产生的数据，不是代码缺陷。
- 影响面核查（删除前必查）：脏字段 `f_field_343814` 已被 10 个工单 `work_orders.extra_data` 填过值、195 条 `field_permissions`、1 条 `import_template_fields` 引用。直接删会丢历史值并留悬空引用，风险高。
- 处理方案（经用户确认）：不删，改为停用——`UPDATE field_configs SET is_active=false WHERE field_code='f_field_343814'`。脏字段从新增表单消失（前端 `getFields` 末尾 `.filter(f=>f.is_active)` 过滤），10 个历史工单已填值、195 条权限、1 条导入配置全部保留，可逆。正规 `contract_template` 保持 active。
- 是否覆盖旧规则：否；纯数据订正，未改任何业务口径/字段语义/代码逻辑。
- 同步更新规则文档：未改 `docs/业务规则回归清单.md`，无新增业务口径。
- 实现/验证：本次为数据库数据变更，无代码改动。停用脚本（已即用即删，未留仓库）打印停用前后状态确认仅命中 1 条且正规字段仍 active；二次校验脚本模拟前端 `getFields` 过滤后，onboarding 下「劳动合同模板」可渲染字段数=1（✅）。临时脚本 `_check_*`/`_deactivate_dirty_field`/`_verify_single_template` 全部已清理。
- 代码提交：数据库改动不入 git；本条记录随最终结果一并提交。
- 未提交无关文件：无新增仓库文件（临时脚本已删）。
- 遗留提示：后台「字段管理」页若允许手动新增与既有字段同名的字段，建议后续加唯一性/重名校验，避免脏字段再次产生（本次未改该入口，仅记录）。

## 2026-06-12 · 登录页输入错误账号/密码无任何提示——修复 request 拦截器 401 强制跳转吞提示
- 用户反馈：主页登录时账号或密码错误，没有任何「账号或密码错误」的提示。
- 根因定位：链路本身完整——后端 `auth.service.ts` 登录失败抛 `UnauthorizedException('用户名或密码错误')`（HTTP 401，响应体 `{code:401,message:'用户名或密码错误'}`），登录页 `Login/index.tsx` 的 catch 里有 `message.error`。但 `frontend/src/services/request.ts` 响应拦截器对**所有** 401 一律执行 `window.location.href='/login'` 强制刷新跳转，登录接口本就在登录页发起，页面 reload 把还没显示出来的 `message.error` 冲掉，且该分支未附加 `_friendlyMsg`，导致提示永远看不到。
- 处理方案：`request.ts` 的 401 分支区分场景——`silentError` 接口（登录正是以 `{ silentError:true }` 调用）视为「凭据错误」，不再重定向，附加 `_friendlyMsg` 后正常 reject，交由调用方 `message.error` 提示；其余接口的 401 仍视为「会话过期」，保持原有清登录态 + 跳转登录页行为不变。
- 是否覆盖旧规则：否；未改任何业务口径，仅修复前端错误提示链路。会话过期自动跳登录页的既有行为完全保留。
- 同步更新规则文档：未改 `docs/业务规则回归清单.md`，无新增业务口径。
- 实现/验证：`frontend/src/services/request.ts` 调整 401 分支；`Login/index.test.tsx` 新增「凭据错误时调用 message.error 且不跳转/不写 token」用例。`npx tsc --noEmit` 零错误；登录页测试 3 用例全过；`回归测试.ps1 -SkipBuild` 前端 10 文件 76 用例全过。
- 代码提交：等用户确认后再提交。
- 未提交无关文件：本次仅改 `request.ts`、`Login/index.test.tsx` 与本记录追加。

## 2026-06-12 · 新增管理后台「详情页字段配置」独立页面——解耦导出模板与详情页显示
- 用户要求：子工单详情页显示字段数量异常（期望63个实际90+），之前尝试修改后端toDetailItem方法补充visible_fields字段但仍未生效。用户反馈详情页字段显示不符合预期，要求恢复代码到今天上午最新提交（3d55bb35），改为在管理后台新增独立的「详情页字段配置」页面，不与导出模板混用。
- 根因与方案调整：之前尝试让详情页字段跟随导出模板配置，但修改后仍不生效且导出模板配置也被改错。用户要求回滚代码并采用新方案——独立创建「详情页字段配置」管理页面，与导出模板完全解耦，按模块配置详情页显示哪些字段。
- 是否覆盖旧规则：否；为全新功能模块，不影响现有导出模板和详情页逻辑。导出模板保持手动配置保存的状态不变。
- 同步更新规则文档：未改 `docs/业务规则回归清单.md`，属新增管理功能模块。
- 实现内容：
  1. **后端**：
     - 新增数据表 `detail_view_templates`（迁移文件 `1749712800000-CreateDetailViewTemplates.ts`）：字段包括 id/template_name/module_code/field_list(jsonb)/is_active/created_by/created_at/updated_at，并添加模块索引和启用状态索引
     - 新增Entity `DetailViewTemplate`（`backend/src/entities/detail-view-template.entity.ts`）并注册到 entities/index.ts 和 app.module.ts
     - 新增管理模块 `backend/src/modules/admin/detail-view-templates/`：包含 Service（CRUD操作+按模块查询启用配置）、Controller（管理员权限+审计拦截器）、Module
     - 在 `AdminModule` 中注册 `DetailViewTemplatesModule`
  2. **前端**：
     - 新增Service `frontend/src/services/detailViewTemplates.ts`：提供增删改查API，类型定义兼容 snake_case/camelCase 双格式
     - 新增管理页面 `frontend/src/pages/Admin/DetailViewTemplates/index.tsx`：参考导出模板页面设计，支持按模块配置字段、字段排序、启用/停用等功能
     - 路由配置：在 `routes/index.tsx` 添加 `/admin/detail-view-templates` 路由
     - 权限配置：在 `routeVisibility.ts` 添加路由权限（仅管理员可见）
     - 菜单配置：在 `BasicLayout.tsx` 的管理后台子菜单中添加「详情页字段配置」入口
- 验证：
  - 后端：`npm run build` 编译成功，`npm run migration:run` 成功创建 `detail_view_templates` 表及索引
  - 前端：`npm run build` 编译成功（28.65s），生成 dist 产物
  - 回滚操作：`git restore .` 成功恢复到 commit 3d55bb35 状态，确认导出模板未被破坏
- 代码提交：等用户验证功能正常后再提交。
- 未提交无关文件：已清理所有临时探测文件和之前失败改动产物。


## 2026-06-12 · 修复详情页字段配置路由404错误(模块未注册+前端路径重复)
- 用户要求：手动访问 `/api/admin/detail-view-templates` 返回 `Cannot GET /api/api/admin/detail-view-templates` 双重前缀404错误。
- 根因：1) `DetailViewTemplatesModule` 虽已创建但未在 `app.module.ts` imports 里注册，导致路由未加载；2) 前端 `detailViewTemplates.ts` service 路径写 `/api/admin/...`，而 `request.ts` 的 baseURL 已是 `/api`，叠加后变成 `/api/api/...`。
- 改了什么：1) `app.module.ts` 新增 import `DetailViewTemplatesModule` 并加入 imports 数组(插在 AdminModule 之后)；2) 前端 service 所有路径去掉 `/api` 前缀(改为 `/admin/detail-view-templates` 等)。
- 代码提交：<待提交>
- 验证：后端日志显示 `DetailViewTemplatesController {/api/admin/detail-view-templates}` 路由已映射(GET/POST/PUT/DELETE 5个端点)；前后端 `npx tsc --noEmit` 零错误；后端已启动在 3000、前端在 5174。
- 是否覆盖旧规则：否。纯技术修复，无业务规则变更。


## 2026-06-25 · 修复速创劳动合同导出模板被整体改坏（物理模板文件被换成精简坏版）
- 用户反馈：只想把「签订方式」字段默认值改为 `1.新签`，但上次改动后速创劳动合同导出模板「整体样式」被搞坏（不止标题行），与以前完全不一样。要求定位根因并最小化修复；并保留之前需求：速创导出表末尾加「劳动合同模板」「劳动合同主体」两列、E签宝导出表加「劳动合同模板」一列。
- 根因（已坐实）：问题不在导出代码逻辑，而在物理模板文件 `backend/src/assets/export-templates/劳动合同签订批导出模板-速创.xlsx` 被整体替换成精简坏版：从正确的 13 个 sheet（主表+12个下拉源）被打扁成只剩 1 个 sheet，r1 标题行（电子签模板编号/名称）被清空，数字列被设成日期格式导致工资/发薪日变成日期序列号（如发薪日15→1900-01-14、工资9600→1926-04-13）。导出代码 `tryBuildStandardTemplateWorkbook` 只是读这个物理文件填数据，模板坏了导出就跟着坏。
- 修复方案（用户批准）：以用户下载的正确模板 `...312588.xlsx`（16316字节、3个sheet完好）为基底，写脚本做最小加工后覆盖回物理模板：(1) 主表末尾追加第38列「劳动合同模板」、第39列「劳动合同主体」（复制第37列样式/红色表头字体/列宽）；(2) r3 签订方式说明行改为“默认为“1.新签”即可”；(3) 清空 r4 样例 PII（杨金梅/身份证号）保留样式；(4) 其余 13 个 sheet、标题行、富文本、数字格式(General)、r14 模板说明原样保留。**导出代码一行不改，DB field_list 不改（速创39字段/E签宝31字段本来就含 contract_template/contract_subject，签订方式 const 本来就是1.新签）**。
- E签宝物理模板：核查后完好（31列，第31列即 contract_template 劳动合同模板），**未改动**。
- 修改文件：仅物理文件 `backend/src/assets/export-templates/劳动合同签订批导出模板-速创.xlsx`（原文件已备份为同目录 `.bak-20260625101016.xlsx`）。无代码/数据库改动。
- 验证：脚本读回重建后物理模板确认 13个sheet名与588完全一致、列数=39、两列表头正确且红字、r3签订方式说明=1.新签、数字列 numFmt=General（不会再变日期）、r1标题行富文本恢复、r4样例PII已清空。已跑回归测试。
- 是否覆盖旧规则：否。仅修复被误换的物理资产，恢复到“正确样式+本来需求的两列/一列”状态，业务口径与字段定义未变。


## 2026-06-25 · 修复「是否」类字段下拉被全量误改为 1.是/2.否（仅 need_esign 保留 1.是/2.否）
- 用户反馈：入职导出/导入模板里只有「是否电子签」(need_esign) 的下拉应为「1.是 / 2.否」；其余所有「是/否」字段必须保持「是 / 否」。但上次迁移 `20260624001200` 把全部是否字段都改成了「1.是/2.否」，需回退。同时要求导出模板渲染形式严格对齐参考文件 `工单管理系统-入职导入模板 (8).xlsx`。
- 根因：迁移 `20260624001200-OnboardingImportTemplateContractRules` 与 `seed-fields.ts` 把 need_company_contract / need_contract_urge / need_onboarding_contact / is_common_template / need_company_payroll / social_urge 的 options 与依赖它们的 conditional_required 值统一写成「1.是」，波及面过大；且拆分判断 `isYes`(onboarding-dispatch.helper.ts) 的 YES_TOKENS 不含「1.是」，存「1.是」时反而可能漏拆合同/入职联系工单——回退为「是/否」既满足用户口径，也消除该隐患。
- 改了什么（代码仅改值，不动逻辑）：
  1. `seed-fields.ts`：上述 6 个是否字段 options 回退为 `['是','否']`；依赖它们的 conditionEq 值由 '1.是' 改回 '是'（need_esign / contract_subject / company_address / project_name / contract_template / need_contract_urge / feedback_deadline / is_common_template / template_name / payroll_location）；相关 helpText 措辞回退。**need_esign 自身 options 保留 `['1.是','2.否']`，esign_platform 依赖 need_esign='1.是' 不变。**
  2. `field-validation.service.ts`、`import-template-config.service.ts`：内置 needOnboardingContactCondition / commonOnboardingTemplate 条件值由 '1.是' 改回 '是'。（376-383 行接受「1.是」等别名的输入归一化列表保留，不影响存储口径。）
  3. `import-template.service.ts`：`need_` 字段示例兜底默认由 '1.是' 改为 '是'；并按参考文件把条件必填说明从「满足条件时必填：字段=值」精简为「满足条件时必填」，删除随之失活的 describeCondition/conditionFieldLabel。
  4. 新增正向迁移 `20260625120000-RevertYesNoOptionsExceptEsign.ts`：把生产库 field_configs 的 options/conditional_required/help_text 回退为「是/否」，仅 need_esign 保留「1.是/2.否」（含 down 反向）。
  5. 同步测试 `import-template.service.spec.ts` 断言由详细条件文案改为「满足条件时必填」。
- 导出模板渲染：生成器结构本就与参考文件一致（A列 字段名/是否必填/填写要求/填写示例 四行说明，字段从 B 列起，`__options` 隐藏 sheet 提供下拉），渲染完全由字段配置驱动；回退配置后，第49列「是否电子签」自动渲染 1.是/2.否、其余是否列渲染 是/否，与参考文件 (8).xlsx 对齐。
- 验证：`npm run build`(后端) 通过；后端 jest（import-template.service / import-template-config / onboarding-dispatch.helper / onboarding-split-and-users）22 passed；前端关键业务测试（OnboardingModule / WorkOrders）20 passed。
- 是否覆盖旧规则：否，反而是回归到清单原始口径——`业务规则回归清单` 第252条拆分条件本就用「是」(need_company_contract=是)。仅 need_esign 维持「1.是/2.否」为本次用户明确新口径。


## 2026-06-25 · 入职导入模板表头黄色范围校准（从“几乎全黄”改为与权威模板一致）
- 用户反馈：导入模板表头几乎全部标黄，要求与参考文件 `工单管理系统-入职导入模板 (8).xlsx` 一致的黄色范围。
- 根因：`import-template.service.ts` 的 `shouldHighlightHeader` 原本是“除 4 个计算字段(gender/birth_date/age/probation_end_date)外全部标黄”，与参考模板规则相反。参考模板实际规则是：员工数据字段（基本信息/合同/薪资/社保，含性别等 4 个计算字段）标黄；客户代码、外包类型 + 全部「业务判断项」（业务模式→特殊备注）不标黄。
- 改了什么：在 `import-template.service.ts` 新增常量 `NON_HIGHLIGHT_HEADER_FIELD_CODES`（customer_code/outsource_type + 19 个业务判断项字段码），`shouldHighlightHeader` 改为“ONBOARDING 且不在该名单”才标黄。未动任何其他逻辑、字段定义、下拉源或必填口径。
- 验证：写临时脚本生成真实模板逐列比对 63 列黄色与参考文件 100% 一致；jest `import-template.service`/`import-template-config` 11 passed（同步修改该 spec 的高亮断言：业务判断项 need_company_contract 表头无 fgColor、员工字段姓名表头 FFFFFF00）。其余 3 个失败套件（auth-password-and-seed/control-flow-regression/import.service 的 need_onboarding_contact 条件校验）与本改动无关，为既有失败。
- 是否覆盖旧规则：否。仅修正表头黄色范围使其对齐权威模板，不改变字段必填/下拉/业务口径。


## 2026-06-25 · 对齐 3 个遗留失败后端测试套件的陈旧断言（仅改测试，不动生产代码）
- 背景：上轮「是否字段下拉回退为是/否」后，有 3 个后端套件的测试断言未跟随生产口径，造成 4 个用例失败。生产代码/种子都是正确的，只是测试期望值过时。用户要求将其对齐现行口径。
- 根因与改动（仅改 `backend/test/` 下三个 spec，未动任何生产代码/种子）：
  1. `import.service.spec.ts`：fixture 把 need_company_contract / need_onboarding_contact / is_common_template 三个非-esign 字段的下拉及条件表达式误写为「1.是/2.否」，回退为「是/否」（同步 validRow 默认值、各用例输入与 normalized 断言）。**need_esign 下拉保留 1.是/2.否、esign_platform 依赖 need_esign=1.是 不动**，严格遵循清单第252条唯一例外。
  2. `control-flow-regression.spec.ts`：删除第281-282 行陈旧断言（期望种子含 `moduleCodes: ['benefit_apply','social_insurance_change']` + `isActive:false` 的旧数组格式）。现行种子 seed-module-handlers.ts 已改用分条 `{moduleCode}` 结构且彻底移除这两个模块码，该断言与同文第278-279 行「活跃块不含这两码」直接矛盾，属化石。
  3. `auth-password-and-seed.spec.ts`：「保留已改密用户密码」用例原期望 seed 会 save 已存在用户并在 savedUsers 里找 maoyani；但现行 seedUsers 对已存在用户根本不调 user.save（这是更强的保留保证）。断言改为直接验证 existingUsers 中 maoyani 的 passwordHash/mustChangePassword/passwordUpdatedAt 未被覆盖、且 savedUsers 不含 maoyani。
- 验证：后端 jest 全量 `54 套件全过(1 skipped)、368 passed`，之前 4 failed 归零。前端 `MyDispatched > batch accept` 存在一个独立的 waitFor 超时 flaky 失败，与本次（仅动后端测试）无关，本来就存在。
- 是否覆盖旧规则：否。仅把测试断言对齐到现行生产口径（是/否、唯 need_esign 用 1.是/2.否；种子分条格式；已改密用户不被覆盖），未改任何业务逻辑。


## 2026-06-25 · 入职批量导入两个 bug 修复（方案A翻转 template_name 必填规则 + 导出条件必填被回灌）
- 背景：代码基线 `e429b69` 已强推留存到 GitHub `main`，旧 main 备份为远程分支 `backup/remote-main-20260625`，可回溯。
- 问题一（纯代码 bug）：导出 Excel 模板不随后台「非必填」配置变化。根因 `import-template-config.service.ts:applyConfiguredRules` 在写入 `isRequiredOverride` 时未清掉内置 `conditionalRequired`，`applyTemplateRules` 对 feedback_deadline/is_common_template/template_name 回灌的条件必填仍生效，导出路径覆盖了后台显式「非必填」。页面 `toView` 走 override 显示正确，导出却被回灌。
  - 修复：`applyConfiguredRules` 中当 `isRequiredOverride !== null/undefined` 时，同步置 `conditionalRequired = null`，让后台显式覆盖在导出路径生效；不动 `applyTemplateRules` 的无配置回退分支。
- 问题二（方案A翻转规则，用户已确认）：后台「通用模板=是」时 template_name 仍必填，与期望相反。
  - 修复：把 `import-template-config.service.ts:commonOnboardingTemplateCondition` 与 `field-validation.service.ts:commonOnboardingTemplateCondition` 的 `is_common_template` 条件值由 `'是'` 翻转为 `'否'`，即「need_onboarding_contact=是 且 is_common_template=否 → template_name 必填」；通用模板=是 → 非必填。
- 改动边界：仅动这两个 service 的合并/条件逻辑；不动物理模板文件、不动 need_esign（保留 1.是/2.否 例外）、不动其他字段口径、不动导入查重与状态流转。
- 测试：`import-template-config.service.spec.ts` 新增 2 例（override=false 清条件必填、template_name 条件翻转为 is_common_template=否）；`import.service.spec.ts` 翻转顶部 needsOnboardingContactAndCommonTemplate 常量 + 两个 template_name 必填语义用例为方案A方向。
- 验证：见本轮 `回归测试.ps1` 结果。
- 是否覆盖旧规则：是。覆盖原「template_name 仅在 need_onboarding_contact=是 且 is_common_template=是 时必填」（业务规则回归清单第253条 + 本文 2026 早前记录），已同步翻转回归清单第253条。


## 2026-06-25 · 批量导入两个体验问题：「必填字段缺失」不指明字段 + 下载错误报告按钮无效
- 用户反馈：批量导入工单一直提示「必填字段缺失」但不说是哪个字段；且「下载错误报告」按钮点了没反应。
- 问题一根因（后端，纯修 bug）：落库校验 `work-order-validation.service.ts` 招 4110 异常时，字段名只放在 `details.missing`/`details.fieldCode`，message 固定为字符串「必填字段缺失」；而 `import-job.service.ts:toRowError` 只取 `body.message`、丢弃 details，导致前端错行表「字段」列显示「整行」、原因列只有干巴巴的「必填字段缺失」。（行内校验 field-validation.service.ts:254 本来就带字段名，此次不动）
  - 修复（仅 `import-job.service.ts`）：`toRowError` 增加可选 `fieldNameMap` 参数 + 新增 `extractMissingFieldCodes` 读取 `details.missing`/`details.fieldCode`，把 fieldCode 翻译为 fieldName 拼进 message（形如「必填字段缺失：员工姓名、客户名称」），并把首个 fieldCode 写进 failRows；processJob 中由已有的 `fields` 构造 `fieldNameMap` 传入。不动后端异常结构、不动校验逻辑。
- 问题二根因（前端，纯 bug）：`downloadImportErrorReport` 用 `window.open(url?token=...)` 下载，但 JWT 策略 `jwt.strategy.ts` 只 `fromAuthHeaderAsBearerToken()`、不读 query token，请求 401，新标页报错，按钮表现为「无效」（模板下载能成是因为额外带了 Authorization header）。
  - 修复（前端）：`workOrders.ts:downloadImportErrorReport` 改为与 `downloadServerImportTemplate` 一致的 `fetch + Authorization header + blob` 下载，文件名从 Content-Disposition 解析（新增 `parseContentDispositionFileName`）、回退默认名；`Import/index.tsx:handleDownloadErrorReport` 改 async/await + 失败 message.error 提示。不动后端 guard/路由。
- 测试：后端 `import-job.service.spec.ts` 新增「expands missing field codes into field names」用例（3 passed）；前端新增 `workOrdersImportErrorReport.download.test.ts`（2 用例：验证走 fetch+Authorization 不再 window.open / 错误状态抛异常）；现有 `Import/index.test.tsx` 2 passed 未破坏。前后端 `tsc --noEmit` 零错误。
- 是否覆盖旧规则：否。仅修复错误提示文案与下载鉴权两个 bug，不改校验口径/必填规则/字段定义。

## 2026-06-25 · 批量导入两个体验问题复查与根治（承上条）
- 背景：上条修复后用户复测仍反映【必填字段缺失】不指明字段、下载错误报告按钮无效。重查后定位到两个更深的根因，上次修复未覆盖。
- 问题一根因（后端，纯修 bug）：上次只在 `import-job.service.ts:toRowError` 用 `getActiveFields` 的 fieldNameMap 翻译，但该字段集经 `filterImportFields`/`applyInferredImportRules` 过滤，缺的字段可能不在该集合里→ fieldNameMap.get 返回 undefined→回退显示英文 code。而原始 4110 源头 message 始终是固定字符串。
  - 根治修复（`work-order-validation.service.ts`）：让 4110 源头直接带中文字段名——`validateWorkOrder` 手上有完整 `FieldConfig`，收集 `missingNames`（取 `field.fieldName`）拼进 message（形如「必填字段缺失：姓名」）；`requireText` 新增 `STRICT_REQUIRED_FIELD_NAMES` 映射给 4 个 strict 字段中文名。保留 `details.missing`/`details.fieldCode` 不变，不动校验口径，与上游 toRowError 翻译叠加互不冲突。
- 问题二根因（后端，纯修 bug）：上次只改前端 fetch+Authorization，但 `error-excel.service.ts:generate` 将错误报告文件 `ownerId` 写死 `'system'`；下载时 `uploadsService.resolveForUser`→`assertReadable` 对非 admin 业务员（sub≠'system'）抛 403，前端 fetch 修复后拿到 403 仍表现为下载失败。
  - 修复：`generate` 新增可选 `ownerId` 参数（默认仍 'system'）；`import-job.service.ts:buildErrorReport`/`processJob` 传入发起导入的 `user.sub`，使业务员能下载自己任务的报告；admin 依旧由 roles 放行。不动路由/guard。
- 测试：`work-order-validation.service.spec.ts` 扩展 strict 用例断言 message 含「姓名」+新增 requireText 中文名用例；`import-job.service.spec.ts` 新增「ownerId=user.sub」用例。import-job/work-order-validation/work-order.service/return-resubmit/p1-split4 全过。
- 是否覆盖旧规则：否。仅修复提示文案与下载鉴权两个 bug，不改校验口径/必填规则/字段定义。

## 2026-06-30 social_insurance 4字段反馈后端测试
- 任务：e06658bd — 社保公积金4字段后道反馈（social_insurance_result / medical_insurance_result / housing_fund_result / social_insurance_remark）
- 新增：`backend/test/social-insurance-feedback.spec.ts`（15个单元测试）
- 覆盖：①全部3项已完成→自动COMPLETED；②任一未完成→保持PROCESSING；③4字段写入extraData；④handler可填；⑤模块主管可填；⑥非handler非主管403；⑦business_owner即使在主管表中也被拒；⑧admin可填；⑨无效值/空值报4224 BAD_REQUEST；⑩别名映射(social_security_result/housingFundResult)；⑪已完成状态409；⑫父单已作废409
- 是否覆盖旧规则：否。核心实现已存在，仅补充测试覆盖。

## 2026-06-30 P0修复：前后端值契约统一为"是/否"
- 任务：b14d697b — 最终integration验收（P0 BLOCK修复）
- 改动：
  1. `backend/src/modules/dispatched-orders/dispatched-order.service.ts`：FEEDBACK_COMPLETED 'YES'→'是'，FEEDBACK_NOT_COMPLETED 'NO'→'否'，错误提示从"已完成/未完成"→"是/否"
  2. `backend/src/database/seeds/seed-fields.ts`：social_insurance_result / medical_insurance_result / housing_fund_result 三字段 options ['YES','NO']→['是','否']
  3. `backend/test/social-insurance-feedback.spec.ts`：所有测试用例值同步更新（payload/断言），field validation 测试的无效值改为'YES'（英文），15/15全绿
- 为什么：前端传"是/否"，后端期望'YES'/'NO'，造成API 400、自动办结永不触发、下拉回显断裂
- 验证：npx jest --config test/jest-unit.json test/social-insurance-feedback.spec.ts → 15 passed, 0 failed
- 是否覆盖旧规则：否，seed-fields options本身是新建字段，不影响既有是/否字段

## 2026-07-01 · 社保公积金四字段功能合入主项目

- 用户要求：将 worktree 仓库 reports/tmp-bundle-restore-contract-export 中的社保四字段功能合并到主项目
- 改动范围（后端）：
  1. `handling-feedback.ts`：字段名改为 social_insurance_result/medical_insurance_result/housing_fund_result，选项值改为"是/否"
  2. `seed-fields.ts`：三字段 displayName/options/fieldCode 同步更新
  3. `seed-field-permissions.ts`：HANDLING_FEEDBACK_FIELDS 改为新字段名
  4. `dispatched-order.service.ts`：aliasMap 更新，新增 feedback() 方法（支持别名归一化 + 严格值校验），新增 WorkOrderValidationService import
  5. `dto/feedback.dto.ts`：新建，定义 FeedbackDispatchedOrderDto
  6. `test/social-insurance-feedback.spec.ts`：从 worktree 复制，修复构造参数（WorkOrderValidationService mock、dirtyMarkRepository undefined 占位）
- 改动范围（前端）：
  1. `constants/socialInsuranceFeedback.ts`：新建常量文件
  2. `pages/MyDispatched/Detail/index.tsx`：HANDLING_FEEDBACK_FIELDS/HANDLING_RESULT_OPTIONS 改为新字段名和"是/否"
  3. `services/dispatchedOrders.ts`：visible_fields 改为新字段名
  4. `components/DispatchedBatchImportModal.tsx`：HANDLING_FEEDBACK_ALIASES/缺失检查/摘要列/提示文案全部改为新口径
  5. `pages/OnboardingModule/index.tsx`：同步更新
- 是否覆盖旧规则：否，四字段为新增功能
- 验证：npx jest --config test/jest-unit.json → 55 passed (1 skipped), 403 tests passed

---

## 2026-07-01 社保公积金备注三合一（方案一）

- 改了什么：将三个独立备注字段（social_insurance_remark / medical_insurance_remark / housing_fund_remark）合并为一个「社保公积金办理备注」（social_insurance_remark）；三个结果字段标签改为新口径「是否办结」
- 涉及文件：
  1. `backend/src/modules/dispatched-orders/handling-feedback.ts`：SOCIAL_FUND_FEEDBACK_ITEMS 中 resultLabel 改为「X是否办结」，medical/fund 的 remarkField 统一改为 social_insurance_remark
  2. `backend/src/modules/dispatched-orders/dispatched-order.service.ts`：手工完成 payload 删除独立 medical/housing remark；批量导入 aliasMap 删除独立 medical/housing remark 条目，别名并入 social_insurance_remark
  3. `frontend/src/pages/MyDispatched/Detail/index.tsx`：HANDLING_FEEDBACK_FIELDS 去掉 remark 字段，新增 HANDLING_SHARED_REMARK；表单改为三个结果选择 + 一个共享备注
  4. `frontend/src/pages/OnboardingModule/index.tsx`：同上
  5. `frontend/src/components/DispatchedBatchImportModal.tsx`：HANDLING_FEEDBACK_ALIASES 删除独立 medical/housing remark 条目，别名并入 social_insurance_remark
- 是否覆盖旧规则：备注字段由三个合并为一个（方案一保留 DB 字段，仅前端不再独立展示/写入）
- 验证：前后端 tsc --noEmit 通过；后端 3 套件 69 测试通过

---

## 2026-07-06 · 离职工单附件上传功能补全（批量嵌入 / 导出下载链接 / 前端格式白名单）

- 背景：离职工单附件要覆盖三场景+格式约束。①单条新建详情页上传已完整可用，无改动。经只读探查发现 ②批量嵌入存在「行号对齐」缺陷且模板缺附件列、③导出仅输出文件名文字无法下载、④前端无格式校验。用户已定：批量导入先实测再改、导出改为可点击下载链接、格式加前端白名单。
- 改了什么：
  1. `backend/src/modules/imports/types.ts`：`ParsedSheet.meta` 新增 `rowNumbers: number[]`（与 `rows` 一一对应的 0-based 物理行号）。
  2. `backend/src/modules/imports/excel-parser.service.ts`：`parseWorksheet` push 每条数据行时同步记录物理行号（`rowNo-1`）写入 `meta.rowNumbers`；`KNOWN_FIELD_LABELS` 增加「附件」避免该表头被判未知列。
  3. `backend/src/modules/imports/import-job.service.ts`：嵌入附件关联改为按物理行号取（`parsed.meta.rowNumbers?.[index] ?? index`），修复数组下标≠物理行号导致附件挂错工单/丢失的缺陷。
  4. `backend/src/modules/imports/import-template.service.ts`：离职模板追加「附件」提示列（落在 fieldCount+2），仅引导用户在数据行任意单元格插入附件，不参与字段映射/写库。
  5. `backend/src/modules/admin/export-templates/export-templates.service.ts`：`loadAttachmentSummaries` 返回结构改为 `Map<workOrderId, AttachmentLink[]>`（含 name+url，url=基址+/api/files/fileId）；新增 `attachmentFileBaseUrl`（读 `EXPORT_FILE_BASE_URL`，缺省回退相对路径）；`renderRichValue` 的 attachments_summary 分支改用 exceljs 超链接（`{text, hyperlink}`），多附件显示「首个 等N个」。
  6. `frontend/src/components/MaterialsUpload/index.tsx`：`<Upload>` 加 `accept="image/*,.pdf,.doc,.docx"` + `beforeUpload` 扩展名白名单校验（图片/Word/PDF），命中非白名单 `message.error` 提示并 `Upload.LIST_IGNORE`。
- 复用而非新写：附件落盘 `attachmentsService.createFromBuffer`、下载路由 `/api/files/{fileId}`、exceljs 原生 hyperlink 能力。
- 是否覆盖旧规则：否。仅补全附件上传/导出链路，不改校验口径/必填规则/字段定义；后端上传黑名单+20MB 兜底保持不变。
- 验证：后端 `tsc --noEmit` 零错误、jest 相关 8 套件 50 测试全过（含 excel-parser 新增「物理行号对齐」用例）；前端 `tsc --noEmit` 零错误。


## 2026-07-07 · 修复 Excel 导入附件提取功能（JSZip 导入错误 + oneCellAnchor 解析缺失）
- 背景：用户反馈批量导入 Excel 时嵌入的图片附件无法提取，日志显示「提取到 0 行的嵌入附件」，但之前添加的详细调试日志完全没有输出。
- 根因分析：
  1. **JSZip 导入错误**：`xlsx-attachment-extractor.ts` 使用 `import JSZip from 'jszip'` 的 ES6 默认导入，编译为 CommonJS 后变成 `jszip_1.default.loadAsync()`，但 JSZip 的 CommonJS 导出不提供 `default`，导致 `jszip_1.default` 为 `undefined`，ZIP 文件加载时抛出 `Cannot read properties of undefined (reading 'loadAsync')` 异常。
  2. **oneCellAnchor 解析缺失**：`parseDrawingRows` 函数只匹配 `<xdr:twoCellAnchor>` 标签，但 ExcelJS 生成的嵌入图片使用 `<xdr:oneCellAnchor>` 标签（单单元格锚点，更常见的图片插入方式），导致即使 ZIP 加载成功也无法提取行号映射。
  3. **错误日志被吞掉**：早期版本的 catch 块没有输出错误信息，导致问题难以定位（后续已修复为输出完整错误和堆栈）。
- 修复方案：
  1. `backend/src/modules/imports/xlsx-attachment-extractor.ts` 第 1 行：将 `import JSZip from 'jszip'` 改为 `import * as JSZip from 'jszip'`，确保 CommonJS 兼容性（编译后为 `const JSZip = require('jszip')`，直接使用导出对象）。
  2. 同文件 `parseDrawingRows` 函数（约第 58 行）：正则表达式 `/<xdr:twoCellAnchor[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g` 改为 `/<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g`，同时支持两种锚点类型；函数注释也更新为「同时支持 twoCellAnchor 和 oneCellAnchor」。
- 测试验证：
  - 创建带嵌入图片的测试 Excel 文件（使用 ExcelJS 生成 oneCellAnchor 类型图片）。
  - 独立测试脚本 `test-attachment-extraction.js` 验证：
    - ✅ ZIP 文件加载成功（24个文件）
    - ✅ 成功解析 drawing1.xml（1个图片映射）
    - ✅ 成功提取图片附件（70 bytes PNG，image/png 类型）
    - ✅ 行号映射正确（图片关联到第1行）
- 改动边界：仅修复附件提取逻辑的两个 bug，不改变导入流程、字段映射、校验规则或其他业务逻辑。
- 是否覆盖旧规则：否。纯 bug 修复，补全了之前缺失的 oneCellAnchor 支持和正确的 JSZip 导入方式。

## 2026-07-07 · 修复离职导入模板附件列超链接未关联问题
- 背景：用户提供 `工单管理系统-离职导入模板.xlsx` 后复测仍失败；自动检查发现该文件没有 `xl/media` / `xl/embeddings` / drawing 嵌入对象，附件位于 P5 单元格的外部超链接（KDocs），因此原“嵌入附件提取”逻辑无法捕获。
- 根因：`ExcelParserService.normalizeCellValue` 会把 ExcelJS 超链接单元格 `{ text, hyperlink }` 归一化成显示文本，URL 信息丢失；导入任务只处理嵌入二进制附件，没有处理“附件列单元格超链接”。
- 改了什么：
  1. `backend/src/modules/imports/types.ts`：新增 `ParsedAttachmentLink`，`ParsedSheet.meta.attachmentLinks` 记录附件列超链接及 0-based 物理行号。
  2. `backend/src/modules/imports/excel-parser.service.ts`：附件列改用 `/attachment|附件/i` 识别并保留为表头；解析数据行时读取超链接 URL、显示文本、列号和物理行号。
  3. `backend/src/modules/imports/import-job.service.ts`：按物理行号同时关联嵌入附件与附件列超链接；仅接受 http/https 外链。
  4. `backend/src/modules/attachments/attachments.service.ts`：新增 `createFromExternalLink`，用 `metadata.externalUrl` 保存外链型附件，列表响应的 `download_url` 返回外部 URL；删除外链附件时不再尝试解析本地文件。
  5. `frontend/src/services/attachments.ts`：附件 `download_url` 为 http/https 外链时直接新窗口打开，避免用带 Authorization 的 fetch 去请求第三方站点。
- 用户文件验证：解析 `D:\download\工单管理系统-离职导入模板.xlsx` 得到 `attachmentLinks[0] = { rowIndex: 4, columnIndex: 15, header: "附件", text: "北京聚汇融盛互联网科技有限公司_20260506202802(1).pdf", hyperlink: "https://www.kdocs.cn/l/coZXvNkbQcDu" }`。
- 测试验证：
  - `npx jest --config ./test/jest-unit.json --runInBand test/excel-parser.service.spec.ts test/import-job.service.spec.ts test/attachments.service.list.spec.ts` → 3 suites / 14 tests passed。
  - `npx vitest run src/services/attachments.download.test.ts` → 1 file / 3 tests passed。
  - `npm run build`（backend）→ passed。
- 改动边界：不改变原嵌入附件提取逻辑，不改变受保护 `/api/files/:id` 与签名下载 `/api/files/download`；新增外链型附件兼容 WPS/KDocs 等云文档导出的超链接单元格。
- 注意：KDocs 链接本身返回登录页/网页而非 PDF 二进制，系统会保存并打开该外链；若希望系统内直接下载真实 PDF，需要用户在 Excel 中插入/上传真实文件或提供可匿名下载的直链。

## 2026-07-07 · 追加支持 WPS cellImages 嵌入图片提取
- 背景：用户再次提供同一离职导入模板，并说明已嵌入图片；复测发现 ZIP 内出现 `xl/media/image1.png`，但没有标准 Excel drawing / worksheet rels。
- 根因：WPS/金山表格把单元格图片存为 `xl/cellimages.xml` + `xl/_rels/cellimages.xml.rels`，图片坐标位于 `<a:off x=... y=...>`，不走标准 `xl/drawings/drawing*.xml`；原提取器找不到 `sheet1.xml.rels` 就直接返回空 Map。
- 改了什么：`backend/src/modules/imports/xlsx-attachment-extractor.ts` 新增 WPS cellImages 解析：读取 sheet 行高/列宽，按 EMU 坐标换算 0-based 物理行号，再通过 `cellimages.xml.rels` 解析图片路径并提取 Buffer。
- 用户文件验证：`D:\download\工单管理系统-离职导入模板.xlsx` 提取结果为 `rowIndex=4`，附件 `image1.png`，`image/png`，大小 55392 bytes，对应 Excel 第 5 行数据。
- 验证：`npm run build`（backend）通过；`npx jest --config ./test/jest-unit.json --runInBand test/excel-parser.service.spec.ts test/import-job.service.spec.ts test/attachments.service.list.spec.ts` → 3 suites / 14 tests passed。
- 改动边界：保留原 drawing / vml / 外链附件逻辑，仅补充 WPS cellImages 兼容分支。

## 2026-07-07 · 附件上传/导入后直接收齐，移除审核通过+确认收齐两步
- 背景：用户反馈附件已能上传/提取，但系统还要求先“审核通过”再“确认收齐”，需要点两次才消失。
- 根因：系统附件状态机原设计为 `uploaded -> approved -> received`；前端按状态显示“审核通过”和“确认收齐”两个按钮，后端创建附件默认 `uploaded`。
- 改了什么：
  1. `backend/src/modules/attachments/attachments.service.ts`：普通上传、Excel 嵌入附件、Excel 外链附件创建时默认 `status='received'` 并写入 `receivedAt`；保留 review/receive 旧接口兼容历史数据。
  2. `frontend/src/components/MaterialsUpload/index.tsx`：上传/暂存上传时传 `status: 'received'`；附件列表不再显示“审核通过 / 退回 / 确认收齐”操作，只保留下载和删除。
  3. `frontend/src/services/attachments.ts`：mock/真实上传默认状态改为 `received`，mock 数据补 `received_at`。
  4. `backend/test/attachments.service.list.spec.ts`：新增创建附件默认 received 的覆盖。
- 验证：
  - `npx jest --config ./test/jest-unit.json --runInBand test/attachments.service.list.spec.ts test/import-job.service.spec.ts test/excel-parser.service.spec.ts` → 3 suites / 15 tests passed。
  - `npm run build`（backend）→ passed。
  - `npx vitest run src/services/attachments.download.test.ts` → 1 file / 3 tests passed。
  - `npm run build`（frontend）→ passed。
- 改动边界：不删除后端审核/收齐接口，仅改变新上传/新导入附件的默认状态与前端操作展示；历史 `uploaded/approved` 数据仍可被接口处理。

## 2026-07-15 生产代码全量同步与 seed 默认禁用

- 改了什么：将 `backend/docker-entrypoint.sh` 的 seed 改为仅在 `AUTO_SEED=true` 或 `SEED_ON_BOOT=true` 时执行；`docker-compose.yml` 默认注入 `AUTO_SEED=false`；新增 `backend/test/docker-seed-guard.spec.ts`；按本地代码清单同步后端、前端、测试、迁移、文档、锁文件及运行时模板共 835 个文件。
- 为什么：旧生产入口每次启动都会无条件执行 seed，且此前仅按选定文件同步，可能遗漏未跟踪源码；本次改为 seed 显式开启，并以完整路径和内容哈希清单校验本地与服务器一致。
- 数据边界：未上传本地 `.env`、数据库、SQL、uploads、构建产物或测试结果；保留生产 `.env`、PostgreSQL 数据卷、uploads、Nginx 配置和回退备份。
- 本地验证：seed guard Jest 2 tests passed；根目录 `回归测试.ps1` 通过（前端 10 files / 96 tests、前端 build、后端 build）；`git diff --check` 通过。
- 生产验证：前后端候选 Docker 镜像构建通过；backend healthy，日志明确显示 `Skipping database seeds`，容器环境 `AUTO_SEED=false`；首页 HTTP 200、`/api/health` 正常、近期错误日志 0；部署前后规范化 schema/data dump 哈希完全一致，核心表计数、生产 `.env`、uploads、PostgreSQL/Nginx 容器 ID 均未变化。

## 2026-07-16 本地配置基线整理与生产选择性同步

- 改了什么：本地删除测试残留文本字段 `f_field_c5dfc7` 及其 117 条权限，将速创导出列名改为完整“劳动合同模板（标准模板/特殊模板）”，并给唯一“离职材料导出模板”补入真实附件汇总列；生产仅定向更新 `export_templates/detail_view_templates/import_template_fields/user_roles`，不做整表覆盖。
- 同步结果：劳动合同详情补入 `contract_template`；速创与 E签宝均显示完整劳动合同模板名称；删除重复“离职材料收集批导出模板”，唯一离职材料模板末尾为“附件、备注”；入职发起/导入配置由 69 项恢复为确认的 63 项；陶明月删除多余 `data_entry_leader`，仅保留业务4组 `biz_member` 主角色。
- 数据边界：未修改 `users`、客户、主工单、子工单、真实附件、通知、日志、导入任务及其他业务/流水数据；未删除 6 个后道办理系统字段，只从 onboarding 发起/导入配置中移除；未改代码、迁移或业务规则清单，未重建或重启容器。
- 回退点：生产完整库与四表定向备份位于 `/data/apps/work-order-system/backups/config_sync_20260716_120442/`；SHA-256 分别为 `cd785efebbd260203e42dc2d5d1de4d79f5cd399583990b8a4c318cc04443817` 与 `95097e9f91127bd337f1e6ed8d9256a9e40bf380811a3616b9c38f3a99dc3c58`；本地配置备份为 `.tmp_server_sync/local_config_before_20260716_120442.dump`。
- 生产验证：目标表行数由 `12/7/83/36` 变为 `11/7/77/35`；独立查询确认陶明月仅有业务员主角色、入职有效字段 63、两个平台列名完整、劳动合同详情两项齐全、离职材料模板仅 1 个且含附件/备注；`users/work_orders/dispatched_orders/order_attachments` 行数与内容哈希同步前后完全一致；`ticket_backend` 与 `ticket_postgres` 均为 running healthy。
- 回归验证：根目录 `回归测试.ps1 -SkipBuild` 通过，前端关键业务测试 10 files / 96 tests passed；按参数跳过构建。

## 2026-07-16 用户账号编辑与 seed 身份保留最小修复

- 改了什么：更新用户 DTO/服务允许按既有账号格式修改用户名，保存前拒绝重复用户名，用户名变更递增 `authVersion`；seed 按用户名未命中时再按固定邮箱复用原用户，避免改名账号被重新创建；前端编辑载荷保留用户名，权限预览 Drawer 与重置密码确认框挂到 `document.body`。
- 为什么：修复管理员编辑用户名不落库、seed 重建改名账号，以及固定操作列遮挡确认浮层/权限预览的回归问题；不改变角色权限计算或交接规则。
- 是否覆盖旧规则：否。仅补充账号唯一性、会话失效和身份复用保护，不改变既有角色菜单与工单权限口径。
- 验证：后端 `auth-password-and-seed.spec.ts` 8 tests passed；前端用户管理 7 tests passed；固定前端关键回归 10 files / 96 tests passed（单 worker 等价参数，默认 Vitest fork 在当前环境超时）；前后端 build 均通过。

## 2026-07-17 /safe-server-sync 同步流程门禁完善

- 改了什么：完善并重新注册 SpectrAI `/safe-server-sync` 技能，新增本地功能改动账本、逐功能/逐文件服务器对比、可复现 commit/tag 部署门禁、业务数据绝对保护，以及 `complete/partial/emergency exception/blocked` 完成状态口径。
- 为什么：修正此前未先完整盘点本地功能、生产运行代码无法由 Git commit 复现、可能漏报本地未提交功能的流程缺陷；以后必须先确认本地实际修改，再与服务器逐项比较，最后仅部署确认范围。
- 数据边界：明确禁止从本地同步 `work_orders`、`dispatched_orders`、`order_attachments`、`users`、`user_roles` 等业务、身份与流水数据；只允许对服务器业务数据做只读计数和哈希保护。
- 验证：已通过 `install_skill(localDir=...)` 重新注册且无警告，运行时确认五项核心规则存在；根目录 `回归测试.ps1 -SkipBuild` 通过，前端 10 files / 96 tests passed。未修改应用代码、数据库或服务器。

## 2026-07-17 /safe-server-sync Git 与服务器状态双轴修正

- 改了什么：技能新增四轴状态模型，要求逐功能分别记录本地 Git 状态、服务器部署状态、来源可复现性和服务器验证结果；明确“未提交”不等于“未部署”。
- 为什么：此前服务器可能已运行从脏工作树上传、但未进入 commit 的代码；工时制三选项即属于“服务器已部署但本地 Git 未提交”，不能误报为未部署。
- 预防规则：服务器未检查时只能写“部署状态未知”；服务器已存在但无 commit 时必须写“已部署但 Git 不可复现”，并在后续生产写入前先完成盘点和 commit 对账。
- 数据边界：本次只更新技能、项目错误模式记录和修改记录，不修改应用代码、数据库或服务器。
- 验证：新版技能已通过 `install_skill(localDir=...)` 重新注册且无警告；运行时五项规则检查全部命中；根目录 `回归测试.ps1 -SkipBuild` 通过，前端 10 files / 96 tests passed。

## 2026-07-17 /safe-server-sync 远程目标身份绑定门禁修正

- 改了什么：在项目技能源与 SpectrAI 注册版 `/safe-server-sync` 中新增连接前 Target identity binding gate，要求当前仓库必须通过可信证据绑定唯一 SSH profile、host、port、部署根目录和运行时标识；禁止按 profile 名称/描述/时间/顺序、`new`/`prod` 字样、其他项目会话或排除法推断，禁止通过试连候选主机识别项目；明确本工单仓库绝不使用 `xiangxin-new`。
- 为什么：此前把 SpectrAI 全局 profile `xiangxin-new` 的“新生产服务器”描述误当作工单项目归属证据，显式连接后才通过只读容器检查发现它属于另一套 `sub2api` 项目。全局 profile 不随当前 cwd 隔离，连接本身必须受项目身份门禁约束。
- 重新执行结果：新版技能已重新调用处理 commit `5f3e239` 的部署请求；当前项目没有保存同时包含 profile/host/port/部署根目录/运行时标识的可信正向绑定，因此在任何 `ssh_connect` 或远程探测前按规则返回 `blocked`。本次没有连接 `xiangxin-new`、`xiangxin-prod` 或其他主机，没有上传、远程 Git、数据库写入、容器重启或生产变更。
- 验证：`install_skill(localDir=...)` 成功，1 个技能/1 个文件写入、0 warning；运行时搜索摘要和调用结果均包含唯一目标绑定、禁止候选试连、`xiangxin-new` 排除和连接前停止规则；`git diff --check` 通过（仅既存 CRLF 提示）；根目录 `回归测试.ps1 -SkipBuild` 通过，前端 10 files / 96 tests passed，按参数跳过后端 build。

## 2026-07-17 commit 5f3e239 正确内网目标部署

- 目标修正：工单系统只使用 SpectrAI 加密 profile `work-order-local-ssh`，绑定内网 SSH 目标 `192.168.26.195:22`、用户 `admin`、部署根目录 `/data/apps/work-order-system`；`xiangxin-new`、`xiangxin-prod` 属于其他项目，本次未连接、未写入。
- 部署范围：仅同步 commit `5f3e239 fix(users): allow safe username edits` 的 7 个文件。服务器不是 Git 仓库且已有强制下线、离职交接等后续功能，原始 commit patch dry-run 因上下文差异失败后，改为以服务器实时副本为基线做最小语义合并；实时基线与 staging 双 SHA-256 门禁通过后才写入，未上传当前脏工作树的其他修改。
- 备份与回退：备份目录 `/data/apps/work-order-system/backups/username-edit-5f3e239_20260717_104250`，包含 7 个源文件与 compose 归档、完整 PostgreSQL dump、原补丁和 staging；旧镜像标签为 `work-order-system-backend:username-edit-5f3e239-backup-20260717_104250`、`work-order-system-frontend:username-edit-5f3e239-backup-20260717_104250`。
- 测试与构建：backend 候选镜像 build 通过，`auth-password-and-seed.spec.ts` 1 suite / 8 tests passed；frontend builder production build 通过，用户管理 1 file / 7 tests passed（仅既存 Vite/jsdom 警告）；最终 backend/frontend 镜像构建通过。
- 本地固定回归：根目录 `回归测试.ps1 -SkipBuild` 通过，前端关键业务回归 10 files / 96 tests passed；按参数跳过后端 build，仅有既存 Vite/jsdom 警告。
- 运行验证：仅重建 `ticket_backend` 与 `ticket_frontend`；backend healthy，首页 HTTP 200，`/api/health` 返回 `status=ok`；启动日志为 `No migrations are pending` 且 entrypoint/bootstrap 两层 seed 均跳过；postgres、ticket_nginx 和全部 legacy 容器 ID 未变化。
- 数据保护：部署前后 14 张业务保护表的行数与排序内容哈希逐项完全一致，包括 `users=31`、`user_roles=35`、`work_orders=11`、`dispatched_orders=34`、`operation_logs=211`、`notifications=93`；未执行数据迁移、seed、配置 SQL 或本地数据库覆盖。
- 结果：`complete`。目标 commit 已在正确工单服务器部署并验证，服务器后续独立功能已保留；本地其他未提交修改未部署。

## 2026-07-18 子工单重新提交原因与处理日志

- 改了什么：所有类型子工单在已退回、已撤回或已作废后重新提交时，统一弹出最多 500 字的选填“重新提交原因”；详情页新增默认收起、首次展开懒加载的“工单处理日志”，按时间展示当前子单的退回、修改、撤回、作废、重新提交等操作、说明与字段差异，并支持失败重试和分页加载。
- 流程边界：复用现有退回、撤回、作废和重新提交状态，不新增状态，不做离职日期自动判断，不改变接单、审批、退回或重新流转规则；重新提交原因统一写入操作日志和后道通知。
- 权限与安全：时间线复用子工单详情读取权限，只查询当前子单日志；字段差异继续按当前子单可见字段和字段权限过滤，脱敏字段仅返回 `******`，接口不返回原始审计 JSON；字段业务名称随安全 DTO 返回，缺失时回退字段码。
- 是否覆盖旧规则：否。仅增加选填说明和已有操作日志的安全展示，不改变既有九种状态、角色权限、撤回审批、作废恢复或返回路径。
- 验证：前端定向 2 files / 26 tests passed；后端定向 2 suites / 17 tests passed；根目录 `回归测试.ps1` 通过（前端关键业务 10 files / 99 tests、前端 build、后端 build）；`git diff --check` 通过（仅既存 CRLF 提示）。

## 2026-07-21 最新本地功能可复现收敛（部署前）

- 改了什么：将当前工作区涉及的认证会话安全与首次改密守卫、管理员强制下线、人员离职交接、模块负责人临时委托、派发配置原子保存与负责人资格校验、团队工单批量转派、工时制三选项恢复、Docker seed 默认禁用、后端依赖与 `package-lock` 规范化、子工单重新提交原因与处理日志、前端服务降级与配套测试/迁移/文档，收敛为同一可复现部署范围。
- 服务器对账：绑定目标为 `work-order-local-ssh`（`192.168.26.195:22`，`/data/apps/work-order-system`）；79 个候选文件逐一比较 SHA-256，其中 59 个已与服务器相同但此前未进入本地 commit，16 个存在真实内容差异，4 个为服务器缺失的新文件。对差异文件下载服务器副本并忽略行尾做语义核查，未发现需要保留的服务器独有业务逻辑。
- 排除与数据边界：`.tmp_server_sync/`、构建产物、上传文件、环境变量、本地数据库和一次性产物不提交、不上传；不从本地覆盖 `users`、`user_roles`、`work_orders`、`dispatched_orders`、附件、日志或通知等生产业务数据。三条迁移仅用于认证安全字段、委托表和工时制配置恢复，生产写入前必须完整备份并校验业务数据保护基线。
- 是否覆盖旧规则：否。保留九种工单状态、月份统计、角色菜单、审批、字段权限和导入导出既有口径；本次是把已实现功能变成可追溯、可回滚的发布来源。
- 本地验证：后端定向 10 suites / 81 tests passed；前端定向 7 files / 55 tests passed；根目录 `回归测试.ps1` 通过（固定前端 10 files / 99 tests、前端生产 build、后端 build）；仅有既存 Vite/jsdom 警告。

## 2026-07-21 commit 94e85bf 最新功能全量同步

- 来源与范围：以 commit `94e85bf32138fc68893c478cecb35f221ce41aa7` 为唯一可复现来源，同步认证会话安全、强制下线、人员交接、模块委托、派发配置、批量转派、工时制选项、seed 保护、依赖锁文件、重新提交原因/处理日志及配套测试和文档；无本地功能排除项。
- 文件对账：59 个文件服务器原已与本地相同但 Git 不可复现，实际上传 16 个差异文件和 4 个新增文件；上传后及容器切换后两次校验均为 79/79 SHA-256 匹配。服务器运行时代码确认包含 `getTimeline`、`batchReassign`、`handover-preview`，前端产物确认包含“工单处理日志”和“重新提交原因”。
- 备份与回退：备份目录 `/data/apps/work-order-system/backups/latest-sync-94e85bf_20260721_153510`，包含源码归档、完整 PostgreSQL dump 和部署 manifest；回滚镜像为 `work-order-system-backend:latest-sync-94e85bf-backup-20260721_153510` 与 `work-order-system-frontend:latest-sync-94e85bf-backup-20260721_153510`。
- 构建与运行：backend/frontend 镜像构建成功，仅以 `--no-deps` 替换两个应用容器；`ticket_backend` healthy、首页 HTTP 200、`/api/health` 返回 `status=ok`，新时间线接口未登录返回 401；PostgreSQL 与 Nginx 容器 ID 完全未变。三条迁移 211/212/213 部署前已应用，启动时 seed 明确跳过。
- 依赖验证：容器内 `bcrypt=true`、`jszip=true`，`bcryptjs=false`、`@types/jszip=false`，与规范化依赖清单一致。
- 数据保护：11 张核心业务表行数与全行哈希前后完全一致；`users`、`operation_logs`、`notifications` 的差异分别定位为部署窗口内一次正常登录、对应 `login_success` 日志和 15:50 定时生成的 `sla_breach` 通知，行数变化为 0/+1/+1，不是同步覆盖。未执行本地数据库恢复、seed 或配置 SQL。
- 最终结果：`complete`。全部本地功能均已提交、部署并获得源码、容器运行时、HTTP、依赖、数据库和功能文案证据；不存在未部署、未验证或 Git 不可复现的本地功能。
