import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert, App, Badge, Button, Card, Checkbox, Col, Descriptions, Empty, Form, Input,
  Modal, Popconfirm, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag,
  Tooltip, Typography,
} from 'antd';
import {
  CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, DiffOutlined, EditOutlined,
  PlusOutlined, ReloadOutlined, SaveOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import type {
  FieldPermissionRule, FieldViewMode, PermissionConfig, PermissionConfigVersion,
  PermissionRole, RoleLevel, RoutePermission,
} from '@/services/permissionCenter';
import {
  activatePermissionVersion, createPermissionVersion, getActivePermissionConfig,
  getPermissionVersion, getPermissionVersions,
} from '@/services/permissionCenter';

const { Text } = Typography;
const LEVEL_LABEL: Record<RoleLevel, string> = {
  execution: '执行层', supervisor: '主管层', management: '管理层', global: '全局',
};
const FIELD_MODES: Array<{ label: string; value: FieldViewMode; color: string }> = [
  { label: '可见', value: 'visible', color: 'green' },
  { label: '只读', value: 'readonly', color: 'blue' },
  { label: '脱敏', value: 'masked', color: 'orange' },
  { label: '隐藏', value: 'hidden', color: 'red' },
];

const clone = (config: PermissionConfig) => structuredClone(config);
const nextVersion = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : '1.0.0';
};
const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};
const getFields = (rule: FieldPermissionRule) =>
  Array.from(new Set(Object.values(rule.roleFieldRules).flatMap((fields) => Object.keys(fields)))).sort();

