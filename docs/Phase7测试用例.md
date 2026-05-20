# Phase 7 测试用例

> 依据：`docs/P7-需求确认与实施拆分.md` v1.0  
> 版本：v1.0  
> 编写人：QA / 测试工程师  
> 日期：2026-05-12  
> 优先级：P0 = 阻塞验收；P1 = 核心高风险；P2 = 体验/边界。

## 0. 范围与准入

### 0.1 本轮 9 个测试分类

| 分类 | 覆盖范围 | 自动化脚本 |
|---|---|---|
| P7-F | 入职 3 子工单拆单矩阵，含 8 种组合 | `tests/p7-onboarding-retest.mjs` |
| P7-G | 续签端到端 | `tests/p7-new-businesses.mjs` |
| P7-H | 离职端到端 | `tests/p7-new-businesses.mjs` |
| P7-I | 待遇申报端到端与 6 节点状态流 | `tests/p7-new-businesses.mjs` |
| P7-J | 通知标已读 UX / Badge 回归 | `tests/p7-notification-marking.mjs` |
| P7-K | MultiViewTable 多视图行为 | `tests/p7-multiview-behaviour.mjs` + 手验 |
| P7-L | social_security 软下线替换回归 | `tests/p7-onboarding-retest.mjs` + admin API |
| P7-M | 字段权限 / 角色 / 处理人配置一致性 | admin API + 手验 |
| P7-N | Phase1~6 非回归 smoke 与上线 GO/NO-GO | `tests/final-directed-retest-3300.mjs` + P7 脚本 |

### 0.2 集成准入

- 已执行 architect v1.3 migration，`order_attachments`、`order_stages` 表存在。
- 后端 seed 已完成：9 个启用角色、P7 新字段、P7 派发规则、P7 module_handlers、通知模板。
- 前端已交付：3 条新业务入口、通知标已读修复、MultiViewTable 组件与列表页迁移。
- 测试环境：默认 API `http://127.0.0.1:3300/api`，可通过 `API_BASE` 覆盖。

---

## 1. P7-F 入职 3 子工单拆单矩阵

> 规则：`data_entry` 无条件必拆；`need_onboarding_contact=是` 才拆 `onboarding_contact`；`need_company_contract=是` 才拆 `contract`；`need_company_payroll` 不应影响 P7 三子单；任何组合均不得产生 `social_security`。

| 用例 ID | 优先级 | need_onboarding_contact | need_company_contract | need_company_payroll | 预期子单模块 |
|---|---|---|---|---|---|
| P7-F-001 | P0 | 否 | 否 | 否 | `data_entry` |
| P7-F-002 | P0 | 否 | 否 | 是 | `data_entry` |
| P7-F-003 | P0 | 否 | 是 | 否 | `data_entry, contract` |
| P7-F-004 | P0 | 否 | 是 | 是 | `data_entry, contract` |
| P7-F-005 | P0 | 是 | 否 | 否 | `data_entry, onboarding_contact` |
| P7-F-006 | P0 | 是 | 否 | 是 | `data_entry, onboarding_contact` |
| P7-F-007 | P0 | 是 | 是 | 否 | `data_entry, onboarding_contact, contract` |
| P7-F-008 | P0 | 是 | 是 | 是 | `data_entry, onboarding_contact, contract` |

补充断言：
- 所有子单 `handlerId/handler_id` 不为空或可由处理人池正常接单。
- `dispatched_orders` 不包含 `social_security`。
- admin 可查询历史 `social_security` 子单；新建入职不再产生。
- 主工单社保 5 字段仍保留在 `extraData` / `field_configs` 中，子工单场景隐藏。

---

## 2. P7-G 续签端到端

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-G-001 | P0 | 创建续签工单 | 业务员选择 `orderType=renewal`，填写 25 字段并提交 | 主工单创建成功，状态进入处理中 |
| P7-G-002 | P0 | 续签派发 | 提交续签工单 | 只拆 1 个 `contract` 子工单，处理人为合同组 |
| P7-G-003 | P0 | 合同模板导出 | 合同组创建/选择 `moduleCode=contract` 模板并 apply-preview/apply | 导出列、数据行正确，文件可下载打开 |
| P7-G-004 | P0 | 线下交付反馈 | 合同组填写 `renewal_feedback=已办结` 并完成子单 | 子单 completed，主工单在所有子单完成后关闭 |
| P7-G-005 | P1 | 固定期限校验 | `renewal_term_type=固定期限` 但缺 `renewal_end_date` | 前后端均阻止提交，提示条件必填 |
| P7-G-006 | P1 | 调岗条件字段 | `renewal_reason=调岗续签` 但缺 `renewal_position` | 提示岗位必填 |
| P7-G-007 | P1 | 权限隔离 | 非合同组处理人访问续签子单 | 403 或列表不可见 |
| P7-G-008 | P2 | 模板中文别名 | 导出模板使用中文 alias | Excel 不出现 `??` / 乱码 |

---

