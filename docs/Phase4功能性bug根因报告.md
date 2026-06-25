# Phase 4 功能性 bug 根因报告

> 版本：v1.0（2026-05-11）
> 面向：Phase 4 后端第三轮返工同事、QA、Reviewer
> 作者：architect
>
> **背景**：Phase 4 后端上一轮已过评审（二轮 review 通过），但 QA 在 Windows 本地真实 PG16 + `http://127.0.0.1:3000/api` 做端到端复测，用 5 份 `tests/phase4-fixtures/*.xlsx` 跑完整 upload → preview → confirm → poll 链路，**全部不通过**，`successRows=0`。标准模板、真实客户模板、部分成功、格式错误 4 种 fixture 都无法创建任何 `work_orders`。
>
> 本文把 6 个缺陷（P4-E2E-001 到 P4-E2E-006）从"QA 看到的现象" → "代码级根因" → "修复代码片段" 打通，backend 按本文第 7 章的修复步骤直接动手即可。
>
> 同步阅读：
> - `docs/Phase4已知问题.md`（QA 缺陷清单，**权威**）
> - `docs/Phase4端到端复测报告.md`（复测证据链）
> - `docs/Phase4导入与回流设计.md` §1（接口契约）
> - `docs/Phase4AI导入服务分层设计.md` §4（ExcelParser）
> - `docs/Phase4_三模块接口契约.md` §5（preview JSON 契约）

---

