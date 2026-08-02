# Phase 0: 前后端权限配置一致性对比报告

> 生成时间：2026-08-01  
> 对比基线：backend/角色权限清单-基线.md + frontend/角色路由权限清单-基线.md

---

## 一、角色定义对比

### 1.1 角色命名对照表

| 前端角色代码 | 后端角色代码 | 状态 | 说明 |
|------------|-------------|------|------|
| `admin` | `admin` | ✅ 一致 | 系统管理员 |
| `business_owner` | `biz_manager` | ⚠️ 命名不一致 | 业务负责人（后端已停用business_owner，改名为biz_manager） |
| `business_group_leader` | `biz_leader` | ⚠️ 命名不一致 | 业务组长（后端已停用business_group_leader，改名为biz_leader） |
| `business_group_member` | `biz_member` | ⚠️ 命名不一致 | 业务员（后端已停用business_group_member，改名为biz_member） |
| `data_entry_leader` | `data_entry_leader` | ✅ 一致 | 数据录入组长 |
| `shared_team_owner` | `shared_leader` | ⚠️ 命名不一致 | 共享团队负责人（后端已停用shared_team_owner，改名为shared_leader） |
| `labor_contract_member` | `contract_specialist` | ⚠️ 命名不一致 | 合同专员（后端已停用labor_contract_member，改名为contract_specialist） |
| `onboarding_resignation_member` | `onboarding_specialist` | ⚠️ 命名不一致 | 入离职专员（后端已停用onboarding_resignation_member，改名为onboarding_specialist） |
| `social_insurance_specialist` | `social_insurance_specialist` | ✅ 一致 | 福保负责人 |

### 1.2 角色命名不一致问题

**核心问题**：前端仍在使用后端已停用的旧角色代码，后端已统一使用新角色代码。

**影响**：
- 前端路由权限配置（ROUTE_VISIBILITY）使用旧角色代码
- 后端权限矩阵（DEFAULT_ROLE_ACTION_PERMISSIONS）使用新角色代码
- **前端用户登录后获取的角色代码是后端的新代码，但前端路由配置匹配的是旧代码，导致权限判断失败**

**需要统一的角色代码映射**：
| 旧代码（前端仍在用） | 新代码（后端已改） | 建议方案 |
|-------------------|------------------|---------|
| business_owner | biz_manager | 前端改为 biz_manager |
| business_group_leader | biz_leader | 前端改为 biz_leader |
| business_group_member | biz_member | 前端改为 biz_member |
| shared_team_owner | shared_leader | 前端改为 shared_leader |
| labor_contract_member | contract_specialist | 前端改为 contract_specialist |
| onboarding_resignation_member | onboarding_specialist | 前端改为 onboarding_specialist |

---

## 二、路由访问权限对比

### 2.1 后端 route.* 权限定义（20个）

后端定义的路由权限码：
1. route.dashboard
2. route.notifications
3. route.work_orders
4. route.work_order_create
5. route.work_order_import
6. route.work_order_detail
7. route.dispatched_detail
8. route.onboarding
9. route.onboarding_contract
10. route.onboarding_contact
11. route.onboarding_data_entry
12. route.onboarding_social_insurance
13. route.resignation_contact
14. route.data_entry_resign
15. route.social_insurance_resign
16. route.offboarding
17. route.offboarding_contact_pool
18. route.offboarding_social_suspend_pool
19. route.leader_dashboard
20. system.admin

### 2.2 前端路由权限映射（ROUTE_ACTION_PERMISSIONS）

前端定义的路由 → 权限码映射：
- `/dashboard` → `route.dashboard`
- `/notifications` → `route.notifications`
- `/work-orders` → `route.work_orders`
- `/work-orders/create` → `route.work_order_create`
- `/work-orders/import` → `route.work_order_import`
- `/work-orders/:id` → `route.work_order_detail`
- `/my-dispatched/:id` → `route.dispatched_detail`
- `/onboarding` → `route.onboarding`
- `/onboarding/contract` → `route.onboarding_contract` + `module.contract.manage`
- `/onboarding/onboarding_contact` → `route.onboarding_contact` + `module.onboarding_contact.manage`
- `/onboarding/data_entry` → `route.onboarding_data_entry` + `module.data_entry.manage`
- `/onboarding/social_insurance` → `route.onboarding_social_insurance` + `module.social_insurance.manage`
- `/onboarding/resignation_contact` → `route.resignation_contact` + `module.resignation_contact.manage`
- `/onboarding/data_entry_resign` → `route.data_entry_resign` + `module.data_entry_resign.manage`
- `/onboarding/social_insurance_resign` → `route.social_insurance_resign` + `module.social_insurance_resign.manage`
- `/offboarding` → `route.offboarding`
- `/offboarding/contact-pool` → `route.offboarding_contact_pool` + `module.resignation_contact.manage`
- `/offboarding/social-suspend-pool` → `route.offboarding_social_suspend_pool` + `module.data_entry_resign.manage`
- `/dashboards/leader` → `route.leader_dashboard`
- `/admin` 及其子路由 → `system.admin`

