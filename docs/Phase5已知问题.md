# Phase 5 已知问题

> 更新时间：2026-05-11  
> 来源：QA Phase 5 撤回审批与导出模板复测；生产就绪闭环任务 14763850

| 编号 | 严重级别 | 问题摘要 | 状态 | 影响范围 | 证据 |
|---|---|---|---|---|---|
| P5-E2E-001 | Major | 导出模板 `apply-preview/apply` 中文 alias 被序列化为 `??` / `???` | fixed | 导出预览与最终 Excel 列名 | 已修复模板保存/详情/列表/apply-preview/apply 链路：当历史或请求链路中的 alias/title 退化为纯问号时，按 `fieldCode` 回退 `field_configs.field_name`；新增 `export-template.spec.ts` 覆盖 create/get/apply-preview/apply。 |

## P5-E2E-001 详情

- 复现接口：
  - `POST /api/export-templates`
  - `POST /api/export-templates/:id/apply-preview`
  - `POST /api/export-templates/:id/apply`
- 复现数据：`fieldList=[{fieldCode:'employee_name', alias:'姓名'}, {fieldCode:'employee_id_card', alias:'证件号'}]`
- 实际结果：`columns=[{title:'??'}, {title:'???'}]`，`rows` key 也为问号。
- 预期结果：中文 alias 原样返回，并在导出 Excel 表头中保持中文。

## 修复记录（2026-05-11）

- 修复文件：`backend/src/modules/admin/export-templates/export-templates.service.ts`
- 修复点：
  1. `create/update` 保存模板前规范化 `fieldList`。
  2. `list/detail` 返回模板视图时规范化 `fieldList`，避免模板接口继续输出 `??`。
  3. `apply-preview/apply/dispatched-orders/:id/export` 生成 columns/rows/Excel 时使用同一套标题解析逻辑。
  4. 对历史脏数据兼容：若 `alias/title` 为纯问号（如 `??`、`???`），按字段编码回退 `field_configs.field_name`。
- 回归测试：`backend/test/export-template.spec.ts`
  - 中文 alias 正常返回；
  - `??/???` 历史脏 alias 回退为 `姓名/证件号`；
  - create/get 模板接口不再泄露 `??`；
  - apply 生成 Excel 文件元数据正常。
- 验证：`npm run build`、`npm run test` 通过。
