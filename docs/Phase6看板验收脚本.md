# Phase 6 看板验收脚本

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

> 目标：为业务员看板、团队看板、管理层看板、通知中心和 SLA 统计提供可重复数据基础。

## 一、预热数据说明

脚本：`tests/phase6-seed-data.sql`

数据规模：

| 数据 | 数量 | 说明 |
|---|---:|---|
| `work_orders` | 30 | 订单号前缀 `PH6-`，跨 3 周创建 |
| `dispatched_orders` | 60 | 每个主单 2 个子单，覆盖 6 个 module |
| `notifications` | 最多 15 | SLA、task、system 三类通知，含已读/未读 |

覆盖维度：

- 主工单状态：`draft / pending / processing / completed / returned`。
- 子工单状态：`pending / processing / completed / returned`。
- 模块：`data_entry / contract / onboarding_contact / social_security / payroll / benefit`。
- 时间：最近 21 天分布，用于同环比和趋势图。
- SLA：通过 `extra_data.sla_bucket = warning/breach/normal`、子单创建时间和未完成状态构造超期/预警源数据。
- 成员效率：不同模块 handler 分布不同，可支撑 Top 5 效率成员统计。

## 二、运行方式

### 1. 确认数据库连接

```powershell
$env:PGPASSWORD='ticket123'
psql -h 127.0.0.1 -p 5432 -U ticket -d ticket_system -c "SELECT now();"
```

### 2. 导入预热数据

```powershell
$env:PGPASSWORD='ticket123'
psql -h 127.0.0.1 -p 5432 -U ticket -d ticket_system -f tests/phase6-seed-data.sql
```

如使用 postgres 超级用户：

```powershell
$env:PGPASSWORD='postgres'
psql -h 127.0.0.1 -p 5432 -U postgres -d ticket_system -f tests/phase6-seed-data.sql
```

### 3. 验证 SQL 输出

脚本末尾会输出：

```sql
SELECT COUNT(*) AS phase6_work_orders FROM work_orders WHERE order_no LIKE 'PH6-%';
SELECT module_code, status, COUNT(*) AS count FROM dispatched_orders ...;
SELECT biz_type, is_read, COUNT(*) AS count FROM notifications ...;
```

预期：

| 检查 | 预期 |
|---|---|
| `phase6_work_orders` | 30 |
| 子工单总数 | 60 |
| module 覆盖 | 至少 6 类 module 均有数据 |
| status 覆盖 | pending / processing / completed / returned 均有数据 |
| notifications | sla / task / system 均有数据 |

## 三、看板接口验收

后端启动后执行：

```powershell
# 登录
$login = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin123"}' (legacy admin123 record; current admin123 returns 401 and must not be used for demos)
$token = $login.data.accessToken
$headers = @{ Authorization = "Bearer $token" }

# 业务员看板
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/dashboard/salesperson" -Headers $headers

# 团队看板，以 data_entry 为例
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/dashboard/team/data_entry" -Headers $headers

# 管理层看板
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/dashboard/manager" -Headers $headers

# 通知中心
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/notifications" -Headers $headers
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/notifications/unread-count" -Headers $headers
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/notifications/unread-by-type" -Headers $headers
```

## 四、期望看到的数据

### 1. 业务员看板

| 指标 | 预期 |
|---|---|
| 当月/近 30 天工单数 | 至少包含 `PH6-` 预热主单 |
| 待处理/处理中/已完成/退回 | 各状态均有非零或可解释数据 |
| 完成率 | 介于 0%~100%，与 completed 数量匹配 |
| 趋势图 | 最近三周均有分布点 |

### 2. 团队看板

| 指标 | 预期 |
|---|---|
| module 过滤 | `/dashboard/team/data_entry` 仅统计 data_entry 相关子单 |
| SLA 超期 | 有 warning/breach 类样本可展示 |
| Top 5 效率成员 | 至少可按 handler 聚合 completed 数量和耗时 |
| 工作量分布 | pending/processing/completed/returned 均可统计 |

### 3. 管理层看板

| 指标 | 预期 |
|---|---|
| 全模块汇总 | 6 类 module 均进入汇总口径 |
| 客户 Top 10 | `extra_data.customer_code` 分布可支撑客户维度统计 |
| 状态占比 | 主单、子单状态分布可展示 |
| SLA 汇总 | warning/breach 来源数据可被计算 |

### 4. 通知中心

| 指标 | 预期 |
|---|---|
| 未读数 | `is_read=false` 通知进入未读计数 |
| 分组 | sla / task / system 分组存在 |
| 已读标记 | 调用 read 后未读数下降 |
| SLA 通知 | 标题包含 `SLA预警` 的通知可见 |

## 五、回滚/清理

如需清理预热数据：

```sql
DELETE FROM notifications WHERE payload->>'source' = 'phase6_seed';
DELETE FROM work_orders WHERE order_no LIKE 'PH6-%';
```

由于 `dispatched_orders.parent_order_id` 对 `work_orders.id` 为 `ON DELETE CASCADE`，删除主工单会同步删除对应子工单。

## 六、注意事项

1. SQL 使用 `ON CONFLICT (order_no)` 幂等更新，可重复执行。
2. 如果 seed 用户名与脚本候选不一致，handler 可能回退到 `admin`；不影响看板聚合，但效率成员名称可能集中。
3. 如果后端看板接口尚未实现，应记录为 Phase 6 阻塞，不视为 seed 脚本失败。
4. 若枚举迁移仍缺 `partial/cancelled`，本 SQL 不依赖这些 import job 枚举值。
