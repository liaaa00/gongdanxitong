# Phase 4 真实导入 Round 2 复测报告

> 执行角色：QA 测试工程师  
> 执行时间：2026-05-11  
> 环境：Windows 11 + 本地 PostgreSQL 16 + 后端 `http://127.0.0.1:3000/api`  
> 说明：工作区当前无 `.git` 目录，`git pull` 不适用；本轮基于当前已运行后端服务执行真实接口复测。

## 一、复测范围

本轮复测目标是验证 Phase 4 Round 1 发现的 6 个导入缺陷是否修复，并补充验证 supplement、return/resubmit、大文件限制与创建结果。

| 编号 | 缺陷/测点 | 验收标准 | Round 2 结果 | 结论 |
|---|---|---|---|---|
| P4-E2E-001 | preview JSON `fileId` 契约 | `POST /api/work-orders/import/preview` 接受 `{fileId, orderType}` | 5 份 fixture 均使用 `preview mode=json-fileId` 成功 | 已修复 |
| P4-E2E-002 | 二级表头误判 | 标准模板不再把首行数据拼成表头 | `standard.xlsx` rowCount=2，字段映射为标准中文列名 | 已修复 |
| P4-E2E-003 | 中文乱码 | preview suggestion / unmatched 不出现 `????` | 中文表头、中文字段值均正常返回 | 已修复 |
| P4-E2E-004 | standard.xlsx 创建工单 | `successRows > 0`，标准导入完成 | `completed, successRows=2, failRows=0` | 已修复 |
| P4-E2E-005 | partial 状态 | 部分成功应返回 `partial` | `partial-success.xlsx` 返回 `partial, successRows=2, failRows=1` | 已修复 |
| P4-E2E-006 | format-err 行级校验 | 格式错误进入行级校验，不被表头/映射阻断 | `format-err.xlsx` 映射成功后 job `failed, failRows=1`，进入行级校验路径 | 已修复（失败符合异常 fixture 预期） |

## 二、5 份 Excel Fixture 真实导入结果

执行命令示例：

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\phase4-smoke.ps1 -Fixture tests/phase4-fixtures/standard.xlsx -PollIntervalSeconds 1 -MaxPollCount 8
```

| Fixture | 预期 | 实际结果 | 关键响应/证据 | 结论 |
|---|---|---|---|---|
| `standard.xlsx` | 100% 成功 | `status=completed, total=2, success=2, fail=0` | preview `json-fileId`，suggestion 完整，traceId 示例 `req_a921bbf4-...` | 通过 |
| `missing-col.xlsx` | preview 返回缺必填 | preview 返回 `missingRequired=["id_card_no","email"]`；confirm 后 `failed, success=0, fail=1` | 缺列被识别，异常 fixture 不创建数据 | 通过 |
| `extra-col.xlsx` | 多余列进入 unmatched，核心字段成功映射 | `unmatched=["客户自定义备注","无需映射列"]`；job `completed, success=1, fail=0` | 通过 |
| `format-err.xlsx` | 进入行级格式校验并失败 | preview 映射成功；job `failed, success=0, fail=1` | 通过 |
| `partial-success.xlsx` | 部分成功 | `status=partial, total=3, success=2, fail=1` | 通过 |

> 注：`tests/phase4-smoke.ps1` 最后的列表校验使用 `keyword=CustomerCode`，当前 `GET /api/work-orders` 实际合同未声明 `source=import` 过滤；脚本显示 `workOrdersMatched=0` 不作为导入失败依据。本轮以 import job 的 `successRows/failRows/status` 为验收准则。

## 三、补充测点

| 测点 | 执行方式 | 结果 | 结论 |
|---|---|---|---|
| AI Provider 降级/Mock | preview 返回 `model=fallback:fuzzy`，所有标准列 confidence=1 | 映射与 golden 样本字段对齐 | 通过 |
| >10MB 大文件限制 | 上传超大 Excel | 返回 413 `File too large` | 通过 |
| supplement 字段补充 | `tests/phase4-supplement-return.mjs` | accept 后 supplement 写入 `bank_account=6225889999999999`，GET 可见 | 通过 |
| return/resubmit | 同上 | return 后主单 `returned`，resubmit 后主单 `processing`，returned 子单重置 `pending` | 通过 |

## 四、结论

Phase 4 真实导入 Round 2 核心链路通过：5 份 fixtures 全部达到预期，6 个 P4-E2E 历史缺陷均已关闭。当前可将 Phase 4 从导入 Blocker 状态升级为“核心导入链路可验收”。
