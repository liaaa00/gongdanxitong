# Stage A 前端实施进度

> 更新时间：2025-05-15  
> 对应票据：FE-A1 ~ FE-A9（共 6 人日）  
> 状态：**全部实现完成，build/type-check 通过**

---

## 实施总览

| ID | 功能 | 文件 | 状态 | 接口依赖 | 备注 |
|----|------|------|------|---------|------|
| FE-A1 | 客户/商社二级表格 | `Admin/Customers/` + `services/branches.ts` | ✅ 完成 | `GET/POST/PUT/DELETE /admin/branches` | 展开行显示商社子表 |
| FE-A2 | 业务员↔客户绑定 | `Admin/CustomerAssignees/` + `services/customerAssignees.ts` | ✅ 完成 | `GET/POST/DELETE /admin/customer-assignees` | 一对多绑定，含业务组选择 |
| FE-A3 | 派发规则编辑器 | `Admin/DispatchRules/` + `services/dispatchRules.ts` | ✅ 完成 | 需后端扩字段 `sub_module/assignee_user_id/fallback_user_id/customer_id/department_id` | customer/group + AB 角 + sub_module |
| FE-A4 | 已办结可编辑 | `WorkOrders/Detail/` | ✅ 完成 | `PUT /admin/work-orders/:id` 已办结状态放行 | 仅业务员字段可编辑，其他 readonly |
| FE-A5 | 通知中心增强 | `Notifications/` + `services/notifications.ts` | ✅ 完成 | `GET /notifications` + diff 字段 | unreadOnly + 弹窗 diff + 跳转 |
| FE-A6 | 批量导入重复行 | `components/ExcelUploader/` | ✅ 完成 | `POST /api/import-jobs` 返回 `DUPLICATE_ID_CARD_IN_MONTH` + `existedOrderNo` | 重复行分组 + 跳原工单 |
| FE-A7 | 首登强制改密 | `ChangePassword/` + `stores/userStore.ts` + `services/auth.ts` | ✅ 完成 | `POST /auth/change-password` + `must_change_password` 标记 | 拦截路由 + 强度校验 |
| FE-A8 | 工单池 + 认领 | `WorkOrderPool/` + `services/workOrderPool.ts` | ✅ 完成 | `GET /work-order-pool` + `POST /api/dispatched-orders/:id/claim` | 3 Tab 池 + 原子认领 |
| FE-A9 | 权限文案统一 | `FieldPermissions/` + `hooks/useFieldPermissions.ts` | ✅ 完成 | 无后端依赖 | 可编辑/仅可见/隐藏/脱敏 四态 |

---

## 新增文件清单

```
frontend/src/
  services/
    branches.ts              ← 商社 CRUD
    customerAssignees.ts     ← 业务员↔客户绑定 CRUD
    workOrderPool.ts         ← 工单池 + 认领
  pages/
    Admin/CustomerAssignees/index.tsx   ← 绑定页面
    WorkOrderPool/index.tsx             ← 工单池页面
    ChangePassword/index.tsx            ← 首登改密页
```

## 修改文件清单

```
frontend/src/
  services/
    dispatchRules.ts          ← 扩展 DispatchRuleItem 接口
    notifications.ts          ← 扩展 NotificationItem + mock 种子
    auth.ts                   ← 透传 must_change_password
    types.ts                  ← UserInfo/LoginResponse 加字段
  stores/userStore.ts         ← 新增 mustChangePassword + setter
  routes/index.tsx            ← 新增 3 个路由 + PrivateRoute 拦截
  pages/
    Admin/Customers/index.tsx              ← 展开商社子表
    Admin/DispatchRules/index.tsx          ← 新字段编辑器
    Admin/FieldPermissions/index.tsx       ← 权限文案更新
    WorkOrders/Detail/index.tsx            ← 已办结编辑模式
    Notifications/index.tsx                ← 通知增强
    Login/index.tsx                        ← 首登拦截跳转
  components/ExcelUploader/index.tsx       ← 重复行分组展示
```

---

## 接口契约（需后端对齐）

| 接口路径 | 方法 | 说明 | 状态 |
|----------|------|------|------|
| `/admin/branches` | GET/POST | 商社 CRUD | ⏳ 等后端 |
| `/admin/branches/:id` | PUT/DELETE | 商社增删改 | ⏳ 等后端 |
| `/admin/customer-assignees` | GET/POST | 绑定 CRUD | ⏳ 等后端 |
| `/admin/customer-assignees/:id` | DELETE | 解绑 | ⏳ 等后端 |
| `/admin/dispatch-rules` | GET/POST/PUT | 扩字段 `sub_module/assignee_user_id/fallback_user_id/customer_id/department_id` | ⏳ 等后端 BE-A5 |
| `/work-order-pool` | GET | 工单池列表 | ⏳ 等后端 BE-A10 |
| `/api/dispatched-orders/:id/claim` | POST | 原子认领 | ⏳ 等后端 BE-A10 |
| `/auth/change-password` | POST | 改密 | ⏳ 等后端 BE-A9 |
| `POST /api/import-jobs` | 批量导入 | 返回 `DUPLICATE_ID_CARD_IN_MONTH` + `existedOrderNo` | ⏳ 等后端 BE-A4 |

> 所有接口当前均通过 mock 骨架运行，待后端完成对应 ticket 后切回真实 API。

---

## 验证结果

- ✅ `npx tsc --noEmit` — 零错误
- ✅ `npm run build` — 构建成功 (20.63s)
- ⚠️ ESLint 配置有预存问题（非本次改动引入）
- 🔜 9 个页面需手动走通（可在浏览器 mock 模式下验证）
