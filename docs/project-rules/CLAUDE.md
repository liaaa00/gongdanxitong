# CLAUDE.md — AI 操作手册（最高宪法）

> 版本：1.0.0  
> 最后更新：2026-05-29  
> 适用范围：本项目所有 AI 编码助手、人工开发者与自动化改动流程。  
> 项目根目录：`d:/AI/SpeceAppDate/工单系统`

---

## 0. 最高优先级声明

1. 本文件是本项目的最高操作规范。任何代码生成、重构、修复、测试、迁移、文档更新，都必须先遵守本文。
2. 如果本文与临时口头需求冲突，必须先向用户确认；除非用户明确要求修改本文，否则不得绕过本文硬性约束。
3. 本项目是从 Vibe Coding 演进而来，存在历史命名、历史路由、历史兼容层。AI 修改时必须尊重既有结构，禁止“觉得更优雅”而大规模重写。
4. 任何改动必须小步、可回滚、可验证。不要跨模块批量重构，不要一次性改多个不相关目标。
5. 禁止为了让测试通过而删除功能、降低权限、放宽校验、吞掉错误或伪造结果。

---

## 1. 项目现状总览

### 1.1 项目类型

- 项目名称：工单系统 / Ticket System
- 形态：前后端分离 Web 应用
- 后端目录：`backend/`
- 前端目录：`frontend/`
- 部署编排：`docker-compose.yml`
- 数据库：PostgreSQL 16
- 反向代理：Nginx 1.27 alpine

### 1.2 后端技术栈

- NestJS 10
- TypeScript 5.5，`strict: true`
- TypeORM 0.3.x
- PostgreSQL
- JWT + Passport
- class-validator / class-transformer
- 全局 API 前缀：`/api`
- 全局响应包装：`ResponseInterceptor`
- 全局异常过滤：`HttpExceptionFilter`
- 全局请求追踪：`traceIdMiddleware`
- 全局校验：`ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })`

### 1.3 前端技术栈

- React 18
- Vite 5
- TypeScript 5.5，`strict: true`
- React Router 6
- Ant Design 5
- `@ant-design/pro-components` 2：`ProLayout`、`ProTable`、`PageContainer`、`ProForm` 等
- Zustand 4
- Axios 统一封装在 `frontend/src/services/request.ts`
- Less 全局样式：`frontend/src/styles/global.less`

### 1.4 当前 UI 事实

1. 当前项目不使用 shadcn/ui。
2. 当前项目不使用 Tailwind CSS。
3. 当前项目不使用飞书 SDK 或飞书原生组件。
4. 当前项目的主要组件体系是 Ant Design + Ant Design Pro Components。
5. 当前项目已有统一路由权限入口：`frontend/src/config/routeVisibility.ts`。
6. 当前项目已有规范角色归一化入口：`frontend/src/constants/roles.ts`。

---

## 2. 文件命名规范

### 2.1 通用原则

1. 文件名必须表达业务含义，禁止 `newFile.ts`、`temp.ts`、`test2.ts`、`final.ts`、`copy.ts` 这类临时命名。
2. 新增文件必须放在所属领域目录内，禁止把业务代码堆到根目录、`utils/` 或 `common/`。
3. 测试文件必须与被测对象命名对应，使用 `.test.ts(x)` 或 `.spec.ts`。
4. 不得新增中文文件名的源码文件。中文可出现在文档、注释、界面文案中，但源码文件名使用英文。
5. 不得新增空壳文件、无引用文件、无实际用途的“预留文件”。

### 2.2 后端命名

后端位于 `backend/src/`，文件采用 kebab-case：

| 类型 | 命名格式 | 示例 |
|---|---|---|
| Entity | `kebab-case.entity.ts` | `work-order.entity.ts` |
| DTO | `kebab-case.dto.ts` | `list-query.dto.ts` |
| Controller | `kebab-case.controller.ts` | `work-order.controller.ts` |
| Service | `kebab-case.service.ts` | `work-order.service.ts` |
| Module | `kebab-case.module.ts` | `work-order.module.ts` |
| Guard | `kebab-case.guard.ts` | `jwt-auth.guard.ts` |
| Interceptor | `kebab-case.interceptor.ts` | `audit.interceptor.ts` |
| Decorator | `kebab-case.decorator.ts` | `current-user.decorator.ts` |
| Migration | `{timestamp}-PascalCase.ts` | `1715400000000-InitSchema.ts` |
| Seed | `seed-kebab-case.ts` 或领域明确命名 | `seed-roles.ts` |
| Test | `原文件名.spec.ts` | `work-order.service.spec.ts` |

