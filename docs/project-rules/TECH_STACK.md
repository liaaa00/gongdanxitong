# TECH_STACK.md（技术栈规范）

> 本文件是当前项目的技术栈版本锁定规范。后续 AI、开发者和测试人员查阅文档、生成代码、升级依赖时，必须优先以本文列出的实际版本和证据来源为准，不得仅凭记忆或最新官网默认版本推断。

## 0. 版本锁定原则

1. **最高优先级：锁文件实际解析版本**
   - 后端：`backend/package-lock.json`
   - 前端：`frontend/package-lock.json`
   - 根目录临时工具依赖：`package-lock.json`
2. **第二优先级：包声明与脚本**
   - 后端：`backend/package.json`
   - 前端：`frontend/package.json`
   - 根目录：`package.json`
3. **第三优先级：实际源码 import / 配置使用**
   - 后端：`backend/src/**`
   - 前端：`frontend/src/**`
   - 构建与部署：`docker-compose.yml`、`backend/Dockerfile`、`frontend/Dockerfile`、`frontend/vite.config.ts`、`backend/tsconfig.json`、`frontend/tsconfig.json`
4. **禁止事项**
   - 禁止把 `package.json` 中的 `^x.y.z` 范围版本当成实际版本。
   - 禁止按“当前最新版本”编写代码或查文档；必须查本文锁定版本对应文档。
   - 禁止引入本文未列出的框架或运行时，除非先提交架构决策并同步更新本文。

---

## 1. 仓库结构与包管理

### 1.1 项目结构

当前项目不是 npm workspace，而是前后端分离的多包目录：

| 位置 | 包名 | 作用 | 锁文件 |
|---|---|---|---|
| `backend/` | `ticket-system-backend` | NestJS 后端 API、数据库访问、导入导出、通知、权限、AI 映射 | `backend/package-lock.json` |
| `frontend/` | `work-order-frontend` | React + Vite 前端单页应用 | `frontend/package-lock.json` |
| 根目录 | 未声明项目名，仅有临时依赖 | 历史/辅助 Excel 读取脚本使用 `xlsx` | `package-lock.json` |

### 1.2 包管理器

| 项目 | 包管理器 | 锁文件版本 | 说明 |
|---|---|---|---|
| 后端 | npm | lockfileVersion 3 | 使用 `npm ci` 安装，Dockerfile 已固定该方式 |
| 前端 | npm | lockfileVersion 3 | 使用 `npm ci` 安装，Dockerfile 已固定该方式 |
| 根目录 | npm | lockfileVersion 3 | 仅用于根目录 `xlsx` 辅助脚本 |

### 1.3 Node 与 npm

| 来源 | Node.js | npm | 说明 |
|---|---:|---:|---|
| Docker 运行/构建镜像 | `node:20-alpine` | 随镜像提供 | 后端、前端构建阶段均使用 Node 20 Alpine |
| 当前本机核验环境 | `v20.20.2` | `10.8.2` | 仅作为本次审查环境记录，不代表生产镜像固定小版本 |

**规范：** 后续开发按 Node.js 20 系列处理，不要使用 Node 18/22 的专属 API 或假设。

---

## 2. 后端技术栈

### 2.1 后端总体框架

| 技术 | 实际版本 | 依据 | 当前用途 |
|---|---:|---|---|
| Node.js | 20 系列 | `backend/Dockerfile` 使用 `node:20-alpine` | 后端运行时 |
| TypeScript | `5.9.3` | `backend/package-lock.json` | 后端源码语言与编译 |
| NestJS | `10.4.22` | `@nestjs/common/core/platform-express/testing` 锁定版本 | HTTP API、模块化、DI、守卫、拦截器、SSE |
| Express 平台适配 | `@nestjs/platform-express 10.4.22` | `backend/package-lock.json` | Nest HTTP 平台、文件上传拦截器基础 |
| RxJS | `7.8.2` | `backend/package-lock.json` | Nest 内部流、SSE、HTTP provider timeout |
| reflect-metadata | `0.2.2` | `backend/package-lock.json` | Nest/TypeORM 装饰器元数据 |