## 目录
- [1. 评审态 vs 现实态：为什么评审通过了还炸](#1-评审态-vs-现实态为什么评审通过了还炸)
- [2. P4-E2E-001：preview JSON fileId 契约不通](#2-p4-e2e-001preview-json-fileid-契约不通)
- [3. P4-E2E-002：表头被误判为二级表头](#3-p4-e2e-002表头被误判为二级表头)
- [4. P4-E2E-003：中文表头乱码](#4-p4-e2e-003中文表头乱码)
- [5. P4-E2E-004：standard.xlsx 无法创建 work_orders](#5-p4-e2e-004standardxlsx-无法创建-work_orders)
- [6. P4-E2E-005：partial-success 被误判为 failed](#6-p4-e2e-005partial-success-被误判为-failed)
- [7. P4-E2E-006：format-err 在映射阶段被阻断](#7-p4-e2e-006format-err-在映射阶段被阻断)
- [8. 修复顺序与执行步骤（12 步，按序执行）](#8-修复顺序与执行步骤12-步按序执行)
- [9. 验收脚本与门禁](#9-验收脚本与门禁)
- [10. 纪律再强调：本轮只改 Phase 4，不碰 Phase 3/5/6](#10-纪律再强调本轮只改-phase-4不碰-phase-35-6)

---

## 1. 评审态 vs 现实态：为什么评审通过了还炸

| 层面 | 评审看到的 | QA 真实跑到的 |
|------|-----------|--------------|
| 模块存在 | ✅ `imports.module` / `excel-parser` / `ai-mapping` 全部存在 | ✅ |
| 单测 | ✅ `field-validation.spec` / `excel-parser.spec` 绿灯 | N/A |
| 端到端 | ❌ **没有对真实 Excel fixtures 做过复测** | ❌ 5 份 fixture 全红 |

**结论**：评审通过只证明"代码写了"，不证明"功能跑通"。Phase 5 以后**强制要求**端到端 fixture 复测纳入 DoD（见 §8 步骤 12）。

---

## 2. P4-E2E-001：preview JSON fileId 契约不通

### 2.1 QA 现象

```text
POST /upload/excel → fileId=8d9670d4-...
POST /api/work-orders/import/preview { "fileId": "..." } → 400 Bad Request
脚本 fallback 到 multipart preview 才继续
```

### 2.2 代码级根因

`backend/src/modules/import/import.controller.ts:22-30`：

```ts
@Post('import/preview')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: excelFilter }))
async preview(@UploadedFile() file: Express.Multer.File | undefined, @Body() payload: PreviewImportDto) {
  if (!file) {
    throw businessException(4400, 400, 'Excel文件缺失');
  }
  return this.workOrderImportService.preview(file, payload);
}
```

- **只接受 `multipart/form-data`**；
- `file` 必填，没有 `if (!file && payload.fileId)` 的 JSON 支路；
- 与 `docs/Phase4_三模块接口契约.md` §5.1 规定的"二选一"契约不符。

### 2.3 修复（TS 可拷贝）

**文件 1**：`backend/src/modules/import/dto/preview-import.dto.ts`（扩展）

```ts
import { IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class PreviewImportDto {
  @IsString()
  @IsIn(['onboarding', 'renewal', 'resignation'])
  orderType!: 'onboarding' | 'renewal' | 'resignation';

  @ValidateIf((o) => !o.__hasFile)
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  sampleRows?: number;

  __hasFile?: boolean;
}
```

**文件 2**：`backend/src/modules/import/import.controller.ts`（替换 `preview` 方法）

```ts
@Post('import/preview')
@Roles('salesperson', 'manager', 'admin')
@UseInterceptors(
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: excelFilter,
  }),
)
async preview(
  @UploadedFile() file: Express.Multer.File | undefined,
  @Body() payload: PreviewImportDto,
): Promise<ImportPreviewResult> {
  if (file) {
    return this.workOrderImportService.previewFromBuffer(file, payload);
  }
  if (payload.fileId) {
    return this.workOrderImportService.previewFromFileId(payload.fileId, payload);
  }
  throw businessException(
    4400,
    400,
    'Excel文件或fileId必填其一',
  );
}
```

**文件 3**：`backend/src/modules/import/services/work-order-import.service.ts`（拆分为两个入口）

```ts
async previewFromBuffer(
  file: Express.Multer.File,
  payload: PreviewImportDto,
): Promise<ImportPreviewResult> {
  const meta = await this.uploadService.saveBuffer({
    kind: 'import',
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });
  return this.previewByFilePath(meta.fileId, meta.filePath, payload);
}

async previewFromFileId(
  fileId: string,
  payload: PreviewImportDto,
): Promise<ImportPreviewResult> {
  const meta = await this.uploadService.resolveFile(fileId);
  return this.previewByFilePath(fileId, meta.filePath, payload);
}

private async previewByFilePath(
  fileId: string,
  filePath: string,
  payload: PreviewImportDto,
): Promise<ImportPreviewResult> {
  const parsed = await this.excelParserService.parseFile(filePath);
  const availableFields = await this.fieldValidationService.buildCandidateFields(payload.orderType);
  const suggestion = await this.aiMappingService.suggest(
    payload.orderType,
    parsed.headers,
    availableFields,
  );
  return {
    fileId,
    orderType: payload.orderType,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    preview: parsed.rows.slice(0, payload.sampleRows ?? 5),
    suggestion: suggestion.suggestion,
    confidence: suggestion.confidence,
    unmatched: suggestion.unmatched,
    missingRequired: suggestion.missingRequired,
    availableFields,
    modelUsed: suggestion.modelUsed,
    fallbackReason: suggestion.fallbackReason,
  };
}
```

**优先级**：**P0**。不修这条，任何走 upload → preview 解耦的前端流程都挂。

---

## 3. P4-E2E-002：表头被误判为二级表头

### 3.1 QA 现象

```text
suggestion = {
  "合同期限形式/固定期限": "contract_term_type",
  "合同期限/3年": "...",
  "是否企服发起劳动合同/是": "..."
}
```

明显把**第一行表头** + **第二行第一条数据**拼成了 `X/Y`。

### 3.2 代码级根因

`backend/src/modules/import/services/excel-parser.service.ts:62-71`：

```ts
private detectHeaderRows(worksheet: Worksheet): number {
  const first = this.rowTexts(worksheet, 1);
  const second = this.rowTexts(worksheet, 2);
  const firstHas = first.some((item) => item.length > 0);
  const secondHas = second.some((item) => item.length > 0);
  if (!firstHas && secondHas) return 1;
  return firstHas && secondHas ? 2 : 1;   // ← 错
}
```

只要第一二行都有值就判二级表头——**标准单行表头 + 至少一条数据**的 Excel 全部中招。

### 3.3 修复（TS 可拷贝）

**正确判定规则**（参考 `docs/Phase4AI导入服务分层设计.md` §4.2）：真正的二级表头应满足 **第一行存在合并单元格** 或 **第一行某些列为空但同列第二行有值**。`exceljs` 提供 `worksheet.getMergedRanges()` 与 `cell.isMerged`。

替换 `detectHeaderRows`：

```ts
private detectHeaderRows(worksheet: Worksheet): number {
  const first = this.rowTexts(worksheet, 1);
  const second = this.rowTexts(worksheet, 2);
  const firstNonEmpty = first.filter((t) => t.length > 0).length;
  const secondNonEmpty = second.filter((t) => t.length > 0).length;

  if (firstNonEmpty === 0 && secondNonEmpty > 0) return 1;
  if (firstNonEmpty === 0) return 1;

  const firstRow = worksheet.getRow(1);
  let hasMerge = false;
  for (let c = 1; c <= Math.max(worksheet.columnCount, first.length); c += 1) {
    const cell = firstRow.getCell(c);
    if ((cell as unknown as { isMerged?: boolean }).isMerged) {
      hasMerge = true;
      break;
    }
  }
  if (hasMerge) return 2;

  const sparseFirst = firstNonEmpty < Math.max(first.length, second.length) * 0.7;
  const secondLooksLikeHeader = second.every(
    (t) => t.length === 0 || /[一-龥A-Za-z]/.test(t),
  );
  if (sparseFirst && secondLooksLikeHeader && secondNonEmpty >= firstNonEmpty) {
    return 2;
  }

  return 1;
}
```

**关键约束**：同时为 `parseWorksheet` 增加一个显式开关，允许前端通过 `payload.headerRows` 强制覆盖（`1` 或 `2`），兜底极端模板：

```ts
async parseFile(filePath: string, opts?: { headerRows?: 1 | 2 }): Promise<ParsedSheet> { ... }
```

**优先级**：**P0**。P4-E2E-002 是 P4-E2E-004 / 005 / 006 的共同上游。

---

## 4. P4-E2E-003：中文表头乱码

### 4.1 QA 现象

```text
suggestion={}
unmatched=["????/???????","????/CUST_NB001",...]
```

PowerShell 调 curl 写出的 `standard-real.xlsx` 后，中文表头全部变 `?`。

### 4.2 代码级根因

- 上传阶段：`UploadService.saveBuffer` 如果用 `fs.writeFileSync(path, buffer, 'utf8')` 重新编码会把非 utf8 字节替换成 `?`——必须用 **binary Buffer 原样写入**；
- 下游：`ExcelParserService.parseFile` 用 `Workbook.xlsx.readFile(path)`，**如果文件在写入时已损坏**，exceljs 读到的 `richText` / `string` 只剩 `?`；
- PowerShell 层：`curl.exe -F "file=@file.xlsx"` 在 Windows PowerShell 5.1 下走的是 stdout 编码（非 UTF-8），**脚本侧**可能把 xlsx 内部 zip bytes 当字符串处理导致编码损坏。

### 4.3 修复（TS 可拷贝）

**修复点 1**：`backend/src/modules/upload/upload.service.ts`（确保二进制原样写）

```ts
import { promises as fs } from 'fs';
import { join } from 'path';

async saveBuffer(input: {
  kind: 'import' | 'attachment';
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<{ fileId: string; filePath: string }> {
  const fileId = randomUUID();
  const dir = join(this.rootDir, input.kind);
  await fs.mkdir(dir, { recursive: true });
  const filePath = join(dir, `${fileId}.xlsx`);
  await fs.writeFile(filePath, input.buffer);
  // 关键：不要加第三参数 'utf8'。Buffer 写入时 node 会按二进制原样落盘。
  return { fileId, filePath };
}
```

**修复点 2**：`excel-parser.service.ts` 保留 `parseBuffer` 并**优先**在 controller 层用 `buffer` 路径，减少磁盘二次编码：

```ts
async parseBuffer(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return this.parseWorksheet(workbook.worksheets[0]);
}
```

preview multipart 分支直接用 `parseBuffer(file.buffer)`，**不经磁盘**，规避 Windows 临时文件编码链条。

**修复点 3**：`normalizeHeader` 加 `NFC` 正规化：

```ts
private normalizeHeader(value: string): string {
  return value
    .normalize('NFC')
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**修复点 4**：QA 脚本 `tests/phase4-smoke.ps1` 改为调 `Invoke-RestMethod -InFile` 或改写为 `node` 脚本（不是本轮 backend 的活，但请 QA 同步改，否则 backend 修完仍挂在 PS 编码）。**本修复指导不指望 backend 自己改测试脚本**，仅要求 backend 自测时用 **Node + form-data** 库或 `curl.exe`（注意 `.exe` 后缀走 binary）：

```bash
curl.exe -X POST http://127.0.0.1:3000/api/upload/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@tests/phase4-fixtures/standard-real.xlsx" \
  -F "purpose=import"
```

**优先级**：**P0**。

---

## 5. P4-E2E-004：standard.xlsx 无法创建 work_orders

### 5.1 QA 现象

```text
jobId=... successRows=0 failRows=1
poll status=failed total=1 success=0 fail=1
work_orders matched total=0
```

### 5.2 根因

**这是 P4-E2E-002 + P4-E2E-003 的直接下游**。一旦表头被误拆成 `X/Y`，AI/Fuzzy 所有列都落到 `unmatched`，`field-validation.service` 校验时 `missing_required` 集合非空 → 每行 `ok=false` → savepoint 回滚 → `fail_rows += 1`。`confirm` 最后走到 `if (result.successRows === 0) markFailed`。

### 5.3 修复路径

- **先修** §3（P4-E2E-002）+ §4（P4-E2E-003）——**不要单独修 P4-E2E-004**；
- 修完后追加一条**断言级自测**（放在 `test/e2e/import-standard.e2e-spec.ts`）：

```ts
describe('Phase 4 standard import', () => {
  it('standard.xlsx 全部行必须 success', async () => {
    const fileBuf = await readFile('tests/phase4-fixtures/standard.xlsx');
    const upload = await request(app.getHttpServer())
      .post('/api/upload/excel')
      .attach('file', fileBuf, 'standard.xlsx')
      .field('purpose', 'import');
    expect(upload.status).toBe(201);

    const preview = await request(app.getHttpServer())
      .post('/api/work-orders/import/preview')
      .send({ fileId: upload.body.data.fileId, orderType: 'onboarding' });
    expect(preview.status).toBe(200);
    expect(Object.keys(preview.body.data.suggestion).length).toBeGreaterThan(20);
    expect(preview.body.data.missingRequired).toHaveLength(0);

    const confirm = await request(app.getHttpServer())
      .post('/api/work-orders/import/confirm')
      .send({
        fileId: upload.body.data.fileId,
        orderType: 'onboarding',
        mapping: Object.entries(preview.body.data.suggestion).map(([h, f]) => ({ header: h, fieldCode: f })),
        autoSubmit: false,
      });
    expect(confirm.body.data.successRows).toBeGreaterThan(0);
    expect(confirm.body.data.failRows).toBe(0);
  });
});
```

**优先级**：**P0**（是 QA 首要证据）。

---

## 6. P4-E2E-005：partial-success 被误判为 failed

### 6.1 QA 现象

```text
jobId=... successRows=0 failRows=2
status=failed (期望 partial 或 completed)
```

### 6.2 根因

两个问题叠加：

1. **上游**：P4-E2E-002/003 导致第一行被吃成表头，2 行 partial 变成 1 行，成功行必然为 0；
2. **下游**：`work-order-import.service.ts:105-109`：

   ```ts
   if (result.successRows === 0) {
     await this.importJobService.markFailed(job.id, errorReportUrl);
   } else {
     await this.importJobService.markCompleted(job.id, errorReportUrl, result.failRows.length > 0);
   }
   ```

   状态机只有 `failed | completed`，**缺 `partial` 态**——即便 success=1、fail=1，前端看不到 partial 字面量。

### 6.3 修复（TS 可拷贝）

**1. Entity 扩状态枚举**：`import-job.entity.ts`（如未枚举化，转 `type`）

```ts
export type ImportJobStatus = 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
```

**2. `import-job.service.ts` 新增 `markPartial`**：

```ts
async markPartial(jobId: string, errorReportUrl: string | null): Promise<void> {
  await this.repo.update(
    { id: jobId },
    { status: 'partial', completedAt: new Date(), errorReportUrl },
  );
}
```

**3. `work-order-import.service.ts` 状态机调整**：

```ts
if (result.successRows === 0 && result.failRows.length > 0) {
  await this.importJobService.markFailed(job.id, errorReportUrl);
} else if (result.failRows.length > 0) {
  await this.importJobService.markPartial(job.id, errorReportUrl);
} else {
  await this.importJobService.markCompleted(job.id, errorReportUrl, false);
}
```

**4. 前端轮询返回格式**（`ImportJobStatusVo`）的 `status` 字段文档同步到 `docs/Phase4_三模块接口契约.md` §5.3——`'processing' | 'completed' | 'partial' | 'failed' | 'cancelled'`。

**优先级**：**P1**（上游修完后此条必须补全）。

---

## 7. P4-E2E-006：format-err 在映射阶段被阻断

### 7.1 QA 现象

`format-err.xlsx` 预期：进入行级校验 → `regex_invalid` / `type_convert` 错误码 → 生成错误标红报表。

实际：preview 阶段 `suggestion` 大量为空，confirm 刚到行就被 `missing_required` 挡住，**没机会走到行级格式校验**。

### 7.2 根因

同 §5——表头乱了，就没有合法 mapping 能传给 `validateRow` 执行"字段类型 / regex"检查。

### 7.3 修复路径

- 前置：§3 + §4 修完；
- 追加：`field-validation.service.ts` 必须**区分** `missing_required` 与 `regex_invalid`，前者只在**确认映射之后**报，否则导入体验极差。参考 `docs/Phase4导入与回流设计.md` §1.5 错误分类码表：

| 错误码 | 含义 | 出现阶段 |
|--------|------|----------|
| `missing_required` | 必填缺失 | preview 阶段（告知） |
| `regex_invalid` | 正则未通过 | confirm 行级校验 |
| `type_convert` | 类型转换失败 | confirm 行级校验 |

- 单测追加：

```ts
it('format-err.xlsx 必须进入行级校验并返回 type_convert/regex_invalid', async () => {
  // ... 同 §5.3，最后断言
  expect(confirm.body.data.failRows).toBeGreaterThanOrEqual(1);
  const errExcel = await readFile(confirm.body.data.errorReportUrl);
  expect(errExcel.length).toBeGreaterThan(100);
});
```

**优先级**：**P1**。

---

## 8. 修复顺序与执行步骤（12 步，按序执行）

> **不要跳序**。上游不修，下游修了也验不过。

| # | 步骤 | 关联 bug | 估时 | 产物 |
|---|------|----------|------|------|
| 1 | 升级 `preview-import.dto.ts` 增加 `fileId` 可选字段 + `__hasFile` 开关 | 001 | 0.5h | DTO |
| 2 | 重写 `ImportController.preview`，分 buffer / fileId 两路 | 001 | 1h | controller |
| 3 | 在 `WorkOrderImportService` 拆 `previewFromBuffer` / `previewFromFileId` / `previewByFilePath` | 001 | 1h | service |
| 4 | 重写 `ExcelParserService.detectHeaderRows`（merge + sparse 规则） | 002 | 2h | parser |
| 5 | `parseFile(opts?: { headerRows?: 1 \| 2 })` 允许前端覆盖 | 002 | 0.5h | parser |
| 6 | `UploadService.saveBuffer` 去掉编码参数，确保 binary 原样落盘 | 003 | 0.5h | upload |
| 7 | `ExcelParserService.normalizeHeader` 加 `.normalize('NFC')` | 003 | 0.2h | parser |
| 8 | `ImportJob` entity 增加 `'partial'` 状态 + `markPartial` service 方法 | 005 | 1h | entity + svc |
| 9 | `confirm` 末尾状态机改 `partial` 三路判断 | 005 | 0.5h | service |
| 10 | `field-validation.service` 区分 `missing_required`（preview 阶段）vs `regex_invalid` / `type_convert`（confirm 阶段） | 006 | 1.5h | validation |
| 11 | 新增 e2e：`test/e2e/import-*.e2e-spec.ts`，覆盖 5 份 fixture | 004/005/006 | 3h | tests |
| 12 | 复测 `tests/phase4-smoke.ps1` 或替代脚本，产出 `phase4-summary.json` | 所有 | 1h | 复测日志 |

**总估时**：12.7 小时。**建议 2 天落地 + 第 3 天交 QA 复测**。

---

## 9. 验收脚本与门禁

### 9.1 backend 自测（必须全绿再交付）

```bash
cd backend
npm.cmd run migration:run
npm.cmd run seed
npm.cmd run start:dev

# 另一个终端
npm.cmd run test:e2e -- import-standard.e2e-spec.ts
npm.cmd run test:e2e -- import-partial.e2e-spec.ts
npm.cmd run test:e2e -- import-format-err.e2e-spec.ts
```

### 9.2 QA 复测通过标准

- `standard.xlsx`：`successRows >= 1 && failRows === 0 && status === 'completed'`；
- `partial-success.xlsx`：`successRows >= 1 && failRows >= 1 && status === 'partial'`；
- `format-err.xlsx`：`failRows >= 1` 且错误报表下载可打开；
- `missing-col.xlsx`：preview 的 `missingRequired` 非空，confirm 阻断时报 `4401` 业务码；
- `extra-col.xlsx`：`unmatched` 包含多余列，核心字段正常落库。

### 9.3 发布门禁

**5 份 fixture 全绿 + `docs/Phase4已知问题.md` 的所有 Blocker 关闭** → 可开放真实业务员导入。

---

## 10. 纪律再强调：本轮只改 Phase 4，不碰 Phase 3/5/6

> Phase 4 评审曾因"提交 Phase 3 返工"拿过 2.3/10；Phase 5/6 评审也因"提交 Phase 4 返工"拿过 1/10。**drift 已两次成本**，本次严禁复发。

**硬纪律**：

1. 本次 PR 标题必须以 `[Phase4-E2E-Fix]` 开头；
2. PR 描述表格列出"本轮修改文件清单"，**不允许**出现 `modules/dashboard/` / `modules/withdraw/` / `modules/notifications/sse/` 等 Phase 5/6 路径；
3. 自述摘要明确写"本轮无 Phase 3/5/6 改动"；
4. 若发现 Phase 3/5/6 路径被改，先 revert 再 commit。

---

## 变更日志

- v1.0（2026-05-11）：初版，6 缺陷根因 + 12 步修复序列 + 5 份 fixture 验收门禁。