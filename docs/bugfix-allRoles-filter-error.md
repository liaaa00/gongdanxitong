# Bug 修复：allRoles.filter is not a function

## 问题描述

访问管理页面时出现错误：
```
Something went wrong.
allRoles.filter is not a function
```

## 根本原因

**后端返回格式不匹配**：

- **后端** (`backend/src/modules/admin/roles/roles.service.ts:54`)  
  返回分页对象：
  ```typescript
  return toPageResult(page, pageSize, total, rows);
  // 返回: { page: 1, pageSize: 20, total: 15, totalPages: 1, list: [...] }
  ```

- **前端** (`frontend/src/services/roles.ts:63`)  
  期望直接返回数组：
  ```typescript
  return request.get('/admin/roles') as Promise<RoleItem[]>;
  ```

- **前端使用** (`frontend/src/pages/Admin/Roles/index.tsx:115`)  
  直接调用数组方法：
  ```typescript
  allRoles.filter((r) => !editing || r.id !== editing.id)
  // allRoles 是对象 { list: [...] }，不是数组，所以报错
  ```

## 修复方案

修改 `frontend/src/services/roles.ts` 中的 `getRoles()` 函数，正确处理后端返回的分页对象：

```typescript
export async function getRoles(): Promise<RoleItem[]> {
  if (isMockMode) return mockDelay(withChildren(store()));
  const result = await request.get('/admin/roles') as any;
  // 后端返回分页对象 { list, page, pageSize, total, totalPages }
  // 这里需要提取 list 字段
  return Array.isArray(result) ? result : (result.list || []);
}
```

## 影响范围

此修复解决了所有调用 `getRoles()` 的地方：
- `frontend/src/pages/Admin/Roles/index.tsx` - 角色管理页面
- `frontend/src/pages/Admin/Users/index.tsx` - 用户管理页面（3处调用）
- `frontend/src/pages/Admin/FieldPermissions/index.tsx` - 字段权限页面
- `frontend/src/services/userRoleAssignment.test.ts` - 测试文件

## 验证

✅ 前端构建成功，无 TypeScript 错误  
✅ 兼容 Mock 模式（返回数组）和真实 API（返回分页对象）

## 关于权限管理配置

权限管理的后端逻辑已实现：
- ✅ 角色实体和数据库表已创建
- ✅ 用户-角色关联表已创建
- ✅ 字段权限表已创建
- ✅ CRUD API 已实现
- ✅ 权限守卫和装饰器已实现

此 Bug 仅是前后端数据格式不匹配导致的前端渲染错误，不影响权限管理的核心功能。