### 2.3 路由权限一致性分析

✅ **高度一致**：前端路由映射的权限码与后端定义的权限码完全匹配。

---

## 三、各角色权限对比

### 3.1 admin（系统管理员）

| 维度 | 前端 | 后端 | 状态 |
|-----|------|------|------|
| 路由总数 | 72个 | - | 前端定义 |
| 权限总数 | - | 54个（全部） | 后端定义 |
| route.* 权限 | 所有 | 所有20个 | ✅ 一致 |

**结论**：✅ 一致

---

### 3.2 business_owner（前端） vs biz_manager（后端）

| 维度 | 前端 business_owner | 后端 biz_manager | 状态 |
|-----|-------------------|-----------------|------|
| 角色命名 | business_owner | biz_manager | ⚠️ 不一致 |
| 路由总数 | 27个 | - | - |
| 后端权限数 | - | 5个 | - |
| route.dashboard | ✅ 可访问 | ✅ 有权限 | ✅ 一致 |
| route.dispatched_detail | ✅ 可访问 | ✅ 有权限 | ✅ 一致 |
| route.leader_dashboard | ✅ 可访问 | ✅ 有权限 | ✅ 一致 |
| route.work_orders | ❌ 无权限 | ❌ 无权限 | ⚠️ 问题 |
| work_order.view_all | - | ✅ 有权限 | ⚠️ 不匹配 |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 business_owner，后端已改为 biz_manager**
2. ⚠️ **后端有 work_order.view_all 权限，但前端 business_owner 无法访问 /work-orders 路由**
3. 角色描述为"查看全部业务工单"，但前端配置不允许访问主工单列表

**结论**：❌ 不一致，需修复

---

### 3.3 business_group_leader（前端） vs biz_leader（后端）

| 维度 | 前端 business_group_leader | 后端 biz_leader | 状态 |
|-----|--------------------------|----------------|------|
| 角色命名 | business_group_leader | biz_leader | ⚠️ 不一致 |
| 路由总数 | 49个 | - | - |
| 后端权限数 | - | 21个 | - |
| route.dashboard | ✅ | ✅ | ✅ |
| route.notifications | ✅ | ✅ | ✅ |
| route.work_orders | ✅ | ✅ | ✅ |
| route.work_order_create | ✅ | ✅ | ✅ |
| route.work_order_import | ✅ | ✅ | ✅ |
| route.work_order_detail | ✅ | ✅ | ✅ |
| route.dispatched_detail | ✅ | ✅ | ✅ |
| route.onboarding | ❌ | ❌ | ⚠️ 问题 |
| route.leader_dashboard | ✅ | ✅ | ✅ |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 business_group_leader，后端已改为 biz_leader**
2. ⚠️ **前端无法访问 /onboarding 入口，但可访问其下所有子工单路由**（不一致的层级权限）
3. 后端未定义 route.onboarding 权限，但前端有此路由

**结论**：⚠️ 基本一致，但存在入口路由权限配置问题

---

### 3.4 business_group_member（前端） vs biz_member（后端）

| 维度 | 前端 business_group_member | 后端 biz_member | 状态 |
|-----|--------------------------|----------------|------|
| 角色命名 | business_group_member | biz_member | ⚠️ 不一致 |
| 路由总数 | 44个 | - | - |
| 后端权限数 | - | 20个 | - |
| 核心工单权限 | ✅ 一致 | ✅ 一致 | ✅ |
| route.onboarding | ❌ | ❌ | ⚠️ 问题 |
| route.offboarding | ❌ | ❌ | ✅ |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 business_group_member，后端已改为 biz_member**
2. ⚠️ **与 business_group_leader 相同的 /onboarding 入口权限问题**

**结论**：⚠️ 基本一致，存在角色命名和入口路由问题

---

### 3.5 data_entry_leader

