# GO / NO-GO 决策支持

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

> 角色：架构师
> 生成时间：2026-05-11
> 面向：Leader / 用户（业务负责人）
> 配套文档：`docs/项目移交文档终审报告.md`、`docs/项目测试报告.md`、`docs/总验收清单.md`
>
> **本文档只给"决策依据与条件建议"，最终 GO/NO-GO 拍板权在 Leader 与用户手里。**

---

## 速览面板

| 维度 | 判定 | 关键依据 |
|---|---|---|
| Phase 1~6 功能性验收 | **PASS** | Phase 1 Auth 11/11、Phase 2 Admin 60/60、Phase 3 核心 9/11 步通过且修复已闭、Phase 4 Round 2 14/14、Phase 5 7/7 修复后通过、Phase 6 8/8 |
| 三大 bug 最终闭环 | **PASS** | P3-E2E-001（submit handlerId）、P3-E2E-002（dispatched 列表 500）、P5-E2E-001（中文 alias 乱码）均 fixed + 回归 |
| 前端 MSW 演练 | **PASS（部分）** | 13 场景 11 通过；`/admin/users`、`/admin/roles` 页面标题等待超时属前端体验优化项，不阻塞业务路径 |
| 性能基线 | **未执行** | k6 脚本骨架已交付，真实压测基线未跑 |
| 安全专项 | **未执行** | JWT 越权、字段权限绕过、Excel 恶意公式、REGEX ReDoS、附件安全 6 项均未开展 |
| 文档体系 | **PASS** | 60+ 文档交叉一致（终审报告 §1-11） |

**架构师一句话结论**：**有条件 GO**（生产体验 / 受控业务试用）；**直接生产全量承载 NO-GO**，需补齐性能基线 + 安全专项。

---

## 1. 截至今日的闭环状态

### 1.1 Phase 1-6 验收全景

| Phase | 范围 | 通过率 | 最终状态 | 证据 |
|---|---|---|---|---|
| Phase 1 基础骨架 | Docker 编排 / 19 张表建表 / seed / Auth / traceId | 100% (Auth 11/11) | ✅ | `docs/Phase1-2综合验收报告.md` |
| Phase 2 管理后台 | 10 admin 模块 CRUD / 字段权限矩阵 / DispatchEngine simulate | 60/60 | ✅ | `tests/phase2-admin-crud-full-results.json` |
| Phase 3 工单核心 | submit/dispatch/accept/complete/return | 9/11 步 → 修复后 11/11 | ✅ | `docs/Phase3端到端复测报告.md`、`Phase3已知问题.md` 回归 |
| Phase 4 导入与回流 | Excel 上传 / AI 映射 / import jobs / supplement | Round 1 6 缺陷 → Round 2 14/14 | ✅ | `docs/Phase4复测-round2报告.md` |
| Phase 5 撤回/审批/导出 | withdraw/modify/approve / export-templates | 7/7（修复后） | ✅ | `docs/Phase5复测报告.md`、`Phase5已知问题.md` |
| Phase 6 看板/通知 | 三角色看板 / notifications / SSE / 模板 | 8/8 | ✅ | `docs/Phase6复测报告.md` |

### 1.2 三大 Bug 最终闭环

| ID | 描述 | 修复证据 | 状态 |
|---|---|---|---|
| P3-E2E-001 | `POST /work-orders/:id/submit` 顶层 dispatchedOrders 缺 handlerId | `work-order.service.spec.ts` 断言 `handlerId:'handler-contract-1'` | ✅ fixed + 回归 |
| P3-E2E-002 | `GET /dispatched-orders?moduleCode=...` 四模块均返回 HTTP 500 | `dispatched-order.service.spec.ts` 参数化回归四模块；`npm run test` 16 suites/80 tests 通过 | ✅ fixed + 回归 |
| P5-E2E-001 | 导出模板中文 alias 被序列化为 `??` / `???` | `export-template.spec.ts` 覆盖 create/get/apply-preview/apply；脏数据兼容回退 `field_name` | ✅ fixed + 回归 |

### 1.3 前端收尾

- `P2-FE-MSW-001`（`/mockServiceWorker.js` 缺失）：✅ fixed-verified，Playwright 探针看到 SW activated
- `P2-FE-MSW-002`（handlers 覆盖不足）：⚠️ partial-fixed，11/13 通过，`/admin/users`、`/admin/roles` 页面标题超时；后端接口实际 200，问题在前端页面头文案或嵌套路由渲染，不影响业务路径

