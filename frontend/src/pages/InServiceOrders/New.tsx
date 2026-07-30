import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { App, Button, Form, Space } from 'antd';
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import InServiceOrderForm, {
  normalizeInServiceOrderFormValues,
  type InServiceOrderFormValues,
} from './components/InServiceOrderForm';
import { createInServiceOrder } from '@/services/inServiceOrders';
import {
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_ORDER_KIND_META,
  type InServiceOrderKind,
} from '@/constants/inService';

interface InServiceOrderNewProps {
  orderKind?: InServiceOrderKind;
  listPath?: string;
  businessScope?: 'beilun' | 'out_of_province';
}

export default function InServiceOrderNew({
  orderKind = IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS,
  listPath = '/in-service',
  businessScope,
}: InServiceOrderNewProps) {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<InServiceOrderFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const meta = IN_SERVICE_ORDER_KIND_META[orderKind];

  const handleSubmit = async () => {
    try {
      const values = normalizeInServiceOrderFormValues(await form.validateFields(), orderKind);
      setSubmitting(true);
      const order = await createInServiceOrder({ ...values, orderKind, businessScope });
      modal.success({
        title: meta.label + '已创建',
        content: order.handlerName
          ? `工单 ${order.orderNo} 已自动派发给 ${order.handlerName}，当前待受理。`
          : `工单 ${order.orderNo} 已创建，负责人待配置。`,
        okText: '查看工单',
        onOk: () => navigate('/in-service/' + order.id),
      });
    } catch (error) {
      if ((error as { errorFields?: unknown[] })?.errorFields) {
        message.error('表单校验未通过，请检查红色提示字段');
      } else {
        message.error(error instanceof Error ? error.message : '创建工单失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      header={{
        title: meta.createTitle,
        extra: [
          <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate(listPath)}>
            返回列表
          </Button>,
        ],
      }}
    >
      <InServiceOrderForm form={form} orderKind={orderKind} />
      <Space>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          提交工单
        </Button>
        <Button onClick={() => navigate(listPath)}>取消</Button>
      </Space>
    </PageContainer>
  );
}
