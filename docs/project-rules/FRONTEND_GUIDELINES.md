# FRONTEND_GUIDELINES.md — 前端视觉与组件规范

> 版本：0.2.0 · 基于 2025-05-29 逆向工程盘点
> **本文档只总结当前代码中实际存在的 UI 风格、组件模式和样式规则。不写未来理想态。**

---

## 目录

1. [UI 框架与组件库](#1-ui-框架与组件库)
2. [飞书/Tailwind/shadcn 使用情况](#2-飞书tailwindshadcn-使用情况)
3. [布局系统](#3-布局系统)
4. [组件使用模式](#4-组件使用模式)
5. [调色板与语义色](#5-调色板与语义色)
6. [字号层级 (Typography Scale)](#6-字号层级-typography-scale)
7. [间距系统 (Spacing)](#7-间距系统-spacing)
8. [圆角 (Border Radius)](#8-圆角-border-radius)
9. [阴影 (Box Shadow)](#9-阴影-box-shadow)
10. [表单规范](#10-表单规范)
11. [表格规范](#11-表格规范)
12. [弹窗规范](#12-弹窗规范)
13. [状态展示规范](#13-状态展示规范)
14. [加载与错误状态](#14-加载与错误状态)
15. [响应式断点规则](#15-响应式断点规则)
16. [构建与代码分割](#16-构建与代码分割)

---

## 1. UI 框架与组件库

### 1.1 主库（实际使用）

| 库 | 版本 (package.json) | 使用范围 |
|----|---------------------|---------|
| **antd** | `^5.22.0` | 全部基础组件 |
| **@ant-design/pro-components** | `^2.7.20` | `ProLayout`（主布局）、`ProTable`（数据表格）、`ProForm` + `ProFormText`/`ProFormDigit`/`ProFormDatePicker`/`ProFormSelect`/`ProFormTextArea`（动态表单）、`PageContainer`（页面容器）、`ProConfigProvider` |
| **@ant-design/icons** | `^5.4.0` | 全部图标 |

### 1.2 全局 Provider 配置（`App.tsx` 实际代码）

```tsx
<ConfigProvider locale={zhCN} getPopupContainer={getPopupContainerFromTrigger}>
  <ProConfigProvider intl={zhCNIntl}>
    <AntApp>
      <GlobalMessageBridge />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AntApp>
  </ProConfigProvider>
</ConfigProvider>
```

- `getPopupContainerFromTrigger` 将 Popover/Dropdown 挂载到触发元素的父级（而非 document.body），避免某些嵌套场景下定位偏移。
- `zhCNIntl` 来自 `@ant-design/pro-components`，用于 ProTable 搜索表单的中文文本。

### 1.3 样式预处理

- **Less** (`less ^4.2.1`)：全局样式放在 `src/styles/global.less`
- Vite 配置 `css.preprocessorOptions.less.javascriptEnabled: true`
- 组件级样式使用内联 `style` 属性（React CSSProperties 对象），**不使用 CSS Modules**

---

## 2. 飞书/Tailwind/shadcn 使用情况

### 2.1 飞书

- **不使用飞书原生组件。** 项目为独立 Web 应用（`docker-compose` 部署），与飞书无集成。
- 不存在 `@lark-base-open/js-sdk`、`lark-ui` 等飞书 SDK 依赖。
- 人员选择和部门选择使用 Ant Design 的 `Select` 组件，数据来自后端 API。

### 2.2 Tailwind CSS

- **不使用。** `package.json` 中无 `tailwindcss` 依赖。
- 不存在 `tailwind.config.js` 文件。
- 所有样式通过 Less + 内联 `style` 属性实现。

### 2.3 shadcn/ui

- **不使用。** 无 `@radix-ui/*` 依赖，无 `components/ui/` 目录。
- 所有 UI 复用 Ant Design 组件。

---

## 3. 布局系统

### 3.1 主布局：`BasicLayout.tsx` (570 行)

- 使用 `ProLayout` 的 **mix 混合布局模式**（`layout="mix"`）
- 侧边栏 + 顶部操作栏 + 内容区

#### 3.1.1 侧边栏菜单

- 菜单项定义在 `RAW_MENU` 常量数组中，包含 path / name / icon / roles / children
- 根据当前用户的 `canonicalRoleCodes` 动态过滤：
  - `roles` 未声明 → 所有登录用户可见
  - `roles` 声明为数组 → 仅持有这些规范角色的用户可见
- 菜单分组逻辑由 ProLayout 自动处理
- 选中态：ProLayout 原生样式，禁用左侧蓝色竖条

#### 3.1.2 顶部操作栏

- 用户姓名胶囊：
  ```tsx
  <span style={{
    display: 'inline-block',
    maxWidth: 96,
    padding: '2px 8px',
    borderRadius: 12,
    background: '#f5f5f5',
    color: 'rgba(0, 0, 0, 0.65)',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }}>
    {user?.real_name || user?.username || '用户'}
  </span>
  ```
- 通知铃铛：`BellOutlined` + `Badge`（`count={unreadCount}`） + `Popover`
- 退出按钮：`Button size="small" icon={<LogoutOutlined />}`

#### 3.1.3 内容区

- 页面顶层使用 `ProLayout` 的 `<Outlet />` 渲染子路由

### 3.2 页面容器

- 绝大多数列表页使用 `PageContainer`（来自 `@ant-design/pro-components`）包裹
- 部分详情页使用 `Card` 直接布局

### 3.3 栅格系统

- 使用 Ant Design `Row` + `Col` 24 栅格
- 常用配置：`gutter={[16, 16]}` 或 `gutter={12}`

---

## 4. 组件使用模式

### 4.1 通用组件（`src/components/`）

| 组件 | 核心用途 | 特点 |
|------|---------|------|
| `DynamicForm` | 动态表单渲染 | 使用 `ProForm` 套件（`ProFormText`, `ProFormDigit`, `ProFormDatePicker`, `ProFormSelect`, `ProFormTextArea`）；支持 field_permissions 控制可见/只读/隐藏/脱敏；按 `collection_group` 分组渲染 |
| `ProTablePage` | 标准列表页包装器 | 封装 `ProTable` + `useResizableColumns`；支持导出按钮；默认 `dateFormatter="string"`；分页默认 `pageSize=20`，`showSizeChanger=true` |
| `MultiViewTable` | 多视图表格 | 表格/看板(Kanban)/卡片三视图切换；`ViewSwitcher` 控制视图 |
| `ExcelUploader` | 文件拖拽上传 | 拖拽区域 + 进度展示 |
| `ErrorBoundary` | 错误边界 | 每个路由节点独立包裹；最多重试 3 次防无限崩溃；显示错误详情 (Collapse + 堆栈) |
| `StagesTimeline` | 工单阶段时间线 | |
| `RolePermissionMatrix` | 角色权限矩阵编辑器 | |
| `DeleteDataFeedback` | 删除操作反馈弹窗 | |
| `DispatchedBatchImportModal` | 子工单批量导入弹窗 | |
| `MaterialsUpload` | 材料附件上传 | |
| `AstConditionEditor` | 条件表达式编辑器 | 用于派发规则配置 |

### 4.2 通用自定义 Hooks（`src/hooks/`）

| Hook | 用途 |
|------|------|
| `useAuth` | 封装 `useUserStore`，提供 `user`/`isLoggedIn`/`hasRole`/`hasAnyRole` |
| `useFieldPermissions` | 调用后端字段权限接口，返回 `{permissions, loading}` |
| `useDispatchedActions` | 子工单操作（接单/完成/退回/转派）的状态管理 |

### 4.3 状态管理

- **Zustand** (`^4.5.5`)：仅 2 个 Store
  - `useUserStore`（`stores/userStore.ts`）：用户信息、JWT Token、角色列表、`hasRole`/`hasAnyRole` 判断
  - `useAppStore`（`stores/appStore.ts`）：`collapsed`（侧边栏折叠）、`loading`（全局 loading）

### 4.4 HTTP 客户端

- **axios** 封装在 `services/request.ts`
- Base URL：开发时 `/api`（Vite proxy → `http://127.0.0.1:3000`），生产时走 Nginx
- 拦截器链：
  1. Request：注入 `Authorization: Bearer <token>`；自动修正分页参数（`current`→`page`，`pageSize` 上限 100）
  2. Response：统一解包 `{code, data, message}`，`code !== 0` 时 Toast 报错；401 自动跳 `/login`
- 超时：30 秒

### 4.5 Toast 消息

- 通过 `GlobalMessageBridge` 组件获取 `App.useApp().message` 实例
- 全局错误统一调用 `showGlobalErrorMessage(msg)` → `message.error(msg)`

---

## 5. 调色板与语义色

### 5.1 Ant Design 主题 Token（未覆盖，使用默认值）

| Token | 默认值 | 使用位置 |
|-------|--------|---------|
| `colorPrimary` | `#1677ff` | 按钮、链接、通知 Tab 指示条、SVG 趋势线（入职） |
| `colorSuccess` | `#52c41a` | 成功状态 Tag、完成率数值 |
| `colorWarning` | `#faad14` | 警告状态 Tag（已退回） |
| `colorError` | `#ff4d4f` | 错误状态、ErrorBoundary 错误消息颜色 |
| `colorBgLayout` | `#f5f5f5` | 页面背景、用户姓名胶囊背景 |

### 5.2 工单状态 Tag 颜色（`constants/dictionaries.ts`）

| 状态 | 颜色 | 说明 |
|------|------|------|
| `draft` | `default` | 灰色 Tag |
| `pending` | `processing` | 蓝色脉动 Tag |
| `processing` | `blue` | 蓝色实心 Tag |
| `completed` | `success` | 绿色 Tag |
| `returned` | `warning` | 橙色 Tag |
| `withdrawn` | `default` | 灰色 Tag |
| `withdraw_pending` | `gold` | 金色 Tag |
| `void_pending` | `gold` | 金色 Tag |
| `void` | `default` | 灰色 Tag |

### 5.3 子模块颜色（`constants/modules.ts`）

每个子模块在 Ant Design Tag 中使用以下颜色关键字：

| 模块 | Tag color |
|------|-----------|
| `data_entry`（数据录入） | `blue` |
| `social_insurance`（社保公积金） | `purple` |
| `onboarding_contact`（入职联系） | `cyan` |
| `contract`（劳动合同） | `green` |
| `renewal_contract`（续签合同） | `geekblue` |
| `benefit_apply`（待遇申报） | `magenta` |
| `resignation_contact`（离职联系） | `orange` |
| `resignation_cert`（离职证明） | `cyan` |
| `data_entry_resign`（离职数据录入） | `red` |

### 5.4 趋势图自定义色

| 类型 | 颜色 |
|------|------|
| 入职趋势线 | `#1677ff` |
| 在职（续签）趋势线 | `#722ed1` |
| 离职趋势线 | `#fa8c16` |
| SVG 参考线 | `#f0f0f0` |
| SVG 月份标签 | `#8c8c8c` |
| 最近总量 `Statistic` 值 | 默认（`rgba(0,0,0,0.88)`） |
| 已办结 `Statistic` 值 | `#52c41a`（`valueStyle={{ color: '#52c41a' }}`） |

### 5.5 其他硬编码颜色（`global.less` 及内联样式）

| 颜色 | 用途 |
|------|------|
| `rgba(0, 0, 0, 0.2)` | 滚动条滑块 |
| `rgba(0, 0, 0, 0.45)` | 通知 Tab 未选中文字 |
| `rgba(0, 0, 0, 0.88)` | 通知 Tab 选中文字、正文主色 |
| `rgba(0, 0, 0, 0.65)` | 用户姓名胶囊文字 |
| `#d9d9d9` | 表格列拖拽手柄分隔线 |
| `#f5f5f5` | 用户姓名胶囊背景 |
| `#999` | ErrorBoundary 错误详情文字 |

---

## 6. 字号层级 (Typography Scale)

> 所有字号来自 Ant Design 5.x 默认 token，代码中**没有自定义字体族覆盖**。字体栈为系统默认：
> `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`

### 6.1 Ant Design 默认 Values（实际生效值）

| 层级 | 字号 | 行高 | 用途（代码中实际使用） |
|------|------|------|-----------------------|
| 页面标题 | 20px | 28px | `PageContainer` 标题 / `ProTable` `headerTitle` |
| 卡片标题 | 16px | 24px | `Card title`（如 Dashboard 卡片、MiniTrendLine 卡片） |
| 正文 | 14px | 22px | 表格内容、表单标签、`Descriptions`、`Statistic` title |
| 辅助文字 | 14px | 22px | `Text type="secondary"`、通知 Tab 文字 |
| 小字 | 12px | 20px | ErrorBoundary 详情、通知字段对比文字、`Statistic` title（仪表盘中 `fontSize: 13`） |

### 6.2 代码中手动指定的字号

| 字号 | 位置 | 用法 |
|------|------|------|
| `fontSize: 24` | 仪表盘卡片 `Statistic` | `valueStyle={{ fontSize: 24, lineHeight: 1.2 }}` |
| `fontSize: 13` | 仪表盘卡片 `Statistic` 标题 | `title: { fontSize: 13, whiteSpace: 'nowrap' }` |
| `fontSize: 13` | 用户姓名胶囊 | `fontSize: 13` |
| `fontSize: 12` | 通知详情字段对比 `Text` | `style={{ fontSize: 12 }}` |
| `fontSize: 12` | ErrorBoundary 详情 | `style={{ fontSize: 12 }}` |
| `fontSize: 11` | ErrorBoundary 堆栈 | `style={{ fontSize: 11 }}` |
| `fontSize: 10` | Dashboard 趋势图 SVG 月份文本 | `fontSize="10"` |

---

## 7. 间距系统 (Spacing)

### 7.1 遵循 Ant Design 8px 栅格

代码中未自定义间距 token，所有间距来自 Ant Design 默认值：

| 组件 | 默认内边距 | 代码中覆盖情况 |
|------|-----------|---------------|
| `Card` | `padding: 24px` | **未覆盖** |
| `PageContainer` | `padding: 24px` | **未覆盖** |
| `Table` | `size="middle"`（单元格 `padding: 12px 8px`） | **未覆盖** |
| `Form.Item` | `margin-bottom: 24px` | **未覆盖** |
| `Space` | 默认 `gap: 8px` | 部分使用 `size="middle"`（16px）或 `size={4}` |
| `Row gutter` | 无默认值 | 常用 `gutter={16}`、`gutter={[16, 16]}`、`gutter={12}` |
| `Modal` | `padding: 24px` | **未覆盖** |

### 7.2 代码中手动指定的间距

| 值 | 位置 | 用法 |
|----|------|------|
| `padding: '15vh 24px'` | ErrorBoundary 主界面 | |
| `padding: '20vh 24px'` | ErrorBoundary 连续崩溃界面 | |
| `margin: '16px auto 0'` | ErrorBoundary 详情区 | |
| `marginTop: 16` | ErrorBoundary 详情区 | |
| `padding: '2px 8px'` | 用户姓名胶囊 | |
| `marginRight: 8` | 顶栏操作区 | |
| `gap: '4px 8px'` | 表格顶部筛选区 | |

---

## 8. 圆角 (Border Radius)

> 代码中**未手动覆盖**圆角值。全部使用 Ant Design 5.x 默认：

| 组件类型 | 默认圆角 | 来源 |
|---------|---------|------|
| Button | `6px` | antd token `borderRadius` |
| Card | `8px` | antd token `borderRadiusLG` |
| Tag | `4px` | antd 内部 |
| Input/Select | `6px` | antd token |
| Modal | `8px` | antd token |
| Tooltip | `4px` | antd 内部 |
| 用户姓名胶囊 | `12px`（`borderRadius: 12`） | 手动指定 |
| 滚动条滑块 | `3px`（`border-radius: 3px`） | `global.less` 手动指定 |

---

## 9. 阴影 (Box Shadow)

> 代码中**未手动覆盖**阴影值。全部使用 Ant Design 5.x 默认：

| 组件 | 默认阴影 | 说明 |
|------|---------|------|
| Card | `0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)` | 极浅 |
| Modal | `0 6px 16px 0 rgba(0,0,0,0.08), ...` | 弹窗遮罩感 |
| Dropdown/Popover | `0 6px 16px 0 rgba(0,0,0,0.08), ...` | 弹出层 |
| 通知 Tab | `box-shadow: none !important`（手动移除） | `global.less` 中针对 `.notification-category-tabs .ant-tabs-tab` |

---

## 10. 表单规范

### 10.1 动态表单（`DynamicForm` 组件）

- **核心库**：`ProForm` + 子组件（`ProFormText`, `ProFormDigit`, `ProFormDatePicker`, `ProFormSelect`, `ProFormTextArea`）
- **字段类型映射**（`field_type` → ProForm 组件）：

  | `field_type` | 组件 |
  |-------------|------|
  | `text` | `ProFormText` |
  | `number` | `ProFormDigit` |
  | `date` | `ProFormDatePicker` |
  | `dropdown` | `ProFormSelect`（`options={dropdown_options}`） |
  | `textarea` | `ProFormTextArea` |

- **分组渲染**：按 `collection_group` 分组，每组使用 `Card title={group}` 包裹
- **权限控制**：每个字段根据 `fieldPermissions[fieldCode]` 控制
  - `hidden` → 不渲染
  - `readonly` → `disabled={true}` + 灰色背景（`fieldset disabled` 样式）
  - `masked` → 输入值显示为 `****`，但仍可编辑
  - `visible` → 正常渲染
- **条件必填**：当某个字段匹配 `conditionalRequired` 条件时，`requireFields` 中的字段变为必填
- **聚焦高亮**：`focusField` 参数指定自动聚焦的字段

### 10.2 表单通用属性

- `labelAlign="left"` — 标签左对齐
- `layout="vertical"`（ProForm 默认）— 标签在输入框上方
- `submitter` — 可自定义提交按钮文案和加载状态
- `dateFormatter="string"` — 日期以字符串格式提交

### 10.3 ProTable 搜索表单

- 使用 ProTable 内置的 `search` 配置
- `labelWidth: 'auto'` — 标签宽度自适应
- 筛选条件折叠，默认显示一行

---

## 11. 表格规范

### 11.1 核心配置

- **组件**：`ProTable`（所有数据列表页）
- **通用包装器**：`ProTablePage` 组件
- **分页**：`defaultPageSize: 20`，`showSizeChanger: true`
- **日期格式化**：`dateFormatter="string"`（全局统一）
- **行键**：`rowKey="id"`

### 11.2 列宽拖拽调整（`useResizableColumns`）

- 所有表格列支持用户手动拖拽调整宽度
- 拖拽手柄：`wo-column-resize-handle` CSS 类 → 列标题右侧 12px 宽的拖拽区
- 最小列宽：`80px`
- 默认列宽：`140px`
- 用户列宽偏好持久化在 `localStorage`（key 格式：`wo_table_column_widths_<tableId>`）

### 11.3 表头样式（`global.less`）

```less
.ant-table-wrapper .ant-table-thead > tr > th {
  text-align: center !important;  /* 居中对齐 */
  white-space: nowrap;            /* 不换行 */
}
.ant-table-wrapper .ant-table-thead > tr > th .ant-table-column-title {
  white-space: nowrap;
}
```

### 11.4 列标题 DOM 结构

```html
<span class="wo-resizable-title">
  <span class="wo-resizable-title-text">列标题文字</span>
  <span class="wo-column-resize-handle" role="separator" aria-label="拖动调整列宽"></span>
</span>
```

- 拖拽手柄伪元素：`width: 1px; height: 24px; background: #d9d9d9`（分隔线外观）
- 拖拽中：`document.body` 添加 `wo-column-resizing` 类，光标变为 `col-resize`

### 11.5 滚动条样式

```less
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.2); border-radius: 3px; }
::-webkit-scrollbar-track { background-color: transparent; }
```

---

## 12. 弹窗规范

### 12.1 Modal 使用模式

- **Ant Design `Modal`**：所有弹窗使用 `Modal` 组件
- **确认弹窗**：`Modal.confirm()` 用于删除/撤回确认
- **通知详情弹窗**（`Notifications/index.tsx` 实际代码）：
  ```tsx
  <Modal
    title="消息详情"
    open={detailOpen}
    onCancel={() => setDetailOpen(false)}
    width={680}
    footer={null}
  >
  ```
  内容使用 `Descriptions` 组件（`column={1}`）展示。

### 12.2 Popover

- **通知铃铛**：`Popover` + `trigger="click"` + `placement="bottomRight"`
- **内容**：`List` 组件，每条通知显示标题 + 时间，支持"查看全部"按钮跳转到 `/notifications`

### 12.3 Drawer（较少使用）

- 部分配置页（如字段权限矩阵）使用 `Drawer` 侧边面板

---

## 13. 状态展示规范

### 13.1 工单状态 Tag

```tsx
<Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
```

映射表在 `constants/dictionaries.ts` 的 `STATUS_MAP` 中定义（共 12 个状态码）。

### 13.2 状态归一化

`utils/statusDisplay.ts` 中的 `normalizeStatusCode()` 将历史/变体状态码归一：
- `withdraw_approved`、`retracted` → `withdrawn`
- `return_approved`、`backend_returned` → `returned`
- `voided`、`canceled` → `void`

### 13.3 子模块 Tag

```tsx
<Tag color={getModuleColor(moduleCode)}>{getModuleLabel(moduleCode)}</Tag>
```

---

## 14. 加载与错误状态

### 14.1 全页加载

- **路由懒加载**：`React.lazy()` + `<Suspense fallback={<Loading />}>`
- **Loading 组件**：`<Spin size="large" />` 居中（`display: flex; height: 100vh`）

### 14.2 表格加载

- `ProTable` 内置 `loading` 属性（`request` 返回 Promise 时自动处理）

### 14.3 仪表盘加载

- 使用 `Skeleton` 占位（卡片数据加载中）
- 使用 `<Spin>` 包裹仪表盘卡片区
- 自定义样式：
  ```less
  .ant-spin-nested-loading > div > .ant-spin { max-height: none; }
  .dashboard-loading-cover { min-height: 220px; }
  .dashboard-loading-cover > div > .ant-spin {
    display: flex; align-items: center; justify-content: center;
  }
  ```

### 14.4 空状态

- 使用 `<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="xxx" />`
- 如 Dashboard 趋势图无数据时：`<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />`

### 14.5 错误边界（`ErrorBoundary` 组件）

- **层级**：每个路由节点一个独立 ErrorBoundary，一个页面崩不影响其他页面
- **默认 fallback**：`Result status="error"` + 重试按钮 + 返回首页按钮
- **崩溃上限**：同一位置连续崩溃 3 次后停止重试，显示 `Result status="500"` 建议刷新页面
- **错误详情**：`Collapse` 折叠面板内显示错误消息 + 堆栈 + （DEV 模式下）组件堆栈
- **全局兜底**：`App` 根组件包裹 ErrorBoundary

### 14.6 页面级异常

- `window.onerror` 全局拦截 → console 输出 + Toast "系统出现意外错误，请刷新页面后重试"
- `window.onunhandledrejection` 全局拦截 → console 输出 + Toast "操作异常，请稍后重试"

---

## 15. 响应式断点规则

### 15.1 Ant Design 默认断点（实际使用）

| 断点 | 最小宽度 | 当前行为 |
|------|----------|---------|
| `xs` | < 576px | 侧边栏隐藏；`ProLayout` 自动切换为顶部导航 |
| `sm` | ≥ 576px | 侧边栏折叠为图标 |
| `md` | ≥ 768px | 侧边栏展开 |
| `lg` | ≥ 992px | 完整侧边栏 |
| `xl` | ≥ 1200px | 内容最大宽度 1200px |
| `xxl` | ≥ 1600px | 超宽屏 `max-width: 1600px` |

### 15.2 网格断点使用（`Col` 组件）

代码中实际使用的 Col 断点：

| 断点 | 代码用法 |
|------|---------|
| `xs={24}` | 手机全宽 |
| `sm={12}` | 平板半宽 |
| `md={8}` | 桌面 1/3 宽 |
| `lg={6}` | 大屏 1/4 宽 |

### 15.3 移动端适配状态

- **当前未做专门的移动端 H5 适配。**
- `index.html` 中有 `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- `ProLayout` 在小屏幕自动折叠侧边栏（Ant Design 默认行为，已生效）
- 表格在小屏幕启用横向滚动（`scroll={{ x: 'max-content' }}`）

---

## 16. 构建与代码分割

### 16.1 Vite 构建配置

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'antd-vendor': ['antd', '@ant-design/icons', '@ant-design/pro-components', 'dayjs'],
        'data-vendor': ['zustand', 'axios'],
      },
    },
  },
  chunkSizeWarningLimit: 2500, // KB
}
```

### 16.2 路由懒加载

所有页面组件通过 `React.lazy(() => import(...))` 异步加载，在 `routes/index.tsx` 中集中定义。

### 16.3 开发模式特性

- Vite dev server：端口 5173，host `0.0.0.0`（局域网可访问）
- 代理配置：`/api` → `http://127.0.0.1:3000`，`/uploads` → `http://127.0.0.1:3000`
- MSW Mock：通过 `VITE_USE_MSW=true` 环境变量启用
- 热模块替换：Vite 默认 HMR

---

## 附录：关键文件索引

| 关注点 | 文件路径 |
|--------|---------|
| 全局样式 | `src/styles/global.less` |
| 全局 Provider | `src/App.tsx` |
| 入口 + 全局错误处理 | `src/main.tsx` |
| 路由定义 | `src/routes/index.tsx` |
| 路由可见性表 | `src/config/routeVisibility.ts` |
| 主布局 | `src/layouts/BasicLayout.tsx` |
| 动态表单 | `src/components/DynamicForm/index.tsx` |
| 表格包装器 | `src/components/ProTablePage/index.tsx` |
| 表格列宽拖拽 | `src/utils/tableEnhance.tsx` |
| 状态颜色字典 | `src/constants/dictionaries.ts` |
| 角色归一化 | `src/constants/roles.ts` |
| 模块元数据 | `src/constants/modules.ts` |
| 状态展示工具 | `src/utils/statusDisplay.ts` |
| Toast 桥接 | `src/utils/messageBridge.tsx` |
| 错误边界 | `src/components/ErrorBoundary/index.tsx` |
| HTTP 客户端 | `src/services/request.ts` |
| 用户 Store | `src/stores/userStore.ts` |
| 仪表盘页 | `src/pages/Dashboard/index.tsx` |
| 通知页 | `src/pages/Notifications/index.tsx` |