---

## 2. 剩余已知问题清单（全量 grep 汇总）

> 按问题编号前缀分组，状态标注：`fixed`（代码已修）/ `fixed-verified`（代码修 + 复测验）/ `open`（未修）/ `deferred`（有意延后到下期）/ `accepted-risk`（风险接受，不修）

### 2.1 Phase 1 已知（`docs/Phase1已知问题.md`）

| ID | 严重 | 摘要 | 状态 | 处置建议 |
|---|---|---|---|---|
| P1-KNOWN-001 | P0 | AuthService 中文乱码未闭合字符串 | **fixed-verified**（Phase 1 Auth 11/11） | - |
| P1-KNOWN-002 | P0 | `seed-field-permissions.ts` 类型写法导致 53 编译错误 | **fixed-verified**（`npm run build` 通过） | - |
| P1-KNOWN-003 | P0 | 缺 `/api/health` 路由 | **fixed-verified**（HealthModule 已接入） | - |
| P1-KNOWN-004 | P1 | 响应缺 traceId | **fixed-verified**（ResponseInterceptor L34 确认）| - |
| P1-KNOWN-005 | P1 | 后端 build 失败导致 e2e 未执行 | **fixed-verified**（e2e 11/11） | - |
| P1-KNOWN-006 | P1 | 本机 Docker 不可用 | **accepted-risk** | 部署环境安装 Docker Desktop 后 `tests/smoke-test.ps1` 复测 |
| P1-KNOWN-007 | P1 | Docker Desktop 安装受 UAC 阻塞 | **accepted-risk** | 同上，环境问题不是代码问题 |
| P1-KNOWN-008 | P1 | Windows 原生 PostgreSQL 中文路径 initdb UTF8 失败 | **workaround**（已用 `D:\pgsql16portable`） | 部署文档已说明 |
| P1-KNOWN-009 | P0 | AuditInterceptor 缺 OperationLogRepository 注入 | **fixed-verified**（P2-BE-REWORK-008 闭环） | - |

### 2.2 Phase 2 返工项（`docs/Phase2已知问题.md`）

| ID | 严重 | 状态 |
|---|---|---|
| P2-BE-REWORK-001 admin 子模块缺 @Module + AppModule 未集成 | P0 | **fixed-verified**（60/60） |
| P2-BE-REWORK-002 TS 编译错误 | P0 | **fixed-verified** |
| P2-BE-REWORK-003 handler-picker 四策略未实现 | P0 | **fixed-verified**（Phase 3 派发产出验证） |
| P2-BE-REWORK-004 业务单测仍 skip | P2 | **partial**（持续补） |
| P2-BE-REWORK-005 AuditInterceptor async Promise 风险 | P1 | **fixed-verified** |
| P2-BE-REWORK-006 AstValidator 叶子/REGEX 长度校验 | P1 | **deferred**（安全专项） |
| P2-BE-REWORK-007 build/test/admin users 验收线 | P0 | **fixed-verified** |
| P2-BE-REWORK-008 OperationLogRepository 注入失败 | P0 | **fixed-verified** |
| P2-BE-REWORK-009 simulate `{orderType,fields}` 命中异常 | P0 | **fixed-verified** |
| P2-BE-REWORK-010 POST admin/users 后 GET 404 | P0 | **fixed-verified** |
| P2-BE-REWORK-011 Jest worker warning | P2 | **fixed-verified**（未复现） |

### 2.3 Phase 3 / 4 / 5 / 6 E2E

| ID | 严重 | 状态 |
|---|---|---|
| P3-E2E-001 / 002 | P0 / P0 | ✅ **fixed-verified**（见 §1.2） |
| P4-E2E-001~006 | Blocker/Major | ✅ **fixed-verified** Round 2 14/14 |
| P5-E2E-001 | Major | ✅ **fixed-verified** |
| P6-SCRIPT-001（前端 verify:phase56 旧 DTO + Node EventSource 缺失） | P2 | **open**（脚本问题，不影响后端）|
| P2-FE-MSW-001 | P1 | ✅ **fixed-verified** |
| P2-FE-MSW-002 | P2 | ⚠️ **partial-fixed**（11/13） |
| P2-FE-001~006 其他前端设计问题 | P1~P2 | **部分 fixed，部分 open**（菜单过滤已落地；masked 脱敏 / AstConditionEditor 结构 / 批量矩阵保存仍待补） |