| 维度 | 前端 | 后端 | 状态 |
|-----|------|------|------|
| 角色命名 | data_entry_leader | data_entry_leader | ✅ 一致 |
| 路由总数 | 23个 | - | - |
| 后端权限数 | - | 17个 | - |
| route.onboarding | ✅ | ✅ | ✅ |
| route.offboarding | ✅ | ✅ | ✅ |
| route.leader_dashboard | ✅ | ✅ | ✅ |
| route.onboarding_data_entry | ✅ | ✅ | ✅ |
| route.data_entry_resign | ✅ | ✅ | ✅ |

**结论**：✅ 一致

---

### 3.6 shared_team_owner（前端） vs shared_leader（后端）

| 维度 | 前端 shared_team_owner | 后端 shared_leader | 状态 |
|-----|----------------------|-------------------|------|
| 角色命名 | shared_team_owner | shared_leader | ⚠️ 不一致 |
| 路由总数 | 25个 | - | - |
| 后端权限数 | - | 22个 | - |
| route.onboarding | ✅ | ✅ | ✅ |
| route.offboarding | ✅ | ✅ | ✅ |
| route.leader_dashboard | ✅ | ✅ | ✅ |
| 模块权限 | ✅ 一致 | ✅ 一致 | ✅ |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 shared_team_owner，后端已改为 shared_leader**

**结论**：⚠️ 权限一致，但角色命名不一致

---

### 3.7 labor_contract_member（前端） vs contract_specialist（后端）

| 维度 | 前端 labor_contract_member | 后端 contract_specialist | 状态 |
|-----|---------------------------|------------------------|------|
| 角色命名 | labor_contract_member | contract_specialist | ⚠️ 不一致 |
| 路由总数 | 20个 | - | - |
| 后端权限数 | - | 12个 | - |
| route.onboarding | ✅ | ✅ | ✅ |
| module.contract.manage | ✅ | ✅ | ✅ |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 labor_contract_member，后端已改为 contract_specialist**

**结论**：⚠️ 权限一致，但角色命名不一致

---

### 3.8 onboarding_resignation_member（前端） vs onboarding_specialist（后端）

| 维度 | 前端 onboarding_resignation_member | 后端 onboarding_specialist | 状态 |
|-----|-----------------------------------|--------------------------|------|
| 角色命名 | onboarding_resignation_member | onboarding_specialist | ⚠️ 不一致 |
| 路由总数 | 21个 | - | - |
| 后端权限数 | - | 17个 | - |
| route.onboarding | ✅ | ✅ | ✅ |
| route.offboarding | ✅ | ✅ | ✅ |
| module.onboarding_contact.manage | ✅ | ✅ | ✅ |
| module.resignation_contact.manage | ✅ | ✅ | ✅ |

**发现的问题**：
1. ⚠️ **前端角色代码使用旧的 onboarding_resignation_member，后端已改为 onboarding_specialist**

**结论**：⚠️ 权限一致，但角色命名不一致

---

### 3.9 social_insurance_specialist

| 维度 | 前端 | 后端 | 状态 |
|-----|------|------|------|
| 角色命名 | social_insurance_specialist | social_insurance_specialist | ✅ 一致 |
| 路由总数 | 20个 | - | - |
| 后端权限数 | - | 15个 | - |
| route.onboarding | ✅ | ✅ | ✅ |
| module.social_insurance.manage | ✅ | ✅ | ✅ |
| module.social_insurance_resign.manage | ✅ | ✅ | ✅ |

**结论**：✅ 一致

---

## 四、业务操作权限对比

### 4.1 后端定义的 54 个权限

**工单操作权限**（11个）：
- work_order.view
- work_order.view_team
- work_order.view_all
- work_order.create
- work_order.import
- work_order.update
- work_order.withdraw
- work_order.void
- work_order.urge
- work_order.export
- work_order.delete

**路由访问权限**（20个）：
- route.* 系列（见2.1节）

**模块管理权限**（7个）：
- module.contract.manage
- module.onboarding_contact.manage
- module.resignation_contact.manage
- module.data_entry.manage
- module.data_entry_resign.manage
- module.social_insurance.manage
- module.social_insurance_resign.manage

**批量操作权限**（7个）：
- dispatched_order.batch_import
- dispatched_order.batch_import_fields
- dispatched_order.batch_export
- dispatched_order.batch_accept
- dispatched_order.batch_complete
- dispatched_order.batch_feedback
- dispatched_order.batch_urge

### 4.2 前端使用的权限码

从 ROUTE_ACTION_PERMISSIONS 提取：
- route.* 系列（与后端一致）
- module.* 系列（与后端一致）
- system.admin

### 4.3 前端未使用但后端定义的权限

