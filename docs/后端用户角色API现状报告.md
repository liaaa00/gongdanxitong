# 后端用户-角色关联 API 现状报告

## 结论
后端**已经实现**用户-角色关联的完整基础支持：
- 用户创建/更新接口支持传入 `roles` 数组
- 用户详情/列表接口会返回关联的角色绑定数据
- 另有独立的绑定/解绑接口用于增量维护用户角色
- 数据库层 `user_roles` 已按多对多关系建表，且采用联合主键

## 1. 当前 API 实现现状

### 1.1 控制器
文件：`backend/src/modules/admin/users/users.controller.ts`

已存在的相关接口：
- `GET /api/admin/users`：用户列表
- `POST /api/admin/users`：创建用户，支持 `roles`
- `GET /api/admin/users/:id`：用户详情，返回用户及其 `userRoles`
- `PUT /api/admin/users/:id`：更新用户，支持 `roles`
- `POST /api/admin/users/:id/roles`：批量绑定角色
- `DELETE /api/admin/users/:id/roles/:roleId`：解绑单个角色

### 1.2 服务层
文件：`backend/src/modules/admin/users/users.service.ts`

实现情况：
- `list()`：左连接 `userRoles -> role -> department`，列表会带出角色绑定信息
- `detail()`：查询 `userRoles`，并预加载 `role`、`department`
- `create()`：事务内创建用户并写入 `user_roles`
- `update()`：如传入 `roles`，会先删旧绑定再重建新绑定
- `bindRoles()`：增量绑定角色
- `unbindRole()`：按 `userId + roleId` 删除绑定
- `validateRoleBindings()`：校验至少 1 个角色、只能 1 个主角色、角色+部门组合不能重复

### 1.3 请求数据结构
创建/更新用户时，`roles` 的元素结构为：
```ts
{
  roleId: string;
  departmentId: string;
  isPrimary: boolean;
}
```

## 2. 数据库表结构确认

文件：`backend/src/database/migrations/1715400000000-InitSchema.ts`

### 2.1 `user_roles` 表
```sql
CREATE TABLE user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  department_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, role_id, department_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE
)
```

### 2.2 结论
- `user_roles` 明确是**多对多关联表**
- 不是单纯在 `users` 表里存一个 `role_id`
- 联合主键保证同一用户/角色/部门组合不重复
- 级联删除已配置，用户/角色/部门删除会自动清理关联

## 3. GET /api/admin/users/:id 返回内容确认

`detail()` 已预加载：
- `userRoles.role`
- `userRoles.department`

因此该接口**会返回用户的角色列表**，但返回结构是 `userRoles[]`，不是扁平的 `roles[]`。

## 4. 缺失功能清单

### 4.1 核心功能
**未发现核心缺失。**
用户-角色关联的 CRUD/绑定/解绑/详情返回，在后端已经具备。

### 4.2 可能的前后端契合点（非阻塞）
如果前端期望的是更扁平的数据结构，当前返回需要自行映射：
- 现状：`userRoles[].role` / `userRoles[].department`
- 可选增强：增加统一响应 DTO，直接返回 `roles[]`

## 5. 如需补充的 API 端点 / 数据结构（可选增强）

当前不是必须补充，但若要提升前端可用性，建议增加：

### 5.1 可选端点
- `GET /api/admin/users/:id/roles`
  - 仅返回该用户绑定的角色列表
- `PUT /api/admin/users/:id/roles`
  - 用于一次性替换全部角色绑定（当前 `PUT /:id` 已支持这一能力）

### 5.2 可选响应 DTO
```ts
{
  id: string;
  username: string;
  realName: string;
  roles: Array<{
    roleId: string;
    roleCode: string;
    roleName: string;
    departmentId: string;
    departmentName: string;
    isPrimary: boolean;
  }>;
}
```

## 6. 参考文件
- `backend/src/modules/admin/users/users.controller.ts`
- `backend/src/modules/admin/users/users.service.ts`
- `backend/src/entities/user-role.entity.ts`
- `backend/src/entities/user.entity.ts`
- `backend/src/entities/role.entity.ts`
- `backend/src/database/migrations/1715400000000-InitSchema.ts`