后端类名采用 PascalCase：

- Entity：`UserRole`
- DTO：`CreateUserDto`
- Controller：`UsersController`
- Service：`UsersService`
- Module：`UsersModule`

### 2.3 前端命名

前端位于 `frontend/src/`。

| 类型 | 命名格式 | 示例 |
|---|---|---|
| 页面目录 | `PascalCase` | `WorkOrders/` |
| 页面入口 | `index.tsx` | `WorkOrders/index.tsx` |
| 子页面目录 | `PascalCase` | `WorkOrders/Detail/` |
| 通用组件目录 | `PascalCase` | `DynamicForm/` |
| 通用组件入口 | `index.tsx` | `DynamicForm/index.tsx` |
| Hook | `camelCase.ts` 或 `usePascalCase.ts` | `useAuth.ts` |
| Service | `camelCase.ts` | `workOrders.ts` |
| Store | `camelCaseStore.ts` | `userStore.ts` |
| Utils | `camelCase.ts` | `permission.ts` |
| Constants | `camelCase.ts` | `roles.ts` |
| Type 文件 | `types.ts` 或领域名 | `types.ts` |
| Test | `原文件名.test.ts(x)` | `index.test.tsx` |

React 组件名必须使用 PascalCase。Hook 必须以 `use` 开头。

---

## 3. 目录结构约束

### 3.1 根目录约束

根目录只允许放置：

- 项目说明文档：如 `README.md`、`TECH_STACK.md`、`BACKEND_STRUCTURE.md`、`APP_FLOW.md`、`FRONTEND_GUIDELINES.md`、`IMPLEMENTATION_PLAN.md`、`progress.txt`、`CLAUDE.md`
- 项目级配置：如 `.env.example`、`.gitignore`、`docker-compose.yml`
- 运维脚本：如启动/停止脚本
- 历史日志和临时分析文件应尽量移入 `tmp/`、`docs/` 或专用目录；不要继续在根目录制造散落文件。

禁止在根目录新增业务源码。

### 3.2 后端目录结构约束

后端业务代码必须遵守现有结构：

```text
backend/src/
├─ app.module.ts
├─ main.ts
├─ config/
├─ database/
│  ├─ data-source.ts
│  ├─ migrations/
│  └─ seeds/
├─ entities/
├─ common/
├─ health/
└─ modules/
   ├─ admin/
   ├─ ai/
   ├─ attachments/
   ├─ auth/
   ├─ dashboard/
   ├─ dispatch/
   ├─ dispatch-engine/
   ├─ dispatched-orders/
   ├─ field-permissions/
   ├─ field-supplement/
   ├─ imports/
   ├─ notifications/
   ├─ operation-logs/
   ├─ role-action-permissions/
   ├─ stages/
   ├─ upload/
   ├─ uploads/
   ├─ work-orders/
   └─ workflows/
```

硬性要求：

1. Entity 统一放在 `backend/src/entities/`，并从 `backend/src/entities/index.ts` 汇出。
2. 业务模块放在 `backend/src/modules/<domain>/`。
3. 管理后台子模块放在 `backend/src/modules/admin/<domain>/`。
4. 通用守卫、拦截器、装饰器、异常、工具放在 `backend/src/common/`。
5. 配置只放在 `backend/src/config/`。
6. 数据库迁移只放在 `backend/src/database/migrations/`。
7. 种子数据只放在 `backend/src/database/seeds/`。
8. 禁止在 Controller 中写业务流程、复杂查询或 SQL；Controller 只负责路由、参数、鉴权装饰器和调用 Service。
9. 禁止新增平行于 `modules/` 的业务目录。

### 3.3 前端目录结构约束

前端代码必须遵守现有结构：