## 3. P7-H 离职端到端

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-H-001 | P0 | 创建离职工单 | 业务员选择 `orderType=resignation` 并填写 18 字段 | 创建成功，字段权限正确 |
| P7-H-002 | P0 | 默认离职联系派发 | 提交离职工单 | 必拆 `resignation_contact`，处理角色为合同组 |
| P7-H-003 | P0 | 需要离职证明 | `need_resignation_cert=是` 后提交 | 同时拆 `resignation_contact` 与 `resignation_cert` |
| P7-H-004 | P0 | 不需要离职证明 | `need_resignation_cert=否` 后提交 | 只拆 `resignation_contact`，不拆 `resignation_cert` |
| P7-H-005 | P0 | 离职联系反馈 | 合同组完成联系并写 `resignation_contact_feedback` | 子单 completed，反馈回写主工单 |
| P7-H-006 | P0 | 离职证明放开 | 合同组完成证明开具，上传/导出证明并写 `resignation_cert_status=已开具/已送达` | 证明附件/模板产物可查，工单可关闭 |
| P7-H-007 | P1 | 条件必填 | `need_resignation_cert=是` 但缺 `cert_delivery_address` | 前后端阻止提交 |
| P7-H-008 | P1 | 权限复用合同组 | 离职无独立离职组 | 合同组可处理，其他后道不可见 |
| P7-H-009 | P2 | 历史查询 | 已完成离职工单搜索员工姓名/身份证 | 列表与详情正常展示 |

---

## 4. P7-I 待遇申报端到端

> 6 节点验收口径：材料审核/退回补充、用印申请、收齐箱确认、线下申报、节点反馈、完成关闭。落库以 `order_stages` 为准，材料以 `order_attachments` 为准。

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-I-001 | P0 | 创建待遇申报 | 业务员选择 `orderType=benefit` 填写 32 字段 | 创建成功，动态字段渲染完整 |
| P7-I-002 | P0 | 主派发 | 提交待遇工单 | 只拆 `benefit_apply` 子工单 |
| P7-I-003 | P0 | 材料上传 | 上传 `biz_purpose=benefit_material` 附件 | `order_attachments.status=uploaded` |
| P7-I-004 | P0 | 材料审核通过 | 后道记录 `material_review` 阶段 | `benefit_review_status=已通过` 或阶段日志可见 |
| P7-I-005 | P0 | 退回补充 | 后道因材料缺失 return 子单，填写 `benefit_return_reason` | 主工单/子单 returned，业务员可补充并 resubmit |
| P7-I-006 | P0 | 用印申请 | 材料无误后业务员/系统记录 `stamp_requested` | 用印节点记录操作者、时间、单号 |
| P7-I-007 | P0 | 用印完成 | 业务员线下用印后回填 `stamp_confirmed` | 材料/阶段进入用印完成状态 |
| P7-I-008 | P0 | 收齐箱 | 后道确认 `materials_received` | 材料收齐标记为是，节点不可重复误增 |
| P7-I-009 | P0 | 线下申报 | 后道记录 `offline_submitted` | 申报日期、申报部门、节点日志存在 |
| P7-I-010 | P0 | 节点反馈 | 后道多次记录 `node_feedback` | Timeline 按时间倒序/正序稳定展示 |
| P7-I-011 | P0 | 完成关闭 | 后道完成 `benefit_apply` 子单 | 子单 completed，主工单在全部子单完成后 completed |
| P7-I-012 | P1 | 非法状态流转 | 未材料审核直接线下申报 | 后端 400，前端禁用按钮 |
| P7-I-013 | P1 | 自定义字段 | admin 新增 benefit 自定义字段后创建工单 | DynamicForm 热加载，权限矩阵可配置 |
| P7-I-014 | P1 | 权限隔离 | 非处理人访问待遇子单/附件 | 403 或不可见 |
| P7-I-015 | P2 | 大附件/格式 | 上传超限或非白名单格式 | 明确错误提示，不生成脏记录 |

---

## 5. P7-J 标已读交互 UX

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-J-001 | P0 | 单条标已读 | 未读通知点击“标已读” | 接口 200，`is_read=true/read_at!=null`，列表刷新，toast 成功 |
| P7-J-002 | P0 | Badge 同步 | 单条标已读后观察顶部 Badge | 未读数立即 -1，不需手动刷新页面 |
| P7-J-003 | P0 | 全部标已读 | 多条未读点击“全部已读” | 当前用户全部未读变已读，Badge=0 |
| P7-J-004 | P1 | 空列表 | 无未读通知时点击全部已读 | 不报错，展示空态/已全部已读 |
| P7-J-005 | P1 | 网络错误降级 | Mock 500/断网时点击标已读 | 保持原未读状态，toast 错误，可重试 |
| P7-J-006 | P1 | Mock 模式 | Vite MSW 下点击标已读 | Mock 数据同步翻转，reload 后仍已读 |
| P7-J-007 | P2 | 并发点击 | 快速重复点击同一条 | 幂等，未读数不为负，不重复 toast |

---

