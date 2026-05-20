# Phase 2 前端测试用例

适用范围：`frontend/src/routes/index.tsx`、`frontend/src/layouts/BasicLayout.tsx`、`frontend/src/components/DynamicForm/index.tsx`、`frontend/src/components/AstConditionEditor/index.tsx`、`frontend/src/components/RolePermissionMatrix/index.tsx`、`frontend/src/components/ExcelUploader/index.tsx`、`frontend/src/components/ProTablePage/index.tsx`。

优先级说明：P0 = 阻塞验收；P1 = 重要功能；P2 = 体验与细节。

## 1. 权限路由

### P2-FE-ROUTE-001 无角色用户访问受限路由跳转 `/403`
- 优先级：P0
- 前置：本地存储无有效用户信息，或 `useUserStore().user.roles=[]`。
- 步骤：直接访问 `/team-dispatched`。
- 预期：页面跳转到 `/403`，不渲染受限页面内容。

### P2-FE-ROUTE-002 non-admin 访问 `/admin/users` 跳转 `/403`
- 优先级：P0
- 前置：已登录，但角色不包含 `admin`。
- 步骤：在地址栏输入 `/admin/users`。
- 预期：自动跳转 `/403`；浏览器历史中不残留可回退到受限页面的内容。

### P2-FE-ROUTE-003 已登录用户访问根路径自动进入仪表盘
- 优先级：P1
- 前置：存在有效 token，`isLoggedIn=true`。
- 步骤：访问 `/`。
- 预期：重定向到 `/dashboard`。

## 2. 管理后台菜单

### P2-FE-MENU-001 non-admin 不显示“管理后台”菜单组
- 优先级：P0
- 前置：登录用户角色不包含 `admin`。
- 步骤：打开侧边栏菜单。
- 预期：不出现“管理后台”一级菜单及其子项。

### P2-FE-MENU-002 admin 显示完整管理后台菜单
- 优先级：P1
- 前置：登录用户包含 `admin`。
- 步骤：打开侧边栏菜单。
- 预期：展示“用户管理 / 角色管理 / 部门管理 / 客户管理 / 字段配置 / 字段权限 / 派发规则 / 模块负责人 / 导出模板配置 / 操作日志”。

## 3. DynamicForm 组件

### P2-FE-FORM-001 visible 字段正常展示且可编辑
- 优先级：P0
- 前置：传入 `fieldPermissions[fieldCode]=visible`，`readOnly=false`。
- 步骤：渲染 `DynamicForm`，在可见字段输入内容并提交。
- 预期：字段显示为可编辑态；提交值包含该字段；必填规则正常生效。

### P2-FE-FORM-002 hidden 字段不渲染也不参与提交
- 优先级：P0
- 前置：传入 `fieldPermissions[fieldCode]=hidden`。
- 步骤：渲染表单并查看 DOM/提交 payload。
- 预期：字段不出现在页面中；提交时不携带该字段。

### P2-FE-FORM-003 readonly 字段展示为禁用态
- 优先级：P0
- 前置：传入 `fieldPermissions[fieldCode]=readonly`。
- 步骤：渲染后尝试修改该字段。
- 预期：输入框禁用；值不可编辑；校验不应因只读字段再次报必填。

### P2-FE-FORM-004 masked 字段应脱敏展示且禁用
- 优先级：P0
- 前置：传入 `fieldPermissions[fieldCode]=masked`，且 `initialValues` 存在敏感值。
- 步骤：渲染表单。
- 预期：页面展示脱敏后的值；字段不可编辑；提交 payload 不暴露原值。

### P2-FE-FORM-005 条件必填字段在联动字段命中后变为必填
- 优先级：P1
- 前置：配置 `conditionalRequired`，如 `need_company_contract=是` 时 `contract_subject` 必填。
- 步骤：先选择触发值，再查看目标字段校验。
- 预期：目标字段出现“条件必填”提示；不填写无法提交。

### P2-FE-FORM-006 日期字段提交时统一转换为 `YYYY-MM-DD`
- 优先级：P1
- 前置：存在 `date` 类型字段。
- 步骤：选择日期并提交。
- 预期：`onFinish` 收到字符串格式日期，而不是 Dayjs 对象。

## 4. AstConditionEditor 组件

### P2-FE-AST-001 根节点可编辑并能输出 JSON AST
- 优先级：P0
- 前置：传入字段列表不少于 1 个。
- 步骤：新增一个条件组、选择字段、设置比较符和值，点击保存。
- 预期：`onChange` 输出的对象满足后端 JSON AST 结构：`{ op, children }` 或叶子节点 `{ field, op, value }`。

### P2-FE-AST-002 支持递归 AND/OR 嵌套编辑
- 优先级：P0
- 前置：字段列表已配置。
- 步骤：创建 AND 组，组内再嵌套 OR 组，再添加至少 2 个叶子条件。
- 预期：层级结构正确；嵌套节点能分别修改、删除，最终 AST 保持树状结构。

### P2-FE-AST-003 支持 NOT 逻辑节点保存
- 优先级：P1
- 前置：编辑器提供 NOT 入口或等价 UI。
- 步骤：创建 NOT 节点并包裹一个叶子条件。
- 预期：保存后的 AST 中能正确表达 NOT 逻辑，且可被后端校验通过。

### P2-FE-AST-004 比较节点保存字段、操作符和值
- 优先级：P0
- 前置：字段列表包含文本/数值/枚举字段。
- 步骤：分别创建 EQ / NEQ / IN / NOT_IN / CONTAINS / GT / LT / GTE / LTE / EXISTS / REGEX 节点。
- 预期：节点值被正确序列化；再次打开编辑器时可回显。

## 5. RolePermissionMatrix 组件

### P2-FE-RPM-001 单元格切换后能标记为脏数据
- 优先级：P0
- 前置：加载至少 2 个角色、3 个字段、2 个场景。
- 步骤：切换某一单元格权限值。
- 预期：该单元格进入待提交状态；仅脏单元在批量提交时被发送。

### P2-FE-RPM-002 批量切换多个字段权限后一次提交成功
- 优先级：P0
- 前置：矩阵数据已加载。
- 步骤：连续修改多个字段单元格并点击保存。
- 预期：后端接收批量 payload；刷新后矩阵值保持一致。

### P2-FE-RPM-003 复制源角色权限到目标角色成功
- 优先级：P1
- 前置：源角色已有完整权限配置，目标角色至少 1 个。
- 步骤：选择“复制到其他角色”，勾选多个目标角色并确认。
- 预期：目标角色矩阵与源角色一致；切换场景后仍保持复制结果。

## 6. ExcelUploader 组件

### P2-FE-EXCEL-001 非 Excel 文件被拒绝
- 优先级：P0
- 前置：上传组件可见。
- 步骤：上传 `.png` 或 `.pdf` 文件。
- 预期：前端提示仅支持 Excel 格式；不进入预览流程。

### P2-FE-EXCEL-002 上传 Excel 后进入字段映射步骤
- 优先级：P0
- 前置：准备合法 `.xlsx` 文件。
- 步骤：上传文件并等待预览完成。
- 预期：步骤从“上传文件”切换到“字段映射”；展示表头建议与预览行数。

### P2-FE-EXCEL-003 修改映射后确认导入成功
- 优先级：P0
- 前置：预览已返回建议映射。
- 步骤：修改某列映射并点击“确认导入”。
- 预期：调用确认接口时带上最新 mapping；成功后进入完成页。

### P2-FE-EXCEL-004 预览失败时展示错误并可重试
- 优先级：P1
- 前置：模拟后端预览接口返回错误。
- 步骤：上传文件。
- 预期：显示错误提示；可重新上传，不残留旧映射结果。

## 7. ProTablePage 组件

### P2-FE-TABLE-001 默认展示搜索与分页
- 优先级：P1
- 前置：传入 request 和 columns。
- 步骤：打开列表页。
- 预期：默认显示搜索区、分页器，默认每页 20 条。

### P2-FE-TABLE-002 关闭 search 时不渲染搜索栏
- 优先级：P1
- 前置：`search={false}`。
- 步骤：渲染表格页。
- 预期：不显示搜索栏，仅显示表格和工具栏。

### P2-FE-TABLE-003 配置 onExport 时显示导出按钮
- 优先级：P0
- 前置：传入 `onExport`。
- 步骤：查看工具栏。
- 预期：展示“导出”按钮；点击后触发导出回调。

### P2-FE-TABLE-004 列筛选与分页参数正确传给 request
- 优先级：P0
- 前置：列表接口支持 `page/pageSize/keyword`。
- 步骤：修改分页和筛选条件。
- 预期：`request` 收到正确参数；返回数据后列表刷新正常。

### P2-FE-TABLE-005 无导出权限时不显示导出按钮
- 优先级：P0
- 前置：外层业务已判定无导出权限。
- 步骤：渲染 `ProTablePage` 不传 `onExport`。
- 预期：工具栏不显示导出入口，避免误导用户。
