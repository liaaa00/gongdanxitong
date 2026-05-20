# Phase 6 看板与通知测试用例

依据：`docs/Phase6看板与通知设计.md`。

优先级：P0 = 阻塞验收；P1 = 核心高风险；P2 = 边界体验。

## 1. 业务员看板计数与同环比

### P6-SALES-001 当月发起数统计正确
- 优先级：P0
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：业务员 A 当月创建多张工单，跨月也有历史工单。
- 步骤：A 查询看板。
- 预期：当月发起数只统计当月 createdAt；不包含其它业务员数据。

### P6-SALES-002 完成数与完成率正确
- 优先级：P0
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：当月工单包含 completed、processing、returned。
- 步骤：查询看板。
- 预期：完成数只统计 completed；完成率=completed/当月总数，四舍五入规则一致。

### P6-SALES-003 returned 待处理数正确
- 优先级：P0
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：业务员名下存在 returned 主工单。
- 步骤：查询看板。
- 预期：待处理/退回数等于 returned 数；点击可跳转筛选列表。

### P6-SALES-004 同比环比计算正确
- 优先级：P1
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：准备本月、上月、去年同月数据。
- 步骤：查询看板。
- 预期：环比=(本月-上月)/上月；同比=(本月-去年同月)/去年同月；除零时返回 null 或明确文案。

### P6-SALES-005 趋势图按天聚合
- 优先级：P1
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：当月多天有工单。
- 步骤：查询趋势数据。
- 预期：按日期升序返回；无数据日期补 0；时区按 Asia/Shanghai。

### P6-SALES-006 权限隔离
- 优先级：P0
- 关联接口：`GET /api/dashboard/salesperson`
- 前置：业务员 B 登录。
- 步骤：B 查询看板。
- 预期：不出现业务员 A 的客户/员工/工单数据。

## 2. 团队看板 SLA 与效率成员

### P6-TEAM-001 SLA 超期总数正确
- 优先级：P0
- 关联接口：`GET /api/dashboard/team/:module`
- 前置：合同模块有 pending/processing 子工单，部分超过 SLA。
- 步骤：合同主管查询团队看板。
- 预期：超期数只统计本模块未完成且超过 SLA 的子工单。

### P6-TEAM-002 SLA 即将超期统计正确
- 优先级：P1
- 关联接口：`GET /api/dashboard/team/:module`
- 前置：存在距离 SLA 截止小于阈值的子工单。
- 步骤：查询看板。
- 预期：即将超期数量正确；已超期不重复计入即将超期。

### P6-TEAM-003 Top 5 效率成员排序
- 优先级：P0
- 关联接口：`GET /api/dashboard/team/:module`
- 前置：团队成员完成量与平均处理时长不同。
- 步骤：查询 Top 5。
- 预期：按效率公式排序；最多 5 人；并列时按完成量/姓名稳定排序。

### P6-TEAM-004 团队看板权限控制
- 优先级：P0
- 关联接口：`GET /api/dashboard/team/:module`
- 前置：非主管/非 manager 用户。
- 步骤：访问团队看板。
- 预期：返回 403；不泄露团队聚合数据。

### P6-TEAM-005 模块过滤不串数据
- 优先级：P1
- 关联接口：`GET /api/dashboard/team/:module`
- 前置：contract 与 social_security 都有子工单。
- 步骤：分别查询两个模块。
- 预期：各自只统计本模块；Top 成员不串模块。

## 3. 管理层看板

### P6-MGR-001 全模块工单汇总正确
- 优先级：P0
- 关联接口：`GET /api/dashboard/manager`
- 前置：多个模块有不同状态子工单。
- 步骤：manager 查询看板。
- 预期：按模块返回总数、完成数、退回数、超期数；合计等于明细总和。

### P6-MGR-002 客户 Top 10 排名
- 优先级：P0
- 关联接口：`GET /api/dashboard/manager`
- 前置：至少 12 个客户有当月工单。
- 步骤：查询客户排名。
- 预期：只返回 Top 10；按当月工单量降序；并列按客户名稳定排序。

### P6-MGR-003 管理层同比环比按全局计算
- 优先级：P1
- 关联接口：`GET /api/dashboard/manager`
- 前置：全局存在本月、上月、去年同月工单。
- 步骤：查询管理看板。
- 预期：同比环比基于权限范围内全量数据，而不是当前页数据。

### P6-MGR-004 admin 与 manager 权限差异
- 优先级：P0
- 关联接口：`GET /api/dashboard/manager`
- 前置：manager 绑定部门，admin 全局。
- 步骤：分别登录查询。
- 预期：manager 只看授权部门；admin 可看全局。

### P6-MGR-005 空数据返回零值结构
- 优先级：P2
- 关联接口：`GET /api/dashboard/manager`
- 前置：筛选范围无工单。
- 步骤：查询看板。
- 预期：返回 0 和空数组，不返回 500。

## 4. 通知中心 SSE/轮询与未读

### P6-NOTI-001 SSE 连接成功并收到新通知
- 优先级：P0
- 关联接口：`GET /api/notifications/stream`
- 前置：用户已登录，浏览器支持 SSE。
- 步骤：建立 SSE，触发一条 assigned 通知。
- 预期：客户端实时收到通知；未读数 +1。

### P6-NOTI-002 SSE 失败降级轮询
- 优先级：P1
- 关联接口：`GET /api/notifications`、`GET /api/notifications/unread-count`
- 前置：模拟 SSE 断开或 nginx 不支持长连接。
- 步骤：客户端降级轮询。
- 预期：仍能获取通知列表和未读数；不重复弹同一通知。

