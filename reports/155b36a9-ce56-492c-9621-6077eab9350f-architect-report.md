# 阶段3省外派单模块架构审查报告

**任务ID**: 155b36a9-ce56-492c-9621-6077eab9350f  
**审查人**: architect  
**审查时间**: 2026-07-28  
**审查范围**: 阶段3省外派单模块技术方案  

---

## 1. 审查目标

审查阶段3省外派单模块架构设计：
1. 业务范围切换器（单项业务/省外派单）实现
2. Sheet5增减员后端逻辑
3. 省外派单列表导入功能
4. 与Sheet4数据隔离方案
5. 状态机扩展需求
6. 技术栈一致性
7. 现有业务不受影响

---

## 2. 核心检查项

### 2.1 业务范围切换器 ✅

**实现位置**: `frontend/src/layouts/BasicLayout.tsx:864-873`

```tsx
<Segmented
  aria-label="业务范围"
  size="small"
  value={businessScope}
  options={[
    { label: '北仑', value: BUSINESS_SCOPE.BEILUN },
    { label: '省外', value: BUSINESS_SCOPE.OUT_OF_PROVINCE },
  ]}
  onChange={handleBusinessScopeChange}
/>
```

**业务范围管理**: `frontend/src/utils/businessScope.ts`
- `readBusinessScope()`: localStorage读取，默认北仑
- `writeBusinessScope(scope)`: localStorage写入
- `getBusinessScopeLandingPath(scope)`: 返回业务范围首页路径（北仑→/dashboard，省外→/out-of-province）

**菜单过滤**: `frontend/src/layouts/BasicLayout.tsx:257-275 filterMenuByRoles()`
- 根据 `businessScope` 过滤菜单项（`it.scope && businessScope && it.scope !== businessScope`）
- 在职管理组（`scope: BUSINESS_SCOPE.BEILUN`）仅在北仑显示
- 省外派单组（`scope: BUSINESS_SCOPE.OUT_OF_PROVINCE`）仅在省外显示

**契约符合度**: ✅ 切换器位置合理（顶部导航栏actionsRender），LocalStorage持久化，菜单动态过滤，无appStore耦合

---

### 2.2 Sheet5增减员后端逻辑 ✅

**数据模型**: `backend/src/entities/out-of-province-order.entity.ts`
- `ViewEntity` 基于 `work_orders` 表的视图
- 固定 `businessScope = BusinessScope.OUT_OF_PROVINCE`
- 支持 `orderType`: `OUT_OF_PROVINCE_INCREASE` / `OUT_OF_PROVINCE_DECREASE`
- 包含 `province` 字段（`extraData->>'province'`）

**业务服务**: `backend/src/modules/out-of-province-orders/out-of-province-orders.service.ts`
- `create()`: 调用 `workOrderService.createDraft()`，将province写入extraData
- `findAll()`: 严格过滤 `business_scope = 'out_of_province'` + `order_type IN (OUT_OF_PROVINCE_INCREASE, OUT_OF_PROVINCE_DECREASE)`
- 权限控制：管理员全量、业务经理部门内、普通用户仅自己
- 支持province、status、orderType、keyword筛选

**种子数据**: `backend/src/database/seeds/province-handler.seed.ts`
- Sheet4: 单项业务27省份映射（5个双人省份：湖北、江苏、山西、山东、福建）
- Sheet5: 省外派单27省份映射（1个双人省份：福建）
- `mappingSource`: 'sheet4' | 'sheet5' 严格隔离
- `moduleCode`: Sheet4 → `IN_SERVICE_SINGLE_BUSINESS`，Sheet5 → `OUT_OF_PROVINCE_DISPATCH`
- `moduleType`: Sheet4 → `IN_SERVICE`，Sheet5 → `OUT_OF_PROVINCE`
- `teamRole`: Sheet4 → `IN_SERVICE`，Sheet5 → `OUT_OF_PROVINCE`
- 命名空间格式: `{moduleCode}__{province}` → `OUT_OF_PROVINCE_DISPATCH__广东`
- 验证逻辑：27省份完整性、无重复、handler数量1-2人、metadata一致性