以下权限后端有定义，但前端路由配置中未直接使用（可能在业务逻辑或按钮权限中使用）：
- work_order.view
- work_order.view_team
- work_order.view_all
- work_order.create
- work_order.import
- work_order.update
- work_order.withdraw
- work_order.void
- work_order.urge
- work_order.export
- work_order.delete
- dispatched_order.batch_* 系列（7个）

**说明**：这些权限主要用于：
1. API 接口级别的权限控制（@BusinessPermission装饰器）
2. 前端页面内按钮/操作的权限控制（如"新建"、"导入"、"撤回"按钮显示隐藏）
3. 数据范围过滤（如 work_order.view_team 用于业务层过滤可查看的工单范围）

---

## 五、发现的核心不一致问题

### 🔴 问题 1：角色代码命名严重不一致

**影响范围**：6 个角色

| 前端使用（旧） | 后端定义（新） | 影响 |
|--------------|--------------|------|
| business_owner | biz_manager | 前端路由权限匹配失败 |
| business_group_leader | biz_leader | 前端路由权限匹配失败 |
| business_group_member | biz_member | 前端路由权限匹配失败 |
| shared_team_owner | shared_leader | 前端路由权限匹配失败 |
| labor_contract_member | contract_specialist | 前端路由权限匹配失败 |
| onboarding_resignation_member | onboarding_specialist | 前端路由权限匹配失败 |

**根本原因**：
- 后端在种子文件（seed-roles.ts）中已将旧角色标记为停用，启用新角色代码
- 前端路由配置（ROUTE_VISIBILITY）仍使用旧角色代码
- 用户登录后获取的角色是后端新代码，但前端用旧代码匹配路由权限

**建议方案**：
1. **推荐**：前端全局替换为新角色代码（与后端保持一致）
2. 备选：前端增加角色代码映射层，兼容新旧代码

---

### 🔴 问题 2：business_owner（biz_manager）角色权限配置矛盾

**矛盾点**：
- 后端有 `work_order.view_all` 权限
- 角色描述："查看所有业务团队的工单统计与报表（只读）"
- **但前端配置中 business_owner 无法访问 `/work-orders` 路由**

**影响**：
- 业务负责人无法查看主工单列表
- 与角色定位不符

**建议方案**：
- 前端 ROUTE_VISIBILITY 中为 business_owner（或改为 biz_manager）增加 `/work-orders` 和 `/work-orders/:id` 路由权限
- 移除 `/work-orders/create` 和 `/work-orders/import`（只读不创建）

---

### 🟡 问题 3：业务侧角色无法访问 /onboarding 入口

**现象**：
- business_group_leader 和 business_group_member 可访问所有子工单路由（如 `/onboarding/contract`）
- **但无法访问 `/onboarding` 入口页面**

**影响**：
- 用户体验不连贯（可以访问子页面但看不到入口导航）
- 可能导致用户迷失在子页面，无法返回入口

**建议方案**：
- 为 business_group_leader 和 business_group_member 增加 `/onboarding` 路由权限
- 或前端调整导航逻辑，无入口权限时隐藏入口链接

---

### 🟡 问题 4：前端存在空路由配置

**现象**：
从前端清单可知，部分路由配置为空数组 `[]`，任何角色都无法访问：
- `/onboarding/resignation_cert`
- `/offboarding/proof-pool`

**影响**：
- 路由存在但不可访问，可能是遗留代码或未完成功能

**建议方案**：
- 确认这些路由是否已废弃，若废弃则从路由表中移除
- 若仍需要，补充对应角色的访问权限

---

## 六、修复优先级建议

### P0（立即修复，影响核心功能）
1. **统一角色代码命名**：前端改为使用新角色代码（biz_manager, biz_leader, biz_member, shared_leader, contract_specialist, onboarding_specialist）
2. **修复 business_owner（biz_manager）路由权限**：增加主工单列表查看权限

### P1（高优先级，影响用户体验）
3. **修复业务侧角色的 /onboarding 入口权限**：business_group_leader 和 business_group_member 增加 `/onboarding` 访问权限

### P2（中优先级，清理遗留问题）
4. **清理空路由配置**：移除或补充权限

---

## 七、验证建议

修复后需验证：
1. 使用新角色代码登录，验证路由权限是否正常
2. 业务负责人能否访问主工单列表（只读）
3. 业务组长/业务员能否访问 `/onboarding` 入口
4. 所有角色的核心流程路由是否畅通

---

**报告生成时间**：2026-08-01  
**下一步**：根据此报告制定修复方案并实施
