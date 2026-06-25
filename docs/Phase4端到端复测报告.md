# Phase 4 后端真实导入端到端复测报告

> 执行角色：QA 测试工程师  
> 执行日期：2026-05-11  
> 环境：Windows 11 + 本地 PostgreSQL 16 + 本地后端 `http://127.0.0.1:3000/api`  
> 结果摘要文件：`tests/phase4-results/phase4-summary.json`

## 一、复测范围

本次按 Leader 分配的 Phase 4 后端真实导入复测要求，覆盖：

1. 5 份 Excel fixtures 的真实导入链路：upload → preview → confirm → import job polling → work_orders 创建数量验证。
2. AI Provider 降级/Mock 口径下的 mapping 建议观察（当前实际返回 model 多为 `fallback:fuzzy`）。
3. 大文件上传限制：`>10MB` Excel 应返回 413。
4. supplement 流程：子单接单后补充字段，并验证主单/其他模块数据同步基础行为。
5. return/resubmit 流程：子单退回 → 主单 returned → 业务员 resubmit → 子单重置。
6. 更新项目级 GO/NO-GO 结论。

## 二、环境与准备

| 项 | 结果 |
|---|---|
| 工作区 Git | 当前工作区无 `.git` 目录，无法执行 `git pull`；已在报告记录该限制 |
| 后端运行地址 | `http://127.0.0.1:3000/api` |
| 数据库 | Windows 本地 PostgreSQL 16 |
| health check | 通过，返回 200 且带 traceId |
| migration | 通过，已执行新迁移 `Phase4ImportJobs1715600000000` |
| seed | 通过 |
| smoke 脚本 | `tests/phase4-smoke.ps1`，已修复为 ASCII-safe 版本 |

## 三、执行命令记录

```powershell
# 后端准备
cd backend
npm.cmd run migration:run
npm.cmd run seed
npm.cmd run start:dev

# Phase 4 fixtures smoke 示例
powershell -NoProfile -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture tests\phase4-fixtures\standard.xlsx
powershell -NoProfile -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture tests\phase4-fixtures\missing-col.xlsx
powershell -NoProfile -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture tests\phase4-fixtures\extra-col.xlsx
powershell -NoProfile -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture tests\phase4-fixtures\format-err.xlsx
powershell -NoProfile -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture tests\phase4-fixtures\partial-success.xlsx

# 补充/退回专项
node tests\phase4-supplement-return.mjs
```

> 说明：`POST /api/work-orders/import/preview` 使用 `{fileId}` JSON 请求返回 400，脚本已自动 fallback 到 multipart preview，以继续观察后端导入能力。

## 四、5 份 fixtures 结果

| Fixture | 预期 | 实际 | 结论 | 证据 |
|---|---|---|---|---|
| `standard.xlsx` | 100% 成功，创建有效数据行对应的 work_orders | preview 可返回部分 suggestion，但字段被解析为 `字段/首行值`；confirm 后 job `failed`，`successRows=0 failRows=1`，创建数量 0 | 不通过 | `tests/phase4-results/standard-run3.log` |
| `missing-col.xlsx` | preview 返回 missingRequired，阻断或提示补映射 | preview 能观察到缺必填倾向，但 JSON preview 不通；confirm job `failed totalRows=0` | 部分符合缺列预期，但链路不通过 | `tests/phase4-results/missing-col-run3.log` |
| `extra-col.xlsx` | 多余列进入 unmatched，核心字段通过 AI/Fuzzy 映射 | suggestion 为空或不完整，无法证明多余列稳定处理 | 不通过 | `tests/phase4-results/extra-col-real.log` |
| `format-err.xlsx` | 进入行级校验，返回 partial 并生成错误 Excel 标红 | 在 mapping/header 阶段先失败，未有效进入格式错误行级校验 | 不通过 | `tests/phase4-results/format-err-real.log` |
| `partial-success.xlsx` | partial，至少 1 行成功、1 行失败 | confirm 后 job `failed`，`successRows=0 failRows=2` | 不通过 | `tests/phase4-results/partial-success-run3.log` |

### 关键响应摘录

#### standard.xlsx