**契约符合度**: ✅ Sheet4/Sheet5双表隔离，使用 `mappingSource` + `moduleCode` + `moduleType` + `teamRole` 四层隔离，省份命名空间机制防止跨表冲突

---

### 2.3 省外派单列表导入功能 ✅

**前端实现**: `frontend/src/pages/OutOfProvince/Import.tsx`
- 增减员类型切换器（Segmented）：省外增员 / 省外减员
- 复用 `ExcelUploader` 组件
- 导入预览：`previewOutOfProvinceImport(file, orderType)`
- 导入确认：`confirmOutOfProvinceImport(mapping, fileId, orderType, newFields)`
- 轮询任务状态：`getOutOfProvinceImportJob(jobId)`
- 错误报告下载：`downloadOutOfProvinceImportErrorReport(jobId)`

**后端实现**: 复用 `backend/src/modules/imports/work-order-import.service.ts`
- `writeOne({ orderType, normalized, autoSubmit, user, defaults })`
- defaults包含 `{ businessScope: 'out_of_province', province }`
- 自动resolve客户ID（基于customer_code + customer_name）
- autoSubmit支持导入后自动提交

**契约符合度**: ✅ 导入流程复用现有入职批量导入基础设施，通过 `orderType` + `defaults.businessScope` 隔离数据

---

### 2.4 与Sheet4数据隔离方案 ✅

**隔离维度**:
1. **数据库层**: `work_orders.business_scope` 字段（`'beilun'` vs `'out_of_province'`）
2. **OrderType枚举**: 在职（`IN_SERVICE`）vs 省外（`OUT_OF_PROVINCE_INCREASE` / `OUT_OF_PROVINCE_DECREASE`）
3. **派单表**: `module_handlers.module_code` 命名空间（`IN_SERVICE_SINGLE_BUSINESS__广东` vs `OUT_OF_PROVINCE_DISPATCH__广东`）
4. **派单种子**: `mappingSource` 标记（'sheet4' vs 'sheet5'）
5. **服务层**: `in-service-orders.service.ts` vs `out-of-province-orders.service.ts`
6. **控制器**: `in-service-orders.controller.ts` vs `out-of-province-orders.controller.ts`
7. **前端路由**: `/in-service` vs `/out-of-province`
8. **菜单范围**: `scope: BUSINESS_SCOPE.BEILUN` vs `scope: BUSINESS_SCOPE.OUT_OF_PROVINCE`

**验证查询**（理论SQL）:
```sql
-- 在职单项业务
SELECT * FROM work_orders 
WHERE business_scope = 'beilun' 
AND order_type = 'in_service';

-- 省外派单
SELECT * FROM work_orders 
WHERE business_scope = 'out_of_province' 
AND order_type IN ('out_of_province_increase', 'out_of_province_decrease');
```

**契约符合度**: ✅ 八层隔离机制，数据不可能混用

---

### 2.5 状态机扩展需求 ✅

**现状**: 省外派单复用 `work_orders` 表的基础状态机（DRAFT/SUBMITTED/COMPLETED等）

**审查结论**: 
- ❌ **无需扩展** - 省外派单未引入往返补料流程（PENDING_INFO）
- ✅ 在职模块的往返状态机已在 `backend/src/modules/dispatched-orders/dispatched-order.service.ts` 实现（PROCESSING ↔ PENDING_INFO可重复触发）
- ✅ 省外派单走基础状态流转即可，不需要单独状态机

**契约符合度**: ✅ 省外派单状态机需求不存在，现有work_orders状态满足

---

### 2.6 技术栈一致性 ✅

| 维度 | 在职模块（阶段2） | 省外派单（阶段3） | 一致性 |
|------|-----------------|-----------------|--------|
| 数据库 | PostgreSQL + TypeORM | 同左 | ✅ |
| 后端框架 | NestJS | 同左 | ✅ |
| 前端框架 | React + AntD + ProComponents | 同左 | ✅ |
| 状态管理 | Zustand (userStore) | 同左 | ✅ |
| 路由 | React Router v6 | 同左 | ✅ |
| 业务范围存储 | LocalStorage (businessScope.ts) | 同左 | ✅ |
| 派单机制 | 省份命名空间 + module_handlers表 | 同左 | ✅ |
| 导入机制 | ExcelUploader + imports module | 同左 | ✅ |

