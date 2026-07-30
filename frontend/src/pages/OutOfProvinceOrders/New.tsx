import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Form, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import OutOfProvinceOrderForm, { type OutOfProvinceOrderFormValues } from './components/OutOfProvinceOrderForm';

// TODO: 等后端接口实现后补充service导入
// import { createOutOfProvinceOrder } from '@/services/outOfProvinceOrders';

export default function NewOutOfProvinceOrder() {
  const [form] = Form.useForm<OutOfProvinceOrderFormValues>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      // TODO: 调用后端接口创建工单
      console.log('提交省外派单', values);
      message.success('省外派单创建成功');
      navigate('/out-of-province/orders');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error('创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="新建省外派单"
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>,
        <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>
          提交
        </Button>,
      ]}
    >
      <Card>
        <OutOfProvinceOrderForm form={form} />
      </Card>
    </PageContainer>
  );
}
