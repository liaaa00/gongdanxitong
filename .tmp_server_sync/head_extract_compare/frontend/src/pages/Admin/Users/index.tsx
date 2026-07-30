import { useRef, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Popconfirm, Modal, Form, Input, Switch, Select, Alert, Drawer, Descriptions, Typography } from 'antd';
import { LockOutlined, StopOutlined, CheckCircleOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { getUsers, resetUserPassword, toggleUserActive, createUser, updateUser, deleteUser, getUserPasswordStatus } from '@/services/users';
import type { UserItem } from '@/services/users';
import { getRoles, flattenRoles } from '@/services/roles';
import type { RoleItem } from '@/services/roles';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import { canonicalRoleCode, ROLE } from '@/constants/roles';
import { ROUTE_VISIBILITY } from '@/config/routeVisibility';

const { Text, Paragraph } = Typography;

// ★ 动态颜色分配：基于组名称 hash，支持任意数量业务组，不写死具体组名
const GROUP_COLORS = ['blue', 'cyan', 'green', 'geekblue', 'purple', 'orange', 'lime', 'volcano', 'magenta', 'gold'];

function getGroupColor(name: string): string {
  if (!name) return 'default';
  // 固定角色组颜色优先
  if (name === '系统管理') return 'gold';
  if (name === '业务团队') return 'purple';
  if (name === '共享团队') return 'magenta';
  // 业务组用 hash 分配颜色
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

const ROLE_NAME_TO_CODE: Record<string, string> = {
  系统管理员: ROLE.ADMIN,
  业务负责人: ROLE.BUSINESS_OWNER,
  业务组长: ROLE.BUSINESS_GROUP_LEADER,
  业务员: ROLE.BUSINESS_GROUP_MEMBER,
  数据录入组长: ROLE.DATA_ENTRY_LEADER,
  共享团队负责人: ROLE.SHARED_TEAM_OWNER,
  合同专员: ROLE.LABOR_CONTRACT_MEMBER,
  入离职联系专员: ROLE.ONBOARDING_RESIGNATION_MEMBER,
  福保负责人: ROLE.SOCIAL_INSURANCE_SPECIALIST,
};

const PREVIEW_ROUTE_PATHS = new Set([
  '/dashboard',
  '/notifications',
  '/work-orders',
  '/my-work/initiated',
  '/my-work/returned',
  '/my-work/pending',
  '/my-work/done',
  '/my-work/team',
  '/my-work/history',
  '/onboarding',
  '/in-service',
  '/offboarding',
  '/admin/users',
  '/admin/roles',
  '/admin/fields',
  '/admin/field-permissions',
  '/admin/dispatch-config',
  '/admin/workflows',
]);

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': '首页/仪表盘',
  '/notifications': '消息通知',
  '/work-orders': '工单列表',
  '/work-orders/create': '新建工单入口',
  '/work-orders/import': '批量导入入口',
  '/my-work/initiated': '我发起的工单',
  '/my-work/returned': '退回待处理',
  '/my-work/pending': '后道待处理',
  '/my-work/done': '后道已办结',
  '/my-work/team': '团队工单池',
  '/my-work/history': '历史工单',
  '/onboarding': '入职管理',
  '/in-service': '在职管理',
  '/offboarding': '离职管理',
  '/admin/users': '用户管理',
  '/admin/roles': '角色管理',
  '/admin/fields': '表单字段管理',
  '/admin/field-permissions': '字段填写权限',
  '/admin/dispatch-config': '派发配置',
  '/admin/workflows': '流程配置',
};

function getRoleCodes(user: UserItem): string[] {
  return Array.from(new Set((user.roles || []).map((role) => {
    const raw = role.role_code || ROLE_NAME_TO_CODE[role.role_name] || role.role_name;
    return canonicalRoleCode(raw);
  }).filter(Boolean)));
}

function getVisibleRouteLabels(user: UserItem): string[] {
  const roleCodes = getRoleCodes(user);
  return Object.entries(ROUTE_VISIBILITY)
    .filter(([path, required]) => PREVIEW_ROUTE_PATHS.has(path) && required.some((role) => roleCodes.includes(role)))
    .map(([path]) => ROUTE_LABELS[path] || path)
    .filter((label, index, list) => list.indexOf(label) === index);
}

function getAbilitySummary(user: UserItem): string[] {
  const roleCodes = getRoleCodes(user);
  const abilities: string[] = [];
  if (roleCodes.includes(ROLE.ADMIN)) abilities.push('系统配置和账号权限管理', '查看全局工单与报表');
  if (roleCodes.includes(ROLE.BUSINESS_OWNER)) abilities.push('查看业务全局数据和报表，不直接办理后道任务');
  if (roleCodes.includes(ROLE.BUSINESS_GROUP_LEADER)) abilities.push('查看本组工单，作为业务员时可发起/修改/撤回');
  if (roleCodes.includes(ROLE.BUSINESS_GROUP_MEMBER)) abilities.push('发起工单、跟踪本人发起工单');
  if (roleCodes.includes(ROLE.DATA_ENTRY_LEADER)) abilities.push('处理增员报岗录入、减员报岗录入相关节点');
  if (roleCodes.includes(ROLE.SHARED_TEAM_OWNER)) abilities.push('处理合同新签/续签、入职联系/离职材料收集授权节点，可查看团队办理情况');
  if (roleCodes.includes(ROLE.LABOR_CONTRACT_MEMBER)) abilities.push('处理劳动合同新签/续签相关节点');
  if (roleCodes.includes(ROLE.ONBOARDING_RESIGNATION_MEMBER)) abilities.push('处理入职联系、离职材料收集节点');
  if (roleCodes.includes(ROLE.SOCIAL_INSURANCE_SPECIALIST)) abilities.push('处理社保公积金增员/减员相关节点');
  return Array.from(new Set(abilities));
}

const AdminUsers: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [previewUser, setPreviewUser] = useState<UserItem | null>(null);
  const [permissionGuideOpen, setPermissionGuideOpen] = useState(false);
  const [form] = Form.useForm();
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);

  const handleResetPassword = async (user: UserItem) => {
    try {
      await resetUserPassword(user.id);
      message.success('密码已重置为默认密码');
    } catch { message.error('重置失败'); }
  };

  const handleToggleActive = async (user: UserItem) => {
    try {
      const result = await toggleUserActive(user.id);
      message.success(result.is_active ? '已启用' : '已禁用');
      actionRef.current?.reload();
    } catch { message.error('操作失败'); }
  };

  const handleDelete = async (user: UserItem) => {
    try { await deleteUser(user.id); message.success('已删除'); actionRef.current?.reload(); }
    catch { message.error('删除失败'); }
  };

  const openCreate = async () => {
    setEditing(null); form.resetFields();
    const result = await getRoles();
    const roles = Array.isArray(result) ? result : (result as any).list || [];
    setRoleOptions(flattenRoles(roles));
    setOpen(true);
  };
  const openEdit = async (u: UserItem) => {
    setEditing(u);
    const result = await getRoles();
    const roles = Array.isArray(result) ? result : (result as any).list || [];
    setRoleOptions(flattenRoles(roles));
    form.setFieldsValue({ ...u, role_ids: u.roles?.map(r => r.role_id) ?? [] });
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields();
    const { role_ids, ...rest } = v;
    const result = await getRoles();
    const allRoles: RoleItem[] = Array.isArray(result) ? result : (result as any).list || [];
    const rolesMap = new Map(allRoles.map((r: RoleItem) => [r.id, r]));
    const roles = (role_ids || []).map((rid: string, index: number) => ({
      role_id: rid,
      role_name: rolesMap.get(rid)?.name || '',
      // 后端要求必须且仅有一个主角色；用户管理当前没有单独主角色选择，默认第一个选中角色为主角色。
      is_primary: index === 0,
      isPrimary: index === 0,
    }));
    const { username, position, password, ...updatableFields } = rest;
    const data = editing
      ? {
          ...updatableFields,
          ...(password ? { password } : {}),
          roles,
        }
      : {
          ...updatableFields,
          username,
          password,
          roles,
        };
    try {
      if (editing) await updateUser(editing.id, data);
      else await createUser(data);
      message.success('保存成功');
      setOpen(false); setEditing(null); form.resetFields();
      actionRef.current?.reload();
    } catch (error: any) {
      // 显示具体的错误信息（如重复性检查的错误）
      const errorMsg = error?.message || '保存失败';
      message.error(errorMsg);
    }
  };

  const columns: ProColumns<UserItem>[] = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120,
      render: (_: unknown, r: UserItem) => (r.username || (r as any).userName || '—') },
    { title: '姓名', dataIndex: 'real_name', key: 'real_name', width: 100,
      render: (_: unknown, r: UserItem) => (r.real_name || (r as any).realName || r.username || '—') },
    { title: '部门/小组', dataIndex: 'group_name', key: 'group_name', width: 110,
      render: (_: unknown, r: UserItem) => {
        const gn = r.group_name || (r as any).groupName || '';
        const dn = r.department_name || '';
        const displayName = gn || dn || '';
        return <Tag color={getGroupColor(displayName)}>{displayName || '—'}</Tag>;
      },
    },
    { title: '岗位', dataIndex: 'position', key: 'position', width: 100,
      render: (_: unknown, r: UserItem) => {
        const pos = r.position || (r as any).jobTitle || (r as any).job_title || '';
        return pos || '—';
      },
    },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 160, ellipsis: true },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: '角色', dataIndex: 'roles', key: 'roles', width: 260, hideInSearch: true,
      render: (_, record) => {
        const roles = Array.isArray(record.roles) ? record.roles : [];
        if (!roles.length) {
          // 兜底：展示 "无角色"，并用 tooltip 提示
          const reason = record.real_name ? '请为该用户分配角色' : '用户数据加载中...';
          return <Tag color="error" title={reason}>无角色</Tag>;
        }
        const roleColors: Record<string, string> = {
          'admin': 'gold', '系统管理员': 'gold',
          'business_owner': 'purple', 'manager': 'purple', '业务负责人': 'purple',
          'business_group_leader': 'blue', 'biz_group': 'blue', '业务组长': 'blue',
          'business_group_member': 'default', 'salesperson': 'default', '业务员': 'default',
          'shared_team_owner': 'magenta', '共享团队负责人': 'magenta',
          'labor_contract_member': 'green', 'contract_team': 'green', '合同专员': 'green',
          'onboarding_resignation_member': 'cyan', 'onboarding_team': 'cyan', '入离职联系专员': 'cyan',
          'data_entry_leader': 'orange', 'data_entry_team': 'orange', '数据录入组长': 'orange',
        };
        return (
          <Space size={[0, 4]} wrap>
            {roles.map((r, idx) => {
              const roleName = r.role_name || (r as any).roleName || (r as any).name || '未知角色';
              const roleCode = r.role_code || (r as any).roleCode || (r as any).code || '';
              const roleId = r.role_id || (r as any).roleId || String(idx);
              const color = roleColors[roleName] || roleColors[roleCode] || 'blue';
              return <Tag key={roleId} color={color} title={roleCode ? `代码: ${roleCode}` : roleName}>{roleName}</Tag>;
            })}
          </Space>
        );
      },
    },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (_: unknown, r: UserItem) => {
        const active = r.is_active === true || r.is_active === ('true' as any) || (r as any).isActive === true;
        return <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>;
      },
    },
    {
      title: '密码', key: 'password_status', width: 90, hideInSearch: true,
      render: (_, r) => {
        const status = getUserPasswordStatus(r.username);
        return status.has_password
          ? <Tag color="green">已设置</Tag>
          : <Tag color="red">未设置</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 260, fixed: 'right', hideInSearch: true,
      render: (_, r) => (
        <Space size={0} wrap style={{ maxWidth: 250, rowGap: 2 }}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setPreviewUser(r)}>权限预览</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" size="small" icon={<LockOutlined />} onClick={() => handleResetPassword(r)}>重置密码</Button>
          <Popconfirm title={r.is_active ? '确定禁用该用户？' : '确定启用该用户？'} onConfirm={() => handleToggleActive(r)}>
            <Button type="link" size="small" danger={r.is_active} icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}>
              {r.is_active ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
          {isAdmin && (
            <Popconfirm title="确定删除该用户？" onConfirm={() => handleDelete(r)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer header={{ title: '用户管理' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="权限按角色和菜单可见性统一控制。可在用户行点击“权限预览”核对该用户能看到哪些菜单、具备哪些操作范围。"
        action={<Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setPermissionGuideOpen(true)}>查看说明</Button>}
      />
      <ProTable<UserItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          try {
            const result = await getUsers(params);
            return { data: result.list, success: true, total: result.total };
          } catch {
            // ★ 后端异常时返回空数据，防止 ProTable 崩溃显示 "Something went wrong"
            return { data: [], success: false, total: 0 };
          }
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="用户列表"
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建用户</Button>,
        ]}
        scroll={{ x: 1160 }}
        size="small"
        tableLayout="fixed"
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        dateFormatter="string"
      />
      <Drawer
        title="角色权限说明"
        open={permissionGuideOpen}
        width={640}
        onClose={() => setPermissionGuideOpen(false)}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph type="secondary">这里保留规则说明，不再占用用户列表首屏空间；具体某个用户请使用“权限预览”。</Paragraph>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={<Tag color="gold">系统管理员</Tag>}>拥有系统最高权限，可管理全部工单和所有系统配置。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="purple">业务负责人</Tag>}>查看业务全局数据、看板和报表，不直接接单/退回/办结后道任务。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="blue">业务组长</Tag>}>查看本组工单；自己作为业务员时可发起、修改、撤回工单。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="default">业务员</Tag>}>只看自己发起的工单，可发起和跟踪本人客户工单。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="magenta">共享团队负责人</Tag>}>处理劳动合同新签/续签、入职联系/离职材料收集等共享团队授权节点，可查看团队办理情况。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="green">合同专员</Tag>}>处理劳动合同新签/续签相关节点。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="cyan">入离职联系专员</Tag>}>处理入职联系、离职材料收集相关节点。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="orange">数据录入组长</Tag>}>处理增员报岗录入、减员报岗录入相关节点。</Descriptions.Item>
            <Descriptions.Item label={<Tag color="blue">福保负责人</Tag>}>处理社保公积金增员/减员相关节点。</Descriptions.Item>
          </Descriptions>
        </Space>
      </Drawer>

      <Drawer
        title="权限预览"
        open={Boolean(previewUser)}
        width={720}
        onClose={() => setPreviewUser(null)}
      >
        {previewUser && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="用户">{previewUser.real_name || previewUser.username}</Descriptions.Item>
              <Descriptions.Item label="账号">{previewUser.username}</Descriptions.Item>
              <Descriptions.Item label="部门/小组">{previewUser.group_name || previewUser.department_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{previewUser.is_active ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>}</Descriptions.Item>
              <Descriptions.Item label="角色">
                <Space wrap>
                  {(previewUser.roles || []).map((role, index) => <Tag key={role.role_id || index}>{role.role_name || role.role_code || '未知角色'}</Tag>)}
                </Space>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>可见菜单/页面</Text>
              <div style={{ marginTop: 8 }}>
                <Space wrap>
                  {getVisibleRouteLabels(previewUser).map((label) => <Tag key={label} color="blue">{label}</Tag>)}
                  {getVisibleRouteLabels(previewUser).length === 0 && <Text type="secondary">暂无可见菜单，请检查角色配置。</Text>}
                </Space>
              </div>
            </div>

            <div>
              <Text strong>主要操作范围</Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" size={4}>
                  {getAbilitySummary(previewUser).map((ability) => <Text key={ability}>• {ability}</Text>)}
                  {getAbilitySummary(previewUser).length === 0 && <Text type="secondary">暂无明确操作范围，请检查角色配置。</Text>}
                </Space>
              </div>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal title={editing ? '编辑用户' : '新建用户'} open={open} onOk={onSave}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
          {!editing && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' }
              ]}
            >
              <Input.Password placeholder="请设置登录密码（至少6位）" />
            </Form.Item>
          )}
          {editing && (
            <Form.Item
              name="password"
              label="修改密码"
              rules={[{ min: 6, message: '新密码至少6位' }]}
              extra="留空则不修改密码"
            >
              <Input.Password placeholder="输入新密码（至少6位，留空不修改）" />
            </Form.Item>
          )}
          <Form.Item name="real_name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="group_name" label="部门/小组"><Input placeholder="如：业务1组、共享团队、系统管理" /></Form.Item>
          <Form.Item name="position" label="岗位"><Input placeholder="如：业务主管、客服专员" /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="手机"><Input /></Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="权限怎么分配？"
            description="给用户选择“业务员（组员）”或“业务组长”，该用户就可以新建工单、批量导入工单，并查看自己/本组工单；选择“业务负责人”则只看报表和列表，不允许新建或操作工单。"
          />
          <Form.Item name="role_ids" label="角色/岗位权限" rules={[{ required: true, message: '请选择至少一个角色' }]}>
            <Select mode="multiple" placeholder="选择用户角色，例如：业务员（组员）" options={roleOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminUsers;
