# TECH_STACK.md — 技术栈规范（锁定版）

> 本文件是工单系统的**技术栈最高事实来源（Source of Truth）**。
> 所有“实际版本”列均**以锁文件 `package-lock.json` 解析出的确切版本为准**，而非 `package.json` 里的 `^` 浮动范围。
> AI 与开发者查阅依赖 API / 用法时，**必须**对照本文件锁定的确切版本所对应的官方文档，禁止凭记忆套用其他大版本的 API。
>
> 盘点依据：`backend/package.json`、`backend/package-lock.json`、`frontend/package.json`、`frontend/package-lock.json`、`docker-compose.yml`、`backend/Dockerfile`、`frontend/Dockerfile`、`backend/tsconfig.json`、`frontend/tsconfig.json`、`frontend/vite.config.ts`、`backend/nest-cli.json`，并交叉核对源码 `import` 实际引用。
> 最后核对日期：2026-05-29。

---

## 0. 架构速览

前后端分离 + Docker 编排的单仓项目（**非 npm workspace**，前后端各自独立 `npm install`）：

- **后端** `backend/`：NestJS 10 + TypeORM 0.3 + PostgreSQL 16，REST API（全局前缀 `/api`），含 SSE 通知流与 Cron 定时任务。
- **前端** `frontend/`：React 18 + Vite 5 + Ant Design 5 + Ant Design Pro Components，状态用 Zustand。
- **部署**：`docker-compose.yml` 编排 `postgres` / `backend` / `frontend` / `nginx` 四个服务。
- **仓库根 `package.json`** 仅含一个 `xlsx` 依赖（历史遗留，见 §6），不是 workspace 根。

---

## 1. 运行时与语言（两端共用）

| 项目 | 锁定版本 | 依据 |
|------|----------|------|
| Node.js（运行时） | **20.x（alpine）** | `backend/Dockerfile` 与 `frontend/Dockerfile` 均 `FROM node:20-alpine`；后端 `@types/node ^20.14.12` |
| TypeScript | **5.9.3**（两端一致） | 两端锁文件均解析 `typescript@5.9.3`（package.json 声明 `^5.5.4`，实际已升至 5.9.3） |
| 包管理器 | **npm（lockfileVersion 3）** | 两端用 `package-lock.json` v3；Dockerfile `npm ci`。未使用 pnpm / yarn |
| 数据库 | **PostgreSQL 16-alpine** | `docker-compose.yml` `image: postgres:16-alpine` |
| 反向代理 | **nginx 1.27-alpine** | `docker-compose.yml` `image: nginx:1.27-alpine` |
| 时区 | **Asia/Shanghai** | docker-compose 中 postgres 与 backend 容器 `TZ` |

> ⚠️ 编译目标两端不同：后端 `target ES2021` / `module commonjs`；前端 `target ES2020` / `module ESNext` / `moduleResolution bundler`。改 tsconfig 前先确认是哪一端。

---

## 2. 后端技术栈（`backend/`）

名称 `ticket-system-backend`，version `0.1.0`，`private: true`。
“声明范围”列为 `package.json` 中的 semver 范围；“实际版本”列为 `package-lock.json` 解析结果。

### 2.1 NestJS 核心

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `@nestjs/common` | `^10.4.2` | **10.4.22** | 装饰器、Pipe、Filter、Interceptor 等核心 |
| `@nestjs/core` | `^10.4.2` | **10.4.22** | 运行时内核 |
| `@nestjs/platform-express` | `^10.4.2` | **10.4.22** | HTTP 平台适配（Express） |
| `@nestjs/config` | `^3.2.3` | **3.3.0** | 环境变量 / 配置管理（`ConfigService`） |
| `@nestjs/schedule` | `^4.1.2` | **4.1.2** | Cron 定时任务（日志清理、SLA 通知） |
| `@nestjs/axios` | `^4.0.1` | **4.0.1** | `HttpModule` / `HttpService`（AI 调用） |

### 2.2 数据库 & ORM

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `typeorm` | `^0.3.20` | **0.3.29** | ORM（实体、迁移、QueryBuilder） |
| `@nestjs/typeorm` | `^10.0.2` | **10.0.2** | NestJS ↔ TypeORM 桥接 |
| `pg` | `^8.12.0` | **8.20.0** | PostgreSQL 原生驱动 |

### 2.3 认证与鉴权

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `@nestjs/jwt` | `^10.2.0` | **10.2.0** | JWT 签发 / 校验 |
| `@nestjs/passport` | `^10.0.3` | **10.0.3** | Passport 桥接 |
| `passport` | `^0.7.0` | **0.7.0** | 认证框架 |
| `passport-jwt` | `^4.0.1` | **4.0.1** | JWT 策略 |
| `bcrypt` | `^5.1.1` | **5.1.1** | 密码哈希（原生 C++ 实现） |
| `bcryptjs` | `^3.0.3` | **3.0.3** | 纯 JS 哈希（共存，无原生编译环境时可用） |

> ⚠️ `bcrypt` 与 `bcryptjs` 同时存在于依赖中，二者哈希格式兼容但**实现不同**。新增哈希逻辑前先确认调用方实际 `import` 的是哪一个，避免混用导致校验歧义。

### 2.4 校验 / 序列化 / 文件

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `class-validator` | `^0.14.1` | **0.14.4** | DTO 声明式校验（配合全局 `ValidationPipe`） |
| `class-transformer` | `^0.5.1` | **0.5.1** | DTO 转换（`@Type`、`transform`） |
| `ajv` | `^8.20.0` | **8.20.0** | JSON Schema 校验（导入字段校验） |
| `multer` | `^2.1.1` | **2.1.1** | multipart 文件上传解析 |
| `exceljs` | `^4.4.0` | **4.4.0** | Excel 读写 / 导出模板 |

> ✅ 修正历史误记：`multer` 实际为 **2.1.1**（非 1.4.x）。

### 2.5 HTTP / 响应式 / 元数据

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `axios` | `^1.16.0` | **1.16.0** | HTTP 客户端（AI provider 请求底座） |
| `rxjs` | `^7.8.1` | **7.8.2** | Observable（NestJS 基础、SSE 通知流） |
| `reflect-metadata` | `^0.2.2` | **0.2.2** | 装饰器元数据反射 |

### 2.6 AI Provider（实测接入）

`backend/src/modules/ai/` 通过 `HttpModule`（`@nestjs/axios`）以 OpenAI 兼容协议接入三个 LLM provider：

| Provider | 文件 | 默认 baseUrl | 默认 model |
|----------|------|--------------|------------|
| OpenAI | `providers/openai.provider.ts` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Qwen（通义千问） | `providers/qwen.provider.ts` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| DeepSeek | `providers/deepseek.provider.ts` | `https://api.deepseek.com` | `deepseek-v4-flash` |

- provider 选择由 `AI_PROVIDER` 环境变量驱动（默认 `openai`），解析逻辑见 `backend/src/config/configuration.ts`。
- DeepSeek 默认模型锁定为 `deepseek-v4-flash`（避免 v4-pro 折扣窗口涨价风险）。
- **当前未接入 Anthropic provider**，如需新增须独立立项。

### 2.7 后端开发依赖（dev）

| 依赖 | 声明范围 | 实际版本 | 用途 |
|------|----------|----------|------|
| `typescript` | `^5.5.4` | **5.9.3** | 语言 |
| `@nestjs/cli` | `^10.4.5` | 10.x | `nest build` / `nest start` 脚手架 |
| `@nestjs/schematics` | `^10.1.4` | 10.x | 代码生成 schematics |
| `@nestjs/testing` | `^10.4.2` | 10.x | NestJS 测试模块 |
| `jest` | `^29.7.0` | **29.7.0** | 单元 / e2e 测试运行器 |
| `ts-jest` | `^29.2.5` | **29.4.9** | Jest + TS 转译 |
| `ts-node` | `^10.9.2` | **10.9.2** | 运行 ts 脚本（seed、typeorm cli） |
| `tsc-alias` | `^1.8.10` | 1.x | 构建后路径别名替换（配合 `nest build`） |
| `tsconfig-paths` | `^4.2.0` | 4.x | 运行时路径别名解析 |
| `eslint` | `^8.57.0` | 8.x | Lint |
| `prettier` | `^3.3.3` | 3.x | 格式化 |
| `supertest` | `^7.0.0` | 7.x | HTTP 集成测试 |

> 路径别名：后端 tsconfig `paths` 为 `src/*`（构建期由 `tsc-alias` 落地，运行期由 `tsconfig-paths` 解析）。

<!-- PLACEHOLDER_APPEND -->

