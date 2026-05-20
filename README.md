# 工单系统（入职业务管理平台）

> 版本：**v0.9.0** · 最后更新：**2026-05-11** · 主分支：main · License：内部使用
>
> 给入职业务的一体化工单系统：手工建单 / Excel 批量导入 / 规则派发 / 多模块协作 / 撤回审批 / 看板。本地部署、前后端分离、PostgreSQL 单库。

---

## 项目介绍

本系统面向**业务员 → 多模块后道**的入职场景：业务员整理客户资料后提交一张"主工单"，系统按可配置的 JSON-AST 规则把不同字段切片自动派发到**合同 / 社保 / 公积金 / 档案** 4 个模块；各模块的 handler 接单、处理、回填数据，全部子工单完成后主单自动完成。整个过程带字段级权限、操作日志、导出模板、撤回审批与团队看板。

系统本地部署，不依赖公网；AI 仅在 Excel 映射阶段可选调用。数据库为入职起步，但字段、权限、派发、模块化结构已为**续签 / 离职 / 待遇申报 / 月度批量业务**预留扩展位。

---

## 技术栈

> 以 `frontend/package.json` / `backend/package.json` 为准；详见 `docs/项目总览.md` §3。

| 层 | 组件 | 版本 |
|----|------|------|
| 前端 | React + TypeScript | 18.3 + 5.5 |
| 前端 UI | antd + @ant-design/pro-components | 5.22 + 2.7 |
| 前端状态 | Zustand | 4.5 |
| 前端路由 | react-router-dom | 6.28 |
| 前端构建 | Vite | 5.x |
| 后端 | NestJS + TypeScript | 10.x + 5.x |
| 后端 ORM | TypeORM | 0.3.x |
| 数据库 | PostgreSQL | 16 |
| 认证 | passport-jwt + bcrypt | 最新稳定 |
| 校验 | class-validator + ajv | 最新稳定 |
| 反向代理 | Nginx | 1.25+ |
| 可选 AI | OpenAI 兼容 API（Excel 映射） | - |

> 规划中（尚未安装）：BullMQ / node-cron / pino / exceljs / ECharts / MSW / Playwright。引入时同步 `docs/项目总览.md` 与 `docs/架构变更日志.md`。

---

## 快速开始

### 方式一：Docker Compose（推荐）

```powershell
# 1. 准备环境变量
copy .env.example .env    # 修改 DATABASE_URL / JWT_SECRET

# 2. 一行启动
docker compose up -d

# 3. 初始化数据 / seed
docker compose exec backend pnpm migration:run
docker compose exec backend pnpm seed:run

# 4. 访问
# 前端：http://localhost
# API：http://localhost/api
# 默认账号：admin / admin123（首登强制改密）
```

详见 `docs/部署手册.md`。

### 方式二：Windows 本地开发

```powershell
# 1. 启动 PostgreSQL（使用仓内 portable）
.\tools\pgsql16\start-pg.ps1

# 2. 后端
cd backend
pnpm install
pnpm migration:run
pnpm seed:run
pnpm start:dev       # http://localhost:3000

# 3. 前端（新开一个终端）
cd frontend
pnpm install
pnpm dev             # http://localhost:5173
```

详见 `docs/部署手册.md` §3「Windows 原生」。

---

## 目录结构

```
工单系统/
├── README.md                     # 本文件（项目主入口）
├── docker-compose.yml            # postgres + backend + frontend + nginx 编排
├── .env.example                  # 环境变量模板
├── backend/                      # NestJS 后端
│   ├── src/modules/              # auth / users / roles / departments / customers /
│   │                             # fields / dispatch-engine / work-orders /
│   │                             # dispatched-orders / withdraw-requests /
│   │                             # imports / notifications / dashboard / admin
│   ├── src/database/             # entities / migrations / seeds
│   └── test/                     # unit + e2e
├── frontend/                     # React + antd Pro 前端
│   ├── src/pages/                # login / admin / my / dispatched / dashboard
│   ├── src/components/
│   ├── src/stores/               # Zustand
│   ├── src/api/                  # axios 封装
│   └── src/layouts/
├── nginx/nginx.conf              # 反向代理：/ → frontend，/api → backend
├── tools/                        # 便携 Postgres / SSH / CLI
└── docs/                         # 全部设计、API、测试、运营文档（见 docs/README.md）
```

---

## 核心特性清单

