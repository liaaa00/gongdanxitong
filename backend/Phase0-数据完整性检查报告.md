# Phase 0 - 数据库权限数据完整性检查报告

> **生成时间**: 2026-08-01  
> **检查方式**: 代码静态分析 + 种子文件审查 + 迁移历史追溯  
> **注意**: 本报告基于代码推断,未直接连接数据库验证

---

## 执行摘要

**检查范围**: 用户角色关联 (user_roles)、字段权限配置 (field_permissions)、角色操作权限配置 (system_settings)

**关键发现**:
- ✅ 实体定义完整,级联删除保护健全
- ⚠️ 新旧角色代码并存,历史数据可能存在不一致
- ⚠️ 字段权限场景存在历史遗留 (LEGACY_SCENARIOS)
- ⚠️ 角色操作权限存在运行时覆盖机制

---

## 一、用户角色关联检查 (user_roles)

### 1.1 表结构分析

**表**: `user_roles`  
**复合主键**: `(user_id, role_id, department_id)`  
**外键关联**:
```typescript
@ManyToOne(() => User, onDelete: 'CASCADE')
@ManyToOne(() => Role, onDelete: 'CASCADE')
@ManyToOne(() => Department, onDelete: 'CASCADE')
```

**级联删除保护**: ✅ 已配置,删除用户/角色/部门时自动清理关联记录

---

### 1.2 种子数据分析

**数据来源**: `backend/src/database/seeds/seed-users.ts`

**种子用户统计**:
- **总用户数**: 31 人
  - 正式组织用户: 25 人 (lizhanbo, wangzixi, aolei...fuqianwen)
  - 兼容账号: 6 人 (admin, contractsup01...social01)

**角色分配**:
```typescript
用户类型                    角色代码                      部门
------------------------------------------------------------------
系统管理员 (2人)           admin                        SYSTEM_ADMIN
业务负责人 (3人)           biz_manager                  BUSINESS
业务组长 (5人)             biz_leader                   BUSINESS_GROUP_1..5
业务员 (10人)              biz_member                   BUSINESS_GROUP_1..5
数据录入组长 (2人)         data_entry_leader            DATA_ENTRY_GROUP
共享团队负责人 (1人)       shared_leader                SHARED_TEAM
                          + contract_specialist         SHARED_CONTRACT
                          + onboarding_specialist       SHARED_ONBOARDING_RESIGNATION
合同专员 (1人)             contract_specialist          SHARED_CONTRACT
入离职联系专员 (1人)       onboarding_specialist        SHARED_ONBOARDING_RESIGNATION
福保负责人 (1人)           social_insurance_specialist  WELFARE_SECURITY
```

**多角色用户**:
- `jianglu` (江璐): 3个角色 (shared_leader + contract_specialist + onboarding_specialist)
- 兼容账号部分用户: 2个角色

---

### 1.3 潜在数据问题

#### ⚠️ 问题1: 旧角色代码可能存在孤立记录

**现象**: 种子文件使用**新角色代码** (`biz_manager`, `biz_leader`, `biz_member`),但权限配置和字段权限种子仍为**旧角色代码**生成矩阵。

**旧角色代码清单** (来自 `seed-field-permissions.ts` 和 `role-action-permission.service.ts`):
```typescript
OLD_BUSINESS_ROLES = ['business_owner', 'business_group_leader', 'business_group_member']
OLD_SHARED_ROLES = ['shared_team_owner', 'labor_contract_member', 'onboarding_resignation_member']
历史停用角色 = ['manager', 'salesperson', 'contract_team', 'onboarding_team', 
                'data_entry_team', 'contract_supervisor', 'onboarding_supervisor', 
                'data_entry_supervisor', 'social_security_team', 'social_security_supervisor']
```

**推断**:
- 如果系统曾使用旧角色代码创建用户,则 `user_roles` 表中**可能存在指向旧角色的记录**
- `roles` 表中旧角色记录**未被物理删除**,只是标记 `is_active=false` (根据 `seed-roles.ts:56-58`)
- 外键约束不会报错,但逻辑上这些用户将使用停用角色的权限配置

**风险等级**: 🟡 中等 (不影响系统运行,但权限行为可能不符合预期)

---

#### ⚠️ 问题2: 用户与部门的关联一致性

**约束**: user_roles 的复合主键强制要求一个用户**不能**在同一部门拥有相同角色两次,但**可以**在不同部门拥有相同角色。

