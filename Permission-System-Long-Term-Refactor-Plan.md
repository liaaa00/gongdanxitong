# 权限系统长期重构实施计划

> 制定日期：2026-08-02  
> 制定人：系统架构专家  
> 目标：实现权限即服务(PaaS) + 基于RBAC的统一权限引擎  
> 总工期：约3-4个月（可分阶段交付）

---

## 执行摘要

**核心目标：** 从当前分散的权限配置（8个配置点、9600+配置项）重构为统一的权限即服务架构，实现配置可视化、热更新、零停机部署。

**关键策略：**
- ✅ **增量迁移**：新功能使用新架构，旧功能逐步迁移
- ✅ **双轨运行**：新旧系统并行，确保回滚安全
- ✅ **每周交付**：每个里程碑可独立验收
- ✅ **零业务中断**：所有变更对用户透明

**预期收益：**
- 权限配置时间从 **30分钟降至5分钟**（-83%）
- 配置错误率从 **20%降至0%**（-100%）
- 生产环境支持 **热更新**（当前需重启）
- 权限变更可 **审计追溯**

---

## 阶段划分与里程碑

### 📋 总体时间线

```
Week 1-2:  Phase 1 - 统一权限配置模型
Week 3-4:  Phase 2 - 权限配置中心开发
Week 5-6:  Phase 3 - 权限管理后台UI
Week 7-8:  Phase 4 - 前端迁移到配置中心
Week 9-10: Phase 5 - 后端迁移到配置中心
Week 11-12: Phase 6 - RBAC引擎实现
Week 13-14: Phase 7 - 权限即服务独立部署
Week 15-16: Phase 8 - 全量迁移与灰度发布
```

---

## Phase 1: 统一权限配置模型 (Week 1-2)

### 1.1 目标
设计统一的权限配置数据模型，支持路由权限、操作权限、字段权限的完整表达。

### 1.2 交付物
- [ ] 权限配置JSON Schema定义
- [ ] 数据库表设计（permission_configs表）
- [ ] TypeScript类型定义
- [ ] 单元测试

### 1.3 详细任务

#### 任务1.1: 设计权限配置Schema
```json
// config/permission-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "roles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "code": { "type": "string" },
          "name": { "type": "string" },
          "canonicalCode": { "type": "string" },
          "isActive": { "type": "boolean" },
          "description": { "type": "string" }
        },
        "required": ["id", "code", "name", "canonicalCode", "isActive"]
      }
    },
    "routePermissions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "allowedRoles": { "type": "array", "items": { "type": "string" } },
          "backendActions": { "type": "array", "items": { "type": "string" } },
          "menu": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "icon": { "type": "string" },
              "order": { "type": "number" },
              "hidden": { "type": "boolean" }
            }
          }
        },
        "required": ["path", "allowedRoles"]
      }
    },
    "fieldPermissions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "scenario": { "type": "string" },
          "roleFieldRules": {
            "type": "object",
            "additionalProperties": {
              "type": "object",
              "additionalProperties": {
                "enum": ["visible", "hidden", "readonly", "masked"]
              }
            }
          }
        },
        "required": ["scenario", "roleFieldRules"]
      }
    }
  },
  "required": ["version", "roles", "routePermissions", "fieldPermissions"]
}
```

#### 任务1.2: 数据库表设计
```sql
-- 权限配置版本表
CREATE TABLE permission_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  description TEXT
);

-- 权限变更审计表
CREATE TABLE permission_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES permission_config_versions(id),
  change_type VARCHAR(50), -- create_role / update_route / update_field
  target_resource VARCHAR(200),
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX idx_perm_logs_version ON permission_change_logs(version_id);
CREATE INDEX idx_perm_logs_time ON permission_change_logs(changed_at DESC);
```

#### 任务1.3: TypeScript类型定义
```typescript
// backend/src/modules/permission-center/types/permission-config.ts
export interface PermissionConfig {
  version: string;
  roles: RoleDefinition[];
  routePermissions: RoutePermission[];
  fieldPermissions: FieldPermissionRule[];
}

export interface RoleDefinition {
  id: string;
  code: string;
  name: string;
  canonicalCode: string;
  isActive: boolean;
  description?: string;
}

export interface RoutePermission {
  path: string;
  allowedRoles: string[];
  backendActions: string[];
  menu?: {
    title: string;
    icon?: string;
    order?: number;
    hidden?: boolean;
  };
}

export interface FieldPermissionRule {
  scenario: string;
  roleFieldRules: Record<string, Record<string, FieldViewMode>>;
}

export type FieldViewMode = 'visible' | 'hidden' | 'readonly' | 'masked';
```