后端入口：`backend/src/main.ts`。

后端固定行为：

- 全局 API 前缀：`/api`
- CORS：已启用 `app.enableCors()`
- 全局校验：`ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })`
- 全局响应包装：`ResponseInterceptor`
- 全局异常过滤：`HttpExceptionFilter`
- 全局追踪 ID：`traceIdMiddleware`
- 全局认证守卫：`JwtAuthGuard`
- 全局角色守卫：`RolesGuard`
- 全局字段权限拦截：`FieldPermissionInterceptor`

### 2.2 后端编译配置

| 配置项 | 当前值 | 依据 |
|---|---|---|
| module | `commonjs` | `backend/tsconfig.json` |
| target | `ES2021` | `backend/tsconfig.json` |
| strict | `true` | `backend/tsconfig.json` |
| noImplicitAny | `true` | `backend/tsconfig.json` |
| strictNullChecks | `true` | `backend/tsconfig.json` |
| outDir | `./dist` | `backend/tsconfig.json` |
| path alias | `src/*` -> `src/*` | `backend/tsconfig.json` |
| build 命令 | `nest build && tsc-alias` | `backend/package.json` |

**规范：** 后端新代码必须满足 strict TypeScript，不得依赖隐式 any 或关闭严格模式。

### 2.3 后端核心运行依赖

| 包 | 实际版本 | 当前用途 |
|---|---:|---|
| `@nestjs/axios` | `4.0.1` | AI provider 通过 OpenAI-compatible HTTP 接口调用模型 |
| `@nestjs/config` | `3.3.0` | 环境变量配置、`ConfigService` |
| `@nestjs/jwt` | `10.2.0` | JWT 登录态 |
| `@nestjs/passport` | `10.0.3` | Passport 认证集成 |
| `@nestjs/schedule` | `4.1.2` | Cron 定时任务 |
| `@nestjs/typeorm` | `10.0.2` | Nest 与 TypeORM 集成 |
| `ajv` | `8.20.0` | JSON schema/配置校验相关能力 |
| `axios` | `1.16.0` | HTTP 请求能力，主要由 Nest Axios 模块承载 |
| `bcrypt` | `5.1.1` | 密码哈希相关能力 |
| `bcryptjs` | `3.0.3` | 兼容/历史密码哈希相关能力 |
| `class-transformer` | `0.5.1` | DTO 转换 |
| `class-validator` | `0.14.4` | DTO 校验 |
| `exceljs` | `4.4.0` | Excel 导入解析、错误 Excel、导出模板生成 |
| `multer` | `2.1.1` | 上传文件处理 |
| `passport` | `0.7.0` | 认证基础库 |
| `passport-jwt` | `4.0.1` | JWT strategy |
| `pg` | `8.20.0` | PostgreSQL 驱动 |
| `typeorm` | `0.3.29` | ORM、实体、迁移、Repository |

### 2.4 后端开发与测试依赖