**推断**:
- 种子数据中 `jianglu` 同时拥有 3 个角色,分属不同部门
- 如果手动操作时不注意部门约束,可能导致插入失败

**风险等级**: 🟢 低 (数据库约束会阻止不合法数据)

---

#### ✅ 正常: 外键孤立记录

**结论**: 由于配置了 `onDelete: CASCADE`,不会存在 `role_id` 指向不存在角色的孤立记录。

---

## 二、字段权限配置检查 (field_permissions)

### 2.1 表结构分析

**表**: `field_permissions`  
**唯一约束**: `(role_id, field_code, scenario)`  
**外键**: `role_id` → `roles.id (onDelete: CASCADE)`

**种子初始化**: `backend/src/database/seeds/seed-field-permissions.ts`

---

### 2.2 场景覆盖分析

#### 标准场景 (13个)
```typescript
FIELD_PERMISSION_SCENARIOS = [
  'create:onboarding',
  'create:in_service',
  'create:resignation',
  'dispatched:data_entry',
  'dispatched:social_insurance',
  'dispatched:onboarding_contact',
  'dispatched:contract',
  'dispatched:renewal_contract',
  'dispatched:benefit',
  'dispatched:resignation_contact',
  'dispatched:resignation_cert',
  'dispatched:data_entry_resign',
  'dispatched:resignation_social_insurance',
]
```

#### 历史遗留场景 (3个)
```typescript
LEGACY_SCENARIOS_TO_DELETE = [
  'main',
  'dispatched:benefit_apply',
  'dispatched:social_security',
]
```

**别名映射** (运行时兼容,来自 `field-permission.service.ts:31-38`):
```typescript
SCENARIO_ALIASES = {
  'main' -> ['create:onboarding', 'create:in_service', 'create:resignation'],
  'dispatched:benefit_apply' -> ['dispatched:benefit'],
  'dispatched:social_security' -> ['dispatched:social_insurance'],
  'dispatched:resignation_social_insurance' -> ['dispatched:social_insurance_resign'],
  'dispatched:social_insurance_change' -> ['dispatched:social_insurance'],
  'dispatched:resignation_cert' -> ['dispatched:resignation_contact'],
}
```

---

### 2.3 潜在数据问题

#### ⚠️ 问题3: LEGACY_SCENARIOS 数据残留

**现象**: 
- `LEGACY_SCENARIOS_TO_DELETE` 标记为待删除,但种子文件中**未执行物理删除**
- 运行时通过 `SCENARIO_ALIASES` 做别名兼容

**推断**:
1. 如果曾执行过旧版种子,`field_permissions` 表中**可能存在** `scenario='main'` 等旧场景的记录
2. 新版种子 (`seed-field-permissions.ts`) **不再生成**这些场景的记录
3. 旧记录不会被自动清理,导致数据冗余

**影响**:
- 旧场景记录仍然有效 (通过 alias 查询会匹配)
- 增加数据量,但不影响功能

**风险等级**: 🟡 中等 (数据冗余,建议清理)

---

#### ⚠️ 问题4: 迁移脚本手动插入的权限记录

**发现**: `20260729003000-FixResignationContactVisibility.ts` 迁移脚本**手动插入**了 `mobile` 和 `email` 字段在 `dispatched:resignation_contact` 场景的权限。

**SQL片段**:
```sql
INSERT INTO field_permissions (id, role_id, field_code, permission, scenario)
SELECT uuid_generate_v4(), role.id, field.field_code,
  (CASE WHEN role.code = 'admin' THEN 'visible' ELSE 'readonly')::field_permission_mode_enum,
  'dispatched:resignation_contact'
FROM roles role
CROSS JOIN (VALUES ('mobile'), ('email')) AS field(field_code)
WHERE role.code IN (
  'onboarding_resignation_member', 'shared_team_owner', 'onboarding_specialist',
  'shared_leader', 'admin', 'business_owner', 'business_group_leader',
  'biz_manager', 'biz_leader'
)
ON CONFLICT (role_id, field_code, scenario)
DO UPDATE SET permission = EXCLUDED.permission
```

**问题**:
1. 迁移脚本与种子文件**双重维护**同一份数据
2. 如果种子文件更新 `RESIGNATION_CONTACT_VISIBLE` 白名单,迁移脚本不会同步
3. 迁移脚本使用**旧角色代码** (`business_owner`, `business_group_leader`),与当前种子不一致

**风险等级**: 🟡 中等 (维护复杂度高,容易不一致)

---

#### ⚠️ 问题5: 新旧角色代码的权限矩阵重复