### 1.4 验收标准
- ✅ JSON Schema通过 ajv 校验器测试
- ✅ 数据库表创建成功，包含索引
- ✅ TypeScript类型编译通过
- ✅ 单元测试覆盖率 >80%

### 1.5 回滚方案
此阶段仅创建表和类型，不影响现有功能。可直接删除表回滚。

---

## Phase 2: 权限配置中心开发 (Week 3-4)

### 2.1 目标
开发权限配置中心后端服务，支持配置的CRUD、版本管理、热更新通知。

### 2.2 交付物
- [ ] PermissionCenterModule（NestJS模块）
- [ ] 配置查询API
- [ ] 配置更新API
- [ ] 版本管理API
- [ ] WebSocket配置变更通知
- [ ] 单元测试 + E2E测试

### 2.3 详细任务

#### 任务2.1: 创建PermissionCenterModule
```typescript
// backend/src/modules/permission-center/permission-center.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionConfigVersion,
      PermissionChangeLog,
    ]),
  ],
  controllers: [PermissionCenterController],
  providers: [
    PermissionCenterService,
    PermissionCacheService,
    PermissionNotificationGateway,
  ],
  exports: [PermissionCenterService],
})
export class PermissionCenterModule {}
```

#### 任务2.2: 配置查询服务
```typescript
// backend/src/modules/permission-center/permission-center.service.ts
@Injectable()
export class PermissionCenterService {
  constructor(
    @InjectRepository(PermissionConfigVersion)
    private configRepo: Repository<PermissionConfigVersion>,
    private cache: PermissionCacheService,
  ) {}

  // 获取当前激活的配置
  async getActiveConfig(): Promise<PermissionConfig> {
    const cached = await this.cache.get('active_config');
    if (cached) return cached;

    const active = await this.configRepo.findOne({
      where: { is_active: true },
      order: { activated_at: 'DESC' },
    });

    if (!active) {
      throw new NotFoundException('No active permission config');
    }

    await this.cache.set('active_config', active.config, 3600);
    return active.config as PermissionConfig;
  }

  // 按角色查询路由权限
  async getRoutePermissionsForRole(roleCode: string): Promise<string[]> {
    const config = await this.getActiveConfig();
    return config.routePermissions
      .filter(rp => rp.allowedRoles.includes(roleCode))
      .map(rp => rp.path);
  }

  // 按场景和角色查询字段权限
  async getFieldPermissionsForRole(
    scenario: string,
    roleCode: string,
  ): Promise<Record<string, FieldViewMode>> {
    const config = await this.getActiveConfig();
    const rule = config.fieldPermissions.find(fp => fp.scenario === scenario);
    return rule?.roleFieldRules[roleCode] || {};
  }
}
```

#### 任务2.3: 配置更新API
```typescript
// backend/src/modules/permission-center/permission-center.controller.ts
@Controller('api/permission-center')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionCenterController {
  constructor(
    private service: PermissionCenterService,
    private notifier: PermissionNotificationGateway,
  ) {}

  @Get('config')
  @Roles(['admin'])
  async getActiveConfig() {
    return this.service.getActiveConfig();
  }

  @Post('config')
  @Roles(['admin'])
  async createConfigVersion(
    @Body() dto: CreatePermissionConfigDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    // 1. 校验JSON Schema
    // 2. 创建新版本（is_active=false）
    // 3. 记录变更日志
    // 4. 返回新版本ID
  }

  @Post('config/:versionId/activate')
  @Roles(['admin'])
  async activateConfig(
    @Param('versionId') versionId: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    // 1. 停用旧版本
    // 2. 激活新版本
    // 3. 清除缓存
    // 4. 通过WebSocket广播配置变更
    await this.notifier.broadcastConfigUpdate(versionId);
  }
}
```