**前端 6 大模块**：
- 登录与会话（强制首登改密 / 失败锁定 / token 续签）
- 管理后台（用户 / 角色 / 部门 / 客户 / 字段 / 派发规则 / 字段权限 / 导出模板）
- 我的工单（手工建单 / Excel 导入 / 动态字段渲染 / 撤回申请）
- 后道工作台（待接单 / 进行中 / 已完成 / 接单 / 完成 / 退回）
- 团队看板（三层视图：个人 / 模块主管 / admin 全局）
- 通知中心（站内信 + SSE 实时推送 + 未读计数）

**后端 8 大模块**：
- auth / users / roles / departments / customers（基础）
- fields / field-permissions / dispatch-rules（配置）
- work-orders / dispatched-orders / withdraw-requests / approvals（核心业务）
- imports / export-templates（数据进出）
- notifications（事件推送）
- dashboard（看板聚合）
- ai（Excel 映射）
- admin / operation-logs（审计）

**亮点能力**：
- **JSON-AST 派发引擎**：字段条件组合可视化配置，支持 dry-run 影子验证
- **字段级权限**：visible / readonly / masked / hidden 四态，由拦截器 + 装饰器自动下发
- **并发安全**：子工单 accept 乐观锁、round_robin rr_cursor 版本号、主单行级悲观锁
- **AI 映射**：Excel 首行 → 字段 code 的智能建议，支持样本学习
- **通知中心**：队列去重 + SSE 推送 + 未读桶分钟聚合
- **看板**：三层角色视图 + SQL 口径统一 + Grafana 同源指标

---

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 20 LTS | 前后端均要 |
| pnpm | 8.x | 统一包管理器 |
| PostgreSQL | 16 | 原生或仓内 portable |
| Docker Desktop | 4.x | 可选，Windows 用户若用 Compose 需管理员权限 |
| 浏览器 | Chrome / Edge 最新 | 前端兼容底线 |

---

## 文档索引

一级入口（本 README 只列主文档，完整 40+ 份请看 **`docs/README.md`** 导航）：

| 面向 | 文档 |
|------|------|
| 新同事入门 | `docs/项目总览.md` |
| 后端 API 契约 | `docs/API规范.md` |
| 数据库 | `docs/数据库ER图.md` |
| 部署 | `docs/部署手册.md` |
| 日常运营 | `docs/运营手册.md` |
| 终用户验收 | `docs/总验收清单.md` |
| 业务员/后道教程 | `docs/交用教程.md` |
| 回归测试 | `docs/回归用例总纲.md` |
| 架构变更 | `docs/架构变更日志.md` |

---

## 开发贡献指南

**代码风格**：
- TypeScript 统一 strict：**禁止 any**、**禁止 ts-ignore**；必要时写类型 adapter；
- 后端 Nest 模块按 `controller / service / repository / dto / types` 分层，单文件 ≤ 500 行；
- 前端 pages 负责编排，业务逻辑下沉到 stores / api，组件库复用 antd Pro。

**提交（Conventional Commits）**：
```
feat(work-orders): 支持子工单 return 召回
fix(dispatch): round_robin 并发 rr_cursor 版本号
docs(phase3): 补齐后端返工指导
chore(deps): bump antd 5.22 → 5.23
```

**PR Review Checklist**：
- [ ] 设计文档/API规范/ER图已同步
- [ ] 单测 ≥ 80% 覆盖关键路径
- [ ] 无 any / 无 ts-ignore / 无 console.log 残留
- [ ] 涉及 migration 的修改：附回滚脚本
- [ ] UI 变更：附截图或 Loom / 自测说明
- [ ] 破坏性变更：已在 `docs/架构变更日志.md` 登记

---

## 运维脚本

### 清理 Phase 6 测试工单数据

`backend/scripts/cleanup-phase6-seed.sql` 用于清理 `phase6-seed-data.sql` 造的测试主工单；`dispatched_orders` 会依赖外键 `ON DELETE CASCADE` 自动跟随清理。请仅由 admin/DBA 在确认候选数据后手动执行：

```bash
psql -U postgres -d work_order_system -f backend/scripts/cleanup-phase6-seed.sql
```

---

## License

内部使用。未经书面授权不得外发源码与文档。

---

## 变更日志

- v0.9.0（2026-05-11）：Phase 3 后端评审通过，Phase 5/6 前端收尾完成，Phase 4 后端写作中；本 README 重写以对齐正确技术栈。
- v0.8.x 及更早：见 `docs/架构变更日志.md`。