const PermissionCenter: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string>();
  const [active, setActive] = useState<PermissionConfig>();
  const [draft, setDraft] = useState<PermissionConfig>();
  const [versions, setVersions] = useState<PermissionConfigVersion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [scenario, setScenario] = useState<string>();
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleIndex, setRoleIndex] = useState<number>();
  const [versionOpen, setVersionOpen] = useState(false);
  const [comparison, setComparison] = useState<PermissionConfigVersion>();
  const [roleForm] = Form.useForm<PermissionRole>();
  const [versionForm] = Form.useForm<{ version: string; description: string }>();

  const load = async () => {
    setLoading(true);
    try {
      const [config, history] = await Promise.all([getActivePermissionConfig(), getPermissionVersions()]);
      setActive(config); setDraft(clone(config)); setVersions(history); setDirty(false);
      setScenario((current) => current || config.fieldPermissions[0]?.scenario);
    } catch { message.error('权限配置加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const change = (updater: (config: PermissionConfig) => PermissionConfig) => {
    setDraft((current) => current ? updater(current) : current); setDirty(true);
  };
  const openRole = (role?: PermissionRole, index?: number) => {
    roleForm.resetFields();
    roleForm.setFieldsValue(role || ({ isActive: true, level: 'execution' } as PermissionRole));
    setRoleIndex(index); setRoleOpen(true);
  };
  const saveRole = async () => {
    const values = await roleForm.validateFields();
    change((current) => {
      const roles = [...current.roles];
      const role = { ...values, id: values.id || crypto.randomUUID(), canonicalCode: values.canonicalCode || values.code };
      if (roleIndex === undefined) roles.push(role); else roles[roleIndex] = role;
      return { ...current, roles };
    });
    setRoleOpen(false);
  };
  const deleteRole = (role: PermissionRole) => change((current) => ({
    ...current,
    roles: current.roles.filter((item) => item.code !== role.code),
    routePermissions: current.routePermissions.map((route) => ({
      ...route,
      allowedRoles: route.allowedRoles.filter((code) => code !== role.code),
    })),
    fieldPermissions: current.fieldPermissions.map((rule) => {
      const roleFieldRules = { ...rule.roleFieldRules };
      delete roleFieldRules[role.code];
      return { ...rule, roleFieldRules };
    }),
  }));
  const updateRoute = (index: number, patch: Partial<RoutePermission>) => change((current) => ({
    ...current,
    routePermissions: current.routePermissions.map((route, i) => i === index ? { ...route, ...patch } : route),
  }));
  const toggleRoute = (index: number, role: string, checked: boolean) => change((current) => ({
    ...current,
    routePermissions: current.routePermissions.map((route, i) => {
      if (i !== index) return route;
      const allowed = new Set(route.allowedRoles);
      checked ? allowed.add(role) : allowed.delete(role);
      return { ...route, allowedRoles: [...allowed] };
    }),
  }));
  const updateField = (field: string, role: string, mode: FieldViewMode) => change((current) => ({
    ...current,
    fieldPermissions: current.fieldPermissions.map((rule) => rule.scenario !== scenario ? rule : {
      ...rule, roleFieldRules: { ...rule.roleFieldRules, [role]: { ...rule.roleFieldRules[role], [field]: mode } },
    }),
  }));
  const openVersion = () => {
    if (!draft) return;
    versionForm.setFieldsValue({ version: nextVersion(draft.version), description: '' }); setVersionOpen(true);
  };
  const saveVersion = async () => {
    if (!draft) return;
    const values = await versionForm.validateFields(); setSaving(true);
    try {
      const config = { ...clone(draft), version: values.version };
      await createPermissionVersion(config, values.description);
      setDraft(config); setVersions(await getPermissionVersions()); setDirty(false); setVersionOpen(false);
      message.success('新版本已保存，激活前不会影响当前权限');
    } catch (error) { message.error(error instanceof Error ? error.message : '版本保存失败'); }
    finally { setSaving(false); }
  };
  const activate = async (version: PermissionConfigVersion) => {
    setActivatingId(version.id);
    try { await activatePermissionVersion(version.id); message.success(`已激活版本 ${version.version}`); await load(); }
    catch { message.error('版本激活失败'); }
    finally { setActivatingId(undefined); }
  };
  const compare = async (version: PermissionConfigVersion) => {
    try { setComparison(version.config ? version : await getPermissionVersion(version.id)); }
    catch { message.error('版本详情加载失败'); }
  };

  const roleColumns = [
    { title: '角色', dataIndex: 'name', render: (_: unknown, role: PermissionRole) => <Space direction="vertical" size={0}><Text strong>{role.name}</Text><Text type="secondary">{role.code}</Text></Space> },
    { title: '规范角色码', dataIndex: 'canonicalCode' },
    { title: '层级', dataIndex: 'level', render: (level?: RoleLevel) => level ? <Tag>{LEVEL_LABEL[level]}</Tag> : '-' },
    { title: '说明', dataIndex: 'description', ellipsis: true, render: (value?: string) => value || '-' },
    { title: '状态', dataIndex: 'isActive', render: (value: boolean) => <Badge status={value ? 'success' : 'default'} text={value ? '启用' : '停用'} /> },
    { title: '操作', render: (_: unknown, role: PermissionRole, index: number) => <Space><Tooltip title="编辑"><Button aria-label={`编辑${role.name}`} icon={<EditOutlined />} onClick={() => openRole(role, index)} /></Tooltip><Popconfirm title={`删除角色“${role.name}”？`} description="该角色的路由和字段权限将从当前草稿一并移除。" onConfirm={() => deleteRole(role)}><Tooltip title="删除"><Button danger aria-label={`删除${role.name}`} icon={<DeleteOutlined />} /></Tooltip></Popconfirm></Space> },
  ];
  const routeColumns = useMemo(() => draft ? [
    { title: '路由', dataIndex: 'path', fixed: 'left' as const, width: 240, render: (value: string, _: RoutePermission, index: number) => <Input value={value} onChange={(event) => updateRoute(index, { path: event.target.value })} /> },
    { title: '菜单名称', width: 170, render: (_: unknown, route: RoutePermission, index: number) => <Input value={route.menu?.title} placeholder="非菜单路由" onChange={(event) => updateRoute(index, { menu: { ...(route.menu || { title: '' }), title: event.target.value } })} /> },
    ...draft.roles.filter((role) => role.isActive).map((role) => ({
      title: <span>{role.name}<br /><Text type="secondary" style={{ fontSize: 11 }}>{role.code}</Text></span>, key: role.code, width: 125, align: 'center' as const,
      render: (_: unknown, route: RoutePermission, index: number) => <Checkbox aria-label={`${route.path}-${role.name}`} checked={route.allowedRoles.includes(role.code)} onChange={(event) => toggleRoute(index, role.code, event.target.checked)} />,
    })),
    { title: '后端权限码', width: 240, render: (_: unknown, route: RoutePermission, index: number) => <Select mode="tags" value={route.backendActions || []} style={{ width: '100%' }} tokenSeparators={[',']} onChange={(backendActions) => updateRoute(index, { backendActions })} /> },
  ] : [], [draft]);
  const fieldRule = draft?.fieldPermissions.find((rule) => rule.scenario === scenario);
  const fieldColumns = useMemo(() => draft && fieldRule ? [
    { title: '字段码', dataIndex: 'field', fixed: 'left' as const, width: 220 },
    ...draft.roles.filter((role) => role.isActive).map((role) => ({
      title: role.name, key: role.code, width: 135,
      render: (_: unknown, row: { field: string }) => <Select aria-label={`${row.field}-${role.name}`} value={fieldRule.roleFieldRules[role.code]?.[row.field] || 'hidden'} style={{ width: 108 }} onChange={(mode) => updateField(row.field, role.code, mode)} options={FIELD_MODES.map((item) => ({ value: item.value, label: <Tag color={item.color}>{item.label}</Tag> }))} />,
    })),
  ] : [], [draft, fieldRule]);
  const versionColumns = [
    { title: '版本', dataIndex: 'version', render: (value: string, row: PermissionConfigVersion) => <Space><Text strong>{value}</Text>{row.isActive && <Tag color="green">当前</Tag>}</Space> },
    { title: '说明', dataIndex: 'description', render: (value?: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', render: formatDate },
    { title: '激活时间', dataIndex: 'activatedAt', render: formatDate },
    { title: '操作', render: (_: unknown, row: PermissionConfigVersion) => <Space><Button icon={<DiffOutlined />} onClick={() => void compare(row)}>对比</Button>{!row.isActive && <Popconfirm title={`激活版本 ${row.version}？`} description="激活后将成为全站当前权限配置。" onConfirm={() => void activate(row)}><Button type="primary" icon={<CloudUploadOutlined />} loading={activatingId === row.id}>激活</Button></Popconfirm>}</Space> },
  ];

  const tabs = draft ? [
    { key: 'roles', label: '角色管理', children: <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openRole()}>新建角色</Button>}><Table rowKey="id" columns={roleColumns} dataSource={draft.roles} pagination={false} scroll={{ x: 900 }} /></Card> },
    { key: 'routes', label: '路由权限', children: <Card extra={<Button icon={<PlusOutlined />} onClick={() => change((current) => ({ ...current, routePermissions: [...current.routePermissions, { path: `/new-route-${current.routePermissions.length + 1}`, allowedRoles: ['admin'] }] }))}>新增路由</Button>}><Table rowKey="path" columns={routeColumns} dataSource={draft.routePermissions} pagination={false} scroll={{ x: 'max-content', y: 540 }} /></Card> },
    { key: 'fields', label: '字段权限', children: <Card extra={<Select style={{ width: 300 }} value={scenario} onChange={setScenario} options={draft.fieldPermissions.map((rule) => ({ value: rule.scenario, label: rule.description ? `${rule.description}（${rule.scenario}）` : rule.scenario }))} />}>{fieldRule ? <Table rowKey="field" columns={fieldColumns} dataSource={getFields(fieldRule).map((field) => ({ field }))} pagination={{ pageSize: 30 }} scroll={{ x: 'max-content', y: 520 }} /> : <Empty description="暂无字段权限场景" />}</Card> },
    { key: 'versions', label: '版本历史', children: <Card><Table rowKey="id" columns={versionColumns} dataSource={versions} pagination={{ pageSize: 10 }} /></Card> },
  ] : [];

  const delta = comparison && active ? {
    roles: comparison.config.roles.length - active.roles.length,
    routes: comparison.config.routePermissions.length - active.routePermissions.length,
    fields: comparison.config.fieldPermissions.length - active.fieldPermissions.length,
  } : undefined;

  return <PageContainer
    header={{ title: '权限配置中心', subTitle: '统一管理角色、路由、字段权限和配置版本' }}
    extra={[
      <Button key="reload" icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading || saving}>重新加载</Button>,
      <Button key="reset" disabled={!dirty || !active} onClick={() => { if (active) { setDraft(clone(active)); setDirty(false); } }}>放弃修改</Button>,
      <Button key="save" type="primary" icon={<SaveOutlined />} disabled={!dirty} onClick={openVersion}>保存为新版本</Button>,
    ]}
    loading={loading}
  >
    {draft && <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="当前版本" value={active?.version || '-'} prefix={<SafetyCertificateOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="角色" value={draft.roles.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="路由规则" value={draft.routePermissions.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="字段场景" value={draft.fieldPermissions.length} /></Card></Col>
      </Row>
      <Alert type={dirty ? 'warning' : 'success'} showIcon icon={dirty ? undefined : <CheckCircleOutlined />} message={dirty ? '当前有未保存修改' : '当前显示已激活配置'} description={dirty ? '修改不会立即生效；保存为新版本后，需在版本历史中确认激活。' : '任何调整都会生成独立版本，可通过历史版本回退。'} style={{ marginBottom: 16 }} />
      <Tabs items={tabs} />
    </>}

    <Modal title={roleIndex === undefined ? '新建角色' : '编辑角色'} open={roleOpen} onOk={() => void saveRole()} onCancel={() => setRoleOpen(false)} destroyOnHidden>
      <Form form={roleForm} layout="vertical">
        <Form.Item name="id" hidden><Input /></Form.Item>
        <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="code" label="角色码" rules={[{ required: true, pattern: /^[a-z][a-z0-9_]*$/, message: '请输入小写字母、数字或下划线' }]}><Input disabled={roleIndex !== undefined} /></Form.Item>
        <Form.Item name="canonicalCode" label="规范角色码"><Input placeholder="默认与角色码一致" /></Form.Item>
        <Form.Item name="level" label="角色层级"><Select options={Object.entries(LEVEL_LABEL).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="description" label="说明"><Input.TextArea rows={3} maxLength={200} showCount /></Form.Item>
        <Form.Item name="isActive" label="启用" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
    <Modal title="保存权限配置版本" open={versionOpen} onOk={() => void saveVersion()} confirmLoading={saving} onCancel={() => setVersionOpen(false)} destroyOnHidden>
      <Alert type="info" showIcon message="新版本保存后仍为未激活状态" style={{ marginBottom: 16 }} />
      <Form form={versionForm} layout="vertical">
        <Form.Item name="version" label="版本号" rules={[{ required: true, pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, message: '例如 1.2.0' }]}><Input /></Form.Item>
        <Form.Item name="description" label="变更说明" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
      </Form>
    </Modal>
    <Modal title={`版本对比${comparison ? `：${comparison.version}` : ''}`} open={Boolean(comparison)} footer={null} width="min(1200px, 96vw)" onCancel={() => setComparison(undefined)} destroyOnHidden>
      {comparison && active && delta && <>
        <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="角色数变化">{delta.roles >= 0 ? '+' : ''}{delta.roles}</Descriptions.Item>
          <Descriptions.Item label="路由数变化">{delta.routes >= 0 ? '+' : ''}{delta.routes}</Descriptions.Item>
          <Descriptions.Item label="字段场景变化">{delta.fields >= 0 ? '+' : ''}{delta.fields}</Descriptions.Item>
        </Descriptions>
        <Row gutter={12}><Col span={12}><Text strong>当前激活版本</Text><pre style={{ maxHeight: 460, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>{JSON.stringify(active, null, 2)}</pre></Col><Col span={12}><Text strong>待对比版本</Text><pre style={{ maxHeight: 460, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>{JSON.stringify(comparison.config, null, 2)}</pre></Col></Row>
      </>}
    </Modal>
  </PageContainer>;
};

export default PermissionCenter;
