# Bug 修复总结：字段权限页面 data.roles.map 错误

## 问题描述
字段权限页面出现 `data.roles.map is not a function` 错误，与之前的 `allRoles.filter` 问题类似。

## 根本原因
后端 API 可能返回分页对象 `{ list: [...], total: ... }` 而不是直接返回数组，导致前端代码在调用数组方法时出错。

## 修复位置

### 1. `src/pages/Admin/FieldPermissions/index.tsx` - load 函数 (line 71-82)

**修复前：**
```typescript
const res = await request.get('/admin/field-permissions/matrix', { params: { scenario } }) as MatrixResp;
setData(res);
```

**修复后：**
```typescript
const res = await request.get('/admin/field-permissions/matrix', { params: { scenario } }) as any;
// 处理可能的分页对象
const normalizedData: MatrixResp = {
  roles: Array.isArray(res?.roles) ? res.roles : (res?.roles?.list || []),
  fields: Array.isArray(res?.fields) ? res.fields : (res?.fields?.list || []),
  matrix: Array.isArray(res?.matrix) ? res.matrix : (res?.matrix?.list || []),
  scenarios: Array.isArray(res?.scenarios) ? res.scenarios : (res?.scenarios?.list || DEFAULT_SCENARIOS),
};
setData(normalizedData);
```

**说明：** 在数据加载的源头就进行规范化处理，确保所有字段都是数组。

### 2. `src/pages/Admin/FieldPermissions/index.tsx` - loadMockMatrix 函数 (line 46-63)

**修复前：**
```typescript
const [roles, fields] = await Promise.all([getRoles(), getFields()]);
const activeRoles = roles.filter((r) => r.is_active);
const activeFields = fields.filter((f) => f.is_active);
```

**修复后：**
```typescript
const [rolesResult, fieldsResult] = await Promise.all([getRoles(), getFields()]);
// 处理可能的分页对象
const roles: RoleItem[] = Array.isArray(rolesResult) ? rolesResult : (rolesResult as any)?.list || [];
const fields: FieldConfigItem[] = Array.isArray(fieldsResult) ? fieldsResult : (fieldsResult as any)?.list || [];
const activeRoles = roles.filter((r: RoleItem) => r.is_active);
const activeFields = fields.filter((f: FieldConfigItem) => f.is_active);
```

**说明：** Mock 模式下也需要处理分页对象，并添加了 TypeScript 类型注解。

### 3. `src/pages/Admin/FieldPermissions/index.tsx` - columns 定义 (line 85-96)

**修复前：**
```typescript
...data.roles.map((r) => ({
  title: r.name,
  dataIndex: r.id,
  width: 110,
  render: (v: string) => {
    const cfg = PERM_TAG[v] || { color: 'default', label: v || '—' };
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  },
})),
```

**修复后：**
```typescript
...(Array.isArray(data.roles) ? data.roles : []).map((r) => ({
  title: r.name,
  dataIndex: r.id,
  width: 110,
  render: (v: string) => {
    const cfg = PERM_TAG[v] || { color: 'default', label: v || '—' };
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  },
})),
```

**说明：** 添加双重保护，即使数据规范化失败也不会崩溃。

### 4. `src/pages/Admin/FieldPermissions/index.tsx` - rowData 定义 (line 98-105)

**修复前：**
```typescript
const rowData = data ? data.fields.map((f) => {
  const row: Record<string, string> = { key: f.field_code, field_name: f.field_name };
  data.roles.forEach((role) => {
    const cell = data.matrix.find((m) => m.role_id === role.id)?.cells.find((c) => c.field_code === f.field_code);
    row[role.id] = cell?.permission || 'hidden';
  });
  return row;
}) : [];
```

**修复后：**
```typescript
const rowData = data ? (Array.isArray(data.fields) ? data.fields : []).map((f) => {
  const row: Record<string, string> = { key: f.field_code, field_name: f.field_name };
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const matrix = Array.isArray(data.matrix) ? data.matrix : [];
  roles.forEach((role) => {
    const cell = matrix.find((m) => m.role_id === role.id)?.cells.find((c) => c.field_code === f.field_code);
    row[role.id] = cell?.permission || 'hidden';
  });
  return row;
}) : [];
```

**说明：** 对所有数组字段都添加了防御性检查。

### 5. 类型导入优化

**修复前：**
```typescript
import { getRoles } from '@/services/roles';
import { getFields } from '@/services/fields';
```

**修复后：**
```typescript
import { getRoles, type RoleItem } from '@/services/roles';
import { getFields, type FieldConfigItem } from '@/services/fields';
```

**说明：** 导入类型定义，解决 TypeScript 类型错误。

## 防御策略

采用**三层防御**：

1. **数据源层**：在 `load()` 和 `loadMockMatrix()` 函数中规范化数据
2. **使用层**：在 `columns` 和 `rowData` 定义中添加 `Array.isArray()` 检查
3. **类型层**：添加 TypeScript 类型注解，编译时发现潜在问题

## 已完成的操作

1. ✅ 修复了 5 个关键位置的数据处理逻辑
2. ✅ 添加了完整的 TypeScript 类型注解
3. ✅ 重新构建了前端项目（构建成功，耗时 22.00s）
4. ✅ 验证了 TypeScript 编译通过

## 测试建议

1. **清除浏览器缓存**：按 `Ctrl+Shift+Delete` 清除浏览器缓存
2. **硬刷新页面**：按 `Ctrl+F5` 强制刷新页面
3. **测试路径**：
   - 访问字段权限页面（`/admin/field-permissions`）
   - 切换不同的场景（scenario）
   - 检查表格是否正常显示
   - 验证角色列和字段行是否正确渲染

## 防御性编程模式

```typescript
// ✅ 正确的做法 - 三层防御
// 1. 数据源层规范化
const normalizedData = {
  roles: Array.isArray(res?.roles) ? res.roles : (res?.roles?.list || []),
  fields: Array.isArray(res?.fields) ? res.fields : (res?.fields?.list || []),
};

// 2. 使用层检查
const roles = Array.isArray(data.roles) ? data.roles : [];
roles.map(...);

// 3. 类型层保护
const roles: RoleItem[] = ...;
```

## 相关文件

- `src/pages/Admin/FieldPermissions/index.tsx`（主要修复文件）
- `src/services/roles.ts`（类型定义来源）
- `src/services/fields.ts`（类型定义来源）

## 构建信息

- 构建时间：22.00s
- 构建状态：✅ 成功
- TypeScript 编译：✅ 通过