**现象**: 种子文件为新旧角色都生成权限矩阵:
```typescript
ALL_RECOGNIZED_CODES = new Set([
  ...ACTIVE_ROLE_CODES,      // 9个新角色
  ...OLD_BUSINESS_ROLES,     // 3个旧业务角色
  ...OLD_SHARED_ROLES,       // 3个旧共享角色
])
```

**推断**:
- `field_permissions` 表中,每个字段 × 每个场景会生成 **15个角色** 的权限记录 (9新+6旧)
- 如果有 100 个字段 × 13 个场景 = 1300 个配置点 × 15 个角色 = **19,500 条记录**
- 实际上只有 9 个角色在使用,冗余了 **40%** 的数据

**风险等级**: 🟡 中等 (数据冗余,查询性能影响小但维护成本高)

---

#### ✅ 正常: 外键孤立记录

**结论**: 由于配置了 `onDelete: CASCADE`,删除角色时会自动清理对应的 `field_permissions` 记录,不会有孤立数据。

---

### 2.4 迁移历史中的字段权限修复

**发现**: 近期迁移显示字段权限配置在**运行中被修复**,说明初始配置存在问题。

**迁移记录**:
1. `20260729003000-FixResignationContactVisibility.ts`:
   - 修复 `mobile` 和 `email` 字段在离职联系场景下的可见性
   - 同步更新 `dispatched_orders.visible_fields` JSONB 字段

2. `20260730001000-AlignOnboardingImportAndDuplicateGuard.ts`:
   - 补充 `graduation_school`, `major`, `graduation_date` 三个字段到 `field_configs`
   - 调整 `display_order` 插入到 `education` 字段后

**推断**: 字段权限种子文件与实际业务需求之间**存在滞后**,需要通过迁移脚本修复。

---

## 三、角色操作权限配置检查 (system_settings)

### 3.1 配置机制

**存储方式**: 
- **表**: `system_settings`
- **Key**: `roleActionPermissions.v1`
- **Value**: JSON 格式的权限矩阵

**配置逻辑** (来自 `role-action-permission.service.ts:174-177`):
```typescript
async getMatrix(): Promise<RoleActionPermissionMatrix> {
  const stored = await this.readStoredMatrix();
  return { ...DEFAULT_ROLE_ACTION_PERMISSIONS, ...stored };
}
```

**合并规则**: `运行时配置` 覆盖 `代码默认配置`

---

### 3.2 默认配置分析

**权限操作总数**: 54 个 (来自 `ROLE_ACTIONS:8-54`)

**分类**:
- **工单操作** (11个): view, view_team, view_all, create, import, update, withdraw, void, urge, export, delete
- **路由权限** (20个): dashboard, notifications, work_orders, onboarding, offboarding...
- **系统管理** (1个): system.admin
- **模块管理** (7个): module.contract.manage, module.onboarding_contact.manage...
- **批量操作** (7个): batch_import, batch_export, batch_accept, batch_complete...

---

### 3.3 角色权限配置

**完整覆盖的角色** (17个):
```typescript
admin: ALL_ACTIONS (54个)
biz_manager / business_owner / manager: 5个 (view_all, export, dashboard, dispatched_detail, leader_dashboard)
biz_leader / business_group_leader: 33个
biz_member / business_group_member / salesperson: 25个
shared_leader / shared_team_owner: 24个
data_entry_leader: 21个
contract_specialist / labor_contract_member: 16个
onboarding_specialist / onboarding_resignation_member: 24个
social_insurance_specialist: 18个
social_security_team: 2个
```

---

### 3.4 潜在数据问题

#### ⚠️ 问题6: 运行时配置覆盖风险

**机制**: 
1. 代码中定义 `DEFAULT_ROLE_ACTION_PERMISSIONS` (默认权限矩阵)
2. 系统启动时从 `system_settings` 表读取 `roleActionPermissions.v1`
3. 运行时配置**覆盖**代码默认配置

**问题**:
- 如果管理员通过 API 修改了运行时配置,代码更新**不会**自动同步到数据库
- 导致代码与数据库配置**不一致**
- 很难追踪哪些权限是被运行时覆盖的

**推断检查项**:
1. 查询 `system_settings` 表,检查是否存在 `key='roleActionPermissions.v1'` 的记录
2. 如果存在,解析 JSON 并对比 `DEFAULT_ROLE_ACTION_PERMISSIONS`
3. 标注被覆盖的角色和权限