**契约符合度**: ✅ 完全一致，无技术栈分歧

---

### 2.7 现有业务不受影响 ✅

**验证维度**:
1. **入职/续签/离职路由**: 未被省外模块覆盖（`/work-orders`、`/renewal`、`/resignation` 保持独立）
2. **在职路由**: `/in-service` 独立，与 `/out-of-province` 无冲突
3. **菜单过滤**: `scope` 机制确保北仑/省外菜单互斥显示
4. **数据库隔离**: `business_scope` + `order_type` 双重过滤
5. **派单表隔离**: `module_code` 命名空间（`ONBOARDING__某省` vs `OUT_OF_PROVINCE_DISPATCH__某省`）
6. **AssigneeRecord/FallbackHandler**: 未被删除，保持向后兼容

**契约符合度**: ✅ 省外模块是增量叠加，不修改现有表结构、不删除现有字段、不覆盖现有路由

---

## 3. 风险点标注

### 🟡 中风险：省外表单字段待补齐

**位置**: `frontend/src/pages/OutOfProvince/Import.tsx:60-62`
```tsx
<Alert
  type="info"
  showIcon
  message="省外导入与北仑数据独立"
  description="导入请求固定携带省外业务范围；单条表单字段仍等待业务侧提供菜鸟模板/浙江自签字段清单。"
/>
```

**影响**: 
- 导入功能已可用，但单条表单（`/out-of-province/new`）字段定义不完整
- 需等待业务侧提供「菜鸟模板」或「浙江自签」字段清单

**缓解措施**: 
- 已在导入页显式标注TODO
- 表单路由已预留，后续补充字段不影响现有导入功能

---

### 🟢 低风险：LocalStorage业务范围回退

**位置**: `frontend/src/utils/businessScope.ts:10-18`
```ts
export function readBusinessScope(): BusinessScope {
  try {
    return localStorage.getItem(BUSINESS_SCOPE_STORAGE_KEY) === BUSINESS_SCOPE.OUT_OF_PROVINCE
      ? BUSINESS_SCOPE.OUT_OF_PROVINCE
      : BUSINESS_SCOPE.BEILUN;
  } catch {
    return BUSINESS_SCOPE.BEILUN;
  }
}
```

**影响**: 
- 用户切换省外范围后，如果清除浏览器缓存或使用隐私模式，会回退到北仑
- 不影响功能正确性，仅影响用户偏好保持

**缓解措施**: 
- 默认值为北仑（主业务），符合业务优先级
- 用户可随时通过切换器重新选择

---

### 🟢 低风险：Sheet5双人省份仅1个

**位置**: `backend/src/database/seeds/province-handler.seed.ts:41-50`
```ts
// Sheet5: 省外派单映射（1个双人省份：福建）
const SHEET5_MAPPING: Record<string, string> = {
  // ... 福建: 'yangxiaohan/yangjie' ...
};
```

**影响**: 
- Sheet4单项业务有5个双人省份（湖北、江苏、山西、山东、福建）
- Sheet5省外派单仅福建是双人配置，其他均单人
- 如果未来省外业务量增长，可能需要动态调整

**缓解措施**: 
- 种子数据可快速修改（纯数据配置，无代码改动）
- `parseHandlerUsernames()` 已支持1-2人动态解析
- `weight` 机制（首位100，备位1）自动生效

---

## 4. 架构契约

### 4.1 数据隔离契约

```ts
// 在职单项业务
interface InServiceOrder {
  businessScope: 'beilun';
  orderType: 'in_service';
  businessType: BusinessType;    // 一级分类
  processType: ProcessType;       // 二级流程
  requirementType: RequirementType; // 三级需求
  province: string;
}

// 省外派单
interface OutOfProvinceOrder {
  businessScope: 'out_of_province';
  orderType: 'out_of_province_increase' | 'out_of_province_decrease';
  province: string;
  // 不包含三级分类字段
}
```