### P6-NOTI-003 标记单条已读
- 优先级：P0
- 关联接口：`POST /api/notifications/:id/read`
- 前置：存在未读通知。
- 步骤：标记已读。
- 预期：isRead=true，readAt 非空，未读数 -1。

### P6-NOTI-004 全部已读
- 优先级：P1
- 关联接口：`POST /api/notifications/read-all`
- 前置：用户有多条未读通知。
- 步骤：点击全部已读。
- 预期：当前用户所有未读变已读；其它用户不受影响。

### P6-NOTI-005 通知列表分页与过滤
- 优先级：P1
- 关联接口：`GET /api/notifications`
- 前置：用户有多类型通知。
- 步骤：按 bizType、isRead、page/pageSize 查询。
- 预期：分页准确；过滤条件生效；按 createdAt 倒序。

### P6-NOTI-006 未授权不能读他人通知
- 优先级：P0
- 关联接口：`GET /api/notifications/:id`、`POST /api/notifications/:id/read`
- 前置：用户 B 获取用户 A 通知 id。
- 步骤：B 查询或标记 A 通知。
- 预期：返回 403/404；不泄露内容。

## 5. SLA cron 去重与黑名单

### P6-SLA-001 同一子工单同一 SLA 阶段只发一次提醒
- 优先级：P0
- 关联接口：Cron/worker、`GET /api/notifications`
- 前置：子工单持续处于即将超期状态。
- 步骤：多次运行 SLA cron。
- 预期：只生成一条相同阶段通知；去重 key 生效。

### P6-SLA-002 已完成子工单不再提醒
- 优先级：P0
- 关联接口：Cron/worker
- 前置：子工单已 completed。
- 步骤：运行 SLA cron。
- 预期：不生成超期/即将超期通知。

### P6-SLA-003 退回黑名单不触发处理人 SLA
- 优先级：P1
- 关联接口：Cron/worker
- 前置：子工单 returned 或主工单 returned。
- 步骤：运行 SLA cron。
- 预期：该子工单不向原 handler 发超期提醒；业务员退回待处理提醒另行计算。

### P6-SLA-004 cron 并发运行不重复
- 优先级：P1
- 关联接口：Cron/worker
- 前置：两个 cron 实例同时运行。
- 步骤：并发触发。
- 预期：唯一键/幂等逻辑防重复通知。

## 6. v1.2 新 biz_type 端到端

### P6-BIZ-WR-001 withdraw_resolved 通过时通知业务员
- 优先级：P0
- 关联接口：撤回审批接口、`GET /api/notifications`
- 前置：withdraw_request 全员 agree。
- 步骤：审批完成后业务员查询通知。
- 预期：收到 bizType=withdraw_resolved，payload 包含 requestId/status=approved。

### P6-BIZ-WR-002 withdraw_resolved 拒绝时通知业务员
- 优先级：P0
- 关联接口：撤回审批接口、`GET /api/notifications`
- 前置：withdraw_request 被 reject。
- 步骤：业务员查询通知。
- 预期：bizType=withdraw_resolved，payload 包含 status=rejected 和 rejectReason。

### P6-BIZ-PWD-001 password_reset_by_admin 通知用户
- 优先级：P0
- 关联接口：`POST /api/admin/users/:id/reset-password`
- 前置：admin 重置普通用户密码。
- 步骤：目标用户查询通知。
- 预期：收到 password_reset_by_admin；不包含明文密码；提示尽快修改密码。

### P6-BIZ-PWD-002 password_reset_by_admin 仅目标用户可见
- 优先级：P0
- 关联接口：`GET /api/notifications`
- 前置：A 被重置密码，B 未被重置。
- 步骤：A/B 分别查询。
- 预期：只有 A 可见该通知。

### P6-BIZ-SUP-001 assigned_as_supervisor 新主管收到通知
- 优先级：P1
- 关联接口：`POST /api/admin/users`、`PUT /api/admin/users/:id`
- 前置：admin 给用户绑定 supervisor 角色。
- 步骤：保存角色变更。
- 预期：目标用户收到 assigned_as_supervisor 通知，payload 包含 module/department。

### P6-BIZ-SUP-002 取消主管不重复发送 assigned 通知
- 优先级：P2
- 关联接口：`PUT /api/admin/users/:id`
- 前置：用户已是主管。
- 步骤：编辑其它字段但主管角色不变。
- 预期：不重复发送 assigned_as_supervisor。

### P6-BIZ-WELCOME-001 user_welcome 新用户首次创建通知
- 优先级：P1
- 关联接口：`POST /api/admin/users`
- 前置：admin 新建启用用户。
- 步骤：创建用户。
- 预期：目标用户收到 user_welcome，包含登录入口和初始改密提示。

### P6-BIZ-WELCOME-002 禁用用户不发送 welcome
- 优先级：P2
- 关联接口：`POST /api/admin/users`
- 前置：admin 创建用户时 isActive=false。
- 步骤：保存用户。
- 预期：不发送 user_welcome，启用时再按契约决定是否发送。

### P6-BIZ-ANN-001 system_announcement 全员通知
- 优先级：P1
- 关联接口：`POST /api/admin/announcements`
- 前置：admin 发布系统公告。
- 步骤：所有角色用户查询通知。
- 预期：均收到 system_announcement；未读数增加。

### P6-BIZ-ANN-002 system_announcement 支持目标范围
- 优先级：P1
- 关联接口：`POST /api/admin/announcements`
- 前置：admin 选择部门/角色范围发布。
- 步骤：范围内外用户分别查询。
- 预期：范围内收到，范围外不可见。
