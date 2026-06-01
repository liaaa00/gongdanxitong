import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Card, Select, App, Tag, Alert, Button, Popconfirm, Space } from 'antd';
import { SaveOutlined, RollbackOutlined } from '@ant-design/icons';
import request from '@/services/request';
import { isMockMode, mockDelay } from '@/services/mock';
import { getRoles, type RoleItem } from '@/services/roles';
import { getFields, type FieldConfigItem } from '@/services/fields';
import { useAuth } from '@/hooks/useAuth';
import { canonicalRoleCode } from '@/constants/roles';

// 后端 enum: visible | readonly | masked | hidden
// 前端"可编辑" = visible（可见且可写），"仅可见" = readonly（可见只读）
type PermissionValue = 'visible' | 'readonly' | 'masked' | 'hidden' | 'editable';
type PermissionSelectValue = '可编辑' | '只读' | '隐藏';

const PERMISSION_OPTIONS: { label: PermissionSelectValue; value: PermissionSelectValue; color: string }[] = [
  { label: '可编辑', value: '可编辑', color: 'green' },
  { label: '只读', value: '只读', color: 'default' },
  { label: '隐藏', value: '隐藏', color: 'red' },
];

// 提交到后端时把 editable 归一为 visible
const toBackendPermission = (v: PermissionValue): 'visible' | 'readonly' | 'masked' | 'hidden' => {
  if (v === 'editable') return 'visible';
  return v;
};

// ★ 从后端 permission 反解为前端展示值
// 后端: visible=可写可见, readonly=只读, masked=脱敏, hidden=隐藏
// 前端 Select: editable=可编辑, readonly=仅可见, masked=脱敏, hidden=隐藏
const fromBackendPermission = (raw: string | undefined | null): PermissionValue => {
  if (!raw) return 'hidden';
  if (raw === 'visible') return 'editable';   // 后端 visible → 前端 editable（可编辑）
  if (raw === 'readonly') return 'readonly';   // 后端 readonly → 前端 readonly（仅可见）
  if (raw === 'masked' || raw === 'hidden') return raw as PermissionValue;
  // 如果已经是前端值 'editable'，直接返回
  if (raw === 'editable') return 'editable';
  return 'hidden';
};

interface MatrixRole { id: string; code: string; name: string }
interface MatrixField { field_code: string; field_name: string; source_category?: string | null; sub_ticket_scope?: string | null; collection_group?: string | null }
interface MatrixCell { field_code: string; permission: PermissionValue }
interface MatrixRow { role_id: string; role_name: string; cells: MatrixCell[] }
interface MatrixResp {
  roles: MatrixRole[];
  fields: MatrixField[];
  matrix: MatrixRow[];
  scenarios: string[];
}

const PERM_TAG: Record<string, { color: string; label: string }> = {
  editable: { color: 'green', label: '可编辑' },
  visible: { color: 'green', label: '可编辑' },
  hidden: { color: 'red', label: '隐藏' },
  masked: { color: 'orange', label: '脱敏' },
  readonly: { color: 'default', label: '只读' },
  可编辑: { color: 'green', label: '可编辑' },
  只读: { color: 'default', label: '只读' },
  隐藏: { color: 'red', label: '隐藏' },
};

const toSelectPermission = (v: PermissionValue): PermissionSelectValue => {
  const normalized = fromBackendPermission(v);
  if (normalized === 'editable' || normalized === 'visible') return '可编辑';
  if (normalized === 'readonly') return '只读';
  return '隐藏';
};

const fromSelectPermission = (v: PermissionSelectValue): PermissionValue => {
  if (v === '可编辑') return 'editable';
  if (v === '只读') return 'readonly';
  return 'hidden';
};

const SOURCE_LABEL: Record<string, string> = {
  customer_filled: '客户填写',
  agent_supplemented: '业务员填写',
  process_judgment: '系统判断',
};

const SCOPE_LABEL: Record<string, string> = {
  all: '全局',
  data_entry: '数据录入',
  onboarding_contact: '入职联系',
  contract: '劳动合同签订',
  social_insurance: '社保公积金办理',
};