| 包 | 实际版本 | 当前用途 |
|---|---:|---|
| `@nestjs/cli` | `10.4.9` | Nest 构建 CLI |
| `@nestjs/schematics` | `10.2.3` | Nest 脚手架能力 |
| `@nestjs/testing` | `10.4.22` | 单元测试/模块测试 |
| `@types/bcrypt` | `5.0.2` | bcrypt 类型 |
| `@types/express` | `4.17.25` | Express 类型 |
| `@types/jest` | `29.5.14` | Jest 类型 |
| `@types/multer` | `2.1.0` | Multer 类型 |
| `@types/node` | `20.19.40` | Node 类型 |
| `@types/passport-jwt` | `4.0.1` | Passport JWT 类型 |
| `@types/supertest` | `6.0.3` | Supertest 类型 |
| `@typescript-eslint/eslint-plugin` | `8.59.4` | 后端 ESLint TypeScript 规则 |
| `@typescript-eslint/parser` | `8.59.4` | 后端 ESLint TS parser |
| `eslint` | `8.57.1` | 后端 lint |
| `eslint-config-prettier` | `9.1.2` | ESLint/Prettier 冲突关闭 |
| `eslint-plugin-prettier` | `5.5.5` | Prettier 作为 ESLint 规则 |
| `jest` | `29.7.0` | 后端测试框架 |
| `prettier` | `3.8.3` | 格式化 |
| `supertest` | `7.2.2` | HTTP 接口测试 |
| `ts-jest` | `29.4.9` | Jest TS 转译 |
| `ts-node` | `10.9.2` | seed、迁移、脚本执行 |
| `tsc-alias` | `1.8.17` | 编译后路径别名修正 |
| `tsconfig-paths` | `4.2.0` | ts-node 路径别名支持 |

### 2.5 后端数据库与 ORM

| 技术 | 实际版本/配置 | 依据 |
|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `docker-compose.yml` |
| TypeORM | `0.3.29` | `backend/package-lock.json` |
| PostgreSQL 驱动 | `pg 8.20.0` | `backend/package-lock.json` |
| synchronize | `false` | `backend/src/app.module.ts` |
| 默认 schema | `public` | `configuration.ts` / `.env.example` |
| 默认 DB 名 | `ticket_system` | `.env.example` / `docker-compose.yml` |

后端 `AppModule` 当前注册的 TypeORM 实体：

- `ActionConfig`
- `Branch`
- `Customer`
- `CustomerAssignee`
- `Department`
- `DispatchRule`
- `DispatchedOrder`
- `ExceptionModuleHandler`
- `DispatchedOrderReturnRecord`
- `ExportTemplate`
- `FieldConfig`
- `FieldPermission`
- `FieldSupplementLog`
- `FieldSupplementRule`
- `ImportJob`
- `ModuleField`
- `ModuleHandler`
- `ModuleSupervisor`
- `Notification`
- `OperationLog`
- `OrderAttachment`
- `OrderStage`
- `Role`
- `SystemSetting`
- `User`
- `UserRole`
- `WorkOrder`
- `WorkOrderFieldDirtyMark`
- `WorkOrderModuleConfig`
- `WorkflowDefinition`

**规范：** 数据库结构细节以 `BACKEND_STRUCTURE.md` 为准；本文只锁定数据库与 ORM 技术栈。

### 2.6 后端文件上传、导入导出与附件

| 能力 | 技术 | 实际版本 | 当前依据 |
|---|---|---:|---|
| Multipart 上传 | `multer` | `2.1.1` | `backend/src/modules/attachments`、`imports`、`uploads` 使用 |
| Excel 解析/生成 | `exceljs` | `4.4.0` | `excel-parser.service.ts`、`error-excel.service.ts`、`export-templates.service.ts` |
| 上传目录 | 文件系统目录 | 默认 `uploads` / Docker `/app/uploads` | `configuration.ts`、`docker-compose.yml` |
| 导入大小 | 环境变量 | 默认 `MAX_IMPORT_SIZE_MB=10` | `.env.example` |
| 附件大小 | 环境变量 | 默认 `MAX_ATTACHMENT_SIZE_MB=20` | `.env.example` |

### 2.7 后端 AI 能力

当前后端 AI 模块采用 **OpenAI-compatible Chat Completions HTTP 协议**，不是 OpenAI 官方 SDK。

| Provider | 后端类 | 默认 base URL | 默认模型 | 说明 |
|---|---|---|---|---|
| `openai` | `OpenAiProvider` | `https://api.openai.com/v1` | `gpt-4o-mini` | 默认 provider |
| `qwen` | `QwenProvider` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 阿里 DashScope OpenAI 兼容模式 |
| `deepseek` | `DeepSeekProvider` | `https://api.deepseek.com` | `deepseek-v4-flash` | DeepSeek OpenAI 兼容模式 |