**示例查询** (需数据库访问):
```sql
SELECT key, value, updated_at
FROM system_settings
WHERE key = 'roleActionPermissions.v1';
```

**风险等级**: 🔴 高 (如果存在运行时覆盖,代码与实际行为不一致)

---

#### ⚠️ 问题7: 新旧角色代码的权限重复定义

**现象**: `DEFAULT_ROLE_ACTION_PERMISSIONS` 为新旧角色都定义了权限:

**新旧映射**:
```typescript
新角色代码              旧角色代码                   权限是否相同
--------------------------------------------------------------------
biz_manager          business_owner / manager       ✅ 完全相同 (5个权限)
biz_leader           business_group_leader          ✅ 完全相同 (33个权限)
biz_member           business_group_member          ✅ 完全相同 (25个权限)
shared_leader        shared_team_owner              ✅ 完全相同 (24个权限)
contract_specialist  labor_contract_member          ✅ 完全相同 (16个权限)
onboarding_specialist onboarding_resignation_member ✅ 完全相同 (24个权限)
```

**问题**: 维护两套相同的配置,增加维护成本,容易导致更新时遗漏。

**风险等级**: 🟡 中等 (维护复杂度高)

---

#### ⚠️ 问题8: 停用角色仍有权限配置

**现象**: `salesperson`, `social_security_team` 等停用角色在 `DEFAULT_ROLE_ACTION_PERMISSIONS` 中仍有权限定义。

**推断**: 如果 `user_roles` 表中存在使用这些角色的用户,他们仍能获得权限。

**风险等级**: 🟡 中等 (应清理停用角色的权限配置)

---

## 四、数据完整性评分

| 检查项                     | 状态 | 评分 |
|---------------------------|------|------|
| 实体定义与外键约束          | ✅   | 10/10 |
| 级联删除保护               | ✅   | 10/10 |
| 用户角色关联数据一致性      | ⚠️   | 7/10 |
| 字段权限场景覆盖           | ⚠️   | 6/10 |
| 历史遗留数据清理           | ⚠️   | 5/10 |
| 运行时配置透明度           | ⚠️   | 6/10 |
| 新旧角色代码统一性         | ⚠️   | 5/10 |
| **总体评分**               | ⚠️   | **7.0/10** |

---

## 五、发现的数据问题汇总

### 🔴 高优先级问题

**问题6**: 角色操作权限存在运行时覆盖机制,代码与数据库配置可能不一致
- **影响**: 难以追踪实际权限配置,代码审查失效
- **建议**: 
  1. 查询 `system_settings` 表检查是否有运行时覆盖
  2. 如果有,导出并文档化
  3. 考虑禁用运行时覆盖,或添加审计日志

---

### 🟡 中优先级问题

**问题1**: 用户可能关联了停用的旧角色代码
- **影响**: 权限行为可能不符合预期
- **建议**: 执行数据迁移,将旧角色替换为新角色

**问题3**: LEGACY_SCENARIOS 数据残留
- **影响**: 数据冗余,维护困惑
- **建议**: 执行清理脚本删除 `scenario IN ('main', 'dispatched:benefit_apply', 'dispatched:social_security')` 的记录

**问题4**: 迁移脚本手动维护字段权限
- **影响**: 双重维护,容易不一致
- **建议**: 将迁移脚本中的权限配置移回种子文件统一管理

**问题5**: 新旧角色的字段权限矩阵重复
- **影响**: 数据冗余约 40%,维护成本高
- **建议**: 种子文件中移除旧角色代码的权限生成逻辑

**问题7**: 新旧角色的操作权限重复定义
- **影响**: 维护成本高
- **建议**: 合并为单一角色代码的权限定义

**问题8**: 停用角色仍有权限配置
- **影响**: 可能给予不应有的权限
- **建议**: 从 `DEFAULT_ROLE_ACTION_PERMISSIONS` 中移除停用角色

---

### 🟢 低优先级问题

**问题2**: 用户与部门的复合主键约束
- **影响**: 无,数据库约束保护
- **建议**: 在文档中明确说明约束规则

---

## 六、数据清理建议

### 清理脚本1: 迁移旧角色到新角色

```sql
-- 备份
CREATE TABLE user_roles_backup AS SELECT * FROM user_roles;

-- 更新旧角色代码为新角色代码
UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'biz_manager')
WHERE role_id IN (SELECT id FROM roles WHERE code IN ('business_owner', 'manager'));

UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'biz_leader')
WHERE role_id IN (SELECT id FROM roles WHERE code = 'business_group_leader');

UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'biz_member')
WHERE role_id IN (SELECT id FROM roles WHERE code IN ('business_group_member', 'salesperson'));

-- 其他角色映射...
```