// 情境列表：按工单发起（三大模块）+ 子工单拆分维度
const DEFAULT_SCENARIOS = [
  // 三大模块的新建工单
  'create:onboarding',                // 新建-入职管理
  'create:in_service',                // 新建-在职管理
  'create:resignation',               // 新建-离职管理
  // 入职管理 子工单
  'dispatched:data_entry',            // 数据录入
  'dispatched:social_insurance',      // 社保公积金办理
  'dispatched:onboarding_contact',    // 入职联系
  'dispatched:contract',              // 劳动合同签订
  // 在职管理 子工单
  'dispatched:renewal_contract',      // 续签合同
  'dispatched:benefit',               // 待遇申报
  // 离职管理 子工单
  'dispatched:resignation_contact',   // 离职联系
  'dispatched:resignation_cert',      // 离职证明
  'dispatched:data_entry_resign',     // 社保停保
];

// 兼容旧 main 场景显示
const SCENARIO_LABEL: Record<string, string> = {
  'main': '新建工单（旧）',
  'create:onboarding': '发起入职工单时',
  'create:in_service': '发起在职工单时',
  'create:resignation': '发起离职工单时',
  'dispatched:data_entry': '办理数据录入时',
  'dispatched:social_insurance': '办理社保公积金时',
  'dispatched:onboarding_contact': '办理入职联系时',
  'dispatched:contract': '办理劳动合同签订时',
  'dispatched:renewal_contract': '办理续签合同时',
  'dispatched:benefit': '办理待遇申报时',
  'dispatched:resignation_contact': '办理离职联系时',
  'dispatched:resignation_cert': '办理离职证明时',
  'dispatched:data_entry_resign': '办理社保停保时',
};

/**
 * 默认权限规则：基于角色 code + 场景，返回字段权限
 * ★ 业务负责人 (business_owner) 对所有场景仅为 visible（只读）
 * ★ 业务组长 (business_group_leader) 对主工单为 editable
 * ★ 业务员 (business_group_member) 对主工单为 editable（自己的数据）
 * ★ 模块专员对其对应模块为 editable
 */
function defaultPermission(roleCodeRaw: string, scenario: string, fieldCode: string): 'editable' | 'readonly' | 'hidden' {
  // ★ 统一规范化角色代码：兼容后端旧代码（biz_manager 等）和前端新代码（business_owner 等）
  const roleCode = canonicalRoleCode(roleCodeRaw);
  // 系统管理员 全局可编辑
  if (roleCode === 'admin') return 'editable';
  // 业务负责人 全局只读
  if (roleCode === 'business_owner') return 'readonly';

  // 新建工单（三大模块）/ 兼容旧 main
  if (scenario === 'main' || scenario.startsWith('create:')) {
    if (roleCode === 'business_group_leader') return 'editable';
    if (roleCode === 'business_group_member') return 'editable';
    return 'readonly';
  }

  const modulePart = scenario.startsWith('dispatched:') ? scenario.slice('dispatched:'.length) : '';

  // 数据录入模块 → 数据录入组长
  if ((modulePart === 'data_entry' || modulePart === 'social_insurance') && roleCode === 'data_entry_leader') return 'editable';
  // 劳动合同相关 → 合同专员、共享团队负责人
  if ((modulePart === 'contract' || modulePart === 'renewal_contract' || modulePart === 'benefit') && roleCode === 'labor_contract_member') return 'editable';
  if ((modulePart === 'contract' || modulePart === 'renewal_contract') && roleCode === 'shared_team_owner') return 'editable';
  // 入离职联系 → 入离职联系专员
  if ((modulePart === 'onboarding_contact' || modulePart === 'resignation_contact' || modulePart === 'resignation_cert') && roleCode === 'onboarding_resignation_member') return 'editable';
  // 共享团队负责人对其所有模块可编辑
  if ((modulePart === 'contract' || modulePart === 'onboarding_contact' || modulePart === 'resignation_contact' || modulePart === 'resignation_cert') && roleCode === 'shared_team_owner') return 'editable';

  // 核心字段（客户名称、姓名、身份证号）对所有角色至少可见
  const coreFields = ['customer_name', 'employee_name', 'id_card_no', 'customer_code'];
  if (coreFields.includes(fieldCode)) return 'readonly';

  return 'hidden';
}

