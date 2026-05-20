# P0 热修：/export-templates 页面运行时异常 + findDOMNode + 菜单重复 key

**日期**: 2026-05-14  
**任务 ID**: 9d535655-eb59-43cd-800d-defa20e39873  
**修复人**: 前端工程师 (frontend)

---

## 1. 问题根因分析

### 1.1 `rawData.some is not a function` — 数组归一化缺失

**影响文件**:  
- `frontend/src/pages/Admin/ExportTemplates/index.tsx`

**根因**: `getExportTemplates()` 在真实后端返回分页对象 `{ list: [...], total, page }` 时，直接传给 `setData()` 导致 `dataSource` 变成非数组对象，Table 内部调用 `.some()` 时报 `rawData.some is not a function`。

**修复前** (L22-24):
```typescript
const load = async () => {
  setLoading(true);
  try { setData(await getExportTemplates()); }  // ← 无数组守卫
  catch { message.error('加载失败'); }
  finally { setLoading(false); }
};
```

**修复后**:
```typescript
const load = async () => {
  setLoading(true);
  try {
    const res = await getExportTemplates();
    setData(Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? []);
  }
  catch { message.error('加载失败'); }
  finally { setLoading(false); }
};
```

### 1.2 菜单重复 key — 父子菜单路径相同

**影响文件**:  
- `frontend/src/layouts/BasicLayout.tsx`

**根因**: ProLayout 默认使用 `path` 作为菜单项的 `key`。以下 5 组菜单的父级与其第一个子级共享同一 `path`，导致 React 渲染时出现 "Encountered two children with the same key" 警告：

| 父菜单 path | 重复子菜单 path | 修复 key |
|-------------|----------------|----------|
| `/work-orders` | `/work-orders` (主工单列表) | `work-orders-main` |
| `/my-dispatched` | `/my-dispatched` (我的子工单) | `my-dispatched-list` |
| `/renewal` | `/renewal` (续签列表) | `renewal-list` |
| `/resignation` | `/resignation` (离职列表) | `resignation-list` |
| `/benefit` | `/benefit` (申报列表) | `benefit-list` |

**修复**: 为每个与父级 path 冲突的子菜单项添加显式 `key` 属性。

### 1.3 全局 findDOMNode 扫描

**扫描结果**: 无问题。

- ✅ `ReactDOM.findDOMNode` — 全文 0 次匹配
- ✅ `forwardRef` — 全文 0 次匹配（无自定义组件包裹 Tooltip/Popover）
- ✅ `visible=` 遗留属性 — 全文 0 次匹配（全部使用 `open`）
- ✅ Tooltip/Popover/Dropdown 函数子组件 — 全文 0 次匹配
- ✅ 所有 Tooltip 使用字符串 title、Popover 使用 pre-rendered content、Dropdown 使用 menu prop — 均为 antd v5 兼容模式

### 1.4 已在上次修复中处理的问题

以下文件已在前期修复，无需额外修改：
- `frontend/src/pages/ExportTemplates/index.tsx` L30-39: `getFields()` 已加 `Array.isArray` 守卫
- `frontend/src/pages/ExportTemplates/index.tsx` L132-142: ProTable request handler 已做数组归一化
- `frontend/src/pages/Admin/Customers/index.tsx`: `rawData` 使用正确，有 `Array.isArray` 守卫

---

## 2. 修改文件清单

| # | 文件 | 改动 | 行号 |
|---|------|------|------|
| 1 | `frontend/src/pages/Admin/ExportTemplates/index.tsx` | `load()` 加 `Array.isArray` 归一化守卫 | L22-28 |
| 2 | `frontend/src/layouts/BasicLayout.tsx` | 5 组冲突子菜单加显式 `key` 属性 | L23-55 |

---

## 3. 验证步骤

### 3.1 自动化验证
```bash
cd frontend
npx tsc --noEmit   # ✅ 0 errors
npm run build       # ✅ 成功 (20.79s)
```

### 3.2 手动验证清单

| 序号 | 测试场景 | 预期结果 | 状态 |
|------|----------|----------|------|
| 1 | 访问 `/export-templates` 页面 | 正常加载，无白屏/报错 | 待 QA |
| 2 | 访问 `/admin/export-templates` 页面 | 表格正常渲染，JSON 格式模板可编辑 | 待 QA |
| 3 | 创建/编辑/删除导出模板 | 所有操作不报错、不白屏 | 待 QA |
| 4 | 切换所有菜单项 | 控制台无 "duplicate key" 警告 | 待 QA |
| 5 | 页面加载后检查控制台 | 无 findDOMNode 警告、无未捕获异常 | 待 QA |

---

## 4. 防御模式总结

本次统一引入的数组归一化模式：
```typescript
// 模式：兼容后端直接返回数组或分页对象
const res = await someApi();
const list = Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? [];
```

此模式已在以下位置落地：
- `Admin/ExportTemplates` — 本次修复
- `ExportTemplates` (用户端) — 前期修复
- `Admin/Customers` — 前期修复
- `getFields` 调用 — 前期修复