AI 调用特征：

- 请求路径：`${baseUrl}/chat/completions`
- 鉴权头：`Authorization: Bearer <apiKey>`
- 响应格式：`response_format: { type: 'json_object' }`
- 温度：`temperature: 0`
- 超时：`30000ms`
- 配置优先级：数据库中的 AI settings（若存在且含 apiKey）优先，否则读取环境变量。

**明确未使用：** 当前后端未使用 `openai` npm SDK，也未使用 Anthropic Claude SDK。

### 2.8 后端通知与定时任务

| 能力 | 技术 | 位置 |
|---|---|---|
| 服务端事件流 | Nest `@Sse` + RxJS `Observable` | `backend/src/modules/notifications/notification-stream.controller.ts` |
| 通知流路径 | `/events/notifications` 与 `/notifications/stream`，受全局 `/api` 前缀影响实际为 `/api/events/notifications`、`/api/notifications/stream` | `NotificationStreamController` |
| 心跳 | `interval(1000)`，事件类型 `ping` | `NotificationStreamController` |
| 通知事件 | 事件类型 `notification` | `NotificationEventBus` |
| SLA 定时通知 | `@Cron` | `dispatched-orders/sla-notification.service.ts` |
| 操作日志清理 | `@Cron` | `operation-logs/operation-log-cleanup.service.ts` |

---

## 3. 前端技术栈

### 3.1 前端总体框架

| 技术 | 实际版本 | 依据 | 当前用途 |
|---|---:|---|---|
| React | `18.3.1` | `frontend/package-lock.json` | SPA UI 框架 |
| React DOM | `18.3.1` | `frontend/package-lock.json` | 浏览器渲染 |
| TypeScript | `5.9.3` | `frontend/package-lock.json` | 前端源码语言 |
| Vite | `5.4.21` | `frontend/package-lock.json` | 开发服务器与构建工具 |
| `@vitejs/plugin-react` | `4.7.0` | `frontend/package-lock.json` | React Fast Refresh / JSX 编译 |
| React Router DOM | `6.30.3` | `frontend/package-lock.json` | 前端路由 |