async function loadMockMatrix(scenario: string): Promise<MatrixResp> {
  const [rolesResult, fieldsResult] = await Promise.all([getRoles(), getFields()]);
  const roles: RoleItem[] = Array.isArray(rolesResult) ? rolesResult : (rolesResult as any)?.list || [];
  const fields: FieldConfigItem[] = Array.isArray(fieldsResult) ? fieldsResult : (fieldsResult as any)?.list || [];
  const activeRoles = roles.filter((r: RoleItem) => r.is_active);
  const activeFields = fields.filter((f: FieldConfigItem) => f.is_active);
  const matrix: MatrixRow[] = activeRoles.map((r: RoleItem) => ({
    role_id: r.id, role_name: r.name,
    cells: activeFields.map((f: FieldConfigItem) => ({
      field_code: f.field_code,
      permission: defaultPermission(r.code, scenario, f.field_code),
    })),
  }));
  return mockDelay({
    roles: activeRoles.map((r: RoleItem) => ({ id: r.id, code: r.code, name: r.name })),
    fields: activeFields.map((f: FieldConfigItem) => ({
      field_code: f.field_code, field_name: f.field_name,
      source_category: f.source_category, sub_ticket_scope: f.sub_ticket_scope, collection_group: f.collection_group,
    })),
    matrix,
    scenarios: DEFAULT_SCENARIOS,
  });
}

type DirtyKey = string; // `${roleId}__${fieldCode}`
const dirtyKey = (roleId: string, fieldCode: string) => `${roleId}__${fieldCode}`;