```text
frontend/src/
├─ App.tsx
├─ main.tsx
├─ routes/
│  └─ index.tsx
├─ layouts/
│  └─ BasicLayout.tsx
├─ components/
├─ config/
│  └─ routeVisibility.ts
├─ constants/
├─ hooks/
├─ pages/
├─ services/
├─ stores/
├─ styles/
├─ utils/
├─ mocks/
└─ test-setup.ts
```

硬性要求：

1. 所有页面路由必须集中在 `frontend/src/routes/index.tsx`。
2. 页面组件必须放在 `frontend/src/pages/`。
3. 可复用组件必须放在 `frontend/src/components/`。
4. API 调用必须放在 `frontend/src/services/`，页面禁止直接调用 `axios`。
5. 全局状态必须放在 `frontend/src/stores/`，优先使用现有 Zustand 模式。
6. 通用 Hook 必须放在 `frontend/src/hooks/`。
7. 路由可见性必须维护在 `frontend/src/config/routeVisibility.ts`。
8. 角色代码归一化必须维护在 `frontend/src/constants/roles.ts`。
9. 全局样式只放在 `frontend/src/styles/global.less`。
10. 不得新增 `src/api/`、`src/views/`、`src/redux/`、`src/model/` 等与现有结构冲突的新体系。

---

## 4. 组织架构与人员选择：最高禁止事项

### 4.1 绝对禁止：自建本地组织架构同步逻辑

严禁在本项目中自建任何“本地组织架构同步”逻辑。

以下行为一律禁止：

1. 禁止编写从飞书、钉钉、企业微信或其他外部平台拉取部门列表并同步到本地数据库的逻辑。
2. 禁止编写从飞书、钉钉、企业微信或其他外部平台拉取人员列表并同步到本地数据库的逻辑。
3. 禁止新增 `syncOrganization`、`syncDepartments`、`syncUsers`、`feishuSync`、`larkSync`、`organizationSync` 等同步服务、任务或脚本。
4. 禁止新增 `@Cron`、`@Interval` 或外部 webhook 来定时/被动同步组织架构。
5. 禁止新增 `feishu_open_id`、`feishu_user_id`、`feishu_department_id`、`lark_user_id`、`lark_department_id`、`dingtalk_user_id` 等外部组织字段。
6. 禁止将飞书已有的姓名、部门名、部门路径、头像、职级、岗位、上级关系等元数据冗余复制到本地权限表。
7. 禁止为了“方便筛选”而维护一套本地镜像通讯录。
8. 禁止新建“同步组织架构”页面、按钮、菜单、API、定时任务、命令行脚本或后台任务。

### 4.2 强制要求：部门和人员选择必须使用实时组件

所有部门选择和人员选择必须强制使用以下实时组件：

- 部门选择：`DepartmentSelect`
- 人员选择：`UserSelect`

使用规则：

1. 新增任何“选择部门”的表单项、筛选项、弹窗字段、配置字段，必须使用 `DepartmentSelect`。
2. 新增任何“选择人员/处理人/负责人/业务员/主管/经办人”的表单项、筛选项、弹窗字段、配置字段，必须使用 `UserSelect`。
3. `DepartmentSelect` 和 `UserSelect` 必须实时查询权威数据源，不得依赖手写静态数组。
4. 页面不得各自复制一份 `Select` + `getUsers` / `getDepartments` 的临时实现。
5. 页面不得在本地维护独立的用户/部门缓存作为业务事实来源；如需前端性能缓存，只能封装在组件内部，并且必须可刷新、不可作为权限事实来源。
6. 组件返回值必须是稳定 ID：部门返回 `departmentId`，人员返回 `userId`。显示名称仅用于 UI 展示，不得作为业务主键提交。
7. 如果当前代码位置尚未接入 `DepartmentSelect` / `UserSelect`，后续触碰相关页面时必须优先替换为这两个组件，而不是继续复制旧写法。
8. 如果项目中暂未存在这两个组件，新增选择需求时必须先在 `frontend/src/components/DepartmentSelect/` 和 `frontend/src/components/UserSelect/` 建立统一组件，再接入页面。

### 4.3 权限存储原则