前端入口：

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/routes/index.tsx`

前端根组件固定结构：

- `React.StrictMode`
- `ErrorBoundary`
- Ant Design `ConfigProvider`，语言为 `zh_CN`
- Ant Design Pro `ProConfigProvider`，语言为 `zhCNIntl`
- Ant Design `App`
- `BrowserRouter`
- `AppRoutes`

### 3.2 前端 UI 与组件库

| 包 | 实际版本 | 当前用途 |
|---|---:|---|
| `antd` | `5.29.3` | 主 UI 组件库 |
| `@ant-design/icons` | `5.6.1` | 图标 |
| `@ant-design/pro-components` | `2.8.10` | ProTable、ProForm、配置化表格/表单能力 |
| `dayjs` | `1.11.20` | 日期时间处理 |
| `reactflow` | `11.11.4` | 工作流编辑器节点/连线图 |
| `react-window` | `2.2.7` | 虚拟滚动能力，注意类型版本不一致 |
| `@types/react-window` | `1.8.8` | react-window 类型，但对应 v1 类型体系 |

**明确未使用：** 当前 `package.json` 未声明 `shadcn/ui`、Radix UI、Tailwind CSS。后续不要按 shadcn/Tailwind 项目范式生成组件，除非先引入并更新本文。

### 3.3 前端状态、请求与数据处理

| 包 | 实际版本 | 当前用途 |
|---|---:|---|
| `axios` | `1.16.0` | HTTP 请求封装，`frontend/src/services/request.ts` |
| `zustand` | `4.5.7` | 前端轻量状态管理，`frontend/src/stores` |
| `xlsx` | `0.18.5` | 前端 Excel 相关处理 |
| `msw` | `2.7.0` | 开发/测试 mock，`VITE_USE_MSW=true` 时启用 |

前端请求规范：

- 默认 baseURL：`/api`
- 若设置 `VITE_API_BASE_URL`，则 baseURL 为 `${VITE_API_BASE_URL}/api`
- 请求超时：`30000ms`
- 请求拦截器自动读取 `localStorage.token` 写入 `Authorization: Bearer <token>`
- 分页参数自动修正：`current` 可映射为 `page`，`pageSize/limit/perPage` 最大限制为 `100`
- 401 响应会清理本地 token 并跳转 `/login`

### 3.4 前端编译配置

| 配置项 | 当前值 | 依据 |
|---|---|---|
| module | `ESNext` | `frontend/tsconfig.json` |
| target | `ES2020` | `frontend/tsconfig.json` |
| moduleResolution | `bundler` | `frontend/tsconfig.json` |
| jsx | `react-jsx` | `frontend/tsconfig.json` |
| strict | `true` | `frontend/tsconfig.json` |
| path alias | `@/*` -> `src/*` | `frontend/tsconfig.json`、`vite.config.ts` |
| 样式预处理 | Less | `vite.config.ts`、`less 4.6.4` |
| Less JS | `javascriptEnabled: true` | `vite.config.ts` |

### 3.5 前端 Vite 开发服务器

| 配置 | 当前值 | 依据 |
|---|---|---|
| host | `0.0.0.0` | `frontend/vite.config.ts` |
| port | `5173` | `frontend/vite.config.ts` |
| API proxy target | `http://127.0.0.1:3000` | `frontend/vite.config.ts` |
| proxy `/api` | 启用 | `frontend/vite.config.ts` |
| proxy `/uploads` | 启用 | `frontend/vite.config.ts` |
| proxy `/events` | 启用，`ws: true` | `frontend/vite.config.ts` |
| manualChunks | `react-vendor`、`antd-vendor`、`data-vendor` | `frontend/vite.config.ts` |
| chunkSizeWarningLimit | `2500` | `frontend/vite.config.ts` |

### 3.6 前端测试与质量工具

| 包 | 实际版本 | 当前用途 |
|---|---:|---|
| `vitest` | `4.1.5` | 单元测试 |
| `@vitest/coverage-v8` | `4.1.5` | 覆盖率 |
| `jsdom` | `29.1.1` | DOM 测试环境 |
| `@testing-library/react` | `16.3.2` | React 测试 |
| `@testing-library/jest-dom` | `6.9.1` | DOM matcher |
| `@testing-library/user-event` | `14.6.1` | 用户交互模拟 |
| `@playwright/test` | `1.59.1` | E2E 测试 |
| `eslint-plugin-jsx-a11y` | `6.10.2` | JSX 可访问性 lint 规则 |
| `@typescript-eslint/parser` | `8.59.3` | ESLint TS parser |
| `eslint` | `9.39.4` | 前端锁文件中实际解析版本；注意未在 `frontend/package.json` 直接声明 |
| `@eslint/js` | `9.39.4` | 前端 ESLint 传递/执行依赖 |

**注意：** 前端 `package.json` 的 `lint` 脚本调用 `eslint`，但 `devDependencies` 未直接声明 `eslint`。当前 `frontend/package-lock.json` 中存在 `eslint 9.39.4`，这是一个需要后续治理的依赖声明不完整点。

---

## 4. 构建、运行与脚本

### 4.1 后端脚本

| 脚本 | 命令 | 用途 |
|---|---|---|
| `build` | `nest build && tsc-alias` | 编译后端并修复路径别名 |
| `start` | `node dist/main.js` | 运行编译产物 |
| `start:dev` | `nest start --watch` | 开发热重载 |
| `start:prod` | `node dist/main.js` | 生产运行 |
| `test` | `jest --config ./test/jest-unit.json --runInBand` | 后端单元测试 |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | 后端 E2E 测试 |
| `lint` | `eslint "{src,test}/**/*.ts" --fix` | 后端 lint 且自动修复 |
| `format` | `prettier --write "src/**/*.ts"` | 后端格式化 |
| `typeorm` | `node -r ts-node/register -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d src/database/data-source.ts` | TypeORM CLI |
| `migration:generate` | `npm run typeorm -- migration:generate src/database/migrations/InitSchema` | 生成迁移 |
| `migration:create` | `npm run typeorm -- migration:create src/database/migrations/ManualMigration` | 创建迁移 |
| `migration:run` | `npm run typeorm -- migration:run` | 执行迁移 |
| `migration:revert` | `npm run typeorm -- migration:revert` | 回滚迁移 |
| `seed` | `ts-node -r tsconfig-paths/register src/database/seeds/index.ts` | 初始化种子数据 |
| `db:clean-orders` | `ts-node -r tsconfig-paths/register scripts/clean-orders.ts` | 清理工单数据脚本 |
| `ai-eval` | `ts-node ../tests/ai-mapping-eval/run-eval.ts` | AI 映射评估 |

