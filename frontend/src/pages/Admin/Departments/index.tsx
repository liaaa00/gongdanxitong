import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Switch, Popconfirm, App, Tag, TreeSelect } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '@/services/departments';
import type { DepartmentItem } from '@/services/departments';
import { useAuth } from '@/hooks/useAuth';

const AdminDepartments: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [data, setData] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentItem | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getDepartments();
      setData(Array.isArray(res) ? res : (res as any)?.list ?? (res as any)?.items ?? []);
    }
    catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await updateDepartment(editing.id, v);
      else await createDepartment(v);
      message.success('保存成功');
      setOpen(false); setEditing(null); form.resetFields(); load();
    } catch { message.error('保存失败'); }
  };

  const onDel = async (id: string) => {
    try { await deleteDepartment(id); message.success('已删除'); load(); }
    catch { message.error('删除失败'); }
  };

  const treeData = data.filter((d) => !d.parent_id).map((d) => ({
    title: d.name, value: d.id,
    children: data.filter((c) => c.parent_id === d.id).map((c) => ({ title: c.name, value: c.id })),
  }));

  return (
    <PageContainer header={{ title: '部门管理' }} extra={[
      <Button key="add" type="primary" icon={<PlusOutlined />}
        onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>新建部门</Button>,
    ]}>
      <Table rowKey="id" loading={loading} dataSource={data}
        columns={[
          { title: '部门代码', dataIndex: 'code', width: 160 },
          { title: '部门名称', dataIndex: 'name' },
          { title: '上级', dataIndex: 'parent_id', width: 140,
            render: (p) => data.find((d) => d.id === p)?.name || '—' },
          { title: '排序', dataIndex: 'sort_order', width: 80 },
          { title: '状态', dataIndex: 'is_active', width: 90,
            render: (v) => v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag> },
          { title: '操作', width: 160, render: (_, r) => (
            <Space>
              <Button size="small" icon={<EditOutlined />}
                onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>编辑</Button>
              {isAdmin && (
                <Popconfirm title="确定删除？" onConfirm={() => onDel(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </Space>
          ) },
        ]}
      />
      <Modal title={editing ? '编辑部门' : '新建部门'} open={open}
        onOk={onSave} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ is_active: true, sort_order: 1 }}>
          <Form.Item name="code" label="部门代码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="parent_id" label="上级部门">
            <TreeSelect allowClear treeData={treeData} placeholder="不选则为顶级" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序"><InputNumber min={0} /></Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminDepartments;