权限关系只认 ID，不认外部元数据。

当前核心表关系：

- `users.id`：系统用户 ID
- `roles.id`：角色 ID
- `departments.id`：部门 ID
- `user_roles`：用户-角色-部门三元关系表

`user_roles` 当前使用复合主键：

```text
(user_id, role_id, department_id)
```

硬性规则：

1. 人员权限仅存储 UserID、RoleID、DepartmentID 的映射关系。
2. 不得在 `user_roles` 中冗余用户姓名、角色名、部门名、飞书名称、部门路径等展示字段。
3. 展示所需名称必须通过关联查询或前端展示层从权威接口读取。
4. 一人多角色、多部门任职必须通过多条 `user_roles` 记录表达。
5. 不得用 `username`、`real_name`、`department_name` 作为权限判断依据。

---

## 5. 后端编码规范

### 5.1 Controller 规范

1. Controller 只负责 HTTP 合约，不写核心业务逻辑。
2. Controller 方法必须使用 DTO 接收入参。
3. Controller 不得直接访问 Repository、EntityManager 或 DataSource 进行业务查询。
4. Controller 必须声明必要的鉴权/角色/业务权限装饰器。
5. 新接口路径必须放在所属领域 Controller 中，不得新增杂乱 Controller。
6. 返回结构交给全局 `ResponseInterceptor` 统一包装，不要在每个接口手写不一致格式。

### 5.2 Service 规范

1. 核心业务逻辑写在 Service。
2. 跨表写操作必须使用 TypeORM transaction。
3. Service 不得吞异常；需要转换时抛出明确业务异常。
4. 查询逻辑优先使用 Repository/QueryBuilder，禁止拼接不可信 SQL。
5. 批量操作必须考虑幂等性、部分失败、审计日志和权限边界。
6. 修改工单、子工单、权限、配置类数据时，必须考虑 operation log 或既有审计机制。

### 5.3 DTO 与校验规范

1. 所有外部入参必须经过 DTO。
2. DTO 字段必须配合 `class-validator` 装饰器。
3. 可选字段使用 `@IsOptional()`，不要用 `any` 接收任意对象。
4. 对 JSONB 扩展数据要限定结构或在 Service 中做显式校验。
5. 因全局开启 `whitelist` 与 `forbidNonWhitelisted`，不要依赖 DTO 以外字段透传。

### 5.4 Entity 与数据库规范

1. TypeORM `synchronize` 必须保持 `false`。
2. 表结构变更必须走 migration。
3. 禁止直接修改已执行的历史 migration；只能新增 migration。
4. Entity 字段名与数据库列名保持清晰映射：TypeScript 用 camelCase，数据库列名用 snake_case。
5. 外键关系必须在 Entity 中显式表达。
6. 删除行为必须明确 `onDelete` 语义，尤其是用户、角色、部门、工单、配置关系。
7. 种子数据必须幂等，禁止 `DROP TABLE`、`TRUNCATE` 生产数据表。

### 5.5 鉴权与权限规范

1. 后端全局启用 `JwtAuthGuard` 和 `RolesGuard`，不要绕过。
2. 公开接口必须明确标注公开装饰器或遵循现有公开规则，不得误开。
3. 管理接口必须校验管理员或对应业务权限。
4. 字段级权限必须尊重现有 `FieldPermissionInterceptor` 与 `field_permissions` 体系。
5. 操作级权限必须尊重 `role-action-permissions` 体系。
6. 不得只靠前端隐藏按钮来实现安全，后端必须兜底。

---

## 6. 前端编码规范

### 6.1 路由规范

1. 所有路由集中维护在 `frontend/src/routes/index.tsx`。
2. 私有页面必须经过 `PrivateRoute`。
3. 需要角色限制的页面必须经过 `RoleRoute`。
4. 新增路由必须同步维护 `frontend/src/config/routeVisibility.ts`。
5. 未列入 `ROUTE_VISIBILITY` 的路径默认不可访问。
6. 历史路径兼容只能通过 `LEGACY_ROUTE_ALIASES` 做收敛，不得放宽权限。

### 6.2 页面与组件规范