#### 任务2.4: WebSocket配置变更通知
```typescript
// backend/src/modules/permission-center/permission-notification.gateway.ts
@WebSocketGateway({ namespace: '/permission-updates' })
export class PermissionNotificationGateway {
  @WebSocketServer() server: Server;

  async broadcastConfigUpdate(versionId: string) {
    this.server.emit('config-updated', {
      versionId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 2.4 验收标准
- ✅ API返回正确的权限配置
- ✅ 配置更新成功触发WebSocket通知
- ✅ 缓存机制有效（Redis命中率>90%）
- ✅ E2E测试通过

### 2.5 回滚方案
保留旧的权限配置代码（routeVisibility.ts等），新API仅供查询，不影响现有判断逻辑。

---

## Phase 3: 权限管理后台UI (Week 5-6)

### 3.1 目标
开发可视化的权限管理界面，支持角色管理、路由权限编辑、字段权限三维表格编辑。

### 3.2 交付物
- [ ] 权限管理页面（React组件）
- [ ] 角色管理CRUD界面
- [ ] 路由权限矩阵编辑器
- [ ] 字段权限三维表格编辑器
- [ ] 配置版本历史查看
- [ ] 配置预览与对比
- [ ] E2E测试

### 3.3 详细任务

#### 任务3.1: 角色管理页面
```tsx
// frontend/src/pages/Admin/PermissionCenter/Roles/index.tsx
export default function RoleManagement() {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  
  const columns = [
    { title: '角色代码', dataIndex: 'code' },
    { title: '角色名称', dataIndex: 'name' },
    { title: '规范代码', dataIndex: 'canonicalCode' },
    { title: '状态', dataIndex: 'isActive', render: (v) => v ? '启用' : '停用' },
    { title: '操作', render: (_, record) => (
      <Space>
        <Button onClick={() => handleEdit(record)}>编辑</Button>
        <Button onClick={() => handleToggle(record)}>
          {record.isActive ? '停用' : '启用'}
        </Button>
      </Space>
    )},
  ];

  return (
    <PageContainer title="角色管理">
      <ProTable
        columns={columns}
        dataSource={roles}
        toolBarRender={() => [
          <Button key="add" type="primary" onClick={handleAdd}>
            新增角色
          </Button>
        ]}
      />
    </PageContainer>
  );
}
```

#### 任务3.2: 路由权限矩阵编辑器
```tsx
// frontend/src/pages/Admin/PermissionCenter/RoutePermissions/index.tsx
export default function RoutePermissionMatrix() {
  const [routes, setRoutes] = useState<RoutePermission[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);

  // 渲染角色×路径矩阵
  const matrix = useMemo(() => {
    return routes.map(route => ({
      path: route.path,
      ...roles.reduce((acc, role) => ({
        ...acc,
        [role.code]: route.allowedRoles.includes(role.code),
      }), {}),
    }));
  }, [routes, roles]);

  const handleToggle = (path: string, roleCode: string) => {
    // 切换该路径对该角色的可见性
  };

  return (
    <PageContainer title="路由权限矩阵">
      <Table
        columns={[
          { title: '路由路径', dataIndex: 'path', fixed: 'left', width: 200 },
          ...roles.map(role => ({
            title: role.name,
            dataIndex: role.code,
            width: 100,
            render: (allowed: boolean, record) => (
              <Checkbox
                checked={allowed}
                onChange={() => handleToggle(record.path, role.code)}
              />
            ),
          })),
        ]}
        dataSource={matrix}
        scroll={{ x: 1500 }}
      />
    </PageContainer>
  );
}
```

#### 任务3.3: 字段权限三维表格
```tsx
// frontend/src/pages/Admin/PermissionCenter/FieldPermissions/index.tsx
export default function FieldPermissionEditor() {
  const [scenario, setScenario] = useState('dispatched:contract');
  const [fields, setFields] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [rules, setRules] = useState<Record<string, Record<string, FieldViewMode>>>({});

  const handleChange = (field: string, roleCode: string, mode: FieldViewMode) => {
    // 更新字段权限
  };

  return (
    <PageContainer title="字段权限配置">
      <Select
        value={scenario}
        onChange={setScenario}
        options={SCENARIOS.map(s => ({ label: s, value: s }))}
        style={{ width: 300, marginBottom: 16 }}
      />
      
      <Table
        columns={[
          { title: '字段名称', dataIndex: 'field', fixed: 'left', width: 150 },
          ...roles.map(role => ({
            title: role.name,
            dataIndex: role.code,
            width: 120,
            render: (_, record) => (
              <Select
                value={rules[role.code]?.[record.field] || 'visible'}
                onChange={(mode) => handleChange(record.field, role.code, mode)}
                options={[
                  { label: '可见', value: 'visible' },
                  { label: '隐藏', value: 'hidden' },
                  { label: '只读', value: 'readonly' },
                  { label: '脱敏', value: 'masked' },
                ]}
              />
            ),
          })),
        ]}
        dataSource={fields.map(f => ({ field: f }))}
        scroll={{ x: 1500 }}
      />
    </PageContainer>
  );
}
```

### 3.4 验收标准
- ✅ 所有CRUD操作正常
- ✅ 矩阵编辑实时保存
- ✅ 配置变更有确认弹窗
- ✅ E2E测试覆盖主流程

### 3.5 回滚方案
前端新增页面，不影响现有功能。可直接隐藏路由回滚。

---

## Phase 4-8: 迁移与集成 (Week 7-16)

*(由于篇幅限制，后续阶段将在下一个文档中详细说明)*

### 简要说明

**Phase 4:** 前端迁移到配置中心（路由守卫从API读取）
**Phase 5:** 后端迁移到配置中心（Guard从配置中心查询）
**Phase 6:** RBAC引擎实现（统一权限判断接口）
**Phase 7:** 权限即服务独立部署（微服务化）
**Phase 8:** 全量迁移与灰度发布（清理旧代码）

---

## 风险与缓解措施

### 风险1: 配置中心故障导致全站不可用
**缓解:** 
- 前端启动时缓存权限配置到localStorage
- 后端启动时缓存到内存
- 配置中心宕机时使用缓存兜底

### 风险2: 迁移过程中权限判断不一致
**缓解:**
- 双轨运行期间，新旧系统都执行判断，日志记录差异
- 差异率<1%时才进行切换

### 风险3: 性能下降（API查询替代硬编码）
**缓解:**
- Redis缓存，TTL=1小时
- 启动时预加载到内存
- 性能测试确保响应时间<10ms

### 风险4: 回滚困难
**缓解:**
- 每个Phase独立可回滚
- Git feature分支开发
- 数据库migration可revert
- 配置版本管理支持一键回退

---

## 总预算与资源

| 阶段 | 工期 | 人力 | 风险 | 可回滚性 |
|---|---|---|---|---|
| Phase 1 | 2周 | 1后端 | 低 | ✅ 完全 |
| Phase 2 | 2周 | 1后端 | 中 | ✅ 完全 |
| Phase 3 | 2周 | 1前端 | 低 | ✅ 完全 |
| Phase 4 | 2周 | 1前端 | 中 | ✅ 配置开关 |
| Phase 5 | 2周 | 1后端 | 高 | ✅ 配置开关 |
| Phase 6 | 2周 | 1后端 | 高 | ✅ 双轨运行 |
| Phase 7 | 2周 | 1后端+1运维 | 高 | ⚠️ 需回退部署 |
| Phase 8 | 2周 | 1前端+1后端 | 中 | ⚠️ 需Git回退 |

**总计:** 16周，1-2人并行，可压缩至12周

---

## 下一步行动

### 立即开始（今晚）
1. 创建feature分支: `feature/permission-center-phase1`
2. 实现Permission Config JSON Schema
3. 编写Schema验证单元测试

### 明天验收
- [ ] JSON Schema定义完成
- [ ] 通过ajv校验器测试
- [ ] 数据库表设计文档
- [ ] TypeScript类型定义

### 本周目标
- [ ] 完成Phase 1全部任务
- [ ] 数据库表创建成功
- [ ] 单元测试覆盖率>80%

---

**文档结束**

> 本计划采用增量迁移策略，确保每个阶段可独立交付和回滚。Phase 1-3为基础建设（4-6周），Phase 4-8为迁移与集成（10周）。建议立即启动Phase 1，明天验收初步成果。