### 2.4 架构师补充发现（文档 vs 代码 gap）

| 新编号（建议） | 描述 | 状态 | 影响 |
|---|---|---|---|
| **P5-DEFERRED-001** | Phase 5 设计 §10 的 `auto_agree_after` 等 4 列未写 migration；`settleWithdrawRequest` / admin 强制审批 / auto_agree cron 均未实装 | **deferred** | 本期不阻塞；下期 Phase 5.5 需要 |
| **P6-DEFERRED-001** | `notifications` 的 ref_cols / 分区 / retention migration 未落地（`Phase2到Phase6_migration清单.md` §2.7/§2.8 即标为"待评估"） | **deferred** | 本期单用户/低量通知够用；量大时再补 |
| **P-API-001** | 通知列表分页返 `items` 而非文档标的 `list`，且追加 `groups` 字段 | **accepted-as-designed** | 前端已适配；建议在 API规范.md §1.4 追加脚注 |
| **P-API-002** | 子工单冲突返回 `4201` 而非文档预留的 `4220` | **accepted-as-designed** | 语义一致；建议在 API规范.md §2.1 追加脚注 |

### 2.5 完全未开展的项

| 类型 | 状态 | 说明 |
|---|---|---|
| 性能 k6 基线 | **open-未执行** | 脚本骨架 4 份就绪，真实压测 p(95)<500ms / fail<1% / checks>99% 基线未跑 |
| 安全专项 | **open-未执行** | JWT 越权 / 字段权限绕过 / Excel 恶意公式/宏 / REGEX ReDoS / 附件上传安全 |
| WCAG 合规 | **partial-自动化** | `docs/WCAG 合规检查清单.md` 已起草；人工辅助技术验证未开展 |

---

## 3. 生产就绪风险矩阵

> 等级定义：**C**（Critical，必须阻塞 GO）/ **H**（High，GO 前必须缓释）/ **M**（Medium，可 GO 但需有应急预案）/ **L**（Low，记入 backlog）