1. 页面组件只负责编排 UI、调用 hooks/services，不堆积复杂业务算法。
2. 超过 200 行且职责混杂的页面，新增功能时应优先拆小组件，但不得无关重构。
3. 通用能力沉淀到 `frontend/src/components/`。
4. 表格优先复用 `ProTablePage`、`MultiViewTable` 或现有 ProTable 模式。
5. 动态字段表单优先复用 `DynamicForm`。
6. 错误边界沿用 `ErrorBoundary`，不要新建另一套错误边界体系。

### 6.3 API 调用规范

1. API 调用必须通过 `frontend/src/services/`。
2. 所有 HTTP 请求必须使用 `frontend/src/services/request.ts` 导出的统一 axios 实例。
3. 页面组件禁止直接 `import axios from 'axios'`。
4. 认证头、分页参数清洗、错误提示、401 跳转交给统一 request 层。
5. Service 函数必须命名清晰，如 `getUsers`、`createUser`、`updateUser`、`deleteUser`。
6. 不得在页面里拼接复杂 API URL；URL 归属于 service。

### 6.4 状态管理规范

1. 登录用户、token、全局用户状态沿用 `frontend/src/stores/userStore.ts`。
2. 跨页面共享状态用 Zustand store。
3. 页面内部临时状态用 `useState` / `useReducer`。
4. 不得新增 Redux、MobX、React Query 等新状态体系，除非用户明确批准并更新技术栈规范。
5. 不得把服务端权威数据长期复制到前端 store 后当作事实来源。

### 6.5 UI 与样式规范

1. UI 组件优先使用 Ant Design 5。
2. 高级表格、布局、表单优先使用 `@ant-design/pro-components`。
3. 全局样式写入 `frontend/src/styles/global.less`。
4. 组件局部样式优先使用 Ant Design props、token、内联样式或局部 className。
5. 禁止引入 Tailwind CSS。
6. 禁止引入 shadcn/ui。
7. 禁止引入另一套大型 UI 组件库。
8. 弹窗、抽屉、表单、表格交互应保持 Ant Design 风格一致。

### 6.6 角色与权限判断规范

1. 前端角色判断必须使用 `canonicalRoleCode`、`canonicalRoleCodes`、`userHasAnyCanonicalRole` 等现有工具。
2. 路由级判断必须使用 `canAccessPath`。
3. 禁止在页面里散落 `user.roles.includes('admin')` 这类硬编码判断。
4. 新增角色代码时必须同步维护：
   - 后端角色种子/角色定义
   - 前端 `frontend/src/constants/roles.ts`
   - 前端 `frontend/src/config/routeVisibility.ts`
   - 相关权限矩阵/操作权限配置
5. 按钮级隐藏不是安全边界，后端必须有权限校验。

---

## 7. 工单业务边界

### 7.1 主工单与子工单

1. 主工单由 `work-orders` 模块负责。
2. 子工单由 `dispatched-orders` 模块负责。
3. 派发决策逻辑优先放在 `dispatch-engine` 或既有派发相关模块，不要塞回页面或 Controller。
4. 工单状态变更必须考虑：状态机、操作权限、字段权限、通知、审计日志。
5. 已完成、已撤回、已作废等终态工单不得被随意重新编辑，除非现有业务流程明确允许。

### 7.2 字段权限

1. 字段配置由字段配置模块维护。
2. 字段可见、只读、隐藏、脱敏必须遵守 `field_permissions` 体系。
3. 前端显示层必须尊重后端返回的字段权限结果。
4. 后端仍需兜底字段权限，不能只在前端隐藏。
5. 新增业务字段要同时考虑导入、导出、详情、编辑、字段权限、动态表单、测试。

### 7.3 导入导出

1. Excel 导入导出必须使用既有 imports / exports / export-templates 体系。
2. 导入必须校验字段、权限、重复数据、错误行反馈。
3. 导出必须遵守字段权限和模板配置。
4. 禁止为了快速交付写一次性脚本绕过业务校验导入生产数据。

---

## 8. 禁止引入的新体系

未经用户明确批准并同步更新规范文档，禁止引入：