**强制约束**: 
- 禁止在 `out-of-province-orders.service.ts` 中查询 `business_scope = 'beilun'`
- 禁止在 `in-service-orders.service.ts` 中查询 `business_scope = 'out_of_province'`
- 禁止在前端 `/in-service` 路由中显示省外数据
- 禁止在前端 `/out-of-province` 路由中显示在职数据

---

### 4.2 派单隔离契约

```ts
// Sheet4：在职单项业务
module_code = `IN_SERVICE_SINGLE_BUSINESS__${province}`

// Sheet5：省外派单
module_code = `OUT_OF_PROVINCE_DISPATCH__${province}`
```

**强制约束**: 
- `module_handlers` 表中，同一 `handler_id` 可同时绑定Sheet4和Sheet5的相同省份（如：chenli同时处理广东的在职和省外）
- 派单引擎根据 `orderType` + `businessScope` 自动选择正确的 `module_code` 前缀
- 禁止手动修改 `module_code` 绕过命名空间隔离

---

### 4.3 前端范围契约

```tsx
// 业务范围切换器位置：顶部导航栏
actionsRender={() => [
  <Segmented
    value={businessScope}
    options={[
      { label: '北仑', value: BUSINESS_SCOPE.BEILUN },
      { label: '省外', value: BUSINESS_SCOPE.OUT_OF_PROVINCE },
    ]}
    onChange={handleBusinessScopeChange}
  />
]}

// 菜单项范围标记
{
  path: '/in-service-group',
  scope: BUSINESS_SCOPE.BEILUN,  // 仅北仑显示
}
{
  path: '/out-of-province-group',
  scope: BUSINESS_SCOPE.OUT_OF_PROVINCE,  // 仅省外显示
}
```

**强制约束**: 
- 禁止将业务范围写入 `appStore` / `userStore`（已确认未引入）
- 禁止通过URL参数传递业务范围（使用LocalStorage单一数据源）
- 切换业务范围时，必须导航到对应的landing path（北仑→/dashboard，省外→/out-of-province）

---

## 5. 审查结论

### ✅ 所有核心检查项通过

1. **业务范围切换器**: 实现位置合理，LocalStorage持久化，菜单动态过滤
2. **Sheet5增减员后端**: 数据模型清晰，服务隔离彻底，种子数据验证完整
3. **省外派单导入**: 复用现有基础设施，类型切换器可用，错误处理完善
4. **Sheet4/Sheet5隔离**: 八层隔离机制（数据库/枚举/派单表/种子/服务/控制器/路由/菜单），数据不可能混用
5. **状态机扩展**: 省外派单无需往返补料，复用基础状态机即可
6. **技术栈一致性**: 前后端框架、派单机制、导入机制完全一致
7. **现有业务保护**: 入职/续签/离职不受影响，在职模块独立运行

### 风险点摘要

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|----------|
| 省外表单字段待补齐 | 🟡 中 | 单条表单不可用，导入功能不受影响 | 已在UI标注TODO，等待业务提供字段清单 |
| LocalStorage业务范围回退 | 🟢 低 | 缓存清除后回退北仑 | 默认值合理，用户可随时切换 |
| Sheet5双人省份仅1个 | 🟢 低 | 未来业务量增长可能需调整 | 种子数据易修改，机制已支持1-2人动态解析 |

### 建议

1. ✅ **阶段3可进入QA回归测试** - 核心架构设计符合约束，无阻塞性问题
2. ⚠️ **省外表单字段尽快补齐** - 虽不阻塞当前阶段，但需在阶段4前完成
3. ✅ **保持Sheet4/Sheet5隔离纪律** - 未来迭代中严格遵守八层隔离契约

---

**审查完成时间**: 2026-07-28  
**下一步行动**: 转交QA执行阶段3回归测试（`回归测试.ps1`）