### 4.2 前端脚本

| 脚本 | 命令 | 用途 |
|---|---|---|
| `dev` | `vite` | 本地开发服务器 |
| `build` | `tsc -b && vite build` | 类型检查并构建 |
| `preview` | `vite preview` | 预览构建产物 |
| `test` | `vitest run` | 单次单元测试 |
| `test:watch` | `vitest` | watch 测试 |
| `coverage` | `vitest run --coverage` | 覆盖率测试 |
| `e2e` | `playwright test` | E2E 测试 |
| `e2e:headed` | `playwright test --headed` | 有界面 E2E |
| `lint` | `eslint src --ext .ts,.tsx --max-warnings 10` | 前端 lint |
| `smoke:live` | `node scripts/smoke-live.mjs` | 现场 smoke 脚本 |
| `verify:phase56` | `node scripts/verify-phase5-6.mjs` | 阶段 5/6 验证脚本 |

### 4.3 根目录脚本/依赖

根目录 `package.json` 仅声明：

| 包 | 实际版本 | 用途 |
|---|---:|---|
| `xlsx` | `0.18.5` | 根目录历史辅助脚本 `read_excel.js` 读取 Excel |

根目录不是前后端统一依赖管理入口。不要在根目录安装业务运行依赖；后端依赖放 `backend/package.json`，前端依赖放 `frontend/package.json`。

---

## 5. 部署与基础设施

### 5.1 Docker Compose 服务拓扑

| 服务 | 镜像/构建 | 端口/暴露 | 用途 |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `${POSTGRES_PORT:-5432}:5432` | PostgreSQL 数据库 |
| `backend` | build `./backend/Dockerfile` | expose `3000` | NestJS API 服务 |
| `frontend` | build `./frontend/Dockerfile` | expose `80` | 构建后的前端静态站点，由容器内 Nginx 提供 |
| `nginx` | `nginx:1.27-alpine` | `${HTTP_PORT:-8080}:80` | 总入口反向代理、静态资源/上传文件代理 |

### 5.2 Dockerfile 规范

后端 Dockerfile：

- 构建阶段与运行阶段均使用 `node:20-alpine`
- 安装依赖使用 `npm ci`
- 构建命令为 `npm run build`
- 运行命令为 `./docker-entrypoint.sh`
- 容器内端口为 `3000`

前端 Dockerfile：

- builder 阶段使用 `node:20-alpine`
- 安装依赖使用 `npm ci`
- 构建命令为 `npm run build`
- runtime 阶段使用 `nginx:alpine`
- 静态产物目录为 `/usr/share/nginx/html`
- 容器内端口为 `80`

### 5.3 关键环境变量