1. 新后端框架：Express 独立服务、Fastify 独立服务、Koa 等。
2. 新 ORM：Prisma、Sequelize、Knex 等。
3. 新前端框架：Vue、Next.js、Nuxt、Svelte 等。
4. 新 UI 体系：Tailwind、shadcn/ui、Material UI、Chakra UI 等。
5. 新状态体系：Redux、MobX、React Query、SWR 等。
6. 新权限体系：CASL、自定义 ACL 表、页面散落角色判断等。
7. 新组织架构同步体系。
8. 新接口响应格式。
9. 新全局错误处理体系。
10. 新目录分层体系。

---

## 9. 测试与验证规范

### 9.1 后端验证

后端常用命令：

```bash
cd backend
npm run build
npm run test
npm run test:e2e
npm run lint
```

规则：

1. 修改后端源码后至少运行 `npm run build`。
2. 修改业务逻辑后应运行相关单元测试或 e2e 测试。
3. 修改数据库结构后必须验证 migration。
4. 修复 bug 必须补充或更新对应测试，除非用户明确要求只做热修。

### 9.2 前端验证

前端常用命令：

```bash
cd frontend
npm run build
npm run test
npm run lint
npm run e2e
```

规则：

1. 修改前端源码后至少运行 `npm run build`。
2. 修改组件交互后应运行相关 Vitest 测试。
3. 修改核心流程后应运行或补充 Playwright e2e。
4. 修改权限、路由、菜单后必须人工核对可见性矩阵。

### 9.3 Docker 验证

常用命令：

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

规则：

1. 修改部署配置、环境变量、Dockerfile、Nginx 配置后必须做容器级验证。
2. 不得把开发机本地路径、个人 IP、个人密钥写死进容器配置。

---

## 10. 安全与数据保护规范

1. 禁止提交真实密钥、真实 token、真实账号密码。
2. `.env` 中的敏感信息不得写入文档正文或测试快照。
3. 日志中不得输出密码、JWT、身份证号完整值、手机号完整值等敏感数据。
4. 身份证号、手机号、员工个人信息在展示和导出时必须考虑脱敏与权限。
5. AI 相关配置必须走环境变量或系统设置，不得硬编码 API Key。
6. 上传文件必须校验大小、类型、路径，禁止路径穿越。
7. 下载和静态文件访问必须限制在授权目录。

---

## 11. Git 与改动边界规范

1. 每次任务只修改与目标直接相关的文件。
2. 不得顺手格式化全仓。
3. 不得顺手重命名大量文件。
4. 不得删除历史兼容路由、历史兼容字段、历史兼容角色映射，除非任务明确要求。
5. 不得修改用户未要求修改的文档或配置。
6. 发现无关 bug 时，先记录到 `progress.txt` 或回复用户，不要擅自扩大范围。
7. 修改前必须查看现有实现，禁止凭空重写。
8. 修改后必须说明：改了什么、为什么、如何验证、还有什么风险。

---

## 12. AI 工作流程

每个 AI 在执行任务时必须遵守：

1. 先读相关文件，再动手。
2. 先确认现有模式，再新增代码。
3. 优先复用已有组件、Service、Hook、DTO、Entity、Guard、Interceptor。
4. 小步修改，不做无关重构。
5. 保持 TypeScript 严格类型通过。
6. 保持前后端接口契约一致。
7. 保持权限前后端双重校验。
8. 保持用户可见文案中文一致。
9. 对不确定的业务规则，向用户确认，不要脑补。
10. 对历史乱码、历史兼容、历史分支残留，先判断影响范围，不要盲删。

---

## 13. 学习循环：被纠正后的强制更新规则

每次 AI 被用户、Leader、代码审查或测试结果纠正错误后，必须立即把错误模式和预防规则更新到本文件。

更新位置：本章节的“错误模式记录”。

记录格式：

```text
- 日期：YYYY-MM-DD
  错误模式：具体描述做错了什么。
  影响范围：说明影响了哪些文件、功能或数据。
  预防规则：以后遇到同类任务必须如何避免。
```

硬性要求：

1. 不允许只口头道歉而不更新规则。
2. 不允许把错误描述写成空话，如“以后更仔细”。
3. 必须写可执行、可检查的预防规则。
4. 如果错误涉及组织架构同步、权限绕过、字段权限、数据迁移、敏感信息泄露，必须提升为最高优先级规则。