---

### 清理脚本2: 删除历史遗留场景权限

```sql
-- 备份
CREATE TABLE field_permissions_backup AS SELECT * FROM field_permissions;

-- 删除遗留场景
DELETE FROM field_permissions
WHERE scenario IN ('main', 'dispatched:benefit_apply', 'dispatched:social_security');
```

---

### 清理脚本3: 删除旧角色的字段权限

```sql
-- 删除旧角色的权限记录
DELETE FROM field_permissions
WHERE role_id IN (
  SELECT id FROM roles
  WHERE code IN (
    'business_owner', 'business_group_leader', 'business_group_member',
    'shared_team_owner', 'labor_contract_member', 'onboarding_resignation_member',
    'manager', 'salesperson', 'contract_team', 'onboarding_team',
    'data_entry_team', 'contract_supervisor', 'onboarding_supervisor',
    'data_entry_supervisor', 'social_security_team', 'social_security_supervisor'
  )
);
```

---

## 七、验证检查清单

**数据库直连时执行以下查询**:

### 7.1 用户角色关联检查
```sql
-- 总用户数
SELECT COUNT(*) AS total_users FROM users;

-- 有角色的用户数
SELECT COUNT(DISTINCT user_id) AS users_with_roles FROM user_roles;

-- 使用停用角色的用户
SELECT u.username, u.real_name, r.code AS role_code, r.is_active, d.name AS department
FROM user_roles ur
JOIN users u ON ur.user_id = u.id
JOIN roles r ON ur.role_id = r.id
JOIN departments d ON ur.department_id = d.id
WHERE r.is_active = false;

-- 孤立记录 (理论上不存在,验证级联删除)
SELECT COUNT(*) AS orphan_records
FROM user_roles ur
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = ur.role_id);
```

---

### 7.2 字段权限配置检查
```sql
-- 总字段权限记录数
SELECT COUNT(*) AS total_permissions FROM field_permissions;

-- 按场景统计
SELECT scenario, COUNT(*) AS record_count
FROM field_permissions
GROUP BY scenario
ORDER BY scenario;

-- 历史遗留场景记录
SELECT COUNT(*) AS legacy_records
FROM field_permissions
WHERE scenario IN ('main', 'dispatched:benefit_apply', 'dispatched:social_security');

-- 使用旧角色代码的权限记录
SELECT r.code AS role_code, fp.scenario, COUNT(*) AS record_count
FROM field_permissions fp
JOIN roles r ON fp.role_id = r.id
WHERE r.code IN (
  'business_owner', 'business_group_leader', 'business_group_member',
  'shared_team_owner', 'labor_contract_member', 'onboarding_resignation_member',
  'manager', 'salesperson', 'social_security_team'
)
GROUP BY r.code, fp.scenario
ORDER BY r.code, fp.scenario;

-- 孤立记录 (验证级联删除)
SELECT COUNT(*) AS orphan_records
FROM field_permissions fp
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = fp.role_id);
```

---

### 7.3 角色操作权限配置检查
```sql
-- 运行时配置检查
SELECT key, value, is_encrypted, updated_at
FROM system_settings
WHERE key = 'roleActionPermissions.v1';

-- 如果返回记录,解析 JSON 对比 DEFAULT_ROLE_ACTION_PERMISSIONS
```

---

## 八、后续行动建议

### 短期 (1周内)
1. ✅ **执行验证检查清单** (需数据库访问权限)
2. ✅ **导出 system_settings 中的运行时权限配置** (如果有)
3. ✅ **执行清理脚本1** (迁移旧角色到新角色)

### 中期 (1个月内)
4. ✅ **执行清理脚本2** (删除历史遗留场景权限)
5. ✅ **执行清理脚本3** (删除旧角色的字段权限)
6. ✅ **更新种子文件** (移除旧角色代码的权限生成逻辑)
7. ✅ **合并迁移脚本中的权限配置到种子文件**

### 长期 (季度)
8. ✅ **建立权限配置审计日志**
9. ✅ **禁用或规范化运行时权限覆盖机制**
10. ✅ **编写自动化测试验证权限配置一致性**

---

**报告生成者**: 数据库权限分析师  
**最后更新**: 2026-08-01  
**状态**: 待验证 (需数据库直连执行验证查询)
