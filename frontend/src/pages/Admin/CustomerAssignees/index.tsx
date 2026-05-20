import { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Table, Button, Space, Modal, Form, Select, Popconfirm, App, Tag, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getCustomerAssignees, createCustomerAssignee, deleteCustomerAssignee } from '@/services/customerAssignees';
import type { CustomerAssigneeItem } from '@/services/customerAssignees';
import { getCustomers } from '@/services/customers';
import { getUsers } from '@/services/users';
import { useAuth } from '@/hooks/useAuth';

const GROUP_OPTIONS = [
  { label: '业务一组', value: '业务一组' },
  { label: '业务二组', value: '业务二组' },
  { label: '业务三组', value: '业务三组' },
  { label: '业务四组', value: '业务四组' },
  { label: '业务五组', value: '业务五组' },
];

const AdminCustomerAssignees: React.FC = () => {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [data, setData] = useState<CustomerAssigneeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCustomerAssignees();
      setData(Array.isArray(res?.list) ? res.list : []);
    } catch { message.error('加载绑定列表失败'); }
    finally { setLoading(false); }
  };

  const loadOptions = async () => {
    try {
      const cRes = await getCustomers({ page: 1, pageSize: 100 });
      const cList = Array.isArray(cRes?.list) ? cRes.list : Array.isArray(cRes) ? cRes : [];
      setCustomers(cList.map((c: any) => ({ value: c.id, label: `${c.customer_name || c.customerName} (${c.customer_code || c.customerCode})` })));

      const uRes = await getUsers({ page: 1, pageSize: 100 });
      const uList = Array.isArray(uRes?.list) ? uRes.list : Array.isArray(uRes) ? uRes : [];
      setUsers(uList.map((u: any) => ({ value: u.id, label: `${u.real_name || u.realName || u.username} (${u.username})` })));
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await createCustomerAssignee(values);
      message.success('绑定成功');
      setOpen(false); form.resetFields();
      load();
    } catch (e: any) { message.error(e?.message || '绑定失败'); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteCustomerAssignee(id); message.success('已解绑'); load(); }
    catch (e: any) { message.error(e?.message || '解绑失败'); }
  };

  return (
    <PageContainer header={{ title: '业务员↔客户绑定' }}
      extra={[
        <Button key="add" type="primary" icon={<PlusOutlined />}
          onClick={() => { form.resetFields(); setOpen(true); }}>新建绑定</Button>,
      ]}
    >
      <Alert style={{ marginBottom: 12 }} type="info" showIcon
        message="绑定说明"
        description="一个客户对应一个业务员（多对一），业务员可动态调整。绑定后工单将按此关系自动匹配发起人权限。" />

      <Table rowKey="id" loading={loading} dataSource={data}
        locale={{ emptyText: '暂无绑定记录，点击"新建绑定"开始' }}
        columns={[
          { title: '客户编号', dataIndex: 'customer_code', width: 120, render: (v: string, r: CustomerAssigneeItem) => v || r.customer_code || '-' },
          { title: '客户名称', dataIndex: 'customer_name', width: 150, render: (v: string, r: CustomerAssigneeItem) => v || r.customer_name || '-' },
          { title: '业务员', dataIndex: 'user_real_name', width: 100, render: (v: string) => v || '-' },
          { title: '所属业务组', dataIndex: 'group_code', width: 110, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
          { title: '状态', dataIndex: 'is_active', width: 80,
            render: (v: boolean) => v ? <Tag color="success">有效</Tag> : <Tag>停用</Tag> },
          { title: '绑定时间', dataIndex: 'assigned_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
          { title: '操作', width: 100,
            render: (_, r) => isAdmin ? (
              <Popconfirm title="确定解除绑定？" onConfirm={() => handleDelete(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>解绑</Button>
              </Popconfirm>
            ) : null,
          },
        ]}
      />

      <Modal title="新建业务员↔客户绑定" open={open} onOk={handleSave}
        onCancel={() => { setOpen(false); form.resetFields(); }} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="customer_id" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select showSearch optionFilterProp="label" placeholder="搜索并选择客户" options={customers} />
          </Form.Item>
          <Form.Item name="user_id" label="业务员" rules={[{ required: true, message: '请选择业务员' }]}>
            <Select showSearch optionFilterProp="label" placeholder="搜索并选择业务员" options={users} />
          </Form.Item>
          <Form.Item name="group_code" label="所属业务组" rules={[{ required: true, message: '请选择业务组' }]}>
            <Select placeholder="选择业务组" options={GROUP_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminCustomerAssignees;