### 错误模式记录

- 日期：2026-05-30
  错误模式：把用户要求的“合并分支 / 合并 worktree 修改”误理解为“清理分支并只保留 main”，存在误删未合并修改的风险。
  影响范围：Git 分支、`.spectrai-worktrees/` 工作树、历史 AI 会话改动与尚未进入 main 的业务修复。
  预防规则：遇到多分支 / worktree 处理时，必须先执行只读核对（`git status`、`git branch --all`、`git worktree list`、`git reflog`），先备份再逐分支比对和合并；未经用户明确确认，禁止删除分支、删除 worktree、执行 `git clean`、`reset --hard` 或把 main 认定为唯一权威源。

- 日期：2026-07-15
  错误模式：生产同步只校验手工挑选的上传包，没有对本地完整代码清单与服务器源码做全量比较，同时忽略了容器入口脚本会在启动时自动执行 seed。
  影响范围：已提交但未进入上传包的运行代码、测试和文档可能漏同步；重启后端还可能把源码中的测试用户、客户和配置 seed 写入生产数据库。
  预防规则：本地工作树为权威源时，必须用全部已跟踪代码加必要未跟踪代码生成上传清单，明确排除数据库、`.env`、uploads、构建产物和临时文件，并对全部范围做上传前后哈希比对；生产切换前必须审计 Docker `CMD`/entrypoint/启动钩子，默认禁用自动 seed，并对受保护业务表做切换前后计数或哈希校验。

- 日期：2026-07-17
  错误模式：把本地 Git 的“未提交”状态与服务器“未部署”状态混为一谈，未先检查服务器运行代码和功能证据，就可能把已经从脏工作树部署的功能说成未部署。
  影响范围：错误描述了工时制“标准/综合/不定时”三选项的生产状态，并掩盖服务器代码虽然已运行、却无法由 Git commit 重现的真实风险。
  预防规则：以后逐功能同时记录本地 Git 状态、服务器部署状态、来源可复现性和服务器验证结果；“未提交”只能描述本地 Git，服务器已存在但无 commit 时必须写“已部署但 Git 不可复现”，未检查服务器时必须写“部署状态未知”，禁止由本地 Git 状态推断服务器状态。

- 日期：2026-07-17
  错误模式：把 SpectrAI 全局 SSH profile 的名称、描述和“新生产服务器”字样误当作当前工单项目归属证据，显式连接了属于另一项目的 `xiangxin-new`，再通过目录和容器探测才发现主机不匹配。
  影响范围：对另一项目服务器执行了 `pwd`、目录检查和 `docker ps` 等只读身份探测，读取到 `sub2api` 容器元数据；未上传文件、未执行远程 Git、未修改数据库、未重启容器，发现不匹配后已断开。
  预防规则：任何 SSH 连接或只读探测前，必须从项目自有部署映射、用户对当前任务的明确指定，或包含 profile/host/port/部署根目录/运行时标识的既往验证记录中，建立“当前仓库 -> 唯一远程目标”绑定；profile 名称/描述/时间/顺序、其他项目会话和排除法均不得作为证据。绑定字段缺失或冲突时必须在连接前停止；连接后只允许对已绑定目标做只读身份断言，任一标识不匹配立即断开。对本工单仓库明确禁止使用 `xiangxin-new`。

- 日期：2026-07-17
  错误模式：排除 `xiangxin-new` 后仍按 profile 排除法猜测 `xiangxin-prod`；得到正确内网 IP 后又仅凭用户名短暂假定为 Windows/WinRM，而没有先验证实际远程协议。
  影响范围：连续向用户报告了错误的公网 SSH 目标，延误 commit `5f3e239` 的正确部署；WinRM 5985 测试仅返回连接拒绝、未建立会话，随后在同一用户明确绑定主机上验证 SSH 成功，未对错误公网主机产生新的读取或写入。
  预防规则：本仓库 `D:\ai\speceappdate\工单系统` 固定绑定 Linux 内网主机 `192.168.26.195:22`、用户 `admin` 和 SpectrAI 加密 SSH profile `work-order-local-ssh`；部署根目录为 `/data/apps/work-order-system`，运行时标识为 `ticket_backend/ticket_frontend/ticket_postgres/ticket_nginx`。`xiangxin-new`、`xiangxin-prod` 及其主机均属于其他项目，禁止连接、探测或复用。目标绑定必须同时记录 host、transport、profile 和运行时身份，不能凭名称、用户名或相同部署路径推断；密码只允许保存到 SpectrAI 加密 profile。

