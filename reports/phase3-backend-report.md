# 阶段3 省外增减员后端交付报告

- 任务：`e3f5fe32-a280-4382-b8dd-d148535990d9`
- 基线：团队 integration `db7bb08`（含阶段1派单底座与阶段2在职模块）
- 契约依据：`docs/阶段1派单引擎扩展架构契约-20260727.md`、`docs/在职管理与省外派单-方案定稿-20260726.md`；阶段3架构师契约在实现/验收期间未落盘。

## 交付内容

1. 数据模型与隔离
   - 新增 `BusinessScope.BEILUN/OUT_OF_PROVINCE`。
   - `work_orders` 新增 `business_scope`，旧数据默认/回填 `beilun`，两个省外类型回填 `out_of_province`。
   - 新增只读 `out_of_province_orders` 视图实体，从权威主单表投影省外范围，避免复制状态与双写。
   - 创建、更新、提交均剥离客户端 `businessScope/business_scope`，范围只由后端订单类型决定。

2. REST 模块
   - 新增 `/out-of-province-orders`：列表、创建、详情、更新、提交、重提。
   - 创建仅允许 `out_of_province_increase/decrease` 和统一 27 省简称。
   - 主单列表/详情固定 scope + order type 双过滤；省外详情只返回 `out_of_province_dispatch` 子单。
   - 省外主单继续使用 `WorkOrderService`，省外子单继续使用 `DispatchedOrderService`，未新增状态机。

3. Sheet5 派单
   - 为省外增员、减员补两条生产规则，目标模块固定 `out_of_province_dispatch`。
   - 继续复用阶段1 HandlerPicker 的 Sheet5 namespaced key；福建排前主办首次接单，排后备选只用于同省转派。
   - `/dispatched-orders` 新增可选 `businessScope`，缺省固定北仑；显式省外时只查两个省外类型与 Sheet5 模块。
   - 新逻辑未读取、未删除 `dispatch_rules.assignee_user_id/fallback_user_id`。

4. 导入
   - 上传预览/确认开放两个省外订单类型；异步任务保持省外类型，不回落入职。
   - 最小系统字段：客户名称、客户代码、员工姓名、证件号、省份；省份严格校验 27 省简称。
   - 模板下载白名单仍只有入职/离职，避免在业务字段清单缺失时伪造省外模板。

## 验证结果

- `npm run build`：通过。
- 省外、主单、派发定向：3 suites / 50 tests passed。
- 导入、字段校验与 Sheet5：10 suites / 83 tests passed。
- 阶段1/旧主单/旧派发联合回归：4 suites / 59 tests passed。
- 根目录 `回归测试.ps1 -BackendOnly`：通过。
- `git diff --check`：通过，仅 Git 给出既有 CRLF 转换提示。

## 待办

- 省外单条表单继续 TODO：等待业务提供菜鸟模板/浙江自签字段清单，不能使用入职/离职模板替代。
- Sheet4/Sheet5 当前种子仍是占位账号：等待业务提供真实名册后替换，并复测福建主备顺序与生产派单。
- 阶段3架构师契约若后续落盘，集成前需对照字段/路由命名复核；当前实现遵循已批准的阶段1契约。