| # | 维度 | 子项 | 当前状态 | 风险等级 | 处置建议 |
|---|---|---|---|---|---|
| 1 | **数据库** | migrations 可重放 / seed 幂等 | 4 个 migration 均有 down；seed 使用 ON CONFLICT upsert | **L** | 验收环境首跑即 OK；保留 `pg_dump` 快照 |
| 2 | 数据库 | 慢查询索引 | dispatched_orders / notifications 复合索引已在 InitSchema 规划；看板 SQL 在 `Phase6看板与通知设计.md` §11 有基线 | **L** | 上线后按 `pg_stat_statements` 跟踪 |
| 3 | 数据库 | 备份恢复 | `docs/运营手册.md` §7 已给 `pg_dump -Fc` 日级 + 周全备 + 每月恢复演练脚本骨架 | **M** | 上线前必须执行一次恢复演练 |
| 4 | **安全** | JWT 机制 | passport-jwt；traceId middleware；统一响应；admin/admin123 首登改密 | **M** | 部署文档已强调 `JWT_SECRET ≥ 32 字符`；**上线前必须改 admin 初始密码** |
| 5 | 安全 | 字段级权限 | FieldPermissionInterceptor + `@FieldPermissionScenario` 装饰器已落地 | **M** | 未跑越权专项回归；建议 QA 补一轮 "hidden 字段真的不返回 / masked 真的脱敏" 断言 |
| 6 | 安全 | 上传附件 | 后端 MAX_UPLOAD_SIZE_MB / MAX_IMPORT_SIZE_MB 限制；ClamAV/内容检查未加 | **H** | 生产上线前接入病毒扫描或在 Nginx 层做 mime 白名单 |
| 7 | 安全 | Excel 恶意公式 | exceljs 读取默认不执行公式，但未做 `=CMD\|/c`、HYPERLINK 检测 | **H** | 写入导出时注释掉用户输入中的 `=`、`+`、`-`、`@` 前缀；规则见 OWASP CSV injection |
| 8 | 安全 | REGEX ReDoS | `docs/DispatchEngine-JSON-AST规范.md` 规定 100ms 熔断，但 AstValidator 尚未实装该熔断 | **M** | P2-BE-REWORK-006 delegate 到安全专项；生产只接受 admin 配规则可降级为 L |
| 9 | **性能** | p(95) 基线 | 未跑 | **H** | 上线前至少跑一轮 `tests/k6/` 四脚本，留基线 |
| 10 | 性能 | 看板缓存 | `Phase6看板与通知设计.md` §5 规划内存 TTL 30-60s；实装程度未单独验证 | **M** | 上线后观察 `/dashboard/*` p(95)；>500ms 启用 Redis 缓存 |
| 11 | 性能 | SSE 连接上限 | 未规约 | **M** | 监控 `sse_active_connections`；上限 500 内可用单进程 |
| 12 | **监控** | Prometheus 指标 | `docs/运营手册.md` §8 已规划 8 类关键指标，代码实装未确认 | **M** | 上线前至少把 `http_requests_total` + `db_query_duration_seconds` 打进 Grafana |
| 13 | 监控 | 告警规则 | 已列规则条目 | **M** | 上线前把告警接入 IM（钉钉/飞书/Slack） |
| 14 | 监控 | 审计日志 | operation_logs 表 + AuditInterceptor 已落地；Phase 2 复测通过 | **L** | 保留 180d 策略建议加到运营手册 |
| 15 | **备份** | 业务数据 | 见 #3 | **M** | 同 #3 |
| 16 | 备份 | 上传附件 | `backend_uploads` Docker volume；nginx 以 X-Accel-Redirect 直出 | **M** | 上线前配好离线备份策略（rsync / 对象存储） |
| 17 | **回滚** | migration down | 全部 4 个 migration 均有 down | **L** | 保持红线：应用先回滚、migration 后回滚 |
| 18 | 回滚 | seed 脏数据 | ON CONFLICT 不会重复插；seed 不覆盖业务数据 | **L** | - |
| 19 | 回滚 | Docker 镜像 | Dockerfile 稳定；无版本 tag 滚动风险 | **L** | 上线前固定 `image: xxx:0.9.0` |

**风险结论**：无 Critical 项；High 三项（#6 上传安全 / #7 Excel 注入 / #9 性能基线）是"直接全量生产"的必补项；其余 Medium 项可 GO 但需应急预案或观察窗。

---

## 4. 最终 GO / NO-GO 推荐

### 4.1 QA smoke 最终结论（待填）

> QA 正在跑 `3a393f50` 生产就绪最后一轮 smoke；其结论写入 `docs/项目测试报告.md` §五。本节待 QA 发出最终 GO/NO-GO 后由 Leader 合并本文档。

### 4.2 架构师推荐

基于 §1-§3，我给出**分级建议**：

#### 场景 A：生产体验 / 受控业务试用（小批量、单客户、可快速回滚） → **GO**

**依据**：
- Phase 1-6 功能性闭环已全部通过
- 三大 Bug 已 fixed + 回归
- 文档体系自洽、移交清晰
- 已知问题全部可归类为"deferred / accepted-risk / 非功能性"

**前置条件（部署时清单）**：
1. 修改 `.env` 的 `JWT_SECRET` 为 32 位以上随机字符串（`openssl rand -hex 32`）
2. 首登后**立即把 admin/admin123 密码改掉**
3. `docker compose up` 或 Windows 原生路径启动，跑一遍 `/api/health` + 登录 + 建一张工单
4. 跑一次 `pg_dump` 备份恢复演练
5. 限制生产入口只对内网或白名单 IP 开放

#### 场景 B：直接生产全量流量（多客户、高并发、需 SLA） → **NO-GO，有条件 GO**

**阻塞项**：
1. **性能基线未跑**（风险矩阵 #9，H 级）：必须执行一轮 k6 四脚本并满足 `p(95)<500ms / fail<1% / checks>99%`
2. **Excel CSV injection 防护缺失**（#7，H 级）：导出模板必须在写入前对单元格首字符 `=` `+` `-` `@` 注释
3. **上传附件病毒扫描缺失**（#6，H 级）：接入 ClamAV 或 nginx mime 白名单
4. **字段越权专项未验**（#5，M 级）：QA 补一轮针对"hidden 字段真不返回 / masked 真脱敏"的断言回归

