import { useState, useEffect } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, Modal, Form, Input, InputNumber, Switch, App, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import {
  getCertificateTypes,
  createCertificateType,
  updateCertificateType,
  deleteCertificateType,
  type CertificateType,
} from '@/services/certificateTypes';

export default function CertificateTypesPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CertificateType[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getCertificateTypes();
      setDataSource(data);
    } catch (error) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ displayOrder: 0, isActive: true });
    setModalOpen(true);
  };

  const handleEdit = (record: CertificateType) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCertificateType(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await updateCertificateType(editingId, values);
        message.success('修改成功');
      } else {
        await createCertificateType(values);
        message.success('添加成功');
      }
      setModalOpen(false);
      fetchData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const columns: ProColumns<CertificateType>[] = [
    {
      title: '证明类型名称',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '排序',
      dataIndex: 'displayOrder',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 100,
      render: (val) => (val ? '启用' : '禁用'),
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <PageContainer>
      <ProTable<CertificateType>
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加证明类型
          </Button>,
        ]}
        pagination={false}
      />

      <Modal
        title={editingId ? '编辑证明类型' : '添加证明类型'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item
            name="name"
            label="证明类型名称"
            rules={[{ required: true, message: '请输入证明类型名称' }]}
          >
            <Input maxLength={100} placeholder="例：在职证明、收入证明" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入证明类型描述" />
          </Form.Item>
          <Form.Item name="displayOrder" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="数字越小越靠前" />
          </Form.Item>
          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