```text
POST /upload/excel -> fileId=8d9670d4-389c-419f-9f26-9e0317ac2364
POST /work-orders/import/preview
json preview not accepted, fallback to multipart preview. reason=(400) Bad Request
preview mode=multipart-file rows=1 model=fallback:fuzzy
suggestion={"合同期限形式/固定期限":"contract_term_type", ...}
POST /work-orders/import/confirm
jobId=362d92ed-6c2b-4f0e-aa89-717e1f18e32d successRows=0 failRows=1
poll status=failed total=1 success=0 fail=1
work_orders matched total=0
```

#### standard-real.xlsx

```text
preview mode=multipart-file rows=1 model=fallback:fuzzy
suggestion={}
confidence={}
missingRequired=["customer_name","customer_code","outsource_type",...]
unmatched=["????/???????","????/CUST_NB001",...]
preview suggestion empty; cannot confirm
```

#### partial-success.xlsx

```text
preview rows=2 model=fallback:fuzzy
POST /work-orders/import/confirm
jobId=551f9f32-fa55-49e5-a906-65025e3bae7d successRows=0 failRows=2
poll status=failed total=2 success=0 fail=2
work_orders matched total=0
```

## 五、补充测点结果

### 1. 大文件上传限制

| 项 | 结果 |
|---|---|
| Fixture | `tests/phase4-fixtures/large-over-10mb.xlsx` |
| 预期 | 返回 413 |
| 实际 | 通过，返回 `{"code":413,"data":null,"message":"File too large","traceId":"req_6492b855-58b7-43b3-9a2c-2af61d5cf2e9"}` |
| 证据 | `tests/phase4-results/large-upload.log` |

### 2. supplement 流程

| 步骤 | 结果 |
|---|---|
| 创建 onboarding 主工单 | 通过，返回 201、`code=0`、生成 `orderNo=ON20260511004` |
| submit | 通过，生成 4 条子单：`data_entry`、`social_security`、`onboarding_contact`、`contract` |
| accept data_entry 子单 | 通过，状态变为 `processing`，写入 `acceptedAt` |
| PATCH supplement | 通过，补充字段写回后 GET 可见 |

证据：`tests/phase4-results/supplement-return.log`

### 3. return/resubmit 流程

| 步骤 | 结果 |
|---|---|
| data_entry 子单 return | 通过 |
| 主单状态 | 通过，变为 `returned` |
| 业务员 resubmit | 通过，主单回到 `processing` |
| returned 子单重置 | 通过，相关子单重置为 `pending` |

证据：`tests/phase4-results/supplement-return.log`

## 六、缺陷列表

详见：`docs/Phase4已知问题.md`

| 编号 | 严重级别 | 摘要 | 状态 |
|---|---|---|---|
| P4-E2E-001 | Blocker | preview 不接受 `{fileId}` JSON 契约 | 待修复 |
| P4-E2E-002 | Blocker | 标准单行表头被误判为二级表头，产生 `字段/首行值` 映射 | 待修复 |
| P4-E2E-003 | Blocker | 中文表头出现 `????` 乱码，映射建议为空或不完整 | 待修复 |
| P4-E2E-004 | Blocker | 标准导入无法创建 work_orders | 待修复 |
| P4-E2E-005 | Major | partial-success 未返回 partial，实际 `failed successRows=0` | 待修复 |
| P4-E2E-006 | Major | format-err 在映射阶段被阻断，未进入有效格式错误验证 | 待修复 |

## 七、总体结论

### Phase 4 真实导入验收：不通过

- **通过项**：后端可启动；migration/seed 通过；上传接口可返回 fileId；job 查询接口可返回状态；大文件限制通过；supplement 与 return/resubmit 流程通过。
- **阻塞项**：Excel preview/mapping/confirm 主链路未通过，5 份核心 fixtures 均未达预期；标准导入无法创建 work_orders。
- **主要风险**：真实客户 Excel 模板无法稳定识别中文表头与单行表头，导致导入批量失败或无法确认映射。

### GO / NO-GO

建议维持 **生产 NO-GO**。在 P4-E2E-001 ~ P4-E2E-004 修复并通过 5 份 fixtures 复测前，不建议开放真实导入给业务员使用；可以继续进行受控联调、补充回流和退回再提交等非导入主链路验证。