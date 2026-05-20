# 工单管理系统 - 前端

基于 React 18 + TypeScript + Vite + Ant Design Pro 的入职工单管理系统前端。

## 技术栈

- React 18 + TypeScript
- Vite 5 (构建工具)
- Ant Design 5 + Ant Design Pro Components
- Zustand (状态管理)
- React Router DOM 6
- Axios (HTTP 客户端)
- Day.js (日期处理)
- Less (样式)

## 项目结构

```
src/
├── layouts/          # 全局布局 (BasicLayout)
├── pages/            # 页面组件
│   ├── Login/        # 登录页
│   ├── Dashboard/    # 仪表盘
│   ├── WorkOrders/   # 工单管理
│   ├── MyTodos/      # 我的待办
│   ├── MyDispatched/ # 我的子工单
│   ├── TeamDispatched/ # 部门子工单
│   ├── ExportTemplates/ # 导出模板
│   └── Admin/        # 管理后台
├── components/       # 公共组件
│   ├── ProTablePage/ # 通用表格封装
│   ├── DynamicForm/  # 动态表单 (核心)
│   ├── RolePermissionMatrix/ # 角色权限矩阵
│   ├── AstConditionEditor/ # AST 条件编辑器
│   └── ExcelUploader/ # Excel 导入上传
├── routes/           # 路由配置
├── services/         # API 服务层
├── stores/           # Zustand 状态
├── hooks/            # 自定义 Hook
├── utils/            # 工具函数
└── styles/           # 全局样式
```

## 环境模式（3 种）

| 模式 | 启用方法 | 原理 | 适用场景 | 后端依赖 | 已知限制 |
|---|---|---|---|---|---|
| **A: Mock Service Layer** | `.env` 设 `VITE_USE_MOCK=true`（默认） | `src/services/*.ts` 内置 mock 数据，`isMockMode` 分流 | 本地开发调试、快速原型 | 无 | mock 数据固定，不支持请求级断言 |
| **B: Mock Service Worker** | `.env` 设 `VITE_USE_MSW=true` | Service Worker 拦截 fetch，MSW handlers 响应 | 自动化测试、QA 演练 | 无（需 `public/mockServiceWorker.js`） | 首次加载需 SW 注册；handler 更新需刷新 |
| **C: Live Backend** | 不设上述任一变量 | Vite proxy → 真实后端 API | 前后端联调、真接口验证 | 后端需启动（默认 `:3000`） | 依赖后端可用性 |

### 切换开关详情

```bash
# 模式 A: Mock Service Layer（默认，开箱即用）
npm run dev

# 模式 B: MSW 拦截
VITE_USE_MSW=true npm run dev

# 模式 C: 真接口联调
VITE_USE_MOCK=false npm run dev
```

### Vite Proxy 配置

`vite.config.ts` 中 `server.proxy` 已配置 3 条代理规则，目标地址由 `VITE_API_BASE_URL` 环境变量控制（默认 `http://localhost:3000`）：

| 前缀 | 说明 | WebSocket |
|---|---|---|
| `/api` | REST API | 否 |
| `/uploads` | 文件上传 / 下载 | 否 |
| `/events` | SSE 事件流 | 是 |

```bash
# 自定义后端地址
VITE_API_BASE_URL=http://192.168.1.50:8080 npm run dev
```

### 真接口联调验证

```bash
# 后端启动后，运行冒烟测试
npm run smoke:live
```

脚本依次验证：`login → /auth/me → /work-orders → /admin/users → /dashboard/salesperson`

## 生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

## Docker 部署

```bash
# 构建镜像
docker build -t work-order-frontend .

# 运行
docker run -p 80:80 work-order-frontend
```

## 后端接口规范

遵循 `docs/API规范.md`：
- 统一响应：`{ code, data, message, traceId }`
- 分页参数：`page, pageSize, sort, keyword`
- 分页响应：`{ list, page, pageSize, total, totalPages }`
- JSON 字段使用 camelCase，field_code 保持 snake_case
- 时间格式：ISO 8601

## Phase 开发进度

- [x] Phase 1: 基础骨架 (Vite + 登录 + 权限路由 + 全局布局)
- [x] Phase 2 预热: 路由骨架 + 公共组件 + 服务层 Mock
- [x] Phase 3: 工单核心功能（动态表单/列表/详情/子工单）
- [x] Phase 4: 导入与补充回流（Excel导入/AI映射/字段回流/退回流程）
- [x] Phase 5: 撤回与审批（撤回/修改申请/审批流/操作日志/导出模板）
- [x] Phase 6: 看板与打磨（三角色看板/通知中心/SLA预警/单测/e2e）
