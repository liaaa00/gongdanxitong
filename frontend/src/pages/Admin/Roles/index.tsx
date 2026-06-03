import { useMemo, useRef, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Alert, Badge, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { getRoles, createRole, updateRole, deleteRole } from '@/services/roles';
import type { RoleItem } from '@/services/roles';
import {
  getRoleActionPermissions,
  updateRoleActionPermissions,
  type RoleActionCode,
  type RoleActionDefinition,
  type RoleActionMatrix,
} from '@/services/roleActionPermissions';
import { useAuth } from '@/hooks/useAuth';

const { Text } = Typography;

const LEVEL_OPT = [
  { label: '全局', value: '全局' },
  { label: '管理层', value: '管理层' },
  { label: '主管层', value: '主管层' },
  { label: '执行层', value: '执行层' },
];

const CORE_ROLES = new Set([
  'admin',
  'biz_manager',
  'biz_leader',
  'biz_member',
  'business_owner',
  'business_group_leader',
  'business_group_member',
  'shared_team_owner',
  'labor_contract_member',
  'onboarding_resignation_member',
  'data_entry_leader',
  'social_insurance_specialist',
]);

const DATA_SCOPE: Record<string, string> = {
  admin: '全部数据',
  biz_manager: '全部业务工单',
  biz_leader: '本组工单',
  biz_member: '本人发起的工单',
  business_owner: '全部业务工单',
  business_group_leader: '本组工单',
  business_group_member: '本人发起的工单',
  salesperson: '本人发起的工单',
  shared_team_owner: '共享团队工单',
  labor_contract_member: '合同类工单',
  onboarding_resignation_member: '入职联系/离职材料收集工单',
  data_entry_leader: '增员/减员报岗录入工单',
  social_insurance_specialist: '社保公积金工单',
};

const LEVEL_COLOR: Record<string, string> = {
  全局: 'gold',
  管理层: 'purple',
  主管层: 'blue',
  执行层: 'default',
};

const ACTION_COLOR: Record<string, string> = {
  'work_order.create': 'green',
  'work_order.import': 'cyan',
  'work_order.delete': 'red',
  'work_order.view_all': 'purple',
};

function getScope(role: RoleItem) {
  return DATA_SCOPE[role.code] || '按角色配置';
}

function summarizeActions(actions: RoleActionCode[], actionNameMap: Map<string, string>) {
  if (!actions.length) return { shown: [], rest: 0 };
  const priority = ['work_order.create', 'work_order.import', 'work_order.view_all', 'work_order.view_team', 'work_order.view', 'work_order.update', 'work_order.withdraw', 'work_order.void', 'work_order.urge', 'work_order.export', 'work_order.delete'];
  const sorted = [...actions].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  const shown = sorted.slice(0, 5).map((code) => ({ code, name: actionNameMap.get(code) || code }));
  return { shown, rest: Math.max(0, sorted.length - shown.length) };
}

function cloneMatrix(matrix: RoleActionMatrix): RoleActionMatrix {
  return Object.fromEntries(Object.entries(matrix || {}).map(([roleCode, actions]) => [roleCode, [...actions]])) as RoleActionMatrix;
}

const AdminRoles: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [actionDefinitions, setActionDefinitions] = useState<RoleActionDefinition[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<RoleActionMatrix>({});
  const [matrixDraft, setMatrixDraft] = useState<RoleActionMatrix>({});
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [form] = Form.useForm();

  const actionNameMap = useMemo(() => new Map(actionDefinitions.map((item) => [item.code, item.name])), [actionDefinitions]);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ level: '执行层', is_active: true }); setOpen(true); };
  const openEdit = (role: RoleItem) => { setEditing(role); form.setFieldsValue(role); setOpen(true); };

  const onSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) await updateRole(editing.id, values);
      else await createRole(values);
      message.success('保存成功');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      actionRef.current?.reload();
    } catch {
      message.error('保存失败');
    }
  };

  const onDel = async (role: RoleItem) => {
    try {
      await deleteRole(role.id);
      message.success('已删除');
      actionRef.current?.reload();
    } catch {
      message.error('删除失败');
    }
  };

  const openMatrix = () => {
    setMatrixDraft(cloneMatrix(permissionMatrix));
    setMatrixOpen(true);
  };

  const toggleMatrixAction = (roleCode: string, actionCode: RoleActionCode, checked: boolean) => {
    setMatrixDraft((prev) => {
      const current = new Set(prev[roleCode] || []);
      if (checked) current.add(actionCode);
      else current.delete(actionCode);
      return { ...prev, [roleCode]: Array.from(current) as RoleActionCode[] };
    });
  };

  const saveMatrix = async () => {
    try {
      setSavingMatrix(true);
      const result = await updateRoleActionPermissions(matrixDraft);
      setPermissionMatrix(result.roles);
      setActionDefinitions(result.actions);
      message.success('权限矩阵已保存，已登录用户建议重新登录后生效');
      setMatrixOpen(false);
    } catch {
      message.error('权限矩阵保存失败');
    } finally {
      setSavingMatrix(false);
    }
  };

  const roleColumns: ProColumns<RoleItem>[] = [
    {
      title: '角色',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      render: (_, role) => (
        <Space direction="vertical" size={2} style={{ maxWidth: 240 }}>
          <Space wrap size={6}>
            <Text strong>{role.name}</Text>
            {CORE_ROLES.has(role.code) && <Tag color="blue">常用</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{role.code}</Text>
        </Space>
      ),
    },
    {
      title: '层级 / 数据范围',
      dataIndex: 'level',
      key: 'level',
      width: 190,
      render: (_, role) => (
        <Space direction="vertical" size={4}>
          <Tag color={LEVEL_COLOR[role.level] || 'default'}>{role.level || '-'}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{getScope(role)}</Text>
        </Space>
      ),
    },
    {
      title: '已分配操作权限',
      dataIndex: 'actions',
      key: 'actions',
      width: 420,
      render: (_, role) => {
        const actions = permissionMatrix[role.code] || [];
        const summary = summarizeActions(actions, actionNameMap);
        if (!actions.length) return <Text type="secondary">暂未分配业务权限</Text>;
        return (
          <Space size={[4, 6]} wrap>
            {summary.shown.map((item) => <Tag key={item.code} color={ACTION_COLOR[item.code] || 'processing'}>{item.name}</Tag>)}
            {summary.rest > 0 && <Tag>+{summary.rest} 项</Tag>}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      render: (_, role) => {
        const active = role.is_active === true || (role as any).isActive === true;
        return <Badge status={active ? 'success' : 'default'} text={active ? '启用' : '停用'} />;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, role) => (
        <Space wrap size={6}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(role)}>编辑</Button>
          {isAdmin && (
            <Popconfirm title="确定删除该角色？" onConfirm={() => onDel(role)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const matrixColumns = useMemo(() => {
    const base = [
      {
        title: '角色',
        dataIndex: 'name',
        key: 'name',
        fixed: 'left' as const,
        width: 190,
        render: (_: unknown, role: RoleItem) => (
          <Space direction="vertical" size={0}>
            <Text strong>{role.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{role.code}</Text>
          </Space>
        ),
      },
    ];
    const actionCols = actionDefinitions.map((action) => ({
      title: <span title={action.description}>{action.name}</span>,
      dataIndex: action.code,
      key: action.code,
      width: 116,
      align: 'center' as const,
      render: (_: unknown, role: RoleItem) => (
        <Checkbox
          checked={(matrixDraft[role.code] || []).includes(action.code)}
          onChange={(event) => toggleMatrixAction(role.code, action.code, event.target.checked)}
        />
      ),
    }));
    return [...base, ...actionCols];
  }, [actionDefinitions, matrixDraft]);

  return (
    <PageContainer
      header={{
        title: '角色权限管理',
        subTitle: '用勾选方式给不同岗位分配可执行的工单操作',
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里是可视化权限矩阵，不需要改代码。"
        description="例如给“业务员”勾选“新建工单、批量导入、修改、撤回、作废、催办”，该角色登录后就能看到对应按钮；后端接口也会同步校验。"
      />

      <ProTable<RoleItem>
        actionRef={actionRef}
        columns={roleColumns}
        request={async () => {
          try {
            const [result, permissions] = await Promise.all([getRoles(), getRoleActionPermissions()]);
            const data = Array.isArray(result) ? result : (result as any)?.list || [];
            setAllRoles(data);
            setActionDefinitions(permissions.actions);
            setPermissionMatrix(permissions.roles);
            return { data, success: true, total: data.length };
          } catch {
            setAllRoles([]);
            return { data: [], success: false, total: 0 };
          }
        }}
        rowKey="id"
        search={false}
        headerTitle="角色列表"
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1080 }}
        options={false}
        toolBarRender={() => [
          <Button key="matrix" icon={<SafetyCertificateOutlined />} onClick={openMatrix}>权限矩阵</Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建角色</Button>,
        ]}
      />

      <Modal
        title="角色权限矩阵"
        open={matrixOpen}
        onOk={saveMatrix}
        confirmLoading={savingMatrix}
        onCancel={() => setMatrixOpen(false)}
        okText="保存权限"
        cancelText="取消"
        width="min(1280px, 96vw)"
        destroyOnHidden
      >
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="一行是一个角色，一列是一个操作权限，勾上就是允许。"
          description="建议普通业务员不要勾选“查看全部数据”和“删除工单”；后道角色一般只需要查看、导出，以及后续专属办理权限。"
        />
        <Card size="small" bodyStyle={{ padding: 0 }}>
          <Table<RoleItem>
            size="small"
            rowKey="id"
            columns={matrixColumns as any}
            dataSource={allRoles}
            pagination={false}
            scroll={{ x: Math.max(980, 190 + actionDefinitions.length * 116), y: 520 }}
          />
        </Card>
      </Modal>

      <Modal
        title={editing ? '编辑角色' : '新建角色'}
        open={open}
        onOk={onSave}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ level: '执行层', is_active: true }}>
          <Form.Item name="code" label="角色编码" rules={[{ required: true, message: '请输入角色编码' }]}>
            <Input placeholder="例如 business_group_member" disabled={Boolean(editing && CORE_ROLES.has(editing.code))} />
          </Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="例如 业务员" />
          </Form.Item>
          <Form.Item name="level" label="层级" rules={[{ required: true, message: '请选择层级' }]}>
            <Select options={LEVEL_OPT} />
          </Form.Item>
          <Form.Item name="parent_role_id" label="上级角色">
            <Select
              allowClear
              options={(Array.isArray(allRoles) ? allRoles : [])
                .filter((r) => !editing || r.id !== editing.id)
                .map((r) => ({ label: `${r.name} (${r.level})`, value: r.id }))}
              placeholder="不选则为顶级角色"
            />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminRoles;