| 变量 | 默认值/说明 | 使用方 |
|---|---|---|
| `NODE_ENV` | `development` 或 `production` | 后端/Compose |
| `PORT` | 后端默认 `3000` | 后端 |
| `HOST` | 后端默认 `0.0.0.0` | 后端启动 |
| `HTTP_PORT` | Compose 默认 `8080` | 根 Nginx 对外端口 |
| `POSTGRES_DB` | `ticket_system` | Compose PostgreSQL |
| `POSTGRES_USER` | `postgres` | Compose PostgreSQL |
| `POSTGRES_PASSWORD` | `postgres` | Compose PostgreSQL |
| `DB_HOST` | 本地默认 `127.0.0.1`，Compose 为 `postgres` | 后端 TypeORM |
| `DB_PORT` | `5432` | 后端 TypeORM |
| `DB_USERNAME` | `postgres` | 后端 TypeORM |
| `DB_PASSWORD` | `postgres` | 后端 TypeORM |
| `DB_DATABASE` | `ticket_system` | 后端 TypeORM |
| `DB_SCHEMA` | `public` | 后端 TypeORM |
| `DB_LOGGING` | `false` | 后端 TypeORM |
| `JWT_SECRET` | 必须在生产替换 | 后端认证 |
| `JWT_REFRESH_SECRET` | 必须在生产替换 | 后端认证 |
| `JWT_EXPIRES_IN` | 后端默认 `2h`，Compose 示例 `7d` | 后端认证 |
| `JWT_REFRESH_EXPIRES_IN` | 后端默认 `7d`，Compose 示例 `30d` | 后端认证 |
| `AI_PROVIDER` | `openai` | 后端 AI |
| `AI_API_KEY` | 空 | 后端 AI |
| `AI_BASE_URL` | 依 provider 决定 | 后端 AI |
| `AI_MODEL` | 依 provider 决定 | 后端 AI |
| `OPENAI_API_KEY` | 兼容变量 | 后端 AI |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 后端 AI |
| `OPENAI_MODEL` | `gpt-4o-mini` | 后端 AI |
| `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` | Qwen 兼容变量 | 后端 AI |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek 兼容变量 | 后端 AI |
| `UPLOAD_DIR` | 本地 `uploads`，Docker `/app/uploads` | 后端上传 |
| `MAX_IMPORT_SIZE_MB` | `10` | Excel 导入 |
| `MAX_ATTACHMENT_SIZE_MB` | `20` | 附件上传 |
| `BCRYPT_ROUNDS` / `BCRYPT_SALT_ROUNDS` | `10` | 密码哈希 |
| `OPERATION_LOG_RETENTION_DAYS` | `365` | 操作日志清理 |
| `VITE_API_BASE_URL` | 未设置时前端使用相对 `/api` | 前端请求 |
| `VITE_USE_MSW` | `true` 时开发环境启用 MSW | 前端 mock |

---

## 6. 已知版本异常与风险点

### 6.1 TypeScript 声明范围与锁定版本不一致

后端和前端 `package.json` 都声明 `typescript: ^5.5.4`，但锁文件实际解析为：

- 后端：`typescript 5.9.3`
- 前端：`typescript 5.9.3`

**规范：** 查 TypeScript 文档时按 5.9.x 行为判断；如要锁死小版本，应把 `package.json` 范围改为精确版本并重新生成 lock。

### 6.2 后端 bcrypt 与 bcryptjs 并存

后端同时安装：

- `bcrypt 5.1.1`
- `bcryptjs 3.0.3`

**规范：** 修改密码哈希逻辑前必须先确认当前业务实际 import 的库，避免同一密码在不同实现间出现兼容风险。

### 6.3 前端 react-window 运行时与类型版本不一致

前端安装：

- `react-window 2.2.7`
- `@types/react-window 1.8.8`

**风险：** `@types/react-window` 对应 v1 类型体系，可能与 v2 API 不完全一致。

**规范：** 编写虚拟滚动相关代码时先核对当前 `react-window 2.2.7` 的真实导出，不要完全依赖 v1 类型示例。

### 6.4 前端 ESLint 未直接声明

前端 `package.json` 的 `lint` 脚本直接调用 `eslint`，但 `devDependencies` 未直接声明 `eslint`。锁文件中实际存在：

