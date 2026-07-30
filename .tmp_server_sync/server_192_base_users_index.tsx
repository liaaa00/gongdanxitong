import { useRef, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Popconfirm, Modal, Form, Input, Switch, Select, Segmented, Alert, Drawer, Descriptions, Typography } from 'antd';
import { LockOutlined, LogoutOutlined, UserSwitchOutlined, StopOutlined, CheckCircleOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { executeUserHandover, getUserHandoverPreview, getUsers, resetUserPassword, forceLogoutUser, toggleUserActive, createUser, updateUser, deleteUser, getUserPasswordStatus } from '@/services/users';
import type { UserHandoverPreview, UserItem } from '@/services/users';
import { getRoles, flattenRoles } from '@/services/roles';
import type { RoleItem } from '@/services/roles';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import { canonicalRoleCode, ROLE } from '@/constants/roles';
import { ROUTE_VISIBILITY } from '@/config/routeVisibility';
import { getModuleHandlers } from '@/services/moduleHandlers';

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

const HANDLER_MODULE_LABELS: Record<string, string> = {
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  renewal_contract: '劳动合同续签',
  resignation_contact: '离职材料收集',
  data_entry_resign: '减员报岗录入',
  social_insurance_resign: '社保公积金减员',
  resignation_social_insurance: '社保公积金减员',
};

function getRoleContributions(user: UserItem) {
  return (user.roles || []).map((role, index) => {
    const singleRoleUser = { ...user, roles: [role] };
    return {
      key: role.role_id || role.role_code || `${role.role_name}-${index}`,
      name: role.role_name || role.role_code || '未知角色',
      routes: getVisibleRouteLabels(singleRoleUser),
      abilities: getAbilitySummary(singleRoleUser),
    };
  });
}

const AdminUsers: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [previewUser, setPreviewUser] = useState<UserItem | null>(null);
  const [previewHandlerModules, setPreviewHandlerModules] = useState<string[]>([]);
  const [previewHandlerLoading, setPreviewHandlerLoading] = useState(false);
  const [previewHandlerLoadFailed, setPreviewHandlerLoadFailed] = useState(false);
  const [permissionGuideOpen, setPermissionGuideOpen] = useState(false);
  const [form] = Form.useForm();
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverUser, setHandoverUser] = useState<UserItem | null>(null);
  const [handoverPreview, setHandoverPreview] = useState<UserHandoverPreview | null>(null);
  const [handoverOptions, setHandoverOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverForm] = Form.useForm<{
    replacementUserIds: string[];
    strategy: 'single' | 'round_robin' | 'load_balance';
    reason: string;
  }>();

  const handleResetPassword = async (user: UserItem) => {
    try {
      await resetUserPassword(user.id);
      message.success('密码已重置为默认密码，用户下次登录必须修改密码');
    } catch { message.error('重置失败'); }
  };

  const handleForceLogout = async (user: UserItem) => {
    try {
      await forceLogoutUser(user.id);
      message.success('该用户现有登录会话已撤销');
    } catch { message.error('强制下线失败'); }
  };

  const openPermissionPreview = async (user: UserItem) => {
    setPreviewUser(user);
    setPreviewHandlerModules([]);
    setPreviewHandlerLoadFailed(false);
    setPreviewHandlerLoading(true);
    try {
      const handlers = await getModuleHandlers(undefined, true);
      const modules = handlers
        .filter((handler) => (handler.handler_id || handler.handlerId) === user.id)
        .map((handler) => handler.module_code || handler.moduleCode || '')
        .filter((moduleCode, index, list) => Boolean(moduleCode) && list.indexOf(moduleCode) === index);
      setPreviewHandlerModules(modules);
    } catch {
      setPreviewHandlerLoadFailed(true);
    } finally {
      setPreviewHandlerLoading(false);
    }
  };

  const loadHandoverOptions = async (targetUserId: string, keyword = '') => {
    const result = await getUsers({ page: 1, pageSize: 50, keyword, isActive: true });
    const list = Array.isArray(result) ? result : result.list || [];
    setHandoverOptions(list
      .filter((item: UserItem) => item.id !== targetUserId)
      .map((item: UserItem) => ({
        value: item.id,
        label: `${item.real_name || item.username} (${item.username}) · ${(item.roles || []).map((role) => role.role_name).filter(Boolean).join('、') || '未配置角色'}`,
      })));
  };

  const openHandover = async (user: UserItem) => {
    setHandoverUser(user);
    setHandoverPreview(null);
    setHandoverOpen(true);
    handoverForm.resetFields();
    handoverForm.setFieldsValue({ strategy: 'single', replacementUserIds: [] });
    setHandoverLoading(true);
    try {
      const [preview] = await Promise.all([
        getUserHandoverPreview(user.id),
        loadHandoverOptions(user.id),
      ]);
      setHandoverPreview(preview);
    } catch (error: any) {
      message.error(error?._friendlyMsg || error?.message || '加载交接信息失败');
    } finally {
      setHandoverLoading(false);
    }
  };

  const submitHandover = async () => {
    if (!handoverUser) return;
    const values = await handoverForm.validateFields();
    setHandoverLoading(true);
    try {
      const result = await executeUserHandover(handoverUser.id, {
        ...values,
        reason: values.reason.trim(),
      });
      message.success(`交接完成：转移 ${result.transferredOrders} 条工单，替换 ${result.replacedModules.length} 个模块负责人`);
      setHandoverOpen(false);
      setHandoverUser(null);
      setHandoverPreview(null);
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(error?._friendlyMsg || error?.message || '离职交接失败');
    } finally {
      setHandoverLoading(false);
    }
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
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openPermissionPreview(r)}>权限预览</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title={`确定重置 ${r.real_name || r.username} 的密码？`}
            description="密码将重置为默认密码 123456，用户下次登录必须先修改密码。"
            okText="确认重置"
            cancelText="取消"
            onConfirm={() => handleResetPassword(r)}
          >
            <Button type="link" size="small" icon={<LockOutlined />}>重置密码</Button>
          </Popconfirm>
          <Popconfirm
            title={`确定强制下线 ${r.real_name || r.username}？`}
            description="仅撤销该用户现有登录会话，不会停用账号或修改密码。"
            okText="确认下线"
            cancelText="取消"
            onConfirm={() => handleForceLogout(r)}
          >
            <Button type="link" size="small" icon={<LogoutOutlined />}>强制下线</Button>
          </Popconfirm>
          {r.is_active && (
            <Button type="link" size="small" icon={<UserSwitchOutlined />} onClick={() => void openHandover(r)}>
              离职交接
            </Button>
          )}
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
        onClose={() => {
          setPreviewUser(null);
          setPreviewHandlerModules([]);
          setPreviewHandlerLoadFailed(false);
        }}
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

            <div>
              <Text strong>角色逐项贡献</Text>
              <Descriptions column={1} size="small" bordered style={{ marginTop: 8 }}>
                {getRoleContributions(previewUser).map((contribution) => (
                  <Descriptions.Item key={contribution.key} label={<Tag>{contribution.name}</Tag>}>
                    <Space direction="vertical" size={4}>
                      <Text>页面：{contribution.routes.join('、') || '无额外页面'}</Text>
                      <Text>操作：{contribution.abilities.join('；') || '无额外操作'}</Text>
                    </Space>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </div>

            <div>
              <Text strong>负责人配置影响</Text>
              <div style={{ marginTop: 8 }}>
                {previewHandlerLoading ? (
                  <Text type="secondary">正在读取负责人配置...</Text>
                ) : previewHandlerLoadFailed ? (
                  <Alert type="error" showIcon message="负责人配置加载失败，当前结果不完整" />
                ) : previewHandlerModules.length > 0 ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Alert
                      type="warning"
                      showIcon
                      message={`该用户是 ${previewHandlerModules.length} 个模块的负责人`}
                      description="角色权限与负责人配置相互独立。移除办理角色前，请先在派发配置中更换负责人，避免工单派给无法进入办理页面的账号。"
                    />
                    <Space wrap>
                      {previewHandlerModules.map((moduleCode) => (
                        <Tag key={moduleCode} color="orange">{HANDLER_MODULE_LABELS[moduleCode] || moduleCode} ({moduleCode})</Tag>
                      ))}
                    </Space>
                  </Space>
                ) : (
                  <Text type="secondary">该用户当前未配置为任何办理模块的负责人。</Text>
                )}
              </div>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={`离职交接${handoverUser ? `：${handoverUser.real_name || handoverUser.username}` : ''}`}
        open={handoverOpen}
        width={680}
        confirmLoading={handoverLoading}
        okText="确认交接并停用账号"
        cancelText="取消"
        onOk={submitHandover}
        onCancel={() => {
          setHandoverOpen(false);
          setHandoverUser(null);
          setHandoverPreview(null);
          handoverForm.resetFields();
        }}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="交接将转移未完成工单、替换负责人池、停用账号并撤销现有会话"
          description="原角色绑定会保留用于历史追溯，不会删除或修改现有角色权限配置。"
        />
        <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="未完成工单">
            {handoverPreview ? `${handoverPreview.totalOpenOrders} 条` : '加载中'}
          </Descriptions.Item>
          <Descriptions.Item label="涉及模块">
            <Space wrap>
              {(handoverPreview?.modules || []).map((module) => (
                <Tag key={module.moduleCode} color="blue">
                  {module.moduleCode} · {module.openOrderCount} 条
                </Tag>
              ))}
              {handoverPreview && handoverPreview.modules.length === 0 && <Text type="secondary">无负责人模块或未完成工单</Text>}
            </Space>
          </Descriptions.Item>
        </Descriptions>
        <Form form={handoverForm} layout="vertical">
          <Form.Item name="strategy" label="工单分配策略" rules={[{ required: true }]}>
            <Segmented
              block
              options={[
                { label: '全部给一人', value: 'single' },
                { label: '轮流平均', value: 'round_robin' },
                { label: '按待办量', value: 'load_balance' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="replacementUserIds"
            label="接替负责人"
            dependencies={['strategy']}
            rules={[
              { required: true, message: '请选择至少一名接替负责人' },
              ({ getFieldValue }) => ({
                validator: (_, value: string[]) => getFieldValue('strategy') !== 'single' || value?.length === 1
                  ? Promise.resolve()
                  : Promise.reject(new Error('全部给一人策略只能选择一名接替负责人')),
              }),
            ]}
          >
            <Select
              mode="multiple"
              showSearch
              filterOption={false}
              options={handoverOptions}
              loading={handoverLoading}
              onSearch={(keyword) => handoverUser && void loadHandoverOptions(handoverUser.id, keyword)}
              placeholder="输入姓名、账号或角色搜索在职用户"
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="交接原因"
            rules={[
              { required: true, message: '请填写交接原因' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('交接原因不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount placeholder="例如：员工离职，工作由张三、李四共同接替" />
          </Form.Item>
        </Form>
      </Modal>

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