**可 GO 条件**：上述 4 项完成后即可升级为"生产全量 GO"。

#### 场景 C：若 QA 最后一轮 smoke 出现任何新 P0 → **NO-GO**

- 新 P0 由 Leader 决定返工方（backend / frontend），并触发 §5 的返工节奏
- 若 QA 未发现新 P0，场景 A 即生效

### 4.3 推荐拍板路径

```
IF QA smoke 无新 P0 AND 部署环境是"生产体验/试用"
    → GO（走场景 A 的 5 步前置清单）
ELIF QA smoke 无新 P0 AND 部署环境是"生产全量"
    → 有条件 NO-GO：先补齐场景 B 的 4 项再 GO
ELSE（QA 发现新 P0）
    → NO-GO，走 §5
```

---

## 5. 发布后首周观察重点

### 5.1 P0 级关注（每日一巡）

| 指标 / 日志 | 口径 | 告警阈值 | 备注 |
|---|---|---|---|
| `/api/health` 可用性 | 每 60s 探针 | 连续 2 次失败 | 触发 PagerDuty |
| `http_requests_total{status=~"5.."}` 错误率 | 5 分钟滚动 | ≥ 0.5% | 立即 traceId 回溯 |
| `db_query_duration_seconds p(95)` | 主库 | ≥ 300ms | 排查 dispatched_orders / notifications 索引 |
| `work_order_dispatch_total{status="failed"}` | 累计 | 任何非零 | DispatchEngine 失败立即排查 |
| `import_job_status_total{status="failed"}` | 每小时 | ≥ 5 条/h | 可能是 AI provider 降级或 Excel 恶意 |
| `login_failed_total` | 每分钟 | ≥ 20 次/分 | 暴力破解嫌疑 |
| `withdraw_request_stuck_count` | pending > 48h | ≥ 1 | Phase 5 auto_agree 未实装，人工清理 |
| PG 连接数 | `pg_stat_activity` | ≥ max_connections × 80% | 调 NestJS 连接池或加读副本 |

### 5.2 P1 级关注（每周一巡）

| 指标 / 日志 | 用途 |
|---|---|
| operation_logs 中 `action_type='login'` 分布 | 识别异常账户活动 |
| 派发规则命中分布 | 是否规则配置与实际业务偏差 |
| SSE `sse_active_connections` 峰值 | 通知中心负载评估 |
| 导出模板使用频次 | 识别高频模板是否需要缓存 |
| Excel 导入错误报表下载次数 | 业务员是否经常导入失败 |

### 5.3 P2 级 backlog（月度复盘）

- WCAG 合规人工复跑
- 字段权限矩阵扩展（续签 / 离职场景的字段补齐）
- Phase 5.5 撤回增强（auto_agree / admin 强制 / 定时 cron）
- Phase 6.5 通知 retention / 分区 / 模板全流程治理

### 5.4 首周日志重点词

Prometheus/loki 或等价工具按以下关键字订阅告警：

- `"Internal server error"`、`traceId=req_` 后错误堆栈
- `DispatchEngine`（任何 error 级日志）
- `ImportJob`（status=failed / partial）
- `FieldPermissionInterceptor`（权限穿透疑似）
- `BcryptError`、`JwtError`、`UnauthorizedException`
- `Excel` 相关错误（特别是 CSV injection 防护触发的日志）

---

## 6. 附：决策留痕模板（供 Leader 使用）

```
------------------------------------------------
工单系统 v0.9.0 GO / NO-GO 决策留痕
日期：2026-05-__
QA 最终 smoke 结论：______（GO / NO-GO）
架构师建议：有条件 GO（场景 A） / 有条件 NO-GO（场景 B 缺项）
Leader 拍板：______（GO / NO-GO / 延期）
理由：______
部署范围：______（生产体验 / 受控试用 / 生产全量）
首周观察负责人：______
下一轮复盘日期：______
------------------------------------------------
```

---

## 7. 关联文档

- 终审支撑：`docs/项目移交文档终审报告.md`
- 测试报告：`docs/项目测试报告.md`
- 验收清单：`docs/总验收清单.md`
- 部署手册：`docs/部署手册.md`
- 运营手册：`docs/运营手册.md`
- 架构变更日志：`docs/架构变更日志.md`
- 回归用例总纲：`docs/回归用例总纲.md`
