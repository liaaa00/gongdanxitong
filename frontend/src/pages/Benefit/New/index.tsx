import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Card, Button, Space, App, Divider } from 'antd';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getFields } from '@/services/fields';
import { createWorkOrder } from '@/services/workOrders';

const BenefitNew: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const formRef = useRef<ProFormInstance>();
  const { permissions } = useFieldPermissions('main');
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getFields('benefit')
      .then(setFields)
      .catch(() => message.error('加载字段配置失败'));
  }, []);

  const handleSaveDraft = async () => {
    const values = formRef.current?.getFieldsValue() || {};
    setLoading(true);
    try {
      const result = await createWorkOrder({ ...values, orderType: 'benefit', _action: 'draft' });
      message.success('草稿已保存');
      navigate('/benefit/' + result.id);
    } catch {
      message.error('保存失败');
    } finally { setLoading(false); }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const result = await createWorkOrder({ ...values, orderType: 'benefit', _action: 'submit' });
      message.success('待遇申报已提交');
      navigate('/benefit/' + result.id);
    } catch {
      message.error('提交失败');
    } finally { setSubmitting(false); }
  };

  return (
    <PageContainer header={{ title: '新建待遇申报' }}>
      <Card>
        <DynamicForm
          fields={fields}
          fieldPermissions={permissions}
          orderType="benefit"
          formRef={formRef}
          onFinish={handleSubmit}
          submitText="提交并派发"
          loading={submitting}
        />
        <Divider />
        <Space>
          <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={loading}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={() => formRef.current?.submit()} loading={submitting}>提交并派发</Button>
          <Button onClick={() => navigate('/benefit')}>返回列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default BenefitNew;