- `eslint 9.39.4`
- `@eslint/js 9.39.4`

**风险：** 后续依赖树变化可能导致 lint 命令不可用或版本漂移。

**建议：** 后续治理时将 `eslint` 作为前端直接 devDependency 精确声明，并同步 lock。

### 6.5 根目录仅为辅助依赖，不是业务包

根目录 `package.json` 只有 `xlsx ^0.18.5`，对应锁文件实际版本 `0.18.5`，主要服务于 `read_excel.js` 这类历史辅助脚本。

**规范：** 不要把根目录当作统一 workspace 根包，也不要把业务依赖加到根目录。

### 6.6 前端源码存在历史编码乱码注释

在 `frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/src/services/request.ts` 等文件可见部分中文注释/字符串出现 mojibake 乱码。本文只记录技术栈，不处理编码修复。

**建议：** 后续应单独建立编码修复任务，统一按 UTF-8 无 BOM 修复，不要混入技术栈文档任务。

---

## 7. 技术选型边界声明

### 7.1 后端允许的默认范式

- 使用 NestJS 10 模块化结构。
- 使用 TypeORM 0.3 Repository/DataSource 范式。
- DTO 使用 `class-validator 0.14.4` + `class-transformer 0.5.1`。
- 后端接口默认返回全局 `ResponseInterceptor` 包装后的结构。
- 后端接口路径默认受全局 `/api` 前缀影响。
- 文件上传使用 Multer 2，不按 Multer 1 的过时类型或示例写代码。
- Excel 处理优先使用 ExcelJS 4.4.0；根目录 `xlsx` 仅视为辅助脚本依赖。
- AI 调用使用 OpenAI-compatible HTTP 协议，不使用 OpenAI SDK 或 Anthropic SDK。

### 7.2 前端允许的默认范式

- 使用 React 18 函数组件与 hooks。
- 路由使用 `react-router-dom 6.30.3`，不要使用 v5 的 `Switch`、`Redirect` 等 API。
- UI 使用 Ant Design 5.29.3 与 Ant Design Pro Components 2.8.10。
- 样式使用 Less 与现有 `global.less` 体系。
- 请求使用现有 `frontend/src/services/request.ts` 的 Axios 实例。
- 状态管理使用 Zustand 4.5.7，不默认引入 Redux/MobX。
- 构建使用 Vite 5.4.21，不按 Create React App/Webpack 默认项目处理。

### 7.3 明确未纳入当前技术栈的内容

以下内容当前没有在项目依赖与源码中形成实际技术栈，禁止 AI 擅自按这些范式生成代码：

- Next.js
- Nuxt
- Vue
- Angular
- Tailwind CSS
- shadcn/ui
- Radix UI
- Redux Toolkit
- Prisma
- Sequelize
- MongoDB
- MySQL
- OpenAI 官方 npm SDK
- Anthropic Claude SDK
- pnpm/yarn workspace
- Serverless/FaaS 部署

---

## 8. 文档维护规则

1. 新增或升级任何运行时依赖，必须同步更新本文对应表格。
2. 修改 Docker 基础镜像、数据库镜像、Node 主版本，必须同步更新本文。
3. 修改构建工具、测试工具、lint 工具，必须同步更新本文。
4. 修改 AI provider 协议或默认模型，必须同步更新本文。
5. 如果 `package.json` 与 `package-lock.json` 显示版本不同，以 lock 文件为准，并在异常章节说明。
6. 本文是技术栈版本规范，不替代：
   - `BACKEND_STRUCTURE.md`：数据库结构与 API 合约
   - `APP_FLOW.md`：页面与用户流程
   - `FRONTEND_GUIDELINES.md`：视觉和组件规范
   - `CLAUDE.md`：AI 操作最高规则
   - `progress.txt`：项目记忆与进度
   - `IMPLEMENTATION_PLAN.md`：后续原子化实施计划
