# Phase 5-6 后端返工指导

> 版本：v1.0（2026-05-11）
> 面向：Phase 5/6 后端返工同事、Reviewer
> 作者：architect
>
> **定位**：Phase 5 + Phase 6 后端任务 `8a483447` 被评审打回（round 1 = **1.0 / 10**），与 Phase 4 上轮打回原因同源 —— **drift:deliverable_missing + drift:goal_changed**。本文沿用 `docs/Phase4后端返工指导.md` 的骨架，把评审摘要 → driftLabel 诊断 → P0/P1/P2 切分 → 5 维验收基线 → 文件骨架串成**唯一返工依据**。
>
> 权威设计（不再改动）：
> - `docs/Phase5撤回与审批设计.md`（撤回/审批/导出/审计）
> - `docs/Phase6看板与通知设计.md`（3 个看板 + 站内通知 + SSE）
> - `docs/API规范.md` §4.5 / §4.6（Phase 5/6 接口清单）
> - `docs/数据库ER图.md`（withdraw_requests / withdraw_approvals / notifications / notification_templates 等表结构）

---

## 目录
- [1. 评审结果摘要](#1-评审结果摘要)
- [2. driftLabel 深度诊断](#2-driftlabel-深度诊断)
- [3. 修复优先级切分（P0 / P1 / P2）](#3-修复优先级切分p0--p1--p2)
- [4. Phase 5 需交付清单](#4-phase-5-需交付清单)
- [5. Phase 6 需交付清单](#5-phase-6-需交付清单)
- [6. 文件骨架（TypeScript，可直接 `cp`）](#6-文件骨架typescript可直接-cp)
- [7. 验收准则（5 维基线）](#7-验收准则5-维基线)
- [8. 返工执行节奏建议](#8-返工执行节奏建议)

---

## 1. 评审结果摘要

| 指标 | 值 |
|------|----|
| 任务 ID | `8a483447` |
| 任务名 | Phase 5 + Phase 6 后端 - 撤回审批 + 导出模板 + 看板聚合 + 通知分发 |
| 评审轮次 | 1 |
| 评审分数 | **1.0 / 10**（不通过，`changes_requested`） |
| driftLabels | `drift:deliverable_missing`、`drift:goal_changed`（与 Phase 4 round1 完全同构） |

### 1.1 五维得分

| 维度 | 得分 | 权重 | 评审意见（摘） |
|------|------|------|----------------|
| completeness | 1 | 0.3 | Phase 5+6 所有交付物全部缺失：**0/3 dashboard 端点**、**无 SSE 推送端点**、**导出模板应用逻辑未实现**、**撤回审批流程未完善**、**操作日志详情接口未完善**、**通知中心通道分发未实现** |
| accuracy | 1 | 0.25 | 成员自述摘要描述的是 Phase 4 返工（补齐 `/api/ai/field-mapping` 与 `/api/files/:id`），**与任务 ID 8a483447 完全不对** |
| codeQuality | 1 | 0.2 | Phase 5+6 应交付的代码完全缺失，无法评估；Phase 1-4 代码已在上轮认可，与本轮无关 |
| adherence | 1 | 0.15 | 任务要求实现 Phase 5+6 后端，但成员提交的是 Phase 4 返工 |
| innovation | 1 | 0.1 | Phase 5+6 无新实现，无法评估 |

**加权综合 = 1.0 / 10**（`0.3×1 + 0.25×1 + 0.2×1 + 0.15×1 + 0.1×1`）。

### 1.2 Reviewer 的 5 条 suggestions（原文照录）

> 1. 实现 `DashboardModule`：`GET /api/dashboard/salesperson`（当月工单数量、完成率、待办数）、`GET /api/dashboard/team/:module`（团队子工单统计）、`GET /api/dashboard/manager`（全局汇总）；
> 2. 实现 SSE 通知推送：`GET /api/notifications/stream`，基于 EventSource 向已登录用户推送未读通知；
> 3. 实现通知中心接口：`GET /api/notifications`（列表）、`POST /api/notifications/:id/read`（标记已读）、`POST /api/notifications/read-all`；
> 4. 完善 `dispatched-orders/:id/export` 的导出模板应用逻辑：根据 `ExportTemplate.field_list` 过滤字段并生成 Excel 文件；
> 5. 补充操作日志详情查询接口完善：`GET /api/admin/logs/:id` 返回 `before_data / after_data` 完整内容。

### 1.3 与 Phase 4 round1 的同构关系

| 共同点 | 意义 |
|--------|------|
| 都打 drift:goal_changed | 成员"顺着 Phase 4 做"→ 没意识到任务切到 Phase 5/6 |
| 都打 drift:deliverable_missing | 任务要的模块**一个都没建** |
| 摘要与任务 ID 错位 | 提交前没按任务描述 checklist 自核 |

**纪律结论**：每轮返工前，**必须把任务描述原文贴到 PR 描述顶部**，逐条打勾确认范围。

---

## 2. driftLabel 深度诊断

> **整体根因**：与 Phase 4 round1 同构 —— 成员没有把 Phase 5/6 作为一次**独立新模块**来落地，而是继续在"Phase 4 修补"的惯性里工作。修补不是解法，**按 Phase 5/6 设计重新落地**才是。

### 2.1 Symptom A（目标错位，根因）：`drift:goal_changed`

**表层**：自述摘要写的是 `/api/ai/field-mapping`、`/api/files/:id` —— 这两个接口明确属于 Phase 4（AI 模块 + uploads 模块）。

**根因**：
- Phase 4 端到端复测结果（`docs/Phase4已知问题.md`）让成员误以为"Phase 4 还没完，接着修"；
- 没把任务描述中的 **Phase 5 + Phase 6** 四项（撤回审批/导出模板/看板聚合/通知分发）拿来做实现 checklist；
- 提交摘要是 Reviewer 最早看到的信号 —— 一旦摘要对不上任务 ID，drift 就必然落下。

**修复动作（P0-0，在写代码前）**：
- **把 Phase 4 的任何修补放到新分支**（归并入 `1cc9ff3b` 这个 bug 根因任务），不混到本轮；
- **按任务描述原文列 checklist**，贴到 PR 描述顶部：
  - [ ] `DashboardModule`：salesperson / team/:module / manager
  - [ ] `NotificationModule`：SSE stream + 列表 + 标记已读 + 全部已读
  - [ ] `dispatched-orders/:id/export` 的模板应用逻辑
  - [ ] 撤回审批流程完善（`POST /withdraw`、`/approve`、`/cancel`，状态机）
  - [ ] `GET /api/admin/logs/:id`（含 before/after 完整返回）
- 提交前**自核** PR 描述顶部的 checklist，必须**全部打勾**。

---

### 2.2 Symptom B：Dashboard 模块 0/3 端点

**表层**：`GET /api/dashboard/salesperson` / `/team/:module` / `/manager` **三个端点均不存在**。

**根因**：
- Phase 6 设计 §2-§4 对三个看板有**完整 SQL 基线 + DTO 定义**（`docs/Phase6看板与通知设计.md` §11.1-§11.3 已给出 v1.2 可执行 SQL），但代码侧没建 `dashboard.module`；
- 没有 `DashboardService.getSalespersonMetrics()` / `getTeamMetrics()` / `getManagerMetrics()` 三个方法；
- 没有挂控制器。

**修复动作（P0-1）**：按 Phase 6 设计 §11 逐字落 SQL；看 §6 骨架。

---

### 2.3 Symptom C：SSE 推送端点缺失

**表层**：`GET /api/notifications/stream` 不存在；前端只能轮询，不满足 `Phase6设计 §6.2` 对 SSE 的硬要求。

**根因**：
- NestJS 的 `@Sse()` 装饰器 + `Observable<MessageEvent>` 模式没用上;
- 没有 `NotificationBus`（进程内 EventEmitter2 即可，看板 §6 骨架）把"任何写 notifications 的地方"广播给 SSE 订阅者。

**修复动作（P0-2）**：见 §6.3。

---

### 2.4 Symptom D：通知中心 CRUD 三端点缺失

**表层**：
- `GET /api/notifications`（分页列表）
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

三个均不存在。

**根因**：Phase 4 阶段 `NotificationService` 只做了发送（`send(...)`），**没有读取 & 标记 & 批量标记的出口 API**。

**修复动作（P0-3）**：见 §6.4。

---

### 2.5 Symptom E：导出模板应用逻辑缺失

**表层**：`GET /api/dispatched-orders/:id/export` 端点存在，但**只流式写全字段**，没有根据 `ExportTemplate.field_list` 过滤 & 重命名 & 字段值渲染（枚举、下拉、日期格式）。

**根因**：
- `ExportTemplate` 实体已在 Phase 1 定义，但 Phase 5 设计 §4 要求的 "templateId 选模板 / 字段白名单 / 值渲染" 三件事**均未串起来**;
- 没建 `ExportApplyService` 统一处理 "查模板 → 取字段白名单 → join 字典 → 流式写 exceljs 行"。

**修复动作（P1-1）**：见 §6.5。

---

### 2.6 Symptom F：撤回审批流程完善度不足

**表层**：Reviewer 提到 "Phase 5 要求的进一步完善"。对照 `docs/Phase5撤回与审批设计.md`：
- `POST /api/work-orders/:id/withdraw`（发起）→ 可能已部分存在；
- `POST /api/withdraw-requests/:id/approve`（审批）→ 需双轨（人事 + 业务）`settleWithdrawRequest` 决策逻辑；
- `POST /api/withdraw-requests/:id/cancel`（自撤）；
- `auto_agree_after` 定时检查（node-cron）→ `settle` 在到期时强制通过。

**根因**：本期成员**完全没碰**这条线。

**修复动作（P1-2）**：见 §6.6。

---

### 2.7 Symptom G：操作日志详情接口缺失

**表层**：`GET /api/admin/logs/:id` 不存在（列表 `GET /api/admin/logs` 可能已有）。

**根因**：
- `AuditInterceptor` 在 Phase 5 设计 §5.3 落库 `operation_logs`，**但详情接口没建**；
- 管理员看列表时没法下钻到 before/after JSON diff。

**修复动作（P1-3）**：一个 `@Get('logs/:id')` 控制器 + 权限拦截，非常小。见 §6.7。

---

### 2.8 Symptom H：通知通道分发缺失

**表层**：Reviewer 提到 "无通知中心通道分发实现"。`docs/Phase6设计 §6.4` 要求 `NotificationService.send` 内部根据 `channels[]` 分发到 `in_app` / `sse` / 未来的 `email|sms`。

**根因**：`send` 可能只写库，没分发。

**修复动作（P2-1）**：引入 `NotificationChannel` 接口 + 两实现（`InAppChannel` + `SseChannel`）。见 §6.8。

---

## 3. 修复优先级切分（P0 / P1 / P2）

### 3.1 P0 · 必修（复评门禁）

| 编号 | 项 | 预计工时 |
|------|----|---------|
| P0-0 | 任务范围 checklist + PR 顶部贴原文 | 0.25d |
| P0-1 | Dashboard 3 端点 + SQL 实现（Phase6 §11.1-§11.3 原文 SQL） | 1.5d |
| P0-2 | `GET /api/notifications/stream` SSE 端点 + NotificationBus | 0.5d |
| P0-3 | `GET /api/notifications` + `POST /:id/read` + `POST /read-all` | 0.5d |

### 3.2 P1 · 应修（复评前最好修）

| 编号 | 项 | 预计工时 |
|------|----|---------|
| P1-1 | `dispatched-orders/:id/export` 应用模板白名单 + 值渲染 | 1d |
| P1-2 | 撤回审批 `settleWithdrawRequest` + `auto_agree_after` cron | 1d |
| P1-3 | `GET /api/admin/logs/:id` 详情接口 + 权限 | 0.25d |

### 3.3 P2 · 可缓（不影响复评但影响上线）

| 编号 | 项 | 预计工时 |
|------|----|---------|
| P2-1 | NotificationChannel 抽象 + InApp/Sse 两实现 | 0.5d |
| P2-2 | 看板结果 60s 缓存（Phase6 §5.2） | 0.25d |
| P2-3 | SSE 心跳 15s keep-alive（防 nginx 超时） | 0.25d |

**合计**：P0 2.75 天 + P1 2.25 天 + P2 1 天 ≈ **6 天纯开发**。

---

## 4. Phase 5 需交付清单

> 与 `docs/Phase5撤回与审批设计.md` 逐条对齐。

| 编号 | 端点 / 能力 | 设计章节 | P |
|------|-------------|----------|---|
| P5-01 | `POST /api/work-orders/:id/withdraw`（发起撤回/修改申请） | §3.1 | P1-2 |
| P5-02 | `POST /api/withdraw-requests/:id/approve`（双轨审批 + settle） | §3.2 + §10.3 | P1-2 |
| P5-03 | `POST /api/withdraw-requests/:id/cancel`（自撤） | §3.3 | P1-2 |
| P5-04 | `PATCH /api/withdraw-requests/:id`（admin 强制落地） | §3.4 + §10.5 | P1-2 |
| P5-05 | `PUT /api/work-orders/:id` 走审批通道（修改通道） | §10.7 | P1-2 |
| P5-06 | `auto_agree_after` node-cron 定时检查 | §10.4 | P1-2 |
| P5-07 | `GET /api/dispatched-orders/:id/export?templateId=x` 应用模板 | §4 | P1-1 |
| P5-08 | `@Audit` 装饰器 + `AuditInterceptor` 异步落库 | §5.2-§5.6 | 已有/加固 |
| P5-09 | `GET /api/admin/logs/:id` 详情接口（含 before/after） | §5 + §6 | P1-3 |

---

## 5. Phase 6 需交付清单

> 与 `docs/Phase6看板与通知设计.md` 逐条对齐。

| 编号 | 端点 / 能力 | 设计章节 | P |
|------|-------------|----------|---|
| P6-01 | `GET /api/dashboard/salesperson` | §11.1 | P0-1 |
| P6-02 | `GET /api/dashboard/team/:module` | §11.2 | P0-1 |
| P6-03 | `GET /api/dashboard/manager` | §11.3 | P0-1 |
| P6-04 | `GET /api/notifications/stream`（SSE 长连接） | §6.2 | P0-2 |
| P6-05 | `GET /api/notifications`（分页列表） | §6.7 | P0-3 |
| P6-06 | `POST /api/notifications/:id/read` | §6.7 | P0-3 |
| P6-07 | `POST /api/notifications/read-all` | §6.7 | P0-3 |
| P6-08 | `NotificationService.send` 通道分发 | §6.4 | P2-1 |
| P6-09 | SLA 扫描 node-cron | §6.5 | 次要 |
| P6-10 | 看板 60s LRU 缓存 | §5.2 | P2-2 |

---

## 6. 文件骨架（TypeScript，可直接 `cp`）

### 6.1 模块结构（新增）

```
backend/src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
├── dashboard.service.ts
└── dto/
    ├── salesperson-metrics.dto.ts
    ├── team-metrics.dto.ts
    └── manager-metrics.dto.ts

backend/src/modules/notifications/（扩展）
├── notification.controller.ts            # 新增 list/read/readAll
├── notification-stream.controller.ts     # 新增 SSE
├── notification.bus.ts                   # 新增 进程内 EventEmitter
└── channels/
    ├── notification-channel.interface.ts
    ├── in-app.channel.ts
    └── sse.channel.ts

backend/src/modules/withdraw-requests/（新建/完善）
├── withdraw-requests.module.ts
├── withdraw-requests.controller.ts
├── services/
│   ├── withdraw-request.service.ts       # settleWithdrawRequest
│   └── auto-agree.cron.ts                # node-cron
└── dto/...

backend/src/modules/export-apply/
├── export-apply.service.ts               # 应用 ExportTemplate.field_list
└── field-renderer.ts                     # 枚举/下拉/日期值渲染

backend/src/modules/admin/
└── logs.controller.ts                    # 新增 GET /admin/logs/:id
```

### 6.2 Dashboard 骨架（P0-1）

**`dashboard.controller.ts`**

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DashboardService } from './dashboard.service';
import {
  SalespersonMetricsDto,
  TeamMetricsDto,
  ManagerMetricsDto,
} from './dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('salesperson')
  @Roles('salesperson', 'manager', 'admin')
  async salesperson(
    @CurrentUser() user: JwtUserPayload,
  ): Promise<SalespersonMetricsDto> {
    return this.service.getSalespersonMetrics(user.sub);
  }

  @Get('team/:module')
  @Roles('supervisor', 'manager', 'admin')
  async team(
    @Param('module') module: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<TeamMetricsDto> {
    return this.service.getTeamMetrics(module, user);
  }

  @Get('manager')
  @Roles('manager', 'admin')
  async manager(): Promise<ManagerMetricsDto> {
    return this.service.getManagerMetrics();
  }
}
```

**`dashboard.service.ts`（骨架）**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getSalespersonMetrics(userId: string) {
    // 严格执行 docs/Phase6看板与通知设计.md §11.1 的 SQL 基线
    const rows = await this.ds.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft')       AS draft_cnt,
        COUNT(*) FILTER (WHERE status = 'processing')  AS processing_cnt,
        COUNT(*) FILTER (WHERE status = 'completed'
                         AND completed_at >= date_trunc('month', now())) AS month_completed,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS month_created
      FROM work_orders
      WHERE created_by = $1
      `,
      [userId],
    );
    const r = rows[0] ?? {};
    const total = Number(r.month_created ?? 0);
    const done = Number(r.month_completed ?? 0);
    return {
      draft: Number(r.draft_cnt ?? 0),
      processing: Number(r.processing_cnt ?? 0),
      monthCreated: total,
      monthCompleted: done,
      completionRate: total ? +(done / total).toFixed(4) : 0,
      todo: Number(r.processing_cnt ?? 0),
    };
  }

  async getTeamMetrics(moduleCode: string, user: JwtUserPayload) {
    return this.ds.query(
      `SELECT ... FROM dispatched_orders WHERE module_code = $1 ...`,
      [moduleCode],
    );
  }

  async getManagerMetrics() {
    return this.ds.query(`SELECT ... FROM work_orders ...`);
  }
}
```

> **纪律**：三条 SQL 必须逐字照抄 `Phase6看板与通知设计.md` §11.1-§11.3 的基线；不要自己改 FROM / WHERE 口径。

### 6.3 SSE 通知推送（P0-2）

**`notification.bus.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';

export interface NotificationPayload {
  id: string;
  userId: string;
  bizType: string;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
}

@Injectable()
export class NotificationBus {
  private readonly subjects = new Map<string, Subject<NotificationPayload>>();

  constructor(private readonly events: EventEmitter2) {
    this.events.on('notification.created', (payload: NotificationPayload) => {
      this.subjects.get(payload.userId)?.next(payload);
    });
  }

  subscribe(userId: string): Observable<NotificationPayload> {
    let subj = this.subjects.get(userId);
    if (!subj) {
      subj = new Subject<NotificationPayload>();
      this.subjects.set(userId, subj);
    }
    return subj.asObservable();
  }

  unsubscribe(userId: string): void {
    this.subjects.get(userId)?.complete();
    this.subjects.delete(userId);
  }
}
```

**`notification-stream.controller.ts`**

```ts
import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { NotificationBus } from './notification.bus';

@Controller('notifications')
export class NotificationStreamController {
  constructor(private readonly bus: NotificationBus) {}

  @Sse('stream')
  stream(@CurrentUser() user: JwtUserPayload): Observable<MessageEvent> {
    const notifications$ = this.bus.subscribe(user.sub).pipe(
      map((payload) => ({ data: payload, type: 'notification' }) as MessageEvent),
    );
    const heartbeat$ = interval(15_000).pipe(
      map(() => ({ data: { ts: Date.now() }, type: 'ping' }) as MessageEvent),
    );
    return merge(notifications$, heartbeat$);
  }
}
```

> **nginx 注意**：`/api/notifications/stream` 必须关 `proxy_buffering off; proxy_read_timeout 1h;`，否则 SSE 不通。

### 6.4 通知中心 CRUD（P0-3）

**`notification.controller.ts`**

```ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUserPayload,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.listForUser({
      userId: user.sub,
      page: +page,
      pageSize: +pageSize,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.markRead(id, user.sub);
  }

  @Post('read-all')
  markAll(@CurrentUser() user: JwtUserPayload) {
    return this.service.markReadAll(user.sub);
  }
}
```

**`notification.service.ts` 新增片段**

```ts
async listForUser(q: { userId: string; page: number; pageSize: number; unreadOnly: boolean }) {
  const qb = this.repo
    .createQueryBuilder('n')
    .where('n.userId = :userId', { userId: q.userId })
    .orderBy('n.createdAt', 'DESC');
  if (q.unreadOnly) qb.andWhere('n.readAt IS NULL');
  const [list, total] = await qb
    .skip((q.page - 1) * q.pageSize)
    .take(q.pageSize)
    .getManyAndCount();
  return { page: q.page, pageSize: q.pageSize, total, list };
}

async markRead(id: string, userId: string) {
  await this.repo.update(
    { id, userId, readAt: IsNull() },
    { readAt: new Date() },
  );
  return { code: 0 };
}

async markReadAll(userId: string) {
  const { affected } = await this.repo.update(
    { userId, readAt: IsNull() },
    { readAt: new Date() },
  );
  return { code: 0, data: { updated: affected ?? 0 } };
}
```

### 6.5 导出模板应用（P1-1）

**`export-apply.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { ExportTemplate, DispatchedOrder, FieldConfig } from 'src/entities';
import { renderFieldValue } from './field-renderer';

@Injectable()
export class ExportApplyService {
  constructor(
    @InjectRepository(ExportTemplate)
    private readonly templateRepo: Repository<ExportTemplate>,
    @InjectRepository(DispatchedOrder)
    private readonly doRepo: Repository<DispatchedOrder>,
    @InjectRepository(FieldConfig)
    private readonly fieldRepo: Repository<FieldConfig>,
  ) {}

  async buildExportBuffer(dispatchedOrderId: string, templateId?: string): Promise<Buffer> {
    const order = await this.doRepo.findOneOrFail({
      where: { id: dispatchedOrderId },
      relations: ['workOrder'],
    });

    const template = templateId
      ? await this.templateRepo.findOneOrFail({ where: { id: templateId } })
      : null;

    const whitelist: string[] = template?.fieldList?.length
      ? template.fieldList
      : []; // 空白名单 → 全字段

    const fieldCfgs = await this.fieldRepo.find({
      where: { orderType: order.workOrder.orderType, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    const pickFields = whitelist.length
      ? fieldCfgs.filter((c) => whitelist.includes(c.fieldCode))
      : fieldCfgs;

    const wb = new Workbook();
    const ws = wb.addWorksheet(template?.name ?? 'export');
    ws.addRow(pickFields.map((c) => c.fieldName));

    const raw = { ...order.workOrder.extraData, ...order.extraData };
    ws.addRow(pickFields.map((c) => renderFieldValue(raw[c.fieldCode], c)));

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
```

### 6.6 撤回审批 settle（P1-2，`Phase5设计 §10.3`）

```ts
async settleWithdrawRequest(requestId: string): Promise<void> {
  await this.ds.transaction(async (em) => {
    const req = await em.findOne(WithdrawRequest, {
      where: { id: requestId },
      relations: ['approvals'],
    });
    if (!req || req.status !== 'pending') return;

    const hr = req.approvals.find((a) => a.track === 'hr');
    const biz = req.approvals.find((a) => a.track === 'business');

    const hrDone = hr?.decision && hr.decision !== 'pending';
    const bizDone = biz?.decision && biz.decision !== 'pending';
    if (!hrDone || !bizDone) return;

    const agreed = hr.decision === 'agree' && biz.decision === 'agree';
    req.status = agreed ? 'agreed' : 'rejected';
    req.settledAt = new Date();
    await em.save(req);

    if (agreed) {
      await this.applyWithdraw(em, req);  // 根据 req.type: withdraw / modify 分派
    }
    await this.notifications.send({
      templateCode: agreed ? 'withdraw_agreed' : 'withdraw_rejected',
      recipients: [req.requesterId],
      params: { requestId: req.id },
      bizType: 'withdraw',
    });
  });
}
```

**`auto-agree.cron.ts`**

```ts
import { Cron, CronExpression } from '@nestjs/schedule';

@Cron(CronExpression.EVERY_MINUTE)
async tick(): Promise<void> {
  const now = new Date();
  const due = await this.repo.find({
    where: { status: 'pending', autoAgreeAfter: LessThan(now) },
    take: 50,
  });
  for (const req of due) {
    await this.forceAgree(req.id, 'auto');
  }
}
```

### 6.7 操作日志详情（P1-3）

```ts
@Controller('admin/logs')
export class AdminLogsController {
  constructor(
    @InjectRepository(OperationLog)
    private readonly logRepo: Repository<OperationLog>,
  ) {}

  @Get(':id')
  @Roles('admin', 'manager')
  async detail(@Param('id') id: string) {
    const log = await this.logRepo.findOne({ where: { id } });
    if (!log) throw businessException(4040, 404, '日志不存在');
    return log; // beforeData / afterData 原文返回
  }
}
```

### 6.8 NotificationChannel 抽象（P2-1）

```ts
// channels/notification-channel.interface.ts
export abstract class NotificationChannel {
  abstract readonly code: 'in_app' | 'sse' | 'email' | 'sms';
  abstract deliver(payload: NotificationPayload): Promise<void>;
}

// channels/in-app.channel.ts
@Injectable()
export class InAppChannel extends NotificationChannel {
  readonly code = 'in_app';
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) { super(); }
  async deliver(p: NotificationPayload): Promise<void> {
    await this.repo.insert({ ...p, readAt: null });
  }
}

// channels/sse.channel.ts
@Injectable()
export class SseChannel extends NotificationChannel {
  readonly code = 'sse';
  constructor(private readonly events: EventEmitter2) { super(); }
  async deliver(p: NotificationPayload): Promise<void> {
    this.events.emit('notification.created', p);
  }
}
```

`NotificationService.send` 改造：遍历 `channels`，顺序调用。

---

## 7. 验收准则（5 维基线）

复评目标：**综合 ≥ 7 / 10**。

### 7.1 completeness（目标 ≥ 8 / 10）

- [ ] Dashboard 3 端点返回非空数据（至少 seed 数据下不为 null）
- [ ] `/notifications/stream` `curl -N` 能收到 `event: ping` 心跳
- [ ] `/notifications` 三接口走通；已读/全部已读影响 `unreadOnly=true` 结果
- [ ] `/dispatched-orders/:id/export?templateId=x` 返回的 xlsx **列数 = 模板 field_list 长度**
- [ ] `POST /withdraw` → `POST /approve ×2 (hr+biz)` → `settleWithdrawRequest` 最终改 work_order 状态 + 产生通知
- [ ] `GET /admin/logs/:id` 返回完整 `beforeData/afterData`

### 7.2 accuracy（目标 ≥ 7 / 10）

- [ ] PR 描述顶部贴任务描述 checklist，每项打勾且贴证据链接
- [ ] **自述摘要不提 Phase 4/3**
- [ ] SQL 与 `Phase6设计 §11` 完全一致（可用 git diff 对比）

### 7.3 codeQuality（目标 ≥ 7 / 10）

- [ ] `dashboard.service` 所有 raw SQL 带参数化（`$1, $2, ...`）
- [ ] SSE controller 挂心跳，断开时 `unsubscribe`
- [ ] `settleWithdrawRequest` 在单个事务里

### 7.4 adherence（目标 ≥ 8 / 10）

- [ ] 模块命名与 `docs/开发规范.md` 对齐
- [ ] 接口 URL 与 `docs/API规范.md` §4.5 / §4.6 完全一致
- [ ] 响应外壳统一 `{ code, data, message }`

### 7.5 innovation（目标 ≥ 6 / 10）

- [ ] 看板 SQL 聚合放到 DB 层，不在 JS 中跑 reduce
- [ ] SSE 用 `NotificationBus` 抽象，便于 Phase 7 升 Redis pub/sub

---

## 8. 返工执行节奏建议

| 天 | 内容 |
|----|------|
| D1 | P0-0 纪律（贴 checklist） + P0-1 三看板 SQL 落地并 smoke |
| D2 | P0-2 SSE + P0-3 通知 CRUD |
| D3 | P1-1 导出模板应用 + P1-3 logs 详情 |
| D4 | P1-2 撤回 settle + auto_agree cron + 回归 |
| D5 | P2 可选 + 端到端 smoke + PR 自核 |
| D6 | 代码冻结、Reviewer 复评 |

**提交纪律**：
- PR 顶部贴任务描述 checklist；每项打勾 + 证据（curl 截图 / 日志链接）；
- 绝对不再混入 Phase 4 的 bug 修复（那条线走 `1cc9ff3b` 任务的 `Phase4功能性bug根因报告.md`）；
- 自述摘要一句话：**"本轮交付 Phase 5/6 后端：3 看板 + SSE + 通知 CRUD + 导出模板 + 撤回 settle + 日志详情"**。

---

## 变更日志

- v1.0（2026-05-11）：初版，针对评审 round1 = 1/10 + drift:deliverable_missing + drift:goal_changed，给出 16 项交付清单、8 份 TS 骨架、5 维验收基线与 6 天节奏。