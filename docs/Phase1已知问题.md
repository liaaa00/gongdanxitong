# Phase 1 已知问题

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

> 记录测试过程中发现的问题。测试工程师不直接修改后端/前端业务实现代码，问题交由对应工程师修复。

| ID | 严重级别 | 模块 | 问题 | 复现步骤 | 期望 | 当前状态 |
|---|---|---|---|---|---|---|
| P1-KNOWN-001 | P0 | 后端编译 | `backend/src/modules/auth/auth.service.ts` 存在中文乱码导致的未闭合字符串，第 106、134 行形如 `throw new UnauthorizedException('鐢ㄦ埛涓嶅瓨鍦?);`，会导致 TypeScript 编译失败 | 查看 `backend/src/modules/auth/auth.service.ts` 第 105-134 行 | 字符串应合法闭合，错误消息使用 UTF-8 中文或英文 | 待 backend 修复后复测 |
| P1-KNOWN-002 | P0 | 后端编译/Seed | `npm.cmd run build` 失败，当前主要报错集中在 `backend/src/database/seeds/seed-field-permissions.ts`：`ReturnType<DataSource['getRepository']<FieldPermission>>` 写法导致 TS 语法/类型错误，并派生 53 个编译错误 | 在 backend 目录执行 `npm.cmd run build` | 后端编译通过，seed 文件全量类型、禁 any，`npm run seed` 可重跑并写入 11 角色、5 部门、54 字段、4 派发规则、字段权限矩阵、admin/admin123 | 待 backend 修复后复测 | (legacy admin123 record; current admin123 returns 401 and must not be used for demos)
| P1-KNOWN-003 | P0 | 后端健康检查 | `docker-compose.yml` 的 backend healthcheck 使用 `/api/health`，但当前未发现 HealthController/health 路由实现 | 执行 `rg "Health|health" backend/src` 未发现控制器实现 | 后端提供公开 `/api/health` 路由，供 Docker 和冒烟测试使用 | 待 backend 修复后复测 |
| P1-KNOWN-004 | P1 | 统一响应 | `ResponseInterceptor` 和 `HttpExceptionFilter` 当前未返回 `traceId`，与 docs/API规范.md 和架构广播要求 `{code,data,message,traceId}` 不一致 | 执行 `rg "traceId" backend/src/common` 无结果；查看 `response.interceptor.ts` | 所有成功/错误响应都包含 `traceId` | 待 backend 修复后复测 |
| P1-KNOWN-005 | P1 | 后端 E2E 执行 | 当前 `backend/node_modules` 已存在，但后端 build 失败，因此未继续执行 `npm run test:e2e`，避免数据库/服务启动噪音掩盖编译问题 | 在 backend 目录执行 `npm.cmd run build` 返回 53 个错误 | 先修复 build，再执行 `npm run test:e2e` | 待 backend 修复后复测 |
| P1-KNOWN-006 | P1 | 本机 Docker 环境 | 当前测试会话内无法找到 `docker` 命令，不能执行 `docker compose config` 和完整冒烟启动 | 执行 `docker compose config` 返回 docker command not found | 部署/验收环境安装 Docker Desktop 后执行 `tests/smoke-test.ps1` | 待部署环境复测 |
| P1-KNOWN-007 | P1 | Docker Desktop 安装 | Docker Desktop 安装在当前会话为**硬限制**：① `winget install --id Docker.DockerDesktop -e` 下载完成后安装阶段因管理员/UAC 失败，exit code `4294967295`；② `--scope machine` 重试仍返回 `4294967295`；③ 官方安装包 `Start-Process ... -Verb RunAs -Wait` 命令返回 0 但未安装，`C:\\Program Files\\Docker` 不存在，`winget list` 无记录，`docker` 命令不可用 | 在本机以当前会话执行 Docker Desktop 安装与静默安装 | 安装应成功并可立即使用 `docker compose` | 硬限制；已切换到 Windows 免安装 PostgreSQL 16 备用路径 |
| P1-KNOWN-008 | P1 | Windows 原生 PostgreSQL 安装 | winget 与 EDB installer 均未完成系统级安装；项目中文路径下 initdb 报 UTF8 0xb9；最终采用免安装包解压到 `D:\\pgsql16portable` 成功启动 PostgreSQL 16.13 | 执行 `tests/setup-windows-native.ps1` 或手动解压 EDB binaries zip 到纯英文路径 | 本地 PostgreSQL 16 可用并监听 127.0.0.1:5432 | 已绕过；后续使用 `D:\\pgsql16portable` |
| P1-KNOWN-009 | P0 | 后端本地启动 | Windows 原生 DB 下 migration/seed 成功，但 `npm run start:dev` 启动失败：`AuditInterceptor` 缺 `OperationLogRepository` 注入，CustomersModule context 无法解析 | 后端目录执行 `npm.cmd run start:dev` | 后端监听 3000，`/api/health` 返回 200 | 待 backend 修复，详见 P2-BE-REWORK-008 |

## 复测记录

| 时间 | 执行人 | 范围 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-05-11 | 测试工程师 | 测试文档与脚本静态检查 | 通过 | 已完成测试策略、测试用例、验收清单、seed 验证脚本、Docker 冒烟脚本、Auth E2E 脚本 |
| 2026-05-11 | 测试工程师 | 前端构建 | 通过 | `npm.cmd run build` 在 frontend 目录执行成功，仅有 chunk size warning |
| 2026-05-11 | 测试工程师 | 后端骨架只读检查 | 阻塞自动化执行 | 发现 AuthService 编译错误、seed 不完整、health 路由缺失、traceId 缺失 |
| 2026-05-11 | 测试工程师 | 架构广播后测试资产复核 | 通过 | 已补充 traceId、docker compose config、field_permissions scenario、JSONB 等检查项 |
| 2026-05-11 | 测试工程师 | Docker compose config | 未执行 | 当前环境无 docker 命令，已记录 P1-KNOWN-006 |
| 2026-05-11 | 测试工程师 | 后端构建 | 失败 | `npm.cmd run build` 失败，seed-field-permissions.ts 类型写法导致 53 个错误，已记录 P1-KNOWN-002 |
| 2026-05-11 | 测试工程师 | Phase 1 复测准备 | 待执行 | 已创建 `docs/Phase1验收报告.md` 模板；待收到后端完成通知后执行 build/migration/seed/e2e/smoke 全量复测 |
| 2026-05-11 | 测试工程师 | Docker Desktop 安装尝试 | 阻塞 | `winget install --id Docker.DockerDesktop -e` 下载校验完成，但安装阶段需要管理员权限/UAC，返回 `4294967295`，已记录 P1-KNOWN-007 |
| 2026-05-11 | 测试工程师 | Docker Desktop machine/silent 重试 | 硬限制 | `--scope machine` 仍返回 `4294967295`；官方安装包静默安装命令返回 0 但未落盘，`docker` 命令仍不可用，无法执行 `docker compose up -d postgres` |
| 2026-05-11 | 测试工程师 | Windows 原生 PostgreSQL 备用路径 | 部分通过 | `D:\\pgsql16portable` 免安装 PostgreSQL 16.13 已启动，migration/seed 成功，verify-seed 7/8 通过；后端启动因 AuditInterceptor 依赖注入错误失败，已记录 P1-KNOWN-009/P2-BE-REWORK-008 |
