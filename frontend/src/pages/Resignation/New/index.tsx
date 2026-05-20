import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Card, Button, Space, App, Divider, Form, Select } from 'antd';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getFields } from '@/services/fields';
import { createWorkOrder } from '@/services/workOrders';
import { getCustomers, type CustomerItem } from '@/services/customers';

const ResignationNew: React.FC = () => {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const formRef = useRef<ProFormInstance>();
  const { permissions } = useFieldPermissions('main');
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getFields('resignation')
      .then(setFields)
      .catch(() => message.error('加载字段配置失败'));
  }, [message]);

  useEffect(() => {
    getCustomers({ page: 1, pageSize: 100 })
      .then((res) => {
        if (res.success) setCustomers(res.list);
      })
      .catch(() => message.error('加载客户列表失败'));
  }, [message]);

  const selectedCustomer = customers.find((item) => item.id === customerId);

  const handleCustomerChange = (value?: string) => {
    setCustomerId(value);
    formRef.current?.setFieldsValue({ customerId: value, customer_id: value });
    const customer = customers.find((item) => item.id === value);
    if (customer) {
      formRef.current?.setFieldsValue({
        customerId: value,
        customer_id: value,
        customer_name: customer.customer_name,
        customer_code: customer.customer_code,
      });
    }
  };

  const buildPayload = (values: Record<string, unknown>, action: 'draft' | 'submit') => ({
    ...values,
    customerId,
    customer_name: selectedCustomer?.customer_name || values.customer_name,
    customer_code: selectedCustomer?.customer_code || values.customer_code,
    orderType: 'resignation',
    _action: action,
  });

  const handleSaveDraft = async () => {
    if (!customerId) {
      message.warning('请先选择客户');
      return;
    }
    const values = formRef.current?.getFieldsValue() || {};
    setLoading(true);
    try {
      const result = await createWorkOrder(buildPayload(values, 'draft'));
      message.success('草稿已保存');
      navigate('/resignation/' + result.id);
    } catch {
      message.error('保存失败');
    } finally { setLoading(false); }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    console.log('[新建离职工单] onFinish 触发，提交值：', values);
    if (!customerId) {
      message.warning('请先选择客户');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createWorkOrder(buildPayload(values, 'submit'));
      modal.success({
        title: '离职工单提交成功',
        content: `工单 ${result.order_no || result.orderNo || result.id} 已提交并派发。`,
        okText: '查看工单详情',
        onOk: () => navigate('/resignation/' + result.id),
      });
    } catch (err) {
      console.error('[新建离职工单] 提交失败：', err);
      message.error('提交失败');
    } finally { setSubmitting(false); }
  };

  const handleSubmitClick = async () => {
    try {
      console.log('[新建离职工单] 点击提交，开始校验表单');
      await formRef.current?.validateFields();
      formRef.current?.submit();
    } catch (err) {
      console.error('[新建离职工单] 表单校验失败：', err);
      message.error('表单校验未通过，请检查红色提示字段');
    }
  };

  return (
    <PageContainer header={{ title: '新建离职工单' }}>
      <Card>
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label="客户" required tooltip="选择本离职工单所属客户单位">
            <Select
              showSearch
              allowClear
              placeholder="请选择客户单位"
              style={{ width: 360 }}
              value={customerId}
              onChange={handleCustomerChange}
              optionFilterProp="label"
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.customer_code || ''} - ${c.customer_name}`,
              }))}
            />
          </Form.Item>
        </Form>

        <DynamicForm
          fields={fields}
          fieldPermissions={permissions}
          orderType="resignation"
          formRef={formRef}
          onFinish={handleSubmit}
          submitText="提交并派发"
          loading={submitting}
        />
        <Divider />
        <Space>
          <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={loading}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={handleSubmitClick} loading={submitting}>提交并派发</Button>
          <Button onClick={() => navigate('/resignation')}>返回列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default ResignationNew;