- 日期：2026-07-29
  错误模式：沿用入职/离职的主工单拆分模型推断在职与省外业务，曾把劳动合同续签、证明开具、单项业务和省外增减员设计成主单/子单，并尝试在离职材料完成钩子中自动创建离职证明，造成业务结构与会议口径相反。
  影响范围：工单实体选择、页面入口、派单钩子、主单完成时序、仪表盘统计、省外导入及离职证明流转；还出现了引用未定义 `cert_issue_status` 字段的风险。
  预防规则：新增或重构业务模块前必须先形成“业务线 / 发起入口 / 实体表 / 是否拆单 / 派单来源 / 状态机 / 模板来源”的对照表，并与会议记录和 Excel 逐项核对。只有入职、离职可复用主单拆分；在职三类、离职证明和省外增减员默认按已确认的独立直单实现。禁止凭生命周期相邻关系复用钩子，禁止在字段种子不存在时先写权限或流程引用。

---

## 14. 当前关键架构决策

| 编号 | 决策 | 说明 |
|---|---|---|
| D-01 | 后端使用 NestJS + TypeORM | 保持模块化、装饰器和现有实体体系 |
| D-02 | 数据库使用 PostgreSQL | 支持 UUID、JSONB、复杂查询和事务 |
| D-03 | TypeORM `synchronize: false` | 生产结构变更必须走 migration |
| D-04 | 前端使用 React + Vite + Ant Design | 当前 UI 与构建体系已围绕该组合实现 |
| D-05 | 路由权限集中在 `routeVisibility.ts` | 禁止页面散落角色判断 |
| D-06 | 角色代码通过 `constants/roles.ts` 归一化 | 兼容历史后端角色 code 与前端规范 code |
| D-07 | 用户权限使用 `user_roles` 三元关系 | 一人可在多部门拥有多角色 |
| D-08 | 禁止本地组织架构同步 | 不复制飞书等外部平台组织元数据 |
| D-09 | 部门/人员选择强制使用 `DepartmentSelect` / `UserSelect` | 避免页面各自复制临时 Select 和静态缓存 |
| D-10 | 字段权限使用 `field_permissions` 体系 | 支持按角色、字段、场景控制可见/只读/隐藏/脱敏 |
| D-11 | API 调用统一走 `services/request.ts` | 保持鉴权、错误、分页处理一致 |
| D-12 | 不引入 shadcn/Tailwind/飞书 SDK | 避免破坏当前 Ant Design 独立 Web 应用体系 |

---

## 15. 常用命令速查

### 15.1 后端

```bash
cd backend
npm run start:dev
npm run build
npm run test
npm run test:e2e
npm run lint
npm run migration:generate
npm run migration:create
npm run migration:run
npm run migration:revert
npm run seed
```

### 15.2 前端

```bash
cd frontend
npm run dev
npm run build
npm run test
npm run test:watch
npm run coverage
npm run e2e
npm run e2e:headed
npm run lint
```

### 15.3 全栈容器

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

---

## 16. 最终合规承诺

任何 AI 或开发者修改本项目时，必须承诺：

1. 我会先阅读并遵守 `CLAUDE.md`。
2. 我不会自建本地组织架构同步逻辑。
3. 我会强制使用 `DepartmentSelect` 和 `UserSelect` 处理部门/人员选择。
4. 我不会绕过 `user_roles`、`routeVisibility.ts`、`roles.ts`、字段权限和后端鉴权体系。
5. 我不会引入未经批准的新框架、新 UI 库、新状态库、新 ORM 或新权限体系。
6. 我会在每次被纠正后，把错误模式和预防规则更新到本文件。
