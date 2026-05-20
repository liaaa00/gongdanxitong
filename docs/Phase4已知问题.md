# Phase 4 已知问题

> 更新时间：2026-05-11  
> 来源：QA 使用 Windows 本地 PostgreSQL 16 + 本地后端 `http://127.0.0.1:3000/api` 执行真实导入端到端复测。  
> Round 2 复测报告：`docs/Phase4复测-round2报告.md`

## 问题汇总

| 编号 | 严重级别 | 问题摘要 | 当前状态 | Round 2 证据 |
|---|---|---|---|---|
| P4-E2E-001 | Blocker | `/api/work-orders/import/preview` 不接受 `{fileId}` JSON 契约 | 已修复并复测通过 | 5 份 fixtures 均显示 `preview mode=json-fileId` |
| P4-E2E-002 | Blocker | Excel 标准单行表头被误判为二级表头 | 已修复并复测通过 | `standard.xlsx` rowCount=2，suggestion 为标准中文列名 |
| P4-E2E-003 | Blocker | 中文 Excel 表头在 preview/unmatched 中乱码 | 已修复并复测通过 | preview suggestion/unmatched 中文正常 |
| P4-E2E-004 | Blocker | `standard.xlsx` 无法创建 work_orders | 已修复并复测通过 | `status=completed, successRows=2, failRows=0` |
| P4-E2E-005 | Major | `partial-success.xlsx` 未返回 partial | 已修复并复测通过 | `status=partial, successRows=2, failRows=1` |
| P4-E2E-006 | Major | `format-err.xlsx` 未进入行级格式校验 | 已修复并复测通过 | preview 映射成功，job 行级校验失败 `failRows=1` |

## 已通过的补充测点

| 测点 | 结果 | 证据 |
|---|---|---|
| >10MB Excel 上传限制 | 通过，返回 413 `File too large` | `tests/phase4-results/large-upload.log` |
| 子单 supplement 字段补充 | 通过，补充字段写回后 GET 可见 | `tests/phase4-supplement-return.mjs` 最新执行通过 |
| return/resubmit | 通过，return 后主单 `returned`，resubmit 后主单 `processing` 且 returned 子单重置 `pending` | `tests/phase4-supplement-return.mjs` 最新执行通过 |

## 当前结论

Phase 4 Round 2 真实导入端到端复测通过。原 6 个 P4-E2E 缺陷均已关闭，导入主链路可进入生产体验/受控业务试用准备。