const AdminFieldPermissions: React.FC = () => {
  const { message } = App.useApp();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const currentRoleCode = useMemo(
    () => canonicalRoleCode(user?.roles?.[0]?.code || (isAdmin ? 'admin' : '')),
    [isAdmin, user?.roles],
  );
  const [scenario, setScenario] = useState<string>('create:onboarding');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>('');
  const [data, setData] = useState<MatrixResp | null>(null);
  const [loading, setLoading] = useState(false);
  // 待保存的编辑：key = roleId__fieldCode -> 新权限
  const [dirty, setDirty] = useState<Record<DirtyKey, PermissionValue>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (isMockMode) {
        setData(await loadMockMatrix(scenario));
      } else {
        const [res, rolesResult, fieldsResult] = await Promise.all([
          request.get('/admin/field-permissions/matrix') as Promise<any>,
          getRoles(),
          getFields(),
        ]);
        const rolesList: RoleItem[] = Array.isArray(rolesResult) ? rolesResult : ((rolesResult as any)?.list || []);
        const fieldsList: FieldConfigItem[] = Array.isArray(fieldsResult) ? fieldsResult : ((fieldsResult as any)?.list || []);
        const activeRoles = rolesList.filter((r) => r.is_active);
        const activeFields = fieldsList.filter((f) => f.is_active);
        const backendMatrix = (res?.matrix || {}) as Record<string, Record<string, Record<string, string>>>;
        const backendScenarios: string[] = Array.isArray(res?.scenarios) && res.scenarios.length > 0
          ? res.scenarios
          : DEFAULT_SCENARIOS;
        const matrix: MatrixRow[] = activeRoles.map((r) => ({
          role_id: r.id,
          role_name: r.name,
          cells: activeFields.map((f) => {
            const rawBackend = backendMatrix?.[r.id]?.[scenario]?.[f.field_code];
            const hasBackendData = rawBackend !== undefined && rawBackend !== null && rawBackend !== '';
            const raw = fromBackendPermission(rawBackend as string);
            const fallback = defaultPermission(r.code, scenario, f.field_code);
            // 有后端数据用转换后的值，无后端数据用默认规则
            return { field_code: f.field_code, permission: hasBackendData ? raw : fallback };
          }),
        }));
        const normalizedData: MatrixResp = {
          roles: activeRoles.map((r) => ({ id: r.id, code: r.code, name: r.name })),
          fields: activeFields.map((f) => ({
            field_code: f.field_code,
            field_name: f.field_name,
            source_category: f.source_category,
            sub_ticket_scope: f.sub_ticket_scope,
            collection_group: f.collection_group,
          })),
          matrix,
          scenarios: backendScenarios,
        };
        setData(normalizedData);
      }
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); setDirty({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scenario]);

  useEffect(() => {
    if (!data?.roles?.length) return;
    if (selectedRoleCode && data.roles.some((role) => canonicalRoleCode(role.code) === selectedRoleCode)) return;
    const fallback = currentRoleCode || canonicalRoleCode(data.roles[0].code);
    setSelectedRoleCode(fallback);
  }, [currentRoleCode, data?.roles, selectedRoleCode]);

  const visibleRoles = useMemo(() => {
    const roles = data?.roles || [];
    if (!selectedRoleCode) return roles;
    return roles.filter((role) => canonicalRoleCode(role.code) === selectedRoleCode);
  }, [data?.roles, selectedRoleCode]);

  const roleOptions = useMemo(() => (data?.roles || []).map((role) => ({
    label: `${role.name}（${canonicalRoleCode(role.code)}）`,
    value: canonicalRoleCode(role.code),
  })), [data?.roles]);

  const dirtyCount = Object.keys(dirty).length;

  const setCell = (roleId: string, fieldCode: string, perm: PermissionValue, original: PermissionValue) => {
    setDirty((prev) => {
      const next = { ...prev };
      const k = dirtyKey(roleId, fieldCode);
      const prevValue = prev[k] ?? fromBackendPermission(original);
      const hasChange = toBackendPermission(perm) !== toBackendPermission(original);
      // 按 QA 要求保留调试日志：用于确认 Select onChange 已进入、前后值和 diff 是否成立。
      console.log('[字段权限] 单元格变更', {
        roleId,
        fieldCode,
        prev: prevValue,
        next: perm,
        original,
        hasChange,
      });
      if (!hasChange) {
        delete next[k];
      } else {
        next[k] = perm;
      }
      return next;
    });
  };

  const resetDirty = () => setDirty({});

  const saveAll = async () => {
    if (dirtyCount === 0) return;
    const items = Object.entries(dirty).map(([k, permission]) => {
      const [roleId, fieldCode] = k.split('__');
      return { roleId, scenario, fieldCode, permission: toBackendPermission(permission) };
    });
    setSaving(true);
    try {
      if (isMockMode) {
        await mockDelay(undefined);
      } else {
        await request.post('/admin/field-permissions/batch', { items });
      }
      message.success(`已保存 ${items.length} 条权限变更`);
      setDirty({});
      await load();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = data ? [
    {
      title: '字段',
      dataIndex: 'field_name',
      width: 180,
      fixed: 'left' as const,
      render: (_: unknown, record: any) => {
        if (!record) return null;
        const sourceTag = SOURCE_LABEL[record.source_category];
        return (
          <span>
            {record.field_name}
            {sourceTag && <Tag style={{ marginLeft: 4 }} color="default">{sourceTag}</Tag>}
            <br />
            <small style={{ color: '#999', fontSize: 11 }}>{record.field_code}</small>
          </span>
        );
      },
    },
    { title: '谁来填写', dataIndex: 'source_category', width: 100,
      render: (v: string) => v ? <Tag>{SOURCE_LABEL[v] || v}</Tag> : '—' },
    { title: '显示环节', dataIndex: 'sub_ticket_scope', width: 100,
      render: (v: string) => v ? <Tag>{SCOPE_LABEL[v] || v}</Tag> : '—' },
    ...visibleRoles.map((r) => ({
      title: (
        <span>
          {r.name}
          <br />
          <small style={{ color: '#999', fontSize: 11 }}>{r.code}</small>
        </span>
      ),
      dataIndex: r.id,
      width: 130,
      render: (v: string, record: any) => {
        const original = fromBackendPermission(v || 'hidden');
        const k = dirtyKey(r.id, record.field_code);
        const current = (dirty[k] ?? original) as PermissionValue;
        const isDirty = k in dirty;
        if (!isAdmin) {
          const readonlyCfg = PERM_TAG[fromBackendPermission(current)] || { color: 'default', label: '—' };
          return <Tag color={readonlyCfg.color}>{readonlyCfg.label}</Tag>;
        }
        // ★ 兜底归一：表格状态始终使用前端枚举，显示始终使用中文，避免 visible/edit/hidden 英文泄漏。
        const normalizedCurrent = fromBackendPermission(current);
        const currentCfg = PERM_TAG[normalizedCurrent] || { color: 'default', label: '隐藏' };
        return (
          <Select
            size="small"
            value={toSelectPermission(normalizedCurrent)}
            onChange={(value) => setCell(r.id, record.field_code, fromSelectPermission(value as PermissionSelectValue), original)}
            // Select 内部值也使用中文，避免 Antd 隐藏 aria-live 节点泄漏 editable/readonly/hidden。
            labelRender={(props) => {
              const cfg = PERM_TAG[String(props.value)] || { color: 'default', label: '隐藏' };
              return <Tag color={cfg.color} style={{ marginRight: 0 }}>{cfg.label}</Tag>;
            }}
            optionLabelProp="label"
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            options={PERMISSION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              color: o.color,
            }))}
            optionRender={(option) => (
              <Tag color={(option.data as { color?: string }).color} style={{ marginRight: 0 }}>
                {String(option.label)}
              </Tag>
            )}
            style={{ width: 110, ...(isDirty ? { boxShadow: '0 0 0 2px #ffe58f' } : {}) }}
          />
        );
      },
    })),
  ] : [];

  const selectedRoleName = useMemo(() => {
    const hit = data?.roles?.find((role) => canonicalRoleCode(role.code) === selectedRoleCode);
    return hit ? `${hit.name}（${canonicalRoleCode(hit.code)}）` : '当前角色';
  }, [data?.roles, selectedRoleCode]);

  const rowData = data ? (Array.isArray(data.fields) ? data.fields : []).filter((f: any) => {
    if (sourceFilter && f.source_category !== sourceFilter) return false;
    if (scopeFilter && f.sub_ticket_scope !== scopeFilter) return false;
    return true;
  }).map((f: any) => {
    const row: Record<string, string> = {
      key: f.field_code,
      field_name: f.field_name,
      field_code: f.field_code,
      source_category: f.source_category || '',
      sub_ticket_scope: f.sub_ticket_scope || '',
    };
    const roles = visibleRoles;
    const matrix = Array.isArray(data.matrix) ? data.matrix : [];
    roles.forEach((role) => {
      const cell = matrix.find((m) => m.role_id === role.id)?.cells.find((c) => c.field_code === f.field_code);
      row[role.id] = cell?.permission || 'hidden';
    });
    return row;
  }) : [];

  return (
    <PageContainer header={{ title: '字段填写权限' }} extra={[
      <Select
        key="role"
        style={{ width: 240 }}
        value={selectedRoleCode}
        onChange={setSelectedRoleCode}
        placeholder="选择角色"
        options={roleOptions}
        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
      />,
      <Select key="sc" style={{ width: 240 }} value={scenario} onChange={setScenario}
        placeholder="选择填写场景"
        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
        options={(data?.scenarios || DEFAULT_SCENARIOS).map((s) => ({
          label: SCENARIO_LABEL[s] || s,
          value: s,
        }))} />,
      isAdmin && (
        <Popconfirm
          key="reset"
          title={`放弃 ${dirtyCount} 处未保存的修改？`}
          disabled={dirtyCount === 0}
          onConfirm={resetDirty}
        >
          <Button icon={<RollbackOutlined />} disabled={dirtyCount === 0}>放弃修改</Button>
        </Popconfirm>
      ),
      isAdmin && (
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={dirtyCount === 0}
          onClick={saveAll}
        >
          保存{dirtyCount > 0 ? `（${dirtyCount}）` : ''}
        </Button>
      ),
    ]}>
      <Alert
        style={{ marginBottom: 12 }}
        showIcon
        type={isAdmin ? 'info' : 'warning'}
        message={
          <span>
            当前查看：{selectedRoleName}。选择上方“填写场景”，再设置该角色对每个字段是 <Tag color="green">可编辑</Tag><Tag>只读</Tag><Tag color="red">隐藏</Tag>。
            {isAdmin ? ' 修改后点击右上角保存。' : ' 当前账号仅可查看。'}
          </span>
        }
      />
      <Card
        extra={
          <Space>
            <Select
              style={{ width: 140 }}
              value={sourceFilter}
              onChange={setSourceFilter}
              allowClear
              placeholder="谁来填写"
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
              options={[
                { label: '客户填写', value: 'customer_filled' },
                { label: '业务员填写', value: 'agent_supplemented' },
                { label: '系统判断', value: 'process_judgment' },
              ]}
            />
            <Select
              style={{ width: 140 }}
              value={scopeFilter}
              onChange={setScopeFilter}
              allowClear
              placeholder="显示环节"
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
              options={[
                { label: '所有环节', value: 'all' },
                { label: '数据录入', value: 'data_entry' },
                { label: '入职联系', value: 'onboarding_contact' },
                { label: '劳动合同签订', value: 'contract' },
              ]}
            />
          </Space>
        }
      >
        <Table rowKey="key" loading={loading} columns={columns} dataSource={rowData}
          pagination={{ pageSize: 50 }} scroll={{ x: 'max-content' }} />
      </Card>
    </PageContainer>
  );
};

export default AdminFieldPermissions;
