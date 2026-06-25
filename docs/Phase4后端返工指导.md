# Phase 4 后端返工指导

> 版本：v1.0（2026-05-11）
> 面向：Phase 4 后端返工同事、Reviewer
> 作者：architect
>
> **定位**：Phase 4 后端任务 `7de7dd6c-d796-43d0-adf9-04a0fbbbf0ab` 被评审打回（**2.3/10**），核心交付物几乎全缺。本文是**唯一返工依据**，沿用 `docs/Phase3后端返工指导.md` 的骨架，但结论更重：**这是一次重写，不是修补**。
>
> 同步阅读：
> - `docs/Phase4导入与回流设计.md`（**权威设计**，不变）
> - `docs/Phase4AI导入服务分层设计.md`（5 层分层，**权威**，不变）
> - `docs/Phase4AI映射样本库.md`（Few-shot 与增量样本）
> - `docs/Phase4测试用例.md`（验收清单）
> - `docs/API规范.md` §4.3（接口契约）

---

## 目录
- [1. 评审结果摘要](#1-评审结果摘要)
- [2. driftLabel 深度诊断](#2-driftlabel-深度诊断)
- [3. 修复优先级切分](#3-修复优先级切分)
- [4. 需要创建的文件清单 + 关键骨架](#4-需要创建的文件清单--关键骨架)
- [5. 验收准则（5 维基线）](#5-验收准则5-维基线)
- [6. 返工执行节奏建议](#6-返工执行节奏建议)

---

## 1. 评审结果摘要

| 指标 | 值 |
|------|----|
| 任务 ID | `7de7dd6c-d796-43d0-adf9-04a0fbbbf0ab` |
| 任务名 | Phase 4 后端 - Excel 导入 + AI 映射 + 字段补充 + 退回流程 |
| 评审轮次 | 1 |
| 评审分数 | **2.3 / 10**（不通过，`changes_requested`） |
| driftLabels | `drift:deliverable_missing`、`drift:goal_changed`（**两条 drift 同时出现** = 提交内容与任务范围完全错位） |

### 1.1 五个维度的得分

| 维度 | 得分 | 权重 | 评审意见（摘） |
|------|------|------|----------------|
| completeness | 2 | 0.3 | upload 模块 0/3、AI 模块 0/1、previewImport 是存根、confirmImport 是存根、错误报表/行级校验/异步/批量创建全缺 |
| accuracy | 2 | 0.25 | 成员自述摘要写的是 Phase 3 返工（拦截器 / HandlerPicker / submit 事务），**与 Phase 4 任务完全不对**；`confirmImport` 直接把 ImportJob 标记 `COMPLETED`、`successRows=0` 是功能性错误；置信度硬编码 `0.86/0.99` 无实际 LLM 调用 |
| codeQuality | 3 | 0.2 | Phase 3 代码已在上轮评审拿到 8.9/10；但 Phase 4 要交的代码几乎不存在，没得评；**存根掩盖真实失败**属于危险模式 |
| adherence | 2 | 0.15 | 明确要求对齐 `Phase4AI导入服务分层设计.md` + `Phase4导入与回流设计.md`；提交的是 Phase 3 返工 |
| innovation | 3 | 0.1 | Phase 3 的 advisory lock / 乐观锁已在上轮认可；Phase 4 无新实现 |

### 1.2 Reviewer 的 5 条 suggestions（原文照录）

> 1. 实现 `POST /api/upload/excel` 端点：使用 multer 接收 Excel 文件，存储到本地文件系统，返回 filePath 供后续使用；
> 2. 实现 `POST /api/ai/field-mapping` 端点：读取 Excel 表头，构造 prompt 调用 OpenAI 兼容接口，返回字段映射建议；
> 3. 重写 `previewImport`：接收 filePath，用 exceljs/xlsx 解析第一行表头，调用 AI 映射服务返回建议；
> 4. 重写 `confirmImport`：按 fieldMapping 逐行读取 Excel 数据，调用 WorkOrderValidationService 验证每行，合规行创建工单并触发派发，不合规行收集错误，生成错误报表 Excel，异步更新 ImportJob 状态；
> 5. 实现 `GET /api/files/:id` 端点：从本地文件系统返回文件（含错误报表下载）。

### 1.3 Reviewer summary（原文照录）

> "Phase 4 后端评审不通过。成员提交的内容是 Phase 3 返工（字段权限拦截器升级、HandlerPicker 四策略、submit 事务化等），与 Phase 4 任务目标（Excel 导入 + AI 映射 + 字段补充 + 退回流程）完全不符。核心交付物全部缺失：upload 模块（3 个端点）、AI 映射模块（1 个端点）、真实 Excel 解析与批量验证逻辑、错误报表生成、ImportJob 异步处理流程均未实现。现有 previewImport 和 confirmImport 均为存根，confirmImport 直接将任务标记为 COMPLETED 属于功能性错误。需要重新实现 Phase 4 全部交付物。"

---

## 2. driftLabel 深度诊断

> **整体根因**：这不是"实现质量不足"，而是"**交付目标发生了错位**"——成员把应当交付 Phase 4 的精力用于再写 Phase 3 的强化。`drift:goal_changed` + `drift:deliverable_missing` 两条标签**同时出现**已经说明：修补不是解法，**重新按 Phase 4 设计落地**才是。下面把诊断拆成症状 A-F，对应到具体的设计章节与修复动作。

### 2.1 Symptom A（根因）：`drift:goal_changed` — 目标错位

**表层症状**：成员自述摘要和提交 diff 讲的是"Phase 3 拦截器 + HandlerPicker + submit 事务"。

**根因**：
- 评审上一轮确认 Phase 3 拿了 8.9/10 后，成员误认为"既然在改 Phase 3，顺着往下做更深的 Phase 3 就行"；
- 看板没有把"任务范围"作为硬门禁，导致范围漂移不被自动拦截；
- **提交摘要**是首要诊断口——Reviewer 也据此立刻发现错位。

**修复动作（P0-0，在写代码前）**：
- 返工第一步：**把 Phase 3 的改动从这个 branch 上拆出去**（如果有的话），不要混进 Phase 4；
- **按任务描述原文**重新读一遍：Phase 4 的范围是"导入 + AI + 字段补充回流 + 退回"，其中"字段补充回流和退回流程已在 Phase 3 实现" → 本轮真正新交付的只有：
  - **导入流程**：upload / preview / confirm / progress / error-report / cancel
  - **AI 映射**：field-mapping + provider 注册 + fallback
- 提交前写清摘要，明确写"本 PR 不动 Phase 3"。

---

### 2.2 Symptom B：upload 模块 0/3（文件接收与下发完全缺失）

**表层症状**：
- `POST /api/upload/excel`：前端上传 Excel 无处可去；
- `POST /api/upload/attachment`：附件上传通道没有；
- `GET /api/files/:id`：错误报表 / 附件下载无处可下。

**根因**：Phase 3 不需要文件落盘，所以 upload 模块**在 Phase 3 之前就没动过**；Phase 4 设计文档 §1.4 明确把"文件生命周期"作为 Phase 4 独有职责，成员没把它当新模块来建。

**修复动作（P0-1）**：
- 新建 `backend/src/modules/uploads/` 模块（controller + service + module）；
- 用 **multer + `diskStorage`** 把文件写到 `UPLOAD_DIR/imports/{userId}/{uuid}.xlsx`；
- `GET /api/files/:id` 的 id 实际是 `import_jobs.id` 或 `uuid`，服务端用 `res.download()` + 鉴权（只能下载自己的，admin 例外）；
- 大小限制：`MAX_UPLOAD_SIZE = 20 MB`；非 `.xlsx` / `.xls` 一律 422；
- 参考 `Phase4导入与回流设计.md` §1.4「文件生命周期」。

---

### 2.3 Symptom C：AI 映射模块 0/1（没有真正的 AI 调用）

**表层症状**：`POST /api/ai/field-mapping` 不存在；`previewImport` 里 `confidence` 硬编码 `0.86 / 0.99`，没调过 LLM。

**根因**：
- `AiMappingService` 在 Phase 4 分层设计 §3 是**五大核心 service 之一**，但代码里**只留了存根**；
- 没有 `LlmProvider` 接口、没有 `OpenAIProvider` / `QwenProvider` / `DeepSeekProvider` 三个实现、没有 `isAvailable` 启动探活、没有失败冷却 30s；
- 没有 LRU 缓存、没有 prompt hash、没有 fallback fuzzy（jaccard bigram + jaroWinkler）。

**修复动作（P0-2）**：
- 新建 `modules/ai/field-mapping.controller.ts` 暴露 `POST /api/ai/field-mapping`；
- 新建 `modules/ai/ai-mapping.service.ts` 承接：provider 注册 / LRU / fallback / prompt 构造；
- 新建 `modules/ai/providers/{openai,qwen,deepseek}.provider.ts` + 基类 `llm-provider.interface.ts`；
- 参考 `Phase4AI导入服务分层设计.md` §3.1-§3.5 完整实现；
- Fallback 路径**不能省**：没 API Key 的开发环境、调用 503 都走 fuzzy，**不能让整个请求挂起**。

---

### 2.4 Symptom D：`previewImport` 是存根 — 没有 Excel 真解析

**表层症状**：成员的 `previewImport` 做的是字符串模糊匹配，根本没读过 Excel 文件。

**根因**：
- 没建 `ExcelParserService`；Phase 4 分层设计 §4 规定它要处理：多行表头合并、合并单元格展开、空白列剔除；
- 没用 `exceljs`（或 `xlsx`）库；
- `preview` 的 `fileId` 机制没搭起来（上传和预览解耦的基础）。

**修复动作（P0-3）**：
- 新建 `modules/imports/excel-parser.service.ts`，用 **exceljs 的 stream API** 解析；
- `parse(buffer, opts)` 返回 `ParsedSheet { headers, rows[], meta }`；
- 先建 `preview` 端点：上传后只读前 10 行 + 表头 → 调 `AiMappingService.suggest` → 返回 `PreviewImportResponse`；
- 参考 `Phase4导入与回流设计.md` §1.3 DTO 与 §1.5 校验规则，`Phase4AI导入服务分层设计.md` §4。

---

### 2.5 Symptom E（最严重）：`confirmImport` 把所有任务直接置 `COMPLETED`

**表层症状**：任何 confirm 请求都把 `ImportJob.status=COMPLETED`，`successRows=0`，`failRows=0`。

**根因**：
- 这是个**假成功**——前端会看到导入"成功"但没有任何工单被创建，**是功能性错误不是质量问题**；
- 缺 `WorkOrderImportService`（分层设计 §2.2 + §6）、缺 `FieldValidationService`（分层设计 §5）、缺异步队列（分层设计 §8）、缺错误报表生成（§7）；
- 根本上是没有把"异步任务处理流程"搭出来：没有"confirm 落 import_jobs → enqueue → 后台 worker 分批 → 生成报表 → 更新计数"的链路。

**修复动作（P0-4，最重）**：

分 3 小步，**顺序不能乱**：

1. **行级校验** `modules/imports/field-validation.service.ts`：按 §1.5 五类规则 + §5.2 执行顺序，返回 `RowValidationResult`；
2. **批量写入** `modules/imports/work-order-import.service.ts`：
   - `bulkWrite(job, validatedRows)` 按 500 行一个事务 `INSERT ... RETURNING id`；
   - 幂等索引 `uk_wo_import_ref`（见 §1.6 SQL）**必须建**；
   - `autoSubmit=true` 时，事务 commit 之后把 id 推入"submit 子任务池"（并发 5）；
3. **异步入口** `modules/imports/import-job.service.ts.confirm(jobId, mapping)`：
   - 同步校验 mapping 合法、落 `import_jobs.field_mapping`；
   - 异步入队（本期用 **setImmediate + 进程内队列**就行，Phase 6 再换 BullMQ）；
   - 后台 `processJob(jobId)`：读文件 → 分批 → 校验 → 批写 → 更新 counter → 收集 fail rows → 生成 errors.xlsx → status=completed/failed/cancelled；
   - 每 500 行更新一次 `successRows/failRows/progress`，保证前端 2s 轮询能看见增长。

参考：`Phase4导入与回流设计.md` §1.6-§1.8 / `Phase4AI导入服务分层设计.md` §6 + §7 + §8.1。

---

### 2.6 Symptom F：测试几乎为零

**表层症状**：`Phase4测试用例.md` 有用例但无对应 Jest 测试。

**根因**：所有 service 都是存根，自然没得写测试。

**修复动作（P1-1）**：上面 P0-2/P0-3/P0-4 落地后，按 `Phase4AI导入服务分层设计.md` §10.1 的单测矩阵补齐：
- `ai-mapping.service.spec.ts`（≥ 8 用例：成功 / JSON 非法 → fallback / timeout → fallback / no_api_key → fallback / cache hit / 冷却触发 / prompt hash 变化 / provider 优先级）；
- `excel-parser.service.spec.ts`（≥ 6 用例：单行表头 / 两行合并表头 / 合并单元格 / 空列剔除 / 大文件 stream / 坏文件）；
- `field-validation.service.spec.ts`（≥ 10 用例：5 类规则 + 边界）；
- `work-order-import.service.spec.ts`（≥ 6 用例：500 行分批 / 幂等重试 skip / autoSubmit 并发 5 / 一行失败不影响整批 / 事务回滚 / counter 增量）。

---

## 3. 修复优先级切分

### 3.1 P0 · 必修（不修过不了复评）

| 编号 | 动作 | 依据 | 估时 |
|------|------|------|------|
| P0-0 | 剥离任何 Phase 3 改动；新 branch 从 main 拉 | drift:goal_changed | 0.5h |
| P0-1 | 建 `uploads` 模块（multer + /api/upload/excel + /api/upload/attachment + /api/files/:id） | suggestion #1 #5、`导入与回流设计.md §1.4` | 0.5d |
| P0-2 | 建 `ai` 模块：AiMappingService + 3 Provider + fallback fuzzy + LRU + `/api/ai/field-mapping` | suggestion #2、`分层设计.md §3` | 1.5d |
| P0-3 | 建 `ExcelParserService`；重写 previewImport 走真解析 + AI | suggestion #3、`分层设计.md §4`、`导入与回流设计.md §1.3` | 0.5d |
| P0-4 | 建 FieldValidationService + WorkOrderImportService + ImportJobService 异步链路；重写 confirmImport | suggestion #4、`分层设计.md §5-§8`、`导入与回流设计.md §1.5-§1.8` | 2d |
| P0-5 | 建幂等索引 `uk_wo_import_ref`（见 §1.6 SQL）；migration + down | `导入与回流设计.md §1.6` | 0.5h |
| P0-6 | ImportModule、UploadsModule、AiModule 三个模块都要注册进 `AppModule.imports` | NestJS 规范 + Phase 3 教训 | 10min |
| P0-7 | e2e 跑通黄金路径：上传 → preview → confirm → progress 从 0→100 → 下载 error report | `Phase4测试用例.md` §3 | 0.5d |

### 3.2 P1 · 应修（复评前最好修）

| 编号 | 动作 | 依据 | 估时 |
|------|------|------|------|
| P1-1 | 补齐 4 个 service 的单测，合计 ≥ 30 条 | `分层设计.md §10.1` | 1d |
| P1-2 | 错误报表 exceljs stream 实现，格式按 `导入与回流设计.md §6` | 同 | 0.5d |
| P1-3 | 取消端点 `POST /:jobId/cancel`（仅 processing 态） | `导入与回流设计.md §1.2` + `分层设计.md §8.4` | 0.5h |
| P1-4 | Prometheus 指标：import_jobs_total{status}、ai_provider_failure_total{provider,reason}、row_validate_duration_seconds | `分层设计.md §9.1` | 0.5d |
| P1-5 | 结构化 pino 日志：每批次一条，带 jobId / batchIndex / successDelta / failDelta | `分层设计.md §9.3` | 1h |

### 3.3 P2 · 可缓（不影响复评，但进入 Phase 5/6 前要收）

| 编号 | 动作 | 依据 | 估时 |
|------|------|------|------|
| P2-1 | BullMQ 替换进程内队列（Phase 6 一起做） | `分层设计.md §8.1` | 1d |
| P2-2 | SSE 进度推送（Phase 6 同步做） | `分层设计.md §8.3` | 0.5d |
| P2-3 | 7 天过期文件 cron 清理（Phase 6 做） | `导入与回流设计.md §1.4` | 0.5d |

---

## 4. 需要创建的文件清单 + 关键骨架

> 以下为**最小必要**文件列表；未列出的 dto/types/mappers 按职责拆分，不展开。路径相对 `backend/src/`。

### 4.1 Uploads 模块（P0-1）

```
modules/uploads/
├── uploads.controller.ts     # POST /api/upload/excel, /api/upload/attachment, GET /api/files/:id
├── uploads.service.ts        # 保存、鉴权查找、流式下载
├── uploads.module.ts
└── dto/
    ├── upload-response.dto.ts
    └── file-descriptor.dto.ts
```

**controller 骨架**：

```ts
// pseudo
@Controller()
export class UploadsController {
  @Post('upload/excel')
  @UseInterceptors(FileInterceptor('file', { storage: excelDiskStorage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: onlyXlsx }))
  uploadExcel(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.svc.registerUpload(file, req.user.id, 'excel');
  }

  @Get('files/:id')
  async download(@Param('id') id: string, @Req() req, @Res() res: Response) {
    const desc = await this.svc.findForUser(id, req.user);
    res.download(desc.absPath, desc.originalName);
  }
}
```

### 4.2 AI 模块（P0-2）

```
modules/ai/
├── ai.controller.ts                # POST /api/ai/field-mapping
├── ai-mapping.service.ts           # suggest() + LRU + fallback
├── providers/
│   ├── llm-provider.interface.ts
│   ├── openai.provider.ts
│   ├── qwen.provider.ts
│   └── deepseek.provider.ts
├── fallback/fuzzy.ts               # jaccard + jaroWinkler
├── prompt/prompt-builder.ts        # 按 §2.2 模板
└── ai.module.ts
```

**service 骨架**：

```ts
// pseudo
@Injectable()
export class AiMappingService implements OnModuleInit {
  private providers: LlmProvider[] = [];
  private cooldown = new Map<string, number>();
  private cache = new LRUCache<string, MappingSuggestion>({ max: 1000, ttl: 24 * 3600_000 });

  async onModuleInit() {
    const order = this.cfg.get('AI_PROVIDER_ORDER').split(',');
    for (const name of order) {
      const p = this.buildProvider(name);
      if (await p.isAvailable()) this.providers.push(p);
    }
  }

  async suggest(orderType: string, headers: string[]): Promise<MappingSuggestion> {
    const key = this.hash(orderType, headers);
    const cached = this.cache.get(key); if (cached) return cached;

    for (const p of this.providers) {
      if (this.isCooling(p.name)) continue;
      try {
        const raw = await p.call(this.buildPrompt(orderType, headers));
        const validated = this.validateJson(raw);
        const result = { ...validated, modelUsed: `${p.name}:${p.modelId}`, promptHash: key };
        this.cache.set(key, result);
        return result;
      } catch (e) { this.recordFailure(p.name, e); }
    }
    return this.fallbackFuzzy(orderType, headers);
  }
}
```

### 4.3 Imports 模块（P0-3 + P0-4 + P0-5）

```
modules/imports/
├── import.controller.ts            # /api/work-orders/import/[preview|confirm|:jobId|...|cancel|error-report]
├── import-job.service.ts           # 入口（preview / confirm / progress / cancel / downloadErrorReport）
├── excel-parser.service.ts         # ParsedSheet 多行表头、合并单元格
├── field-validation.service.ts     # 5 类规则 + 条件必填
├── work-order-import.service.ts    # 500 行批事务 + autoSubmit 池
├── error-report.service.ts         # exceljs stream 写错误报表
├── queue/
│   ├── import-queue.ts             # 进程内队列（P2 换 BullMQ）
│   └── worker.ts                   # processJob(jobId)
├── types/
│   ├── parsed-sheet.ts
│   ├── mapping-item.ts
│   └── row-validation.ts
└── imports.module.ts
```

**import-job.service.ts 骨架**：

```ts
// pseudo
@Injectable()
export class ImportJobService {
  async preview(fileId: string, orderType: string): Promise<PreviewImportResponse> {
    const { absPath } = await this.uploads.findForUser(fileId, this.ctx.user);
    const parsed = await this.parser.parse(absPath, { headerRows: 1, sampleRows: 10 });
    const suggestion = await this.ai.suggest(orderType, parsed.headers);
    const fields = await this.fieldCfg.listEnabled(orderType);
    return { fileId, orderType, headers: parsed.headers, rowCount: parsed.meta.totalRows,
             preview: parsed.rows.slice(0, 10),
             suggestion: suggestion.suggestion, confidence: suggestion.confidence,
             unmatched: suggestion.unmatched, availableFields: fields };
  }

  async confirm(dto: ConfirmImportDto, user: User): Promise<ImportJobStatusVo> {
    this.assertMappingValid(dto.mapping);
    const job = await this.repo.save({
      userId: user.id, filePath: await this.uploads.resolve(dto.fileId),
      fieldMapping: dto.mapping, status: 'processing',
      totalRows: 0, successRows: 0, failRows: 0, startedAt: new Date(),
    });
    this.queue.push(job.id);   // setImmediate -> worker.processJob
    return this.toVo(job);
  }

  async getProgress(jobId: number, user: User) {
    const job = await this.repo.findOneForUser(jobId, user);
    return this.toVo(job);
  }

  async cancel(jobId: number, user: User) {
    const { affected } = await this.repo.updateWhere(
      { id: jobId, userId: user.id, status: 'processing' },
      { status: 'cancelled' },
    );
    if (!affected) throw new ConflictException('4401 cancel_state_invalid');
  }

  async downloadErrorReport(jobId: number, user: User) {
    const job = await this.repo.findOneForUser(jobId, user);
    if (!job.errorReportPath) throw new NotFoundException();
    return this.uploads.streamByPath(job.errorReportPath);
  }
}
```

**worker 骨架**：

```ts
// pseudo
export async function processJob(jobId: number, deps: Deps) {
  const job = await deps.repo.find(jobId);
  try {
    for await (const batch of deps.parser.stream(job.filePath, { batchSize: 500, skipHeader: true })) {
      if (await deps.repo.isCancelled(jobId)) return;
      const validated = batch.map(row => deps.validator.validateRow(row, job.fieldMapping, deps.cfg.get()));
      const ok = validated.filter(r => r.ok);
      const bad = validated.filter(r => !r.ok);
      const write = await deps.importer.bulkWrite(job, ok);    // 返回 success/fail 统计
      await deps.errorReport.appendRows(jobId, bad);
      await deps.repo.incrementCounters(jobId, write.success, write.fail + bad.length);
    }
    await deps.errorReport.close(jobId);
    await deps.repo.markCompleted(jobId);
  } catch (e) {
    await deps.repo.markFailed(jobId, e.message);
  }
}
```

### 4.4 migration 骨架（P0-5）

```ts
// backend/src/database/migrations/Phase4Import-xxxxxxxxxxxx.ts
export class Phase4Import implements MigrationInterface {
  public async up(q: QueryRunner) {
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uk_wo_import_ref ON work_orders (
        ((extra_data->'__importRef'->>'jobId')),
        ((extra_data->'__importRef'->>'rowNo'))
      ) WHERE extra_data ? '__importRef';
    `);
    // 如 import_jobs / ai_mapping_samples 等 Phase 4 相关表不存在，这里补齐
  }
  public async down(q: QueryRunner) {
    await q.query(`DROP INDEX IF EXISTS uk_wo_import_ref;`);
  }
}
```

### 4.5 AppModule 注册（P0-6）

```ts
// backend/src/app.module.ts
@Module({
  imports: [
    // ... 既有模块
    UploadsModule,     // 新
    AiModule,          // 新
    ImportsModule,     // 新
  ],
})
export class AppModule {}
```

> 教训回顾：Phase 3 后端就是因为 `WorkOrderModule` 没登记 → `/work-orders` 全路径 404。**一定验证一次**：`curl /api/upload/excel` 返 200/401/415（有 upload 字段时），而不是 404。

---

## 5. 验收准则（5 维基线）

Reviewer 下一轮按这 5 维对齐期望。**不到基线 = 不过评**。

### 5.1 completeness（目标 ≥ 8 / 10）

- [ ] `POST /api/upload/excel` 返 200 带 `fileId`
- [ ] `GET /api/files/:id` 鉴权下载成功
- [ ] `POST /api/ai/field-mapping` 真调 LLM（有 API Key 时）或 fallback（无 Key 时），返回 `suggestion/confidence/unmatched/modelUsed`
- [ ] `POST /api/work-orders/import/preview` 真解析 Excel 前 10 行 + 表头 + AI 建议
- [ ] `POST /api/work-orders/import/confirm` 异步落 import_jobs，后台真分批写工单
- [ ] `GET /api/work-orders/import/:jobId` 进度从 0 → 100
- [ ] `GET /api/work-orders/import/:jobId/error-report` 下载 exceljs 报表
- [ ] `POST /api/work-orders/import/:jobId/cancel` 仅 processing 态可取消

### 5.2 accuracy（目标 ≥ 7 / 10）

- [ ] `previewImport.confidence` 是 LLM 实际返回或 fallback 真分数，**不是硬编码**
- [ ] `confirmImport` 返回的 `ImportJob` 初始 `status='processing'`、`successRows=0` 但最终会增长
- [ ] autoSubmit=true 时，成功行触发 DispatchEngineService 的次数 = successRows
- [ ] 幂等：同 fileId 重复 confirm → 新 jobId；同 jobId 下重复行（idx 冲突）被 `uk_wo_import_ref` skip
- [ ] cancel 后 worker 停止下一批；已写入的不回滚（documented behavior）

### 5.3 codeQuality（目标 ≥ 7 / 10）

- [ ] 单文件 ≤ 500 行；service 按 5 层分（import-job / excel-parser / ai-mapping / field-validation / work-order-import）
- [ ] TypeScript strict，无 any、无 ts-ignore
- [ ] Provider 抽象到接口；替换 provider 不改 AiMappingService
- [ ] FieldValidationService 把"规则"做成 `Map<string, RuleFn>`，新加规则无需改主路径

### 5.4 adherence（目标 ≥ 8 / 10）

- [ ] 接口路径、DTO 字段名 100% 对齐 `docs/Phase4导入与回流设计.md §1.2-§1.3`
- [ ] 错误码与 §4.5 对齐（4400 超行 / 4401 cancel 非法态 / 4402 mapping 非法）
- [ ] 错误报表格式与 §6 对齐（行号、字段、reason、message、原始值）
- [ ] Provider 优先级、冷却、LRU 与分层设计 §3.2 对齐
- [ ] 3 个新模块全部注册到 AppModule（**Phase 3 教训**）

### 5.5 innovation（目标 ≥ 6 / 10）

- [ ] Provider fallback（openai → qwen → deepseek → fuzzy）链路有自测证据（关一个 env，看日志走下一个）
- [ ] 进程内队列含背压（并发 5、超时熔断）
- [ ] 错误报表 exceljs **stream 写**而非 in-memory（大数据量不爆内存）

**复评综合分目标：≥ 7.5 / 10**（Phase 3 复评基线一致）。

---

## 6. 返工执行节奏建议

| 天 | 动作 |
|----|------|
| Day 0（半天） | P0-0：拉新 branch；读 Phase 4 两份设计文档 + 本文；确认范围 |
| Day 1 | P0-1（uploads）+ P0-5（migration） + P0-6（模块注册）+ 冒烟 curl |
| Day 2-3 | P0-2（AI 模块：Provider + fallback + LRU + 真调通） |
| Day 3（下半） | P0-3（ExcelParserService + previewImport 重写） |
| Day 4-5 | P0-4（ImportJob 异步链路 + FieldValidation + WorkOrderImport + ErrorReport） |
| Day 6 | P1-1 单测 + P1-2 错误报表精修 + P1-3 cancel |
| Day 7（半天） | P0-7 e2e 黄金路径 + 自测 curl 清单全过 + 提 PR |

**提交纪律**：
- PR 描述写清"Phase 4 新建模块 3 个 / 修改模块 0 个 / 迁移 1 条"；
- 附 `curl` 自测清单截图（见 §5.1）；
- 摘要中**明确标注**"与 Phase 3 无关改动"，避免再次 drift。

---

## 变更日志

- v1.0（2026-05-11）：初版，针对评审 round1 = 2.3 / drift:deliverable_missing + drift:goal_changed 给出重写级返工路径、文件清单与骨架。