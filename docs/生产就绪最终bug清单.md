# 生产就绪最终 bug 清单

> 生成时间：2026-05-11 17:45（Asia/Shanghai）

| ID | 严重级别 | 状态 | 模块 | 复现命令/接口 | 实际结果 | 期望结果 | 影响 |
|---|---|---|---|---|---|---|---|
| FINAL-P3-E2E-002-REGRESSION | Blocker | fixed-verified | 子工单列表 | `node tests\final-directed-retest-3300.mjs`；`GET /api/dispatched-orders?moduleCode=data_entry|contract|onboarding_contact|social_security` | 四个模块均 HTTP 200，`code=0` | HTTP 200 且 `code=0` | 后道执行层可正常查看并处理子工单 |
| FINAL-FILE-DOWNLOAD-001 | Major | fixed-verified | 文件下载/导出模板 | `node tests\final-directed-retest-3300.mjs`；`POST /api/export-templates/:id/apply` 后 `GET /api/files/:id` | 文件已落盘且可下载，Excel 表头为「员工姓名」「身份证号」，数据行正常 | HTTP 200 下载 Excel 文件 | 导出模板生成后可正常下载，满足交付 |

## 已确认通过的最终 bug 回归

- P3-E2E-001：`submit` 顶层 `dispatchedOrders` 已包含 `handlerId`，本轮复测 4 个子工单均有 `handlerId`。
- P5-E2E-001：中文 alias 在 create / apply-preview / apply 响应和下载 Excel 中均正常显示：`员工姓名`、`身份证号`，未出现 `??` 或 `???`。