## 6. P7-K MultiViewTable 多视图测试

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-K-001 | P0 | 视图切换持久化 | 表格/看板/分组/网格之间切换后刷新 | 当前 viewMode 从 localStorage 恢复 |
| P7-K-002 | P0 | 列配置持久化 | 隐藏/排序列后刷新 | columns state 恢复，key 与 viewId 隔离 |
| P7-K-003 | P0 | 筛选视图保存 | 保存“我负责的处理中”筛选方案 | 方案出现在 ViewSchemeBar，可一键恢复 |
| P7-K-004 | P0 | 看板拖拽 | 将卡片从 pending 拖到 processing/completed | 调用状态更新接口；成功乐观更新，失败回滚 |
| P7-K-005 | P0 | 网格批量入编 | 在 grid 模式编辑多行白名单字段并保存 | 只提交 changed patch，失败行可定位 |
| P7-K-006 | P1 | 500 行 virtual | 500 行列表滚动 | 首屏 < 2s，无明显卡顿，DOM 行数受控 |
| P7-K-007 | P1 | 视图 key 隔离 | work-orders 与 dispatched-orders 分别配置 | localStorage 不串配置 |
| P7-K-008 | P2 | 降级手验 | 浏览器禁用 localStorage | 不白屏，使用默认表格视图 |

---

## 7. P7-L 社保软下线替换回归

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-L-001 | P0 | 角色软下线 | admin 查询 roles | `social_security_team/social_security_supervisor.is_active=false` |
| P7-L-002 | P0 | 规则软下线 | admin 查询 dispatch_rules | `target_module=social_security.is_active=false` |
| P7-L-003 | P0 | 处理人软下线 | admin 查询 module_handlers | `module_code=social_security.is_active=false` |
| P7-L-004 | P0 | 新工单不拆社保 | 跑 P7-F 8 组合 | 无 `social_security` 子单 |
| P7-L-005 | P0 | 历史社保可查 | 使用 admin 查询历史 `moduleCode=social_security&includeReturned=true` | 不 500，可查询历史数据 |
| P7-L-006 | P1 | 字段保留 | admin 查询 field_configs | 社保 5 字段仍 active 或可用于主工单未来扩展 |
| P7-L-007 | P1 | 子场景隐藏 | 查询 `dispatched:*` 字段权限 | 社保 5 字段 hidden，不暴露给 3 子工单 |
| P7-L-008 | P2 | 回退准备 | 执行回退 SQL dry-run/手验 | 可在 30 分钟内恢复社保角色、规则、处理人 |

---

## 8. P7-M 字段权限 / 配置一致性

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-M-001 | P0 | 角色启用数 | 查询 active roles | active 角色为 9 个，不包含社保 2 个 |
| P7-M-002 | P0 | 入职权限场景 | 查询 field-permissions matrix | 只有 main、contract、onboarding_contact、data_entry 生效 |
| P7-M-003 | P0 | 续签权限 | 合同组查看续签子单 | 可见 25 字段，可编辑反馈字段 |
| P7-M-004 | P0 | 离职权限 | 合同组查看 resignation_contact/cert | 按证明字段矩阵显示 |
| P7-M-005 | P0 | 待遇权限 | benefit_apply 后道查看 | 可编辑后道回写字段，不可改业务员基础字段 |
| P7-M-006 | P1 | admin 新增 benefit 字段 | 新增字段并配置权限 | 前端动态表单展示，导出/详情均可用 |
| P7-M-007 | P1 | module_handlers 完整性 | 查询 P7 新 module | `resignation_contact/resignation_cert/benefit_apply` 均有 active 处理人 |

---

## 9. P7-N 总体验收 / 非回归

| 用例 ID | 优先级 | 场景 | 步骤 | 预期 |
|---|---|---|---|---|
| P7-N-001 | P0 | 迁移后 smoke | 后端启动后跑 `tests/final-directed-retest-3300.mjs` | Phase1~6 fixed-verified 不回退 |
| P7-N-002 | P0 | P7 全脚本 | 跑 4 个 P7 脚本 | 无 fail；允许明确标记的环境 skip |
| P7-N-003 | P0 | 中文导出 | 续签/离职模板导出 | 中文 alias 正常，无乱码 |
| P7-N-004 | P1 | 权限越权 | 低权限用户访问 admin/P7 子单 | 403/不可见 |
| P7-N-005 | P1 | 性能冒烟 | 500 行 MultiViewTable、批量导入/导出 | 无 5xx，无前端卡死 |
| P7-N-006 | P2 | 文档闭环 | 更新复测报告与 GO-NOGO v1.3 | 结论明确：GO/CONDITIONAL-GO/NO-GO |

---

## 10. 出口标准

- P0 用例全部通过。
- P1 用例失败需有明确规避方案和责任人。
- `tests/p7-onboarding-retest.mjs`、`tests/p7-new-businesses.mjs`、`tests/p7-notification-marking.mjs` 至少在集成环境完成一次。
- MultiViewTable 若自动化环境不可用，必须补充手验记录截图/录屏。
- `docs/Phase7复测报告.md` 与 `docs/最终GO-NOGO结论.md` v1.3 同步更新。
