import { useState, useRef, useMemo } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Tag, Tree, Button, Space, Modal, Form, Input, Select, Switch, Popconfirm, App, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getRoles, createRole, updateRole, deleteRole } from '@/services/roles';
import type { RoleItem } from '@/services/roles';
import { useAuth } from '@/hooks/useAuth';

const LEVEL_OPT = [
  { label: '全局', value: '全局' },
  { label: '管理层', value: '管理层' },
  { label: '主管层', value: '主管层' },
  { label: '执行层', value: '执行层' },
];

/** 8 core roles and their data scopes */
const CORE_ROLES = new Set(['admin', 'business_owner', 'business_group_leader', 'business_group_member', 'shared_team_owner', 'labor_contract_member', 'onboarding_resignation_member', 'data_entry_leader']);

const DATA_SCOPE: Record<string, string> = {
  'admin': '全部数据',
  'business_owner': '全部业务工单',
  'business_group_leader': '本组工单',
  'business_group_member': '本人创建的工单',
  'shared_team_owner': '合同+入离职全量',
  'labor_contract_member': '合同签订+续签+待遇',
  'onboarding_resignation_member': '入职联系+离职联系',
  'data_entry_leader': '数据录入全量',
  'manager': '全部业务工单（兼容）',
  'salesperson': '本人创建（兼容）',
  'contract_team': '合同+入离职+离职（兼容）',
  'onboarding_team': '入职联系（兼容）',
  'data_entry_team': '数据录入执行（兼容）',
  'contract_supervisor': '合同组主管（兼容）',
  'onboarding_supervisor': '入离职主管（兼容）',
  'data_entry_supervisor': '数据录入主管（兼容）',
};

const LEVEL_COLOR: Record<string, string> = {
  '全局': 'gold', '管理层': 'purple', '主管层': 'blue', '执行层': 'default',
};

const AdminRoles: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [form] = Form.useForm();

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit = (r: RoleItem) => { setEditing(r); form.setFieldsValue(r); setOpen(true); };

  const onSave = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await updateRole(editing.id, v);
      else await createRole(v);
      message.success('保存成功');
      setOpen(false); setEditing(null); form.resetFields();
      actionRef.current?.reload();
    } catch { message.error('保存失败'); }
  };

  const onDel = async (r: RoleItem) => {
    try { await deleteRole(r.id); message.success('已删除'); actionRef.current?.reload(); }
    catch { message.error('删除失败'); }
  };

  const columns: ProColumns<RoleItem>[] = [
    { title: '编码', dataIndex: 'code', key: 'code', width: 180, ellipsis: true,
      render: (_: unknown, r: RoleItem) => (
        <Space>
          {CORE_ROLES.has(r.code) && <Tag color="blue" style={{ fontSize: 10 }}>核心</Tag>}
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.code}</span>
        </Space>
      ),
    },
    { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '层级', dataIndex: 'level', key: 'level', width: 80,
      render: (_: unknown, r: RoleItem) => <Tag color={LEVEL_COLOR[r.level] || 'default'}>{r.level}</Tag>,
    },
    { title: '数据范围', dataIndex: 'data_scope', key: 'data_scope', width: 160,
      render: (_: unknown, r: RoleItem) => {
        const scope = DATA_SCOPE[r.code] || DATA_SCOPE[r.name] || '按角色定义';
        return (
          <Tooltip title={r.description}>
            <span><InfoCircleOutlined style={{ color: '#1677ff', marginRight: 4 }} />{scope}</span>
          </Tooltip>
        );
      },
    },
    { title: '描述', dataIndex: 'description', key: 'description', width: 220, ellipsis: true },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 70,
      render: (_: unknown, r: RoleItem) => {
        const active = r.is_active === true || (r as any).isActive === true;
        return <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          {isAdmin && (
            <Popconfirm title="确定删除该角色？" onConfirm={() => onDel(r)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer header={{ title: '角色管理' }}>
      <ProTable<RoleItem>
        actionRef={actionRef}
        columns={columns}
        request={async () => {
          try {
            const result = await getRoles();
            const data = Array.isArray(result) ? result : (result as any)?.list || [];
            setAllRoles(data);
            return { data, success: true, total: data.length };
          } catch {
            setAllRoles([]);
            return { data: [], success: false, total: 0 };
          }
        }}
        rowKey="id"
        search={false}
        headerTitle="角色列表"
        pagination={false}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建角色</Button>,
        ]}
        expandable={{
          expandedRowRender: (record) => {
            const children = (record as RoleItem & { children?: RoleItem[] }).children;
            if (!children || children.length === 0) return null;
            return (
              <div style={{ padding: '0 24px' }}>
                <span style={{ fontSize: 12, color: '#999' }}>继承关系（子角色）：</span>
                <Tree
                  treeData={[{ title: record.name, key: record.id, children: children.map((c) => ({ title: c.name + ' (' + c.level + ')', key: c.id, isLeaf: true })) }]}
                  defaultExpandAll
                  showLine
                />
              </div>
            );
          },
        }}
      />
      <Modal title={editing ? '编辑角色' : '新建角色'} open={open} onOk={onSave}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ level: '执行层', is_active: true }}>
          <Form.Item name="code" label="角色编码" rules={[{ required: true }]}><Input placeholder="请输入角色英文编码" /></Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="level" label="层级" rules={[{ required: true }]}>
            <Select options={LEVEL_OPT} />
          </Form.Item>
          <Form.Item name="parent_role_id" label="上级角色">
            <Select allowClear options={(Array.isArray(allRoles) ? allRoles : []).filter((r) => !editing || r.id !== editing.id).map((r) => ({ label: `${r.name} (${r.level})`, value: r.id }))} placeholder="不选则为顶级" />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminRoles;
