import React, { useState, useEffect } from 'react';
import { Button, message, Modal, Form, Input, Switch, Space, Popconfirm, Tag } from 'antd';
import { ProTable } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import {
  getCertificateTypes,
  createCertificateType,
  updateCertificateType,
  deleteCertificateType,
  type CertificateType,
  type CreateCertificateTypeDto,
} from '@/services/certificateTypes';

const CertificateTypesPage: React.FC = () => {
  const [dataSource, setDataSource] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CertificateType | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getCertificateTypes();
      setDataSource(data);
    } catch (error: any) {
      message.error(error.message || '加载证明类型失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true });
    setModalVisible(true);
  };

  const handleEdit = (record: CertificateType) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  // PLACEHOLDER_HANDLE_SUBMIT

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRecord) {
        await updateCertificateType(editingRecord.id, values);
        message.success('更新成功');
      } else {
        await createCertificateType(values as CreateCertificateTypeDto);
        message.success('创建成功');
      }
      setModalVisible(false);
      void loadData();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCertificateType(id);
      message.success('删除成功');
      void loadData();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  // PLACEHOLDER_COLUMNS

  const columns: ProColumns<CertificateType>[] = [
    { title: '证明类型名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '模板路径', dataIndex: 'templateUrl', key: 'templateUrl', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (_, record) => (
        <Tag color={record.isActive ? 'green' : 'red'}>{record.isActive ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: CertificateType) => (
        <Space>
          <a onClick={() => handleEdit(record)}>编辑</a>
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
            <a style={{ color: 'red' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<CertificateType>
        headerTitle="证明类型管理"
        rowKey="id"
        search={false}
        dataSource={dataSource}
        loading={loading}
        columns={columns}
        pagination={false}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增证明类型
          </Button>,
        ]}
      />
      {/* PLACEHOLDER_MODAL */}
      <Modal
        title={editingRecord ? '编辑证明类型' : '新增证明类型'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="证明类型名称"
            name="name"
            rules={[{ required: true, message: '请输入证明类型名称' }]}
          >
            <Input placeholder="请输入证明类型名称" maxLength={100} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea placeholder="请输入描述" rows={3} />
          </Form.Item>
          <Form.Item label="模板路径" name="templateUrl">
            <Input placeholder="请输入模板路径" maxLength={500} />
          </Form.Item>
          <Form.Item label="是否启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CertificateTypesPage;
