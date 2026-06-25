import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ApartmentOutlined } from '@ant-design/icons';
import { createCustomer, deleteCustomer, getCustomers, updateCustomer } from '@/services/customers';
import type { CustomerItem } from '@/services/customers';
import { getBranchesByCustomer, createBranch, updateBranch, deleteBranch } from '@/services/branches';
import type { BranchItem } from '@/services/branches';
import { useAuth } from '@/hooks/useAuth';

const { Text } = Typography;

function normalizeCustomer(raw: Record<string, any>): CustomerItem {
  return {
    id: raw.id ?? raw.ID ?? '',
    customer_code: raw.customer_code ?? raw.customerCode ?? '',
    customer_name: raw.customer_name ?? raw.customerName ?? '',
    is_active: raw.is_active ?? raw.isActive ?? true,
    created_at: raw.created_at ?? raw.createdAt ?? '',
  } as CustomerItem;
}

const AdminCustomers: React.FC = () => {
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [rawData, setRawData] = useState<any[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerItem | null>(null);
  const [form] = Form.useForm();

  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [branchMap, setBranchMap] = useState<Record<string, BranchItem[]>>({});
  const [branchLoading, setBranchLoading] = useState<Record<string, boolean>>({});
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchEditing, setBranchEditing] = useState<BranchItem | null>(null);
  const [branchParentId, setBranchParentId] = useState<string>('');
  const [branchForm] = Form.useForm();

  const data = useMemo(() => {
    if (!Array.isArray(rawData)) return [];
    return rawData.map(normalizeCustomer);
  }, [rawData]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 客户管理展示所有启用客户，包含手动新增客户和工单中使用过的真实客户。
      const res = await getCustomers({ page: 1, pageSize: 100, isActive: true });
      if (res?.success === false) {
        setError(res.error || '客户接口返回异常，请稍后重试');
        setRawData([]);
        return;
      }
      const list = Array.isArray(res?.list) ? res.list : Array.isArray(res) ? res : [];
      setRawData(list);
      setSelectedRowKeys((keys) => keys.filter((key) => list.some((item: any) => normalizeCustomer(item).id === key)));
    } catch (e: any) {
      setError(e?.message || '加载客户列表失败');
      setRawData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExpand = async (expanded: boolean, record: CustomerItem) => {
    const key = record.id;
    if (expanded) {
      if (!branchMap[key]) {
        setBranchLoading((prev) => ({ ...prev, [key]: true }));
        try {
          const branches = await getBranchesByCustomer(key);
          setBranchMap((prev) => ({ ...prev, [key]: Array.isArray(branches) ? branches : [] }));
        } catch {
          message.error('加载商社列表失败');
        } finally {
          setBranchLoading((prev) => ({ ...prev, [key]: false }));
        }
      }
      setExpandedKeys((prev) => [...prev, key]);
    } else {
      setExpandedKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const handleBranchSave = async () => {
    const values = await branchForm.validateFields();
    try {
      if (branchEditing) {
        await updateBranch(branchEditing.id, values);
        message.success('商社已更新');
      } else {
        await createBranch({ ...values, customer_id: branchParentId });
        message.success('商社已创建');
      }
      setBranchOpen(false);
      setBranchEditing(null);
      branchForm.resetFields();
      const branches = await getBranchesByCustomer(branchParentId);
      setBranchMap((prev) => ({ ...prev, [branchParentId]: Array.isArray(branches) ? branches : [] }));
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const openBranchCreate = (customerId: string) => {
    setBranchParentId(customerId);
    setBranchEditing(null);
    branchForm.resetFields();
    branchForm.setFieldsValue({ is_active: true });
    setBranchOpen(true);
  };

  const openBranchEdit = (customerId: string, branch: BranchItem) => {
    setBranchParentId(customerId);
    setBranchEditing(branch);
    branchForm.setFieldsValue(branch);
    setBranchOpen(true);
  };

  const handleBranchDelete = async (customerId: string, id: string) => {
    try {
      await deleteBranch(id);
      message.success('商社已删除');
      const branches = await getBranchesByCustomer(customerId);
      setBranchMap((prev) => ({ ...prev, [customerId]: Array.isArray(branches) ? branches : [] }));
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const expandedRowRender = (record: CustomerItem) => {
    const branches = Array.isArray(branchMap[record.id]) ? branchMap[record.id] : [];
    const isLoading = branchLoading[record.id];
    return (
      <div style={{ padding: '8px 24px 12px' }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 13 }}><ApartmentOutlined /> 商社列表</Text>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openBranchCreate(record.id)}>新增商社</Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={branches}
          pagination={false}
          locale={{ emptyText: '暂无商社，点击“新增商社”添加' }}
          columns={[
            { title: '商社代码', dataIndex: 'branch_code', width: 150 },
            { title: '商社名称', dataIndex: 'branch_name' },
            { title: '城市', dataIndex: 'city', width: 100, render: (v: string) => v || '-' },
            {
              title: '状态',
              dataIndex: 'is_active',
              width: 80,
              render: (v: boolean) => v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
            },
            {
              title: '操作',
              width: 150,
              render: (_: any, br: BranchItem) => (
                <Space size="small">
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openBranchEdit(record.id, br)}>编辑</Button>
                  {isAdmin && (
                    <Popconfirm title="确定删除？" onConfirm={() => handleBranchDelete(record.id, br.id)}>
                      <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>
    );
  };

  const onSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) await updateCustomer(editing.id, values);
      else await createCustomer(values);
      message.success('保存成功');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  };

  const onDel = async (id: string) => {
    try {
      await deleteCustomer(id);
      message.success('已删除');
      setRawData((prev) => prev.filter((item) => normalizeCustomer(item).id !== id));
      setSelectedRowKeys((prev) => prev.filter((key) => key !== id));
      load();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要删除的客户');
      return;
    }
    modal.confirm({
      title: '确认批量删除客户？',
      content: `将删除选中的 ${selectedRowKeys.length} 个客户。删除后客户会停用并从当前列表隐藏。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const ids = [...selectedRowKeys];
        const results = await Promise.allSettled(ids.map((id) => deleteCustomer(id)));
        const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
        const failed = results.length - successIds.length;
        setRawData((prev) => prev.filter((item) => !successIds.includes(normalizeCustomer(item).id)));
        setSelectedRowKeys([]);
        if (failed > 0) message.warning(`已删除 ${successIds.length} 个，失败 ${failed} 个`);
        else message.success(`已删除 ${successIds.length} 个客户`);
        load();
      },
    });
  };

  const handleEdit = (record: CustomerItem) => {
    setEditing(record);
    form.setFieldsValue({ customer_code: record.customer_code, customer_name: record.customer_name, is_active: record.is_active });
    setOpen(true);
  };

  return (
    <PageContainer
      header={{ title: '客户管理' }}
      extra={[
        isAdmin && <Button key="batchDelete" danger icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} onClick={handleBatchDelete}>批量删除</Button>,
        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          form.setFieldsValue({ is_active: true });
          setOpen(true);
        }}>新建客户</Button>,
      ]}
    >
      {error && <Alert type="error" message={error} closable style={{ marginBottom: 16 }} onClose={() => setError(null)} />}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        rowSelection={isAdmin ? {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys.map(String)),
        } : undefined}
        locale={{ emptyText: '暂无客户数据' }}
        expandable={{
          expandedRowRender,
          expandedRowKeys: expandedKeys,
          onExpand: handleExpand,
        }}
        columns={[
          {
            title: '客户编号',
            dataIndex: 'customer_code',
            width: 150,
            render: (value: string, record: CustomerItem) => value || (record as any).customerCode || '-',
          },
          {
            title: '客户名称',
            dataIndex: 'customer_name',
            render: (value: string, record: CustomerItem) => value || (record as any).customerName || '-',
          },
          {
            title: '状态',
            dataIndex: 'is_active',
            width: 100,
            render: (value) => value === true || value === 1 || value === 'true' ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          {
            title: '创建时间',
            dataIndex: 'created_at',
            width: 180,
            render: (value: string, record: CustomerItem) => value || (record as any).createdAt || '-',
          },
          {
            title: '操作',
            width: 180,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
                {isAdmin && (
                  <Popconfirm title="确定删除？" onConfirm={() => onDel(record.id || (record as any).ID)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑客户' : '新建客户'}
        open={open}
        onOk={onSave}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
          <Form.Item name="customer_code" label="客户编号" rules={[{ required: true, message: '请输入客户编号' }]}>
            <Input placeholder="如：CUST001" />
          </Form.Item>
          <Form.Item name="customer_name" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={branchEditing ? '编辑商社' : '新增商社'}
        open={branchOpen}
        onOk={handleBranchSave}
        onCancel={() => { setBranchOpen(false); setBranchEditing(null); branchForm.resetFields(); }}
        destroyOnHidden
      >
        <Form form={branchForm} layout="vertical" initialValues={{ is_active: true }}>
          <Form.Item name="branch_code" label="商社代码" rules={[{ required: true, message: '请输入商社代码' }]}>
            <Input placeholder="如：HZ001" />
          </Form.Item>
          <Form.Item name="branch_name" label="商社名称" rules={[{ required: true, message: '请输入商社名称' }]}>
            <Input placeholder="如：浙江企服-杭州" />
          </Form.Item>
          <Form.Item name="city" label="城市"><Input placeholder="如：杭州" /></Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AdminCustomers;